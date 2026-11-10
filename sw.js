// เก็บไฟล์หน้าเว็บไว้ใช้ตอนไม่มีสัญญาณ: ลองโหลดใหม่ก่อน (รอไม่เกิน 4 วินาทีเมื่อสัญญาณอ่อน) ถ้าไม่ได้ใช้ของที่เก็บไว้
const C = 'insp-v4';
const SHELL = ['./', 'index.html', 'hero-art.svg', 'fx.js', 'style.css', 'font.js', 'config.js', 'criteria.js', 'calc.js', 'roster.js', 'lazy.js', 'app.js', 'manifest.json', 'hero-art.svg', 'icon-192.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  // เก็บโครงหน้าเว็บทันทีที่ติดตั้ง (ไม่ให้การติดตั้งล้มถ้าไฟล์ใดโหลดไม่ได้)
  e.waitUntil(caches.open(C).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'no-cache' }).then(r => r.ok && c.put(u, r)).catch(() => {})))));
});
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(C);
    try {
      const r = await Promise.race([fetch(e.request, { cache: 'no-cache' }), timeout(4000)]);
      if (r && r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      const hit = await c.match(e.request) || await c.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      if (e.request.mode === 'navigate') { const idx = await c.match('index.html') || await c.match('./'); if (idx) return idx; }
      return Response.error();
    }
  })());
});
