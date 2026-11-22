const build = {"release":"0.2.0-test.7","id":"c8bf660ebe7fdbd2"};
const scope = self.registration.scope;
const prefix = 'finrate-full-restart:'+scope+':';
const cacheName = prefix+build.id;
const assets = new Map(Object.entries({"manifest.webmanifest":"53505039d9e231d3a645b0074f54f82b93eae65ac25345326b9349cee840f44c","icon-192.png":"02de571ad2d51f9c5ad3e7025d69c3757144326731163ecfe9a76b7fb13bcfa4","icon-512.png":"dc5ebe3e204b64dfeb6585959145d7823c5db9e9af7e3fe45ef00a43bb9a0c0b","apple-touch-icon.png":"b5885c943dfa178c5b7043b35c80cb0f13b3ddc34f7f4085663bf9eac5d1e46d","app-c8bf660ebe7fdbd2.js":"bf4ca945ffc3cf3ed2581bae730bc54aba2063a0a93ed98e28d5195475458e86","styles-c8bf660ebe7fdbd2.css":"aa0ae489dc59ef38d4da423855ef815297bdfd7f0e8e9a7366ef34f4ba96c684","index.html":"bee8dc86e0b5a38266a3ad033b7f3145ccf17baf008a8a26fd35e335aa5a25d5"}).map(([path,hash])=>[new URL(path,scope).href,hash]));
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
