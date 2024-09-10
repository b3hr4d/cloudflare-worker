export default {
	async fetch(request: Request, env: { [key: string]: string }) {
		if (request.method === 'OPTIONS') {
			return new Response(null, {
			  headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type, Authorization',
			  },
			});
		  }
		  
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
  
	  const requestBody = await request.text();
	  const { to, subject, html } = JSON.parse(requestBody);
  
	  const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
		  'Content-Type': 'application/json',
		  Authorization: `Bearer ${env.RESEND_API_KEY}`,
		},
		body: JSON.stringify({
		  from: 'Info <info@b3pay.net>',
		  to,
		  subject,
		  html,
		}),
	  });
  
	  const results = await gatherResponse(response);
  
	  // Add CORS headers
	  return new Response(results, {
		headers: {
		  'Content-Type': 'application/json',
		  'Access-Control-Allow-Origin': '*',  // Allow all origins or specify your domain
		  'Access-Control-Allow-Methods': 'POST, OPTIONS',
		  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		},
	  });
  
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