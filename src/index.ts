let processingRequests: { [key: string]: boolean } = {};

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

		const idempotencyKey = request.headers.get('Idempotency-Key');
		if (!idempotencyKey) {
			return new Response('Missing Idempotency-Key header', { status: 400 });
		}

		// Check if request is already processing
		if (processingRequests[idempotencyKey]) {
			return new Response('Request is already being processed, please wait.', { status: 202 });
		}

		// Mark request as processing
		processingRequests[idempotencyKey] = true;

		// Parse request body
		let requestBody: any;
		try {
			requestBody = await request.json();
		} catch (error) {
			return new Response('Invalid JSON in request body', { status: 400 });
		}

		try {
			const { to, from, subject, html } = requestBody;
			if (!to || !subject || !html) {
				return new Response('Missing required fields in request body', { status: 400 });
			}
			// Your existing logic for handling the request, e.g. sending email
			await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${env.RESEND_API_KEY}`,
				},
				body: JSON.stringify({
					from: from || 'Info <info@b3pay.net>',
					to,
					subject,
					html,
				}),
			});

			const responseBody = { status: 'completed', id: idempotencyKey };

			// Store result in KV for future requests
			await env.IDEMPOTENCY_STORE.put(idempotencyKey, JSON.stringify(responseBody), { expirationTtl: 86400 });

			return new Response(JSON.stringify(responseBody), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		} catch (error: any) {
			return new Response(`Error: ${error.message}`, { status: 500 });
		} finally {
			// Remove from processing map
			delete processingRequests[idempotencyKey];
		}
	},
};

interface Env {
	RESEND_API_KEY: string;
	IDEMPOTENCY_STORE: KVNamespace;
}