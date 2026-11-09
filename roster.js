/* ระบบเวร: โครงสร้างหมวด, ตัวแยกข้อมูลที่วางจากชีต, หน้าดูเวร, ตัวแก้ไขเวร (ใช้ร่วมกันหลายหน้า) */
(function (root) {
  const LEVELS = [1, 2, 3, 4, 5, 6];
  const lv = l => String(l);
  const SECTIONS = [
    { id: 'flag', title: 'กิจกรรมหน้าเสาธง', groups: [''] },
    { id: 'late', title: 'กิจกรรมมาสายประจำ นิติธรรมแก้ได้', groups: [''] },
    { id: 'classroom', title: 'ตรวจห้องเรียนสะอาด', groups: LEVELS.map(lv) },
    { id: 'zone', title: 'ตรวจเขตพื้นที่รับผิดชอบ', groups: LEVELS.map(lv) },
    { id: 'pnn', title: 'กิจกรรมพี่ไหว้น้อง น้องไหว้พี่ เพื่อนไหว้เพื่อน', groups: ['หน้าโรงอาหาร', 'หน้าป้อมยาม'] },
    { id: 'radio', title: 'กิจกรรมประชาสัมพันธ์เสียงตามสาย', groups: [''] }
  ];
  const groupLabel = g => /^[1-6]$/.test(g) ? 'ม.' + g : g;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const thDig = s => String(s).replace(/[๐-๙]/g, c => '๐๑๒๓๔๕๖๗๘๙'.indexOf(c));

  // ข้อความที่คัดลอกจากชีต (คั่นด้วยแท็บ) -> { 'section|grp': [names] }
  function parsePaste(text) {
    const map = {}; let sec = null, grp = '';
    const add = (n) => {
      if (!sec) return; const k = sec + '|' + grp; (map[k] = map[k] || []);
      if (n && map[k].indexOf(n) < 0) map[k].push(n);
    };
    String(text || '').split(/\r?\n/).forEach(line => {
      const cells = line.split('\t').map(c => c.trim());
      const first = cells.filter(Boolean)[0]; if (!first) return;
      const head = cells.find(Boolean);
      if (/^ตาราง|^วัน\s|โรงเรียน/.test(head) && !/ตรวจ|กิจกรรม/.test(head)) return;
      const hs = [[/เสาธง/, 'flag'], [/มาสาย/, 'late'], [/ตรวจห้อง/, 'classroom'], [/ตรวจเขต/, 'zone'], [/ไหว้/, 'pnn'], [/เสียงตามสาย|ประชาสัมพันธ์/, 'radio']];
      const h = hs.find(x => x[0].test(head));
      if (h && !cells[1]) { sec = h[1]; grp = (sec === 'classroom' || sec === 'zone') ? '' : ''; return; }
      let rest = cells;
      const lvl = thDig(cells[0] || '').match(/ปีที่\s*([1-6])|^ม\.?\s*([1-6])\b/);
      if (lvl && (sec === 'classroom' || sec === 'zone')) { grp = lvl[1] || lvl[2]; rest = cells.slice(1); }
      else if (sec === 'pnn' && /โรงอาหาร/.test(cells[0] || '')) { grp = 'หน้าโรงอาหาร'; rest = cells.slice(1); }
      else if (sec === 'pnn' && /ป้อมยาม/.test(cells[0] || '')) { grp = 'หน้าป้อมยาม'; rest = cells.slice(1); }
      else if (cells[0] === '' ) rest = cells.slice(1);
      if ((sec === 'classroom' || sec === 'zone') && !grp) return;
      const name = rest.find(Boolean); if (name) add(name);
    });
    return map;
  }

  // ---------- อ่านเวรจากรูปภาพ (ข้อความจาก OCR -> แยกหมวด/ชั้น/ชื่อ แล้วแก้ชื่อให้ตรงรายชื่อแอดมิน) ----------
  const PFX = /(นางสาว|นาง|นาย|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|น\.ส\.)/;
  const skel = s => String(s).replace(/^\s*(นางสาว|นาง|นาย|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|น\.ส\.)/, '').replace(/[\s\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '');
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let p = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; }
    return p[n];
  }
  function matchKnown(raw, known) {
    const k = skel(raw); if (k.length < 3) return null; let best = null, bs = 0;
    known.forEach(n => { // เทียบกับส่วนหัวของข้อความที่อ่านได้ (ตัดขยะท้ายบรรทัดจากช่องข้าง ๆ ได้)
      const q = skel(n); if (!q) return; let sc = 0;
      for (let L = Math.max(3, q.length - 2); L <= Math.min(k.length, q.length + 2); L++) sc = Math.max(sc, 1 - lev(k.slice(0, L), q) / q.length);
      if (sc > bs) { bs = sc; best = n; }
    });
    return bs >= 0.7 ? best : null;
  }
  // ตัดขยะท้ายบรรทัด: เก็บคำนำหน้า + ชื่อ + นามสกุล (อย่างมาก 2 คำ) และหยุดที่คำแรกที่มีตัวเลข/สัญลักษณ์
  function cleanName(t, cand) {
    const m = t.match(PFX);
    if (m) {
      const rest = t.slice(m.index + m[0].length).trim(), isTh = x => /^[\u0E00-\u0E7F]+$/.test(x);
      let toks = []; for (const x of rest.split(' ')) { if (!x) continue; if (!isTh(x)) { const lead = x.match(/^[\u0E00-\u0E7F]+/); if (lead && !toks.length) toks.push(lead[0]); break; } toks.push(x); }
      if (toks.length > 2 && toks.filter(x => x.length <= 2).length > toks.length * 0.4) toks = [toks.join('')]; // ตัวอักษรถูกเว้นวรรคทีละตัว
      if (toks.length) return m[0] + toks.slice(0, 2).join(' ');
    }
    return cand.replace(PFX, '$1 ').replace(/[^\u0E00-\u0E7F ]+.*$/, '').trim();
  }
  // มีคำสำคัญในบรรทัดไหม (ยอมให้ตัวอ่านผิด 1 ตัวอักษรเมื่อคำยาวพอ)
  function hasKw(flat, kw) {
    if (flat.indexOf(kw) >= 0) return true; if (kw.length < 5) return false;
    for (let i = 0; i + kw.length <= flat.length; i++) if (lev(flat.slice(i, i + kw.length), kw) <= 1) return true;
    return false;
  }
  // input: ข้อความทั้งก้อน หรือรายการบรรทัด [{ text, y }] (y = ตำแหน่งแนวตั้งในรูป ใช้จับว่าชื่อไหนอยู่ข้างป้ายชั้นไหน)
  function parseOcr(input, known) {
    known = known || [];
    const lines = Array.isArray(input) ? input : String(input || '').split(/\r?\n/).map((t, i) => ({ text: t, y: i }));
    const HS = [['เสาธง', 'flag'], ['มาสาย', 'late'], ['ตรวจห้อง', 'classroom'], ['ตรวจเขต', 'zone'], ['ไหว้', 'pnn'], ['เสียงตามสาย', 'radio'], ['ประชาสัมพันธ์', 'radio']];
    const items = []; let sec = null, lv = 0;
    lines.forEach(L => {
      const t = thDig(L.text).replace(/[|_\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) return;
      const flat = t.replace(/\s+/g, ''), hasP = PFX.test(flat);
      if (!hasP) { const h = HS.find(x => hasKw(flat, x[0])); if (h) { sec = h[1]; lv = 0; return; } }
      if (!sec) return;
      let label = null;
      if (sec === 'classroom' || sec === 'zone') {
        if (/สายชั้น|ปีที่|มัธยม/.test(flat) && !/โรงเรียน/.test(flat)) { const d = flat.match(/ปีที่([1-6])/); lv = d && Number(d[1]) > lv ? Number(d[1]) : lv + 1; label = String(Math.min(lv, 6)); }
      } else if (sec === 'pnn') { if (/โรงอาหาร/.test(flat)) label = 'หน้าโรงอาหาร'; else if (/ป้อมยาม/.test(flat)) label = 'หน้าป้อมยาม'; }
      if (label) items.push({ sec, kind: 'label', y: L.y, grp: label });
      // ชื่อ: มีคำนำหน้า หรือ (คำนำหน้าอ่านผิด) ใกล้เคียงชื่อในรายชื่อแอดมิน
      const cand = hasP ? flat.slice(flat.search(PFX)) : flat.replace(/^[0-9.]+/, '');
      let name = hasP || known.length ? matchKnown(cand, known) : null, unk = false;
      if (!name && hasP) { name = cleanName(t, cand); unk = true; }
      if (name) items.push({ sec, kind: 'name', y: L.y, name, unk });
    });
    const map = {}, unknown = [], put = (sec, grp, name, unk) => { const k = sec + '|' + grp; (map[k] = map[k] || []); if (map[k].indexOf(name) < 0) { map[k].push(name); if (unk) unknown.push(name); } };
    ['flag', 'late', 'radio', 'classroom', 'zone', 'pnn'].forEach(sc => {
      const its = items.filter(i => i.sec === sc), labels = its.filter(i => i.kind === 'label');
      its.filter(i => i.kind === 'name').forEach(n => {
        if (sc === 'flag' || sc === 'late' || sc === 'radio') return put(sc, '', n.name, n.unk);
        let best = null, bd = 1e9; // ป้ายที่อยู่ใกล้ที่สุดตามแนวตั้ง (เท่ากันให้ป้ายที่อยู่ถัดลงไป เพราะชื่อแรกของกลุ่มอยู่เหนือป้าย)
        labels.forEach(l => { const d = Math.abs(l.y - n.y); if (d < bd || (d === bd && l.y > n.y)) { bd = d; best = l; } });
        if (best) put(sc, best.grp, n.name, n.unk);
      });
    });
    return { map, unknown };
  }
  function loadScript(src) { return new Promise((res, rej) => { if (window.Tesseract) return res(); const e = document.createElement('script'); e.src = src; e.onload = res; e.onerror = () => rej(new Error('โหลดตัวอ่านภาพไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต')); document.head.appendChild(e); }); }
  function prepImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const sc = Math.max(1, Math.min(3, 2200 / im.width)), c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
        for (let i = 0; i < p.length; i += 4) { let v = p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11; v = v < 165 ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; }
        // ลบเส้นตาราง (เส้นยาวแนวนอน/แนวตั้ง) เพราะทำให้ตัวอ่านเห็นเป็นอักขระขยะ
        const W = c.width, H = c.height, dark = (x, y) => p[(y * W + x) * 4] < 128, wipe = (x, y) => { p[(y * W + x) * 4] = p[(y * W + x) * 4 + 1] = p[(y * W + x) * 4 + 2] = 255; };
        const hmin = Math.round(W * 0.06), vmin = Math.round(45 * sc), mask = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) { let x = 0; while (x < W) { if (!dark(x, y)) { x++; continue; } let e = x; while (e < W && dark(e, y)) e++; if (e - x >= hmin) for (let k = x; k < e; k++) mask[y * W + k] = 1; x = e; } }
        for (let x = 0; x < W; x++) { let y = 0; while (y < H) { if (!dark(x, y)) { y++; continue; } let e = y; while (e < H && dark(x, e)) e++; if (e - y >= vmin) for (let k = y; k < e; k++) mask[k * W + x] = 1; y = e; } }
        for (let i = 0; i < mask.length; i++) if (mask[i]) { p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = 255; }
        g.putImageData(d, 0, 0); URL.revokeObjectURL(url); c.toBlob(b => res(b), 'image/png');
      };
      im.onerror = () => rej(new Error('เปิดรูปภาพไม่ได้')); im.src = url;
    });
  }
  const mapFromEntries = es => { const m = {}; (es || []).forEach(e => m[e.section + '|' + (e.grp || '')] = e.names.slice()); return m; };
  const entriesFromMap = m => Object.keys(m).filter(k => m[k].length).map(k => { const i = k.indexOf('|'); return { section: k.slice(0, i), grp: k.slice(i + 1), names: m[k] }; });

  // หน้าดูเวร (อ่านอย่างเดียว) แบบการ์ด q = คำค้นชื่อ: แสดงเฉพาะชื่อที่ตรงและไฮไลต์
  const SCOL = { flag: '#e3b341', late: '#e8806a', classroom: '#6fb8e6', zone: '#b7d43a', pnn: '#c796e6', radio: '#5fd0b5' };
  function viewHtml(entries, q) {
    const m = mapFromEntries(entries), key = String(q || '').trim().toLowerCase();
    if (!entries.length) return '<div class="card"><div class="note">ยังไม่มีการจัดเวรของวันนี้</div></div>';
    const hl = n => { if (!key) return esc(n); const i = n.toLowerCase().indexOf(key); return i < 0 ? esc(n) : esc(n.slice(0, i)) + '<mark>' + esc(n.slice(i, i + key.length)) + '</mark>' + esc(n.slice(i + key.length)); };
    let hit = 0;
    const html = SECTIONS.map(s => {
      const boxes = s.groups.map(g => {
        let n = m[s.id + '|' + g]; if (!n) return '';
        if (key) n = n.filter(x => x.toLowerCase().indexOf(key) >= 0);
        if (!n.length) return '';
        hit += n.length;
        const lab = groupLabel(g);
        return `<div class="rbox">${lab ? `<div class="rh"><span class="lv">${esc(lab)}</span><small>${n.length} คน</small></div>` : ''}${n.map((x, i) => `<div class="nm"><span class="no">${i + 1}</span><span>${hl(x)}</span></div>`).join('')}</div>`;
      }).join('');
      return boxes ? `<section class="rsec" style="--sc:${SCOL[s.id]}"><h3>${esc(s.title)}</h3><div class="rgrid${s.groups.length === 1 ? ' one' : ''}">${boxes}</div></section>` : '';
    }).join('');
    if (key && !hit) return '<div class="card"><div class="note">ไม่พบชื่อ "' + esc(q) + '" ในเวรวันนี้</div></div>';
    return html;
  }
  const thShort = d => { const [y, m, dd] = d.split('-').map(Number), W = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'], M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']; return W[new Date(y, m - 1, dd).getDay()] + ' ' + dd + ' ' + M[m - 1] + ' ' + String(y + 543).slice(2); };
  // แถบวันที่ย้อนหลัง: dates = [{date,count}] cur = วันที่เลือกอยู่ today = วันนี้
  function historyHtml(dates, cur, today) {
    const list = dates.slice(); if (today && !list.some(x => x.date === today)) list.unshift({ date: today, count: 0 });
    return '<div class="hist">' + list.map(x => `<button type="button" class="hchip${x.date === cur ? ' on' : ''}" data-d="${x.date}"><b>${esc(x.date === today ? 'วันนี้' : thShort(x.date))}</b><small>${x.count ? x.count + ' ชื่อ' : 'ยังไม่จัด'}</small></button>`).join('') + '</div>';
  }

  // ตัดคำนำหน้า/ช่องว่าง เพื่อเทียบชื่อ
  const bare = n => String(n || '').replace(/^\s*(นางสาว|นาง|นาย|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|น\.ส\.)/, '').replace(/\s+/g, '');
  // ชื่อในรายชื่อที่ใกล้เคียงกับที่พิมพ์ที่สุด (สูงสุด n ชื่อ)
  function suggest(q, list, n) {
    const k = bare(q); if (!k) return [];
    const out = [];
    list.forEach(nm => {
      const b = bare(nm); if (!b) return;
      let sc;
      if (b === k) sc = -1; else if (b.indexOf(k) === 0) sc = 0; else if (b.indexOf(k) > 0) sc = 0.5;
      else { const d = Math.min(lev(k, b.slice(0, k.length)), lev(k, b)); sc = d <= Math.max(1, Math.floor(k.length * 0.34)) ? 1 + d : null; }
      if (sc !== null) out.push({ nm, sc });
    });
    return out.sort((a, b) => a.sc - b.sc).slice(0, n || 4).map(x => x.nm);
  }
  // ชื่อซ้ำในรายการ (เทียบแบบไม่สนคำนำหน้า/ช่องว่าง)
  function dupes(arr) { const m = {}, r = []; arr.forEach(x => { const k = bare(x); if (!k) return; m[k] = (m[k] || 0) + 1; if (m[k] === 2) r.push(x); }); return r; }

  // ตัวแก้ไขเวรของวัน
  function mountEditor(el, o) {
    // o: { api(action,params), date, today?, onChange? }
    let date = o.date;
    el.innerHTML = `<div class="card"><div class="tb"><div><label>วันที่จัดเวร</label><input type="date" id="rd" value="${date}"></div>
      <div><label>คัดลอกจากวันที่</label><input type="date" id="rc"></div>
      <button class="btn sec" id="rcb" style="margin:0;flex:0 0 100px">คัดลอก</button></div>
      <details><summary style="cursor:pointer;font-weight:600;color:var(--b)">วางรายชื่อจากชีต (Google Sheet)</summary>
        <div class="muted" style="margin:6px 0">คัดลอกตารางเวรทั้งหมดจากชีตแล้ววางที่นี่ ระบบแยกหมวดและชั้นให้เอง</div>
        <textarea id="rp" placeholder="วางที่นี่..." style="min-height:110px"></textarea>
        <button class="btn sec" id="rpb">นำเข้าและแสดงในช่องด้านล่าง</button></details></div>
      <div class="card"><details><summary style="cursor:pointer;font-weight:600;color:var(--b)">อ่านจากรูปภาพ (สกรีนช็อตหรือรูปถ่ายตารางเวร)</summary>
        <div class="muted" style="margin:6px 0">เลือกรูปตารางเวรทั้งหน้า ระบบอ่านตัวอักษรไทยในเครื่อง แยกหมวดและชั้นให้ แล้วแก้ชื่อให้ตรงรายชื่อที่แอดมินตั้งไว้ ครั้งแรกต้องโหลดตัวอ่านภาษาไทยประมาณ 10 MB (ต้องมีอินเทอร์เน็ต) อาจใช้เวลาสักครู่ และต้องตรวจทานก่อนกดบันทึก<br>เคล็ดลับ: ให้แอดมินใส่รายชื่อสมาชิกสภาทั้งหมดไว้ที่ ตั้งค่า → รายชื่อผู้ตรวจ ระบบจะแก้ชื่อที่อ่านเพี้ยนให้ตรงชื่อจริงเอง</div>
        <input type="file" id="ri" accept="image/*"><button class="btn sec" id="rib">อ่านรูปและแสดงในช่องด้านล่าง</button><div id="rst" class="muted"></div></details></div>
      <div class="card"><h3 style="margin:0 0 8px">เวรย้อนหลัง / ปัจจุบัน</h3><div class="muted" style="margin-bottom:8px">แตะวันที่เพื่อเปิดดูและแก้ไขเวรของวันนั้น</div><div id="rh"></div>
        <details style="margin-top:10px"><summary style="cursor:pointer;font-weight:600;color:var(--b)">ดูเวรวันที่เลือกแบบอ่าน</summary><div id="rv" style="margin-top:8px"></div></details></div>
      <div class="card"><details><summary style="cursor:pointer;font-weight:600;color:var(--b)">รายชื่อผู้ตรวจ (ใช้เติมชื่ออัตโนมัติ)</summary>
        <div class="muted" style="margin:6px 0">หนึ่งชื่อต่อหนึ่งบรรทัด ใช้ร่วมกับรายชื่อในระบบแอดมิน แก้ที่ไหนก็ตรงกัน</div>
        <textarea id="nml" style="min-height:140px"></textarea><div id="nmw"></div>
        <button class="btn sec" id="nms">บันทึกรายชื่อ</button></details></div>
      <div id="rw"></div>
      <div id="rf"></div>
      <button class="btn" id="rs">บันทึกเวรวันที่นี้</button>`;
    const $ = id => el.querySelector('#' + id);
    let state = {};
    function draw() {
      $('rf').innerHTML = SECTIONS.map(s => `<div class="card"><h3>${esc(s.title)}</h3>` + s.groups.map(g => {
        const v = (state[s.id + '|' + g] || []).join('\n');
        return `<label>${esc(groupLabel(g) || 'รายชื่อ')}</label><textarea data-k="${esc(s.id + '|' + g)}" rows="${Math.max(2, (state[s.id + '|' + g] || []).length + 1)}" style="min-height:0" placeholder="หนึ่งชื่อต่อหนึ่งบรรทัด พิมพ์แล้วเลือกชื่อที่แนะนำ">${esc(v)}</textarea><div class="sug" data-s="${esc(s.id + '|' + g)}"></div>`;
      }).join('') + '</div>').join('');
      el.querySelectorAll('textarea[data-k]').forEach(t => {
        const box = () => el.querySelector('.sug[data-s="' + t.dataset.k.replace(/"/g, '\\"') + '"]');
        const upd = () => {
          state[t.dataset.k] = t.value.split('\n').map(x => x.trim()).filter(Boolean); warn();
          const pos = t.selectionStart, ls = t.value.lastIndexOf('\n', pos - 1) + 1; let le = t.value.indexOf('\n', pos); if (le < 0) le = t.value.length;
          const cur = t.value.slice(ls, le).trim(), b = box(); if (!b) return;
          const sg = cur.length >= 2 ? suggest(cur, known, 4).filter(x => x !== cur) : [];
          b.innerHTML = sg.map(x => '<button type="button" class="chip" data-n="' + esc(x) + '">' + esc(x) + '</button>').join('');
          b.querySelectorAll('.chip').forEach(c => c.onmousedown = c.ontouchstart = ev => {
            ev.preventDefault(); const nm = c.dataset.n; t.value = t.value.slice(0, ls) + nm + t.value.slice(le); const np = ls + nm.length; t.setSelectionRange(np, np);
            b.innerHTML = ''; state[t.dataset.k] = t.value.split('\n').map(x => x.trim()).filter(Boolean); warn(); t.focus();
          });
        };
        t.oninput = upd; t.onclick = t.onkeyup = upd;
      });
      warn();
    }
    // เตือนชื่อซ้ำ: ในหมวดเดียวกัน (ผิดปกติ) และข้ามหมวดในวันเดียวกัน
    function warn() {
      const msgs = [];
      SECTIONS.forEach(s => {
        const all = []; s.groups.forEach(g => (state[s.id + '|' + g] || []).forEach(n => all.push(n)));
        dupes(all).forEach(n => msgs.push('"' + n + '" ซ้ำในหมวด ' + s.title));
      });
      const bySec = {}; SECTIONS.forEach(s => { const set = {}; s.groups.forEach(g => (state[s.id + '|' + g] || []).forEach(n => set[bare(n)] = n)); bySec[s.id] = set; });
      const seen = {}; SECTIONS.forEach(s => Object.keys(bySec[s.id]).forEach(k => { (seen[k] = seen[k] || { n: bySec[s.id][k], t: [] }).t.push(s.title); }));
      Object.keys(seen).forEach(k => { if (seen[k].t.length > 1) msgs.push('"' + seen[k].n + '" อยู่หลายหมวดในวันเดียวกัน (' + seen[k].t.join(', ') + ')'); });
      const w = $('rw'); if (w) w.innerHTML = msgs.length ? '<div class="note" style="border-color:#e0a030">ตรวจพบชื่อซ้ำ ตรวจสอบอีกครั้ง:<br>' + msgs.map(esc).join('<br>') + '</div>' : '';
    }
    let known = [];
    const loadNames = () => o.api('init', {}).then(i => { known = i.names || []; $('nml').value = known.join('\n'); nmWarn(); }).catch(() => {});
    function nmWarn() { const d = dupes($('nml').value.split('\n').map(x => x.trim()).filter(Boolean)); $('nmw').innerHTML = d.length ? '<div class="note" style="border-color:#e0a030">ชื่อซ้ำในรายชื่อ: ' + d.map(esc).join(', ') + '</div>' : ''; }
    $('nml').oninput = nmWarn;
    $('nms').onclick = async () => {
      const list = $('nml').value.split('\n').map(x => x.trim()).filter(Boolean), d = dupes(list);
      if (d.length && !confirm('มีชื่อซ้ำ: ' + d.join(', ') + '\nบันทึกต่อไปหรือไม่?')) return;
      try { await o.api('rosterSetNames', { list }); known = list; o.toast && o.toast('บันทึกรายชื่อแล้ว'); } catch (e) { o.toast && o.toast(e.message); }
    };
    loadNames();
    let hdates = [];
    const todayISO = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    function drawHist() {
      const h = $('rh'); h.innerHTML = historyHtml(hdates, date, todayISO());
      h.querySelectorAll('.hchip').forEach(b => b.onclick = () => { date = b.dataset.d; $('rd').value = date; o.onChange && o.onChange(date); load(date); h.scrollIntoView({ block: 'nearest' }); });
      const on = h.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const loadHist = () => o.api('rosterDates', {}).then(d => { hdates = d || []; drawHist(); }).catch(() => drawHist());
    async function load(d) {
      $('rf').innerHTML = '<div class="spin">กำลังโหลด...</div>';
      let es = [];
      try { es = await o.api('rosterGet', { date: d }); state = mapFromEntries(es); } catch (e) { state = {}; o.toast && o.toast(e.message); }
      draw(); drawHist(); $('rv').innerHTML = viewHtml(es, '');
    }
    $('rd').onchange = e => { if (e.target.value) { date = e.target.value; o.onChange && o.onChange(date); load(date); } };
    $('rcb').onclick = async () => {
      const d = $('rc').value; if (!d) return o.toast && o.toast('เลือกวันที่ต้นทาง');
      try { state = mapFromEntries(await o.api('rosterGet', { date: d })); draw(); o.toast && o.toast('คัดลอกแล้ว กดบันทึกเพื่อยืนยัน'); } catch (e) { o.toast && o.toast(e.message); }
    };
    $('rpb').onclick = () => {
      const m = parsePaste($('rp').value), n = Object.keys(m).length;
      if (!n) return o.toast && o.toast('ไม่พบรายชื่อในข้อความที่วาง');
      state = m; draw(); o.toast && o.toast('นำเข้า ' + n + ' ช่อง ตรวจแล้วกดบันทึก');
    };
    $('rib').onclick = async () => {
      const f = $('ri').files[0], st = $('rst'); if (!f) return o.toast && o.toast('เลือกรูปภาพก่อน');
      const btn = $('rib'); btn.disabled = true; let worker;
      try {
        st.textContent = 'กำลังโหลดตัวอ่านภาษาไทย...';
        await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');
        const [blob, init] = await Promise.all([prepImage(f), o.api('init', {}).catch(() => ({ names: [] }))]);
        worker = await window.Tesseract.createWorker('tha', 1, { logger: m => { if (m.status === 'recognizing text') st.textContent = 'กำลังอ่านรูป ' + Math.round(m.progress * 100) + '%'; else if (m.status) st.textContent = 'กำลังเตรียมตัวอ่าน... (' + m.status + ')'; } });
        await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
        const r = await worker.recognize(blob);
        const dl = (r.data.lines || []).filter(l => l.text && l.bbox).map(l => ({ text: l.text, y: (l.bbox.y0 + l.bbox.y1) / 2 }));
        const out = parseOcr(dl.length ? dl : r.data.text, init.names || []), n = Object.keys(out.map).length;
        if (!n) { st.textContent = 'อ่านไม่พบรายชื่อ ลองใช้รูปที่ชัดและเห็นทั้งตาราง หรือใช้วางจากชีตแทน'; return; }
        state = out.map; draw();
        st.textContent = 'อ่านได้ ' + n + ' ช่อง' + (out.unknown.length ? ' · ชื่อที่ไม่ตรงรายชื่อแอดมิน (ตรวจแก้): ' + out.unknown.join(', ') : ' · ชื่อทั้งหมดตรงรายชื่อแอดมิน') + ' · ตรวจแล้วกดบันทึก';
      } catch (e) { st.textContent = ''; o.toast && o.toast(e.message || 'อ่านรูปไม่สำเร็จ'); }
      finally { btn.disabled = false; if (worker) worker.terminate().catch(() => {}); }
    };
    $('rs').onclick = async () => {
      try { await o.api('rosterSave', { date, entries: entriesFromMap(state) }); o.toast && o.toast('บันทึกเวรแล้ว'); loadHist(); $('rv').innerHTML = viewHtml(entriesFromMap(state).map(e => e), ''); o.onChange && o.onChange(date); }
      catch (e) { o.toast && o.toast(e.message); }
    };
    loadHist(); load(date);
  }

  const api = { SECTIONS, parsePaste, parseOcr, matchKnown, prepImage, viewHtml, historyHtml, thShort, suggest, bare, mountEditor, mapFromEntries, groupLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ROSTER = api;
})(typeof window !== 'undefined' ? window : this);
