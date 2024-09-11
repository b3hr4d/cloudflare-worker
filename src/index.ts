import { v5 as uuidv5 } from 'uuid';

interface Env {
  RESEND_API_KEY: string;
  IDEMPOTENCY_STORE: KVNamespace;
  UUID_NAMESPACE: string;
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
        },
      });
    }

    if (request.method !== 'POST' || request.headers.get('content-type') !== 'application/json') {
      return new Response('Bad Request', { status: 400 });
    }

    if (!env.RESEND_API_KEY || !env.UUID_NAMESPACE) {
      return new Response('Missing required environment variables', { status: 500 });
    }

    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!idempotencyKey) {
      return new Response('Missing Idempotency-Key header', { status: 400 });
    }

    const requestBody = await request.text();
    let { to, from, subject, html } = JSON.parse(requestBody);

    // Generate a deterministic UUID based on the idempotency key and request body
    const deterministicId = uuidv5(idempotencyKey + requestBody, env.UUID_NAMESPACE);

    // Check if we've processed this request before
    const storedStatus = await env.IDEMPOTENCY_STORE.get(deterministicId);
    let status: 'pending' | 'completed' = storedStatus as 'pending' | 'completed' | null || 'pending';

    let responseBody;

    if (status === 'pending') {
      // This is either a new request or a retry of a pending request
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: from || 'Info <info@b3pay.net>',
            to,
            subject,
            html,
          }),
        });

        if (!response.ok) {
          throw new Error(`Resend API error: ${response.status}`);
        }

        status = 'completed';
        await env.IDEMPOTENCY_STORE.put(deterministicId, status, { expirationTtl: 86400 }); // 24 hours expiration
      } catch (error) {
        console.error('Error sending email:', error);
        // In case of an error, we don't update the status, allowing for retries
      }
    }

    // Generate a deterministic response
    responseBody = JSON.stringify({
      id: deterministicId,
      status: status,
      to: to,
      subject: subject,
    });

    return new Response(responseBody, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
      },
    });
  },
};