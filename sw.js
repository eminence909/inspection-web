// เก็บไฟล์หน้าเว็บไว้ใช้ตอนไม่มีสัญญาณ: ลองโหลดใหม่ก่อน (รอไม่เกิน 4 วินาทีเมื่อสัญญาณอ่อน) ถ้าไม่ได้ใช้ของที่เก็บไว้
const C = 'insp-v16';
const SHELL = ['./', 'index.html', 'fx.js', 'style.css', 'font.js', 'config.js', 'criteria.js', 'calc.js', 'roster.js', 'lazy.js', 'app.js', 'manifest.json', 'icon-192.png', 'logo-128.png', 'favicon.png', 'icon-180.png', 'icon-512.png', 'results.html', 'roster.html', 'admin.html'];
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
  // ใช้ของในเครื่องก่อน (เปิดไวแม้สัญญาณอ่อน) แล้วอัปเดตเงียบๆ เบื้องหลังเพื่อให้ครั้งหน้าได้ของใหม่
  e.respondWith((async () => {
    const c = await caches.open(C);
    const hit = await c.match(e.request) || await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; });
    if (hit) { const bg = net.catch(() => {}); try { e.waitUntil(bg); } catch (x) {} return hit; }
    try { return await net; } catch (err) {
      if (e.request.mode === 'navigate') { const idx = await c.match('index.html') || await c.match('./'); if (idx) return idx; }
      return Response.error();
    }
  })());
});
