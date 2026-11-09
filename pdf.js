/* สร้าง PDF ในเบราว์เซอร์: ใบรายวัน / สรุปรายสัปดาห์ / สรุปรายเดือน / ใบเวร (ม.1-6 หน้าละ 1 ชั้น)
   ใช้ html2canvas + jsPDF (โหลดใน admin.html) วาดเอกสารจาก HTML เพื่อให้ภาษาไทยแสดงถูกต้อง */
(function (root) {
  const CR = root.CRITERIA, K = root.CALC, SM = root.SUMMARY;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const WD = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const NA = 'ไม่มีการประเมิน';
  function dparts(iso) { const [y, m, d] = iso.split('-').map(Number); return { y: y + 543, m, d, w: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; }
  const thLong = iso => { const p = dparts(iso); return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`; };
  const thFull = iso => { const p = dparts(iso); return `วัน${WD[p.w]}ที่ ${p.d} ${MONTHS[p.m - 1]} พ.ศ. ${p.y}`; };
  const thShort = iso => { const p = dparts(iso); return `${p.d}/${p.m}`; };
  const pct = p => p === null || p === undefined ? '' : (Math.round(p * 100) / 100).toFixed(2);
  const kindTitle = k => k === 'classroom' ? 'ห้องเรียนสะอาด' : 'เขตพื้นที่รับผิดชอบ';

  const CSS = `.pg{background:#fff;color:#000;font-family:'Sarabun',sans-serif;box-sizing:border-box;position:relative;overflow:hidden}
  .pg.l{width:1123px;height:794px;padding:26px 34px}.pg.p{width:794px;height:1123px;padding:34px 40px}
  .pg h1{margin:0;font-size:19px;text-align:center;font-weight:700;line-height:1.3}.pg h2{margin:0;font-size:15px;text-align:center;font-weight:600}
  .pg .meta{display:flex;justify-content:space-between;font-size:14px;margin:8px 0 6px}
  .pg table{border-collapse:collapse;width:100%;font-size:12px}.pg th,.pg td{border:1px solid #000;padding:2px 3px;text-align:center;line-height:1.25}
  .pg th{background:#eef2f0;font-weight:600}.pg td.l{text-align:left}.pg .s{font-size:9.5px}
  .pg .sig{display:flex;justify-content:space-around;margin-top:16px;font-size:13px;text-align:center}
  .pg .sig div{flex:1;padding:0 6px}.pg .sig .ln{margin-top:26px;border-bottom:1px dotted #000;height:1px}
  .pg .gold{background:#fff3c4}.pg .silver{background:#e9edf1}.pg .bronze{background:#f3dccb}`;

  function sigBlock(slots) {
    return '<div class="sig">' + slots.map(s => `<div><div class="ln"></div>(${s.name ? esc(s.name) : '&nbsp;'.repeat(28)})<br><b>${esc(s.role)}</b></div>`).join('') + '</div>';
  }
  function head(kind, sub, line2) {
    const d = CR[kind];
    return `<h1>${esc(d.sheetTitle)}${sub ? ' ' + esc(sub) : ''}</h1><h2>${esc(d.activity)} ${esc(d.activityEn || '')}</h2>${line2 ? `<div class="meta">${line2}</div>` : ''}`;
  }

  // ======== วางคะแนนลงบนรูปใบประเมินเดิม (tpl/*.jpg) ========
  const PT = 96 / 72; // pt -> px (ขนาด Letter 816x1056 px)
  const INK = '#0b2a7a';
  const FIX_ZONE_HEADING = true; // แก้บรรทัด "เกณฑ์การประเมินห้องเรียนสะอาด" ในใบเขตพื้นที่
  const thDig = s => String(s).replace(/[0-9]/g, d => '๐๑๒๓๔๕๖๗๘๙'[d]);
  const SMON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const G = {
    dailyC: {
      key: 'daily_classroom', tpl: 'daily_classroom',
      xs: [86.8, 108.5, 130.1, 151.8, 173.4, 195.1, 216.8, 238.4, 260.1, 281.7, 303.4, 325.0, 346.6, 368.4, 389.9, 411.7, 433.3, 455.0, 476.6, 498.2, 519.9],
      cols: ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '2.3', '2.4', '3.1', '3.2', '3.3', '3.4', '4.1', '4.2', '4.3', '4.4', '5.1', '5.2', '5.3', '5.4'],
      total: [519.9, 549.3], rows: [388.6, 402.7, 416.7, 430.8, 444.9, 458.9, 473.0, 487.0, 501.1, 515.1, 529.3, 543.3, 557.4],
      hdr: { y: [349.5, 365.5], wd: [371.9, 427.1], d: [434.1, 450.7], m: [473.7, 537.1], y4: [555.5, 575.2] },
      names1: { y: [640.7, 654.8] }, names2: { y: [705.3, 719.3] }
    },
    dailyZ: {
      key: 'daily_zone', tpl: 'daily_zone',
      xs: [86.8, 111.6, 136.5, 161.2, 186.0, 210.9, 232.5, 254.2, 275.8, 297.4, 322.2, 344.0, 365.6, 387.2, 408.9, 433.6, 455.4, 476.9, 498.7, 520.3, 545.1, 574.5],
      cols: ['1.1', '1.2', '1.3', '1.4', 'S1', '2.1', '2.2', '2.3', '2.4', 'S2', '3.1', '3.2', '3.3', '3.4', 'S3', '4.1', '4.2', '4.3', '4.4', 'S4', 'T'],
      rows: [347.1, 361.2, 375.2, 389.2, 403.4, 417.4, 431.5, 445.5, 459.5, 473.6, 487.8, 501.8, 515.9],
      hdr: { y: [309.9, 324.0], wd: [380.7, 426.4], d: [434.9, 446.9], m: [467.3, 520.2], y4: [535.0, 568.8] },
      names1: { y: [599.1, 613.1] }, names2: { y: [663.8, 677.8] }
    },
    week: {
      xs: [72.0, 117.6, 177.1, 236.7, 296.2, 356.5, 416.0, 455.8, 498.0, 539.6],
      hdrRuns: { sd: [188.9, 208.1], sm: [228.2, 290.7], sy: [305.5, 331.9], ed: [361.7, 385.7], em: [405.9, 475.5], ey: [490.3, 533.5] },
      dateRuns: [[123.3, 137.7, 141.5, 153.5, 157.3, 171.9], [182.8, 197.2, 201.1, 213.0, 216.9, 231.4], [242.3, 256.8, 260.6, 272.6, 276.4, 290.9], [302.2, 316.7, 320.5, 332.5, 336.3, 350.8], [362.1, 376.6, 380.4, 392.4, 396.2, 410.7]]
    },
    month: { xs: [72.0, 117.6, 177.1, 236.7, 296.1, 356.4, 405.0, 455.8, 539.6] }
  };
  G.weekC = Object.assign({ tpl: 'week_classroom', rows: [466.5, 482.8, 499.1, 515.5, 531.8, 548.1, 564.5, 580.8, 597.1, 613.4, 629.7, 646.1, 662.4], hy: [404.5, 418.5], dy: [452.5, 466.5], fix: { x: [423.2, 449.2], y: [436.7, 450.7] } }, G.week);
  G.weekZ = Object.assign({ tpl: 'week_zone', rows: [445.5, 461.8, 478.1, 494.5, 510.8, 527.1, 543.5, 559.8, 576.1, 592.4, 608.7, 625.1, 641.4], hy: [383.5, 397.5], dy: [431.5, 445.5], fix: { x: [423.2, 449.2], y: [415.7, 429.7] } }, G.week);
  G.monC = Object.assign({ tpl: 'month_classroom', rows: [442.9, 459.1, 475.6, 491.9, 508.2, 524.5, 540.8, 557.2, 573.5, 589.8, 606.1, 622.4, 638.8], hy: [380.9, 394.9], fix: { x: [368.0, 394.0], y: [413.1, 427.1] } }, G.month);
  G.monZ = Object.assign({ tpl: 'month_zone', rows: [445.4, 461.9, 478.2, 494.5, 510.8, 527.1, 543.5, 559.8, 576.1, 592.4, 608.7, 625.1, 641.4], hy: [383.6, 397.6], fix: { x: [368.0, 394.0], y: [415.7, 429.7] } }, G.month);

  // กล่องข้อความวางทับตามพิกัด pt
  function T(x0, x1, y0, y1, text, o) {
    o = o || {};
    if (text === '' || text == null) return '';
    const fs = o.fs || 13, al = o.align === 'left' ? 'flex-start' : 'center';
    return `<div style="position:absolute;left:${x0 * PT}px;top:${y0 * PT}px;width:${(x1 - x0) * PT}px;height:${(y1 - y0) * PT}px;display:flex;align-items:center;justify-content:${al};text-align:center;font:${o.bold ? 700 : 500} ${fs}px/1.05 'Sarabun',sans-serif;color:${o.color || INK};overflow:hidden;white-space:${o.wrap ? 'normal' : 'nowrap'}">${esc(text)}</div>`;
  }
  const F = (x0, x1, y0, y1, text, o) => R(x0 - 0.4, x1 + 0.4, y0 + 1.5, y1 - 0.6) + T(x0, x1, y0, y1, text, o); // ปิดจุดไข่ปลาแล้วเขียนข้อความทับ
  const R = (x0, x1, y0, y1) => `<div style="position:absolute;left:${x0 * PT}px;top:${y0 * PT}px;width:${(x1 - x0) * PT}px;height:${(y1 - y0) * PT}px;background:#fff"></div>`;
  const RI = (x0, x1, y0, y1) => R(x0 + 0.9, x1 - 0.9, y0 + 0.9, y1 - 0.9); // ลบเส้นแบ่งช่องภายในแถว
  // บางหน้าของใบเดิมวางตารางไม่ตรงกับหน้าอื่น (วัดจากรูปแม่แบบทั้ง 36 หน้า) -> เลื่อนทุกอย่างที่วางทับลงตามจำนวน pt
  const PAGE_DY = { daily_classroom: { 2: 18.3, 5: 18.3 }, month_zone: { 3: 13.1 } };
  function tplPage(tpl, level, inner) {
    const dy = ((PAGE_DY[tpl] || {})[level] || 0) * PT;
    return `<div class="pg tp" style="width:816px;height:1056px;padding:0;background:#fff"><img src="tpl/${tpl}-${level}.jpg" style="position:absolute;left:0;top:0;width:816px;height:1056px"><div style="position:absolute;left:0;top:${dy}px;width:816px;height:1056px">${inner}</div></div>`;
  }
  const WDN = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const MFULL = MONTHS;

  // ---------- ใบรายวัน: ใช้ใบเดิม 1 หน้า/ชั้น ----------
  function dailyPage(kind, date, level, data, cfg) {
    const g = kind === 'classroom' ? G.dailyC : G.dailyZ, def = CR[kind];
    const by = {}; data.inspections.filter(r => r.level === String(level)).forEach(r => by[r.room] = r);
    const un = {}; data.unavail.filter(u => u.level === String(level)).forEach(u => un[u.room] = u);
    const team = data.teams.find(t => t.level === String(level)), names = team ? team.names : [];
    const p = dparts(date);
    let h = F(g.hdr.wd[0], g.hdr.wd[1], g.hdr.y[0], g.hdr.y[1], WDN[p.w], { fs: 12 }) + F(g.hdr.d[0], g.hdr.d[1], g.hdr.y[0], g.hdr.y[1], String(p.d), { fs: 12 }) +
      F(g.hdr.m[0], g.hdr.m[1], g.hdr.y[0], g.hdr.y[1], MFULL[p.m - 1], { fs: 12 }) + F(g.hdr.y4[0], g.hdr.y4[1], g.hdr.y[0], g.hdr.y[1], String(p.y), { fs: 10 });
    const cellX = kind === 'classroom'
      ? i => [g.xs[i], g.xs[i + 1]]
      : i => [g.xs[i], g.xs[i + 1]];
    for (let r = 1; r <= CR.ROOMS; r++) {
      const y0 = g.rows[r - 1], y1 = g.rows[r], x = by[r];
      if (!x) { // ไม่มีการตรวจ = ใส่ 0 ทุกช่อง
        g.cols.forEach((c, i) => { h += T(g.xs[i], g.xs[i + 1], y0, y1, 0, { fs: 13, bold: c === 'T' || c[0] === 'S' }); });
        if (kind === 'classroom') {
          h += T(g.total[0], g.total[1], y0, y1, 0, { fs: 13, bold: true });
          if (un[r]) h += T(549.8, 575.4, y0, y1, un[r].reason || 'ตรวจไม่ได้', { fs: 6.5, wrap: true });
        }
        continue;
      }
      const tt = K.dailyTotals(kind, x.scores);
      g.cols.forEach((c, i) => {
        const [a, b] = cellX(i);
        let v;
        if (c === 'T') v = tt.total; else if (c[0] === 'S') v = tt.cats[Number(c[1]) - 1].sum; else v = x.scores[c];
        h += T(a, b, y0, y1, v, { fs: 13, bold: c === 'T' || c[0] === 'S' });
      });
      if (kind === 'classroom') h += T(g.total[0], g.total[1], y0, y1, tt.total, { fs: 13, bold: true });
    }
    if (kind === 'zone' && FIX_ZONE_HEADING) h += R(72, 345, 217.5, 232.5) + T(72, 460, 217.9, 231.9, 'เกณฑ์การประเมินเขตพื้นที่รับผิดชอบ รวมพลังจิตอาสา พัฒนาเขตพื้นที่', { fs: 14, bold: true, color: '#000', align: 'left' });
    const sx = [[78.3, 201.5], [246.8, 370.1], [412.1, 535.4]];
    sx.forEach((s, i) => { h += T(s[0] + 6, s[1] - 6, g.names1.y[0], g.names1.y[1], names[i] || '', { fs: 11 }); });
    [cfg.headBuilding, cfg.councilPresident, cfg.advisor].forEach((n, i) => { if (n) h += T(sx[i][0] + 6, sx[i][1] - 6, g.names2.y[0], g.names2.y[1], n, { fs: 11 }); });
    return tplPage(g.tpl, level, h);
  }

  // ---------- สรุปรายสัปดาห์ ----------
  const SHORT = { gold: 'ทอง', silver: 'เงิน', bronze: 'ทองแดง', pass: 'ผ่านเบื้องต้น', fail: 'ไม่ผ่าน' };
  function weekPage(kind, w, L) {
    const g = kind === 'classroom' ? G.weekC : G.weekZ, xs = g.xs;
    let h = '';
    const a = dparts(w.dates[0]), e = dparts(w.dates[4]), hr = g.hdrRuns;
    h += F(hr.sd[0], hr.sd[1], g.hy[0], g.hy[1], a.d) + F(hr.sm[0], hr.sm[1], g.hy[0], g.hy[1], MFULL[a.m - 1]) + F(hr.sy[0], hr.sy[1], g.hy[0], g.hy[1], a.y) +
      F(hr.ed[0], hr.ed[1], g.hy[0], g.hy[1], e.d) + F(hr.em[0], hr.em[1], g.hy[0], g.hy[1], MFULL[e.m - 1]) + F(hr.ey[0], hr.ey[1], g.hy[0], g.hy[1], e.y);
    w.dates.forEach((d, i) => {
      const p = dparts(d), r = g.dateRuns[i];
      h += F(r[0], r[1], g.dy[0], g.dy[1], p.d, { fs: 9 }) + F(r[2], r[3], g.dy[0], g.dy[1], p.m, { fs: 9 }) + F(r[4], r[5], g.dy[0], g.dy[1], String(p.y).slice(2), { fs: 9 });
    });
    h += R(g.fix.x[0], g.fix.x[1], g.fix.y[0], g.fix.y[1]) + T(g.fix.x[0] - 4, g.fix.x[1] + 4, g.fix.y[0], g.fix.y[1], '(' + thDig(500) + ')', { fs: 12, color: '#000' });
    L.rooms.forEach((r, i) => {
      const y0 = g.rows[i], y1 = g.rows[i + 1];
      r.days.forEach((d, k) => { h += d === null ? T(xs[k + 1], xs[k + 2], y0, y1, 'ไม่มีการประเมิน', { fs: 7.5, wrap: true }) : T(xs[k + 1], xs[k + 2], y0, y1, d, { fs: 13 }); });
      if (r.count) h += T(xs[6], xs[7], y0, y1, r.total, { fs: 13, bold: true }) + T(xs[7], xs[8], y0, y1, pct(r.percent), { fs: 11.5 }) + T(xs[8], xs[9], y0, y1, SHORT[r.medal.key], { fs: 9.5, wrap: true });
      else h += RI(xs[6], xs[9], y0, y1) + T(xs[6], xs[9], y0, y1, 'ไม่มีการประเมิน', { fs: 10 });
    });
    return tplPage(g.tpl, L.level, h);
  }

  // ---------- สรุปรายเดือน ----------
  function monthPage(kind, m, L, label) {
    const g = kind === 'classroom' ? G.monC : G.monZ, xs = g.xs;
    const s = dparts(m.mondays[0]), e = dparts(SM.addDays(m.mondays[3], 4));
    let h = F(171, 533.4, g.hy[0] - 1.5, g.hy[1] - 1.5, `${label || MFULL[s.m - 1]} ${s.y}  (${s.d} ${SMON[s.m - 1]} – ${e.d} ${SMON[e.m - 1]} ${e.y})`, { fs: 13, align: 'left' });
    h += R(g.fix.x[0], g.fix.x[1], g.fix.y[0], g.fix.y[1]) + T(g.fix.x[0] - 4, g.fix.x[1] + 4, g.fix.y[0], g.fix.y[1], '(' + thDig(400) + ')', { fs: 12, color: '#000' });
    L.rooms.forEach((r, i) => {
      const y0 = g.rows[i], y1 = g.rows[i + 1];
      r.weeks.forEach((v, k) => { h += v === null ? T(xs[k + 1], xs[k + 2], y0, y1, 'ไม่มีการประเมิน', { fs: 7.5, wrap: true }) : T(xs[k + 1], xs[k + 2], y0, y1, pct(v), { fs: 12 }); });
      if (r.count) h += T(xs[5], xs[6], y0, y1, pct(r.total), { fs: 12, bold: true }) + T(xs[6], xs[7], y0, y1, pct(r.percent), { fs: 12 }) + T(xs[7], xs[8], y0, y1, r.award || '', { fs: 10.5, bold: !!r.award });
      else h += RI(xs[5], xs[8], y0, y1) + T(xs[5], xs[8], y0, y1, 'ไม่มีการประเมิน', { fs: 10 });
    });
    if (kind === 'zone' && FIX_ZONE_HEADING) { /* ใบสรุปเขตไม่มีบรรทัดนี้ */ }
    return tplPage(g.tpl, L.level, h);
  }

  // ---------- ใบเวร ----------
  function rosterPage(date, entries, cfg) {
    const R = root.ROSTER, m = R.mapFromEntries(entries);
    let rows = '';
    R.SECTIONS.forEach(s => {
      rows += `<tr><td colspan="3" class="l" style="font-weight:700;background:#eef2f0">${esc(s.title)}</td></tr>`;
      s.groups.forEach(g => {
        const n = m[s.id + '|' + g] || [];
        const cnt = Math.max(n.length, (s.id === 'classroom' || s.id === 'zone') ? 2 : (s.groups.length > 1 ? 1 : 4));
        for (let i = 0; i < cnt; i++) {
          rows += `<tr style="height:20px">${i === 0 ? `<td rowspan="${cnt}" style="width:30%;font-weight:700">${/^[1-6]$/.test(g) ? 'สายชั้นมัธยมศึกษาปีที่ ' + g : esc(g)}</td>` : ''}<td class="l">${esc(n[i] || '')}</td><td style="width:20%"></td></tr>`;
        }
      });
    });
    const p = dparts(date);
    return `<div class="pg p"><h1>ตารางการปฏิบัติหน้าที่เวรประจำวันสภานักเรียน</h1><h2>${esc(cfg.schoolName || 'โรงเรียนศีขรภูมิพิสัย')}</h2>
      <div class="meta"><span><b>วัน${WD[p.w]}</b></span><span>ที่ ${p.d}</span><span>เดือน ${MONTHS[p.m - 1]}</span><span>พ.ศ. ${p.y}</span></div>
      <table>${rows}</table></div>`;
  }

  // ---------- เครื่องยนต์วาดเป็น PDF ----------
  async function canvases(pageHtml) {
    if (!root.html2canvas) throw new Error('โหลดตัวสร้างรูปภาพไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-20000px;top:0;';
    box.innerHTML = `<style>${CSS}</style>` + pageHtml.join('');
    document.body.appendChild(box);
    try {
      await Promise.all(Array.from(box.querySelectorAll('img')).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      const out = [], pages = box.querySelectorAll('.pg');
      for (let i = 0; i < pages.length; i++) out.push(await root.html2canvas(pages[i], { scale: 2, backgroundColor: '#fff' }));
      return out;
    } finally { box.remove(); }
  }
  function saveCanvas(c, name) {
    return new Promise(res => c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); res(); }, 500); }, 'image/jpeg', 0.95));
  }
  async function build(pageHtml, landscape, fmt) {
    if (!root.html2canvas || !root.jspdf) throw new Error('โหลดตัวสร้าง PDF ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-20000px;top:0;';
    box.innerHTML = `<style>${CSS}</style>` + pageHtml.join('');
    document.body.appendChild(box);
    try {
      const letter = fmt === 'letter';
      const pdf = new root.jspdf.jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'mm', format: letter ? [215.9, 279.4] : 'a4' });
      const W = letter ? 215.9 : (landscape ? 297 : 210), H = letter ? 279.4 : (landscape ? 210 : 297);
      await Promise.all(Array.from(box.querySelectorAll('img')).map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      const pages = box.querySelectorAll('.pg');
      for (let i = 0; i < pages.length; i++) {
        const c = await root.html2canvas(pages[i], { scale: 2, backgroundColor: '#fff' });
        if (i) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, W, H);
      }
      return pdf;
    } finally { box.remove(); }
  }
  const b64 = pdf => pdf.output('datauristring').split(',')[1];

  const PDFX = {
    async export(o) { // สรุปรายสัปดาห์/รายเดือน ทุกชั้น + เก็บ PDF ล่าสุดลง Drive
      const cfg = await o.api('adminGetConfig');
      let pages, name, ref;
      if (o.type === 'week') {
        const w = Object.assign({ kind: o.kind }, o.cur.w);
        pages = w.levels.map(L => weekPage(w.kind, w, L)); ref = o.week;
        name = `สรุปรายสัปดาห์_${o.kind}_${o.week}.pdf`;
      } else {
        const m = o.cur.m; pages = m.levels.map(L => monthPage(o.kind, m, L, o.cycleLabel)); ref = o.cycle;
        name = `สรุปรายเดือน_${o.kind}_${o.cycle}.pdf`;
      }
      const pdf = await build(pages, false, 'letter');
      pdf.save(name);
      try { await o.api('adminSavePdf', { kind: o.kind, type: o.type, ref, base64: b64(pdf) }); } catch (e) { console.warn('บันทึกลง Drive ไม่สำเร็จ', e.message); }
      return name;
    },
    async daily(o) { // ใบรายวัน ม.1-6
      const cfg = await o.api('adminGetConfig');
      const data = await o.api('adminList', { kind: o.kind, from: o.date, to: o.date });
      const pdf = await build(CR.LEVELS.map(l => dailyPage(o.kind, o.date, l, data, cfg)), false, 'letter');
      pdf.save(`ใบประเมินรายวัน_${o.kind}_${o.date}.pdf`);
    },
    // ดาวน์โหลดเป็นรูปภาพ (JPG) ของชั้นเดียว
    async dailyImage(o) { // o: { kind, date, level, data, cfg }
      const [c] = await canvases([dailyPage(o.kind, o.date, o.level, o.data, o.cfg || {})]);
      await saveCanvas(c, `ใบประเมินรายวัน_${o.kind}_ม${o.level}_${o.date}.jpg`);
    },
    async weekImage(o) { // o: { kind, cur, week, level }
      const w = Object.assign({ kind: o.kind }, o.cur.w), L = w.levels.find(x => String(x.level) === String(o.level));
      const [c] = await canvases([weekPage(o.kind, w, L)]);
      await saveCanvas(c, `สรุปรายสัปดาห์_${o.kind}_ม${o.level}_${o.week}.jpg`);
    },
    async monthImage(o) { // o: { kind, cur, cycle, level }
      const L = o.cur.m.levels.find(x => String(x.level) === String(o.level));
      const [c] = await canvases([monthPage(o.kind, o.cur.m, L, o.cycleLabel)]);
      await saveCanvas(c, `สรุปรายเดือน_${o.kind}_ม${o.level}_${o.cycle}.jpg`);
    },
    async roster(o) {
      const cfg = await o.api('adminGetConfig');
      const es = await o.api('rosterGet', { date: o.date });
      const pdf = await build([rosterPage(o.date, es, cfg)], false);
      pdf.save(`ใบเวร_${o.date}.pdf`);
    }
  };
  PDFX._pages = { dailyPage, weekPage, monthPage, rosterPage };
  PDFX._G = G;
  root.PDFX = PDFX;
  if (typeof module !== 'undefined' && module.exports) module.exports = { dailyPage, weekPage, monthPage, rosterPage };
})(typeof window !== 'undefined' ? window : this);
