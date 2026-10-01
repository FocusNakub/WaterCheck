// Service worker: เปิดออฟไลน์ได้ แต่ข้อมูลน้ำเอาสดก่อนเสมอ (network-first)
const V='flood-v2';
const SHELL=['./','index.html','levels.html','dams.html','reservoirs.html','rain.html','forecast.html','warning.html','tide.html','bma.html','districts.html','help.html','style.css','app.js','manifest.webmanifest','icons/icon-192.png','data/summary.json','data/roads.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);if(u.origin!==location.origin)return; // ฟอนต์/เรดาร์ภายนอกให้เบราว์เซอร์จัดการเอง
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res})
    .catch(()=>caches.match(r).then(m=>m||(r.mode==='navigate'?caches.match('index.html'):Response.error()))));
});
