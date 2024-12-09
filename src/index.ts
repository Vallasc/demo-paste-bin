const htmlContent = `
  <html>
    <body>
      <h1>Create a new Paste</h1>
      <form action="/" method="POST">
        <textarea name="content" rows="30" cols="140" placeholder="Write your paste here..."></textarea><br>
        <button type="submit">Save</button>
      </form>
    </body>
  </html>
`;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const key = url.pathname.split('/')[1];
    const cache = caches.default;

    if (request.method === 'GET') {
      if (!key) {
        return new Response(htmlContent, { headers: { 'Content-Type': 'text/html' } });
      } else {
        // Controlla se il contenuto è già in cache
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          console.log('Cache hit');
          return cachedResponse;
        }

        // Altrimenti recupera da R2 e aggiorna la cache
        console.log('Cache miss');
        const content = await env.PASTE_BIN_BUCKET.get(key);
        if (content === null) {
          return new Response('Bin Not Found', { status: 404 });
        }

				const response = new Response(await content.text(), {
					headers: {
						'Content-Type': 'text',
						'Cache-Control': 'public, max-age=3600', // Cache per 1 ora
					},
				});
        ctx.waitUntil(cache.put(request, response.clone())); // Aggiorna la cache
        return response;
      }
    }
    if (request.method === 'POST') {
      const formData = await request.formData();
      const content = formData.get('content');
      if (typeof content !== 'string') {
        return new Response('Invalid form submission', { status: 400 });
      }

      const R2Key = await sha1(new TextEncoder().encode(content));
      console.log(content);
      await env.PASTE_BIN_BUCKET.put(R2Key, content);

      const destinationURL = `${url.protocol}//${url.host}/${R2Key}`;
      // Invalida eventuali cache precedenti per la stessa chiave
      ctx.waitUntil(cache.delete(new Request(destinationURL)));
      return Response.redirect(destinationURL, 301);
    }

    return new Response(key);
  },
} satisfies ExportedHandler<Env>;

async function sha1(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', data);
  const array = Array.from(new Uint8Array(digest));
  return array.map((b) => b.toString(16).padStart(2, '0')).join('');
}
