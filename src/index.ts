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
  
	  if (request.method !== 'POST' || request.headers.get('Content-Type') !== 'application/json') {
		return new Response(`Invalid request method or content type ${request.method} - ${request.headers.get('Content-Type')}, expected POST - application/json`, { status: 400 });
	  }
  
	  if (!env.RESEND_API_KEY) {
		return new Response('Missing RESEND_API_KEY environment variable', { status: 500 });
	  }
  
	  if (!env.IDEMPOTENCY_STORE) {
		return new Response('Missing IDEMPOTENCY_STORE KV namespace', { status: 500 });
	  }
  
	  const idempotencyKey = request.headers.get('Idempotency-Key');
	  if (!idempotencyKey) {
		return new Response('Missing Idempotency-Key header', { status: 400 });
	  }
  
	  let requestBody: { to: string; from?: string; subject: string; html: string; };
	  try {
		requestBody = await request.json();
	  } catch (error) {
		return new Response('Invalid JSON in request body', { status: 400 });
	  }
  
	  const { to, from, subject, html } = requestBody;
  
	  if (!to || !subject || !html) {
		return new Response('Missing required fields in request body', { status: 400 });
	  }
  
	  const deterministicId = idempotencyKey;
  
	  let status: 'pending' | 'completed';
	  try {
		const storedStatus = await env.IDEMPOTENCY_STORE.get(deterministicId);
		status = storedStatus as 'pending' | 'completed' | null || 'pending';
	  } catch (error) {
		console.error('Error accessing KV store:', error);
		return new Response('Internal server error', { status: 500 });
	  }
  
	  let responseBody;
  
	  if (status === 'pending') {
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
			const errorText = await response.text();
			throw new Error(`Resend API error: ${response.status} - ${errorText}`);
		  }
  
		  status = 'completed';
		  await env.IDEMPOTENCY_STORE.put(deterministicId, status, { expirationTtl: 86400 }); // 24 hours expiration
		} catch (error: any) {
		  console.error('Error sending email:', error);
		  return new Response(`Error sending email: ${error.message}`, { status: 500 });
		}
	  }
  
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
  
  interface Env {
	RESEND_API_KEY: string;
	IDEMPOTENCY_STORE: KVNamespace;
  }