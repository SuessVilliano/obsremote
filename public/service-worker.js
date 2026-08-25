const CACHE='obsremote-v4';
const ASSETS=['/','/index.html','/styles.css?v=4','/app.js?v=4','/manifest.webmanifest','/icon.svg','/soundboard-player.html','/backgrounds/starting.html','/backgrounds/brb.html','/backgrounds/ending.html','/backgrounds/studio.html','/backgrounds/neon.html','/backgrounds/minimal.html'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request)));});
