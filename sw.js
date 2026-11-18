const build = {"release":"0.2.0-test.2","id":"9c019dfbf1c417e4"};
const scope = self.registration.scope;
const prefix = 'finrate-full-restart:'+scope+':';
const cacheName = prefix+build.id;
const assets = new Map(Object.entries({"manifest.webmanifest":"53505039d9e231d3a645b0074f54f82b93eae65ac25345326b9349cee840f44c","icon-192.png":"02de571ad2d51f9c5ad3e7025d69c3757144326731163ecfe9a76b7fb13bcfa4","icon-512.png":"dc5ebe3e204b64dfeb6585959145d7823c5db9e9af7e3fe45ef00a43bb9a0c0b","apple-touch-icon.png":"b5885c943dfa178c5b7043b35c80cb0f13b3ddc34f7f4085663bf9eac5d1e46d","app-9c019dfbf1c417e4.js":"1c2d3f7821ca0f582e6a58eff9f80c800efec760f21899319e55bc4aba02adb3","styles-9c019dfbf1c417e4.css":"0d1a86b0b6d85fe3a74e7437a7e7506d22ccb462060d241c2469a974fe2370a1","index.html":"36c66275027bc3a85ff2406ddbdfacbb7f24a89dc5e7534cae22744e239792a0"}).map(([path,hash])=>[new URL(path,scope).href,hash]));
const index = new URL('index.html',scope).href;

async function precache() {
  const cache = await caches.open(cacheName);
  const responses = await Promise.all([...assets].map(async ([url,expected])=>{
    const response = await fetch(url,{cache:'reload'});
    if(!response.ok)throw new Error('FinRate asset unavailable');
    const bytes = await response.clone().arrayBuffer();
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    const actual = Array.from(hash,byte=>byte.toString(16).padStart(2,'0')).join('');
    if(actual!==expected)throw new Error('FinRate asset version mismatch');
    return [url,response];
  }));
  // Install only succeeds when every response belongs to this build.
  await Promise.all(responses.map(([url,response])=>cache.put(url,response)));
}

self.addEventListener('install',event=>{
  event.waitUntil(precache().catch(async error=>{
    await caches.delete(cacheName);
    throw error;
  }));
});

self.addEventListener('message',event=>{
  if(event.data?.type==='FINRATE_BUILD_INFO')event.ports[0]?.postMessage(build);
  if(event.data?.type==='FINRATE_APPLY_UPDATE'&&event.data.id===build.id){
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await self.clients.claim();
    // Keep snapshots until the new worker has become the controller.
    for(const name of await caches.keys()){
      if(name.startsWith(prefix)&&name!==cacheName)await caches.delete(name);
    }
  })());
});

self.addEventListener('fetch',event=>{
  const {request}=event;
  if(request.method!=='GET'||!request.url.startsWith(scope))return;
  const navigation=request.mode==='navigate';
  const path=new URL(request.url).pathname;
  if(navigation&&path!==new URL(scope).pathname&&path!==new URL(index).pathname)return;
  const url=navigation ? index : request.url;
  if(!assets.has(url))return;
  event.respondWith((async()=>{
    const cache=await caches.open(cacheName);
    return await cache.match(url) || Response.error();
  })());
});
