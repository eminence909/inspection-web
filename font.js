/* ขนาดตัวอักษร 3 ระดับ จำค่าไว้ในเครื่อง ใช้ร่วมทุกหน้า */
(function () {
  var L = [['ก', 1], ['ก+', 1.12], ['ก++', 1.25]], k = 'fs', i = 0;
  try { i = Math.min(2, Math.max(0, Number(localStorage.getItem(k)) || 0)); } catch (e) {}
  function apply() { document.documentElement.style.setProperty('--fs', L[i][1]); var b = document.getElementById('fsz'); if (b) b.textContent = L[i][0]; }
  apply();
  // โหมดสว่าง/มืด (จำค่าไว้ในเครื่อง) ตั้งก่อนวาดหน้าเพื่อไม่ให้กะพริบ
  var th = 'dark'; try { th = localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; } catch (e) {}
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', th);
    var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', th === 'light' ? '#f3f3f1' : '#0a0a0b');
    var b = document.getElementById('thm'); if (b) b.setAttribute('aria-label', th === 'light' ? 'เปลี่ยนเป็นโหมดมืด' : 'เปลี่ยนเป็นโหมดสว่าง');
  }
  applyTheme();
  document.addEventListener('DOMContentLoaded', function () {
    var f = document.getElementById('fsz') || document.querySelector('.top'); if (!f || document.getElementById('thm')) { applyTheme(); return; }
    var t = document.createElement('button'); t.id = 'thm'; t.type = 'button'; t.className = 'thm';
    t.innerHTML = '<svg class="moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    t.onclick = function () { th = th === 'light' ? 'dark' : 'light'; try { localStorage.setItem('theme', th); } catch (e) {} applyTheme(); };
    if (f.id === 'fsz') f.parentNode.insertBefore(t, f); else { t.style.marginLeft = 'auto'; f.appendChild(t); } applyTheme();
  });
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('fsz'); if (!b) return; apply();
    b.onclick = function () { i = (i + 1) % 3; try { localStorage.setItem(k, i); } catch (e) {} apply(); };
  });
})();
