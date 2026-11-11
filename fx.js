/* เอฟเฟกต์เบา ๆ: ตัวเลขนับขึ้น เหรียญโผล่ทีละแถว เครื่องหมายถูกตอนส่งสำเร็จ
   ปิดอัตโนมัติเมื่อเครื่องตั้งค่า "ลดการเคลื่อนไหว" */
(function () {
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  var FX = window.FX = {};

  // ----- เครื่องหมายถูกตอนส่งสำเร็จ -----
  FX.done = function () {
    try { if (navigator.vibrate) navigator.vibrate([18, 50, 18]); } catch (e) {}
    if (RM) return;
    var o = document.createElement('div'); o.className = 'okfx';
    o.innerHTML = '<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34"/><path d="M24 41l11 11 21-23"/></svg>';
    document.body.appendChild(o); setTimeout(function () { o.remove(); }, 1500);
  };
  if (RM) return;

  // ----- ตัวเลขนับขึ้น + หน้าประกาศผลโผล่ทีละแถว -----
  function count(el) {
    if (el._busy || el.children.length) return;
    var t = el.textContent, m = /^(\d+(?:\.\d+)?)([\s\S]*)$/.exec(t); if (!m || t === el._cu) return;
    var to = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, rest = m[2]; el._cu = t;
    if (to === 0) return;
    el._busy = true; var t0 = null, D = 800;
    (function step() {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      if (t0 == null) t0 = now; var k = Math.min(1, (now - t0) / D), v = to * (1 - Math.pow(1 - k, 3));
      if (k < 1) { el.textContent = v.toFixed(dec) + rest; raf(step); } else { el.textContent = t; el._busy = false; }
    })();
  }
  function scan() {
    document.querySelectorAll('.stats b,.sc3 b').forEach(count);
    var ps = document.querySelectorAll('.prow:not([data-s])'); ps.forEach(function (p, i) { p.dataset.s = 1; p.style.animationDelay = (i * 70) + 'ms'; });
  }
  var ob = new MutationObserver(function () { scan(); });
  function start() { ob.observe(document.body, { childList: true, subtree: true, characterData: true }); scan(); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
