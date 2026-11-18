const prefix='finrate-full-restart:'+self.registration.scope+':';
const cacheName=prefix+'c581f16f13f4ccec';
const assets=["index.html","styles.css","manifest.webmanifest","icon-192.png","icon-512.png","apple-touch-icon.png","app.js"].map(path=>new URL(path,self.registration.scope).href);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(cacheName);
    await cache.addAll(assets.map(url=>new Request(url,{cache:'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys()){
      if(name.startsWith(prefix)&&name!==cacheName)await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const {request}=event;
  if(request.method!=='GET'||!request.url.startsWith(self.registration.scope))return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(async()=>{
      const cache=await caches.open(cacheName);
      return (await cache.match(new URL('index.html',self.registration.scope)))||Response.error();
    }));
  }else if(assets.includes(request.url)){
    event.respondWith(caches.open(cacheName).then(async cache=>(await cache.match(request))||fetch(request)));
  }
});
