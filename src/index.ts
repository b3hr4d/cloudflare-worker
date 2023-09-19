export default {
	async fetch(request: Request, env: { [key: string]: string }) {
		// only allow POST with JSON body
		if (request.method !== 'POST' || request.headers.get('content-type') !== 'application/json') {
			return new Response('Bad Request', { status: 400 });
		}

		if (!env.RESEND_API_KEY) {
			return new Response('Missing RESEND_API_KEY', { status: 500 });
		}

		if (!request.body) {
			return new Response('Missing request body', { status: 400 });
		}

		// parse the body into JSON
		const requestBody = await request.text();
		const { to, subject, html } = JSON.parse(requestBody);

		// send the email
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
			},
			body: JSON.stringify({
				from: 'info@b3pay.net',
				to,
				subject,
				html,
			}),
		});

		const results = await gatherResponse(response);
		return new Response(results, {
			headers: {
				'Content-Type': 'application/json',
			},
		});

		/**
		 * gatherResponse awaits and returns a response body as a string.
		 * Use await gatherResponse(..) in an async function to get the response body
		 * @param {Response} response
		 */
		async function gatherResponse(response: Response) {
			const { headers } = response;
			const contentType = headers.get('content-type') || '';
			if (contentType.includes('application/json')) {
				return JSON.stringify(await response.json());
			}
			return response.text();
		}
	},
};
