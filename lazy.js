/* โหลดตัวสร้าง PDF/รูปภาพเมื่อต้องใช้เท่านั้น (ทำให้หน้าเว็บเปิดเร็วขึ้น) */
(function () {
  const loaded = {};
  function load(src) {
    if (loaded[src]) return loaded[src];
    return loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('โหลดไฟล์ไม่สำเร็จ: ' + src)); document.head.appendChild(s);
    });
  }
  window.loadPdfStack = async function () {
    if (window.PDFX) return;
    await Promise.all([
      window.html2canvas ? 0 : load('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
      window.jspdf ? 0 : load('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
      window.SUMMARY ? 0 : load('summary.js?t=' + Date.now()),
      window.ROSTER ? 0 : load('roster.js?t=' + Date.now())
    ]);
    await load('pdf.js?t=' + Date.now());
  };
})();
