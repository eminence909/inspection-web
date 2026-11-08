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

  // ---------- ใบรายวัน (1 หน้า = 1 ชั้น) ----------
  function dailyPage(kind, date, level, data, cfg) {
    const def = CR[kind], items = [];
    def.categories.forEach(c => c.items.forEach(i => items.push(i)));
    const by = {}; data.inspections.filter(r => r.level === String(level)).forEach(r => by[r.room] = r);
    const un = {}; data.unavail.filter(u => u.level === String(level)).forEach(u => un[u.room] = u);
    const team = data.teams.find(t => t.level === String(level)), names = team ? team.names : [];
    let t = '<table><tr><th rowspan="2" style="width:46px">ห้อง</th>' +
      def.categories.map(c => `<th colspan="${c.items.length + 1}" class="s">${c.no}. ${esc(c.title)}</th>`).join('') + '<th rowspan="2" style="width:46px">รวม<br>(100)</th></tr><tr>' +
      def.categories.map(c => c.items.map(i => `<th>${i.id}<div class="s" style="font-weight:400">(${i.max})</div></th>`).join('') + `<th class="s">รวม<br>${c.max}</th>`).join('') + '</tr>';
    for (let r = 1; r <= CR.ROOMS; r++) {
      const x = by[r];
      t += `<tr style="height:30px"><td><b>${level}/${r}</b></td>`;
      if (x) {
        const tt = K.dailyTotals(kind, x.scores);
        t += def.categories.map((c, ci) => c.items.map(i => `<td>${x.scores[i.id]}</td>`).join('') + `<td style="background:#eef2f0"><b>${tt.cats[ci].sum}</b></td>`).join('') + `<td><b>${tt.total}</b></td>`;
      } else t += `<td colspan="${items.length + def.categories.length + 1}" class="s">${un[r] ? '🔒 ' + esc(un[r].reason + (un[r].text ? ' (' + un[r].text + ')' : '')) : NA}</td>`;
      t += '</tr>';
    }
    t += '</table>';
    const sl = [0, 1, 2].map(i => ({ role: 'ผู้ตรวจ ' + (i + 1), name: names[i] || '' }))
      .concat([{ role: 'หัวหน้าอาคาร', name: cfg.headBuilding }, { role: 'ประธานสภานักเรียน', name: cfg.councilPresident }, { role: 'ที่ปรึกษาสภานักเรียน', name: cfg.advisor }]);
    return `<div class="pg l">${head(kind, 'ประจำวัน', `<span><b>ระดับชั้นมัธยมศึกษาปีที่ ${level}</b></span><span>${thFull(date)}</span><span>${esc(cfg.term || '')}</span>`)}${t}${sigBlock(sl)}</div>`;
  }

  // ---------- สรุปรายสัปดาห์ ----------
  function weekPage(kind, w, L, cfg) {
    let t = `<table><tr><th rowspan="2" style="width:56px">ห้อง</th>${w.dates.map((d, i) => `<th>${['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'][i]}<div class="s" style="font-weight:400">${thShort(d)}</div></th>`).join('')}<th rowspan="2">รวมคะแนน<br>(เต็ม 500)</th><th rowspan="2">ร้อยละ</th><th rowspan="2">ผลการประเมิน</th></tr><tr>${w.dates.map(() => '<th class="s">(100)</th>').join('')}</tr>`;
    L.rooms.forEach(r => {
      t += `<tr style="height:30px" class="${r.medal ? r.medal.key : ''}"><td><b>${L.level}/${r.room}</b></td>` + r.days.map(d => d === null ? `<td class="s">${NA}</td>` : `<td>${d}</td>`).join('') +
        (r.count ? `<td><b>${r.total}</b></td><td>${pct(r.percent)}</td><td>${esc(r.medal.label)}</td>` : `<td colspan="3" class="s">${NA}</td>`) + '</tr>';
    });
    t += '</table><div style="font-size:11px;margin-top:6px">เกณฑ์: ร้อยละ 80–100 เหรียญทอง · 70–79 เหรียญเงิน · 60–69 เหรียญทองแดง · 50–59 ผ่านเกณฑ์เบื้องต้น · ต่ำกว่า 50 ไม่ผ่านเกณฑ์ (คิดเฉพาะวันที่มีการประเมิน)</div>';
    const sl = [{ role: 'หัวหน้าอาคาร', name: cfg.headBuilding }, { role: 'ประธานสภานักเรียน', name: cfg.councilPresident }, { role: 'ที่ปรึกษาสภานักเรียน', name: cfg.advisor }];
    return `<div class="pg l">${head(w.kind, 'สรุปผลรายสัปดาห์', `<span><b>ระดับชั้นมัธยมศึกษาปีที่ ${L.level}</b></span><span>วันที่ ${thLong(w.dates[0])} – ${thLong(w.dates[4])}</span><span>${esc(cfg.term || '')}</span>`)}${t}${sigBlock(sl)}</div>`;
  }

  // ---------- สรุปรายเดือน ----------
  function monthPage(kind, m, L, cfg) {
    let t = `<table><tr><th style="width:56px">ห้อง</th>${m.mondays.map((d, i) => `<th>สัปดาห์ที่ ${i + 1}<div class="s" style="font-weight:400">ร้อยละ</div></th>`).join('')}<th>รวมคะแนน<br>(เต็ม 400)</th><th>ร้อยละ</th><th>ผลการประเมิน</th><th>รางวัล</th></tr>`;
    L.rooms.forEach(r => {
      t += `<tr style="height:30px" class="${r.medal ? r.medal.key : ''}"><td><b>${L.level}/${r.room}</b></td>` + r.weeks.map(x => x === null ? `<td class="s">${NA}</td>` : `<td>${pct(x)}</td>`).join('') +
        (r.count ? `<td><b>${pct(r.total)}</b></td><td>${pct(r.percent)}</td><td>${esc(r.medal.label)}</td><td><b>${esc(r.award || '')}</b></td>` : `<td colspan="4" class="s">${NA}</td>`) + '</tr>';
    });
    t += `</table><div style="font-size:11px;margin-top:6px">รางวัลจัดอันดับในแต่ละระดับชั้น · เมื่อคะแนนเท่ากันพิจารณา${kind === 'classroom' ? 'หมวด 4 แล้วหมวด 5' : 'หมวด 4'} · สัปดาห์ที่ไม่มีการประเมินไม่นำมาคิด</div>`;
    const sl = [{ role: 'หัวหน้าอาคาร', name: cfg.headBuilding }, { role: 'ประธานสภานักเรียน', name: cfg.councilPresident }, { role: 'ที่ปรึกษาสภานักเรียน', name: cfg.advisor }, { role: 'รองผู้อำนวยการฝ่ายบริหารงานทั่วไป', name: cfg.deputyDirector }, { role: 'ผู้อำนวยการโรงเรียน', name: cfg.director }];
    return `<div class="pg l">${head(kind, 'สรุปผลรายเดือน', `<span><b>ระดับชั้นมัธยมศึกษาปีที่ ${L.level}</b></span><span>วันที่ ${thLong(m.mondays[0])} – ${thLong(SM.addDays(m.mondays[3], 4))}</span><span>${esc(cfg.term || '')}</span>`)}${t}${sigBlock(sl)}</div>`;
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
  async function build(pageHtml, landscape) {
    if (!root.html2canvas || !root.jspdf) throw new Error('โหลดตัวสร้าง PDF ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)');
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-20000px;top:0;';
    box.innerHTML = `<style>${CSS}</style>` + pageHtml.join('');
    document.body.appendChild(box);
    try {
      const pdf = new root.jspdf.jsPDF({ orientation: landscape ? 'l' : 'p', unit: 'mm', format: 'a4' });
      const W = landscape ? 297 : 210, H = landscape ? 210 : 297;
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
        pages = w.levels.map(L => weekPage(w.kind, w, L, cfg)); ref = o.week;
        name = `สรุปรายสัปดาห์_${o.kind}_${o.week}.pdf`;
      } else {
        const m = o.cur.m; pages = m.levels.map(L => monthPage(o.kind, m, L, cfg)); ref = o.cycle;
        name = `สรุปรายเดือน_${o.kind}_${o.cycle}.pdf`;
      }
      const pdf = await build(pages, true);
      pdf.save(name);
      try { await o.api('adminSavePdf', { kind: o.kind, type: o.type, ref, base64: b64(pdf) }); } catch (e) { console.warn('บันทึกลง Drive ไม่สำเร็จ', e.message); }
      return name;
    },
    async daily(o) { // ใบรายวัน ม.1-6
      const cfg = await o.api('adminGetConfig');
      const data = await o.api('adminList', { kind: o.kind, from: o.date, to: o.date });
      const pdf = await build(CR.LEVELS.map(l => dailyPage(o.kind, o.date, l, data, cfg)), true);
      pdf.save(`ใบประเมินรายวัน_${o.kind}_${o.date}.pdf`);
    },
    async roster(o) {
      const cfg = await o.api('adminGetConfig');
      const es = await o.api('rosterGet', { date: o.date });
      const pdf = await build([rosterPage(o.date, es, cfg)], false);
      pdf.save(`ใบเวร_${o.date}.pdf`);
    }
  };
  PDFX._pages = { dailyPage, weekPage, monthPage, rosterPage };
  root.PDFX = PDFX;
  if (typeof module !== 'undefined' && module.exports) module.exports = { dailyPage, weekPage, monthPage, rosterPage };
})(typeof window !== 'undefined' ? window : this);
