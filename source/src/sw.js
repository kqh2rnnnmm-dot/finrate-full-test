const build = __BUILD_METADATA__;
const scope = self.registration.scope;
const prefix = 'finrate-full-restart:'+scope+':';
const cacheName = prefix+build.id;
const assets = new Map(Object.entries(__ASSET_DIGESTS__).map(([path,hash])=>[new URL(path,scope).href,hash]));
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
