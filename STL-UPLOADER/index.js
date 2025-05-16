// index.js
addEventListener('fetch', event => {
  event.respondWith(handle(event.request))
})

/** @param {Request} request */
async function handle(request) {
  // generate a random integer 1–100
  const value = Math.floor(Math.random() * 100) + 1
  return new Response(JSON.stringify({ value }), {
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      // if you need CORS (calling from browser at filamentbros.com):
      'Access-Control-Allow-Origin': 'https://filamentbros.com'
    },
  })
}
