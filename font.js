/* ขนาดตัวอักษร 3 ระดับ จำค่าไว้ในเครื่อง ใช้ร่วมทุกหน้า */
(function () {
  var L = [['ก', 1], ['ก+', 1.12], ['ก++', 1.25]], k = 'fs', i = 0;
  try { i = Math.min(2, Math.max(0, Number(localStorage.getItem(k)) || 0)); } catch (e) {}
  function apply() { document.documentElement.style.setProperty('--fs', L[i][1]); var b = document.getElementById('fsz'); if (b) b.textContent = L[i][0]; }
  apply();
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.getElementById('fsz'); if (!b) return; apply();
    b.onclick = function () { i = (i + 1) % 3; try { localStorage.setItem(k, i); } catch (e) {} apply(); };
  });
})();
