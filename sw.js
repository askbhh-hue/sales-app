const C='fs-v4',FILES=['./','index.html','manifest.json','icon-192.png','icon-512.png'];

function fsOpenDB(){return new Promise((ok,no)=>{const r=indexedDB.open('fs-share',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function fsSaveShare(entry){const db=await fsOpenDB();return new Promise((ok,no)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(entry,'latest');tx.oncomplete=()=>ok();tx.onerror=()=>no(tx.error)})}

self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>Promise.all(FILES.map(u=>c.add(u).catch(()=>{})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);

  // استقبال الصورة من واتساب أو أي تطبيق تاني
  if(url.pathname.endsWith('/share-target') && e.request.method==='POST'){
    e.respondWith((async()=>{
      try{
        const fd=await e.request.formData();
        const f=fd.getAll('image')[0];
        if(f){
          const buf=await f.arrayBuffer();
          await fsSaveShare({name:f.name||'shared.jpg',type:f.type||'image/jpeg',data:buf,t:Date.now()});
        }
      }catch(err){console.error('[sw] share',err)}
      return Response.redirect('./?shared=1',303);
    })());
    return;
  }

  // التخزين الأساسي (زي ما هو)
  if(e.request.method!=='GET'||!e.request.url.startsWith(self.location.origin))return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('index.html'))));
});
