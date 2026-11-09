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
    known.forEach(n => { const q = skel(n); if (!q) return; const sc = 1 - lev(k, q) / Math.max(k.length, q.length); if (sc > bs) { bs = sc; best = n; } });
    return bs >= 0.7 ? best : null;
  }
  function parseOcr(text, known) {
    known = known || []; const map = {}, unknown = [], HS = [[/เสาธง/, 'flag'], [/มาสาย/, 'late'], [/ตรวจห้อง/, 'classroom'], [/ตรวจเขต/, 'zone'], [/ไหว้/, 'pnn'], [/เสียงตามสาย|ประชาสัมพันธ์/, 'radio']];
    let sec = null, grp = '', lv = 0;
    String(text || '').split(/\r?\n/).forEach(line => {
      const t = thDig(line).replace(/[|_\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) return;
      const flat = t.replace(/\s+/g, '');
      const hasName = PFX.test(flat);
      const h = !hasName && HS.find(x => x[0].test(flat));
      if (h) { sec = h[1]; grp = ''; lv = 0; return; }
      if (sec === 'classroom' || sec === 'zone') {
        if (/สายชั้น|ปีที่|มัธยม/.test(flat) && !/โรงเรียน/.test(flat)) { const d = flat.match(/ปีที่([1-6])/); lv++; grp = d ? d[1] : String(Math.min(lv, 6)); if (d) lv = Number(d[1]); }
      } else if (sec === 'pnn') {
        if (/โรงอาหาร/.test(flat)) grp = 'หน้าโรงอาหาร'; else if (/ป้อมยาม/.test(flat)) grp = 'หน้าป้อมยาม';
      }
      if (!hasName || !sec) return; if ((sec === 'classroom' || sec === 'zone') && !grp) return;
      const cand = flat.slice(flat.search(PFX));
      let name = matchKnown(cand, known);
      if (!name) {
        let ti = t.search(PFX); let raw = ti >= 0 ? t.slice(ti) : cand;
        const toks = raw.split(' '); if (toks.filter(x => x.length <= 2).length > toks.length * 0.4) raw = cand.replace(PFX, '$1 ');
        name = raw.replace(/[0-9.,:;]+$/g, '').trim(); unknown.push(name);
      }
      const k = sec + '|' + grp; (map[k] = map[k] || []); if (map[k].indexOf(name) < 0) map[k].push(name);
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
        for (let i = 0; i < p.length; i += 4) { let v = p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11; v = v < 140 ? 0 : v > 200 ? 255 : (v - 140) * 255 / 60; p[i] = p[i + 1] = p[i + 2] = v; }
        g.putImageData(d, 0, 0); URL.revokeObjectURL(url); c.toBlob(b => res(b), 'image/png');
      };
      im.onerror = () => rej(new Error('เปิดรูปภาพไม่ได้')); im.src = url;
    });
  }
  const mapFromEntries = es => { const m = {}; (es || []).forEach(e => m[e.section + '|' + (e.grp || '')] = e.names.slice()); return m; };
  const entriesFromMap = m => Object.keys(m).filter(k => m[k].length).map(k => { const i = k.indexOf('|'); return { section: k.slice(0, i), grp: k.slice(i + 1), names: m[k] }; });

  // หน้าดูเวร (อ่านอย่างเดียว) q = คำค้นชื่อ: แสดงเฉพาะแถวที่มีชื่อนั้นและไฮไลต์
  function viewHtml(entries, q) {
    const m = mapFromEntries(entries), key = String(q || '').trim().toLowerCase();
    if (!entries.length) return '<div class="card"><div class="note">ยังไม่มีการจัดเวรของวันนี้</div></div>';
    const hl = n => { if (!key) return esc(n); const i = n.toLowerCase().indexOf(key); return i < 0 ? esc(n) : esc(n.slice(0, i)) + '<mark>' + esc(n.slice(i, i + key.length)) + '</mark>' + esc(n.slice(i + key.length)); };
    let hit = 0;
    const html = SECTIONS.map(s => {
      const rows = s.groups.map(g => {
        let n = m[s.id + '|' + g]; if (!n) return '';
        if (key) n = n.filter(x => x.toLowerCase().indexOf(key) >= 0);
        if (!n.length) return '';
        hit += n.length;
        return `<tr><td style="width:34%;font-weight:600;vertical-align:top">${esc(groupLabel(g))}</td><td>${n.map(hl).join('<br>')}</td></tr>`;
      }).join('');
      return rows ? `<div class="card"><h3>${esc(s.title)}</h3><table style="width:100%;border-collapse:collapse">${rows}</table></div>` : '';
    }).join('');
    if (key && !hit) return '<div class="card"><div class="note">ไม่พบชื่อ "' + esc(q) + '" ในเวรวันนี้</div></div>';
    return html;
  }

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
        <div class="muted" style="margin:6px 0">เลือกรูปตารางเวรทั้งหน้า ระบบอ่านตัวอักษรไทยในเครื่อง แยกหมวดและชั้นให้ แล้วแก้ชื่อให้ตรงรายชื่อที่แอดมินตั้งไว้ ครั้งแรกต้องโหลดตัวอ่านภาษาไทยประมาณ 10 MB (ต้องมีอินเทอร์เน็ต) อาจใช้เวลาสักครู่ และต้องตรวจทานก่อนกดบันทึก</div>
        <input type="file" id="ri" accept="image/*"><button class="btn sec" id="rib">อ่านรูปและแสดงในช่องด้านล่าง</button><div id="rst" class="muted"></div></details></div>
      <div id="rf"></div>
      <button class="btn" id="rs">บันทึกเวรวันที่นี้</button>`;
    const $ = id => el.querySelector('#' + id);
    let state = {};
    function draw() {
      $('rf').innerHTML = SECTIONS.map(s => `<div class="card"><h3>${esc(s.title)}</h3>` + s.groups.map(g => {
        const v = (state[s.id + '|' + g] || []).join('\n');
        return `<label>${esc(groupLabel(g) || 'รายชื่อ')}</label><textarea data-k="${esc(s.id + '|' + g)}" rows="${Math.max(2, (state[s.id + '|' + g] || []).length + 1)}" style="min-height:0" placeholder="หนึ่งชื่อต่อหนึ่งบรรทัด">${esc(v)}</textarea>`;
      }).join('') + '</div>').join('');
      el.querySelectorAll('textarea[data-k]').forEach(t => t.oninput = () => { state[t.dataset.k] = t.value.split('\n').map(x => x.trim()).filter(Boolean); });
    }
    async function load(d) {
      $('rf').innerHTML = '<div class="spin">กำลังโหลด...</div>';
      try { state = mapFromEntries(await o.api('rosterGet', { date: d })); } catch (e) { state = {}; o.toast && o.toast(e.message); }
      draw();
    }
    $('rd').onchange = e => { if (e.target.value) { date = e.target.value; load(date); } };
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
        const r = await worker.recognize(blob);
        const out = parseOcr(r.data.text, init.names || []), n = Object.keys(out.map).length;
        if (!n) { st.textContent = 'อ่านไม่พบรายชื่อ ลองใช้รูปที่ชัดและเห็นทั้งตาราง หรือใช้วางจากชีตแทน'; return; }
        state = out.map; draw();
        st.textContent = 'อ่านได้ ' + n + ' ช่อง' + (out.unknown.length ? ' · ชื่อที่ไม่ตรงรายชื่อแอดมิน (ตรวจแก้): ' + out.unknown.join(', ') : ' · ชื่อทั้งหมดตรงรายชื่อแอดมิน') + ' · ตรวจแล้วกดบันทึก';
      } catch (e) { st.textContent = ''; o.toast && o.toast(e.message || 'อ่านรูปไม่สำเร็จ'); }
      finally { btn.disabled = false; if (worker) worker.terminate().catch(() => {}); }
    };
    $('rs').onclick = async () => {
      try { await o.api('rosterSave', { date, entries: entriesFromMap(state) }); o.toast && o.toast('บันทึกเวรแล้ว'); o.onChange && o.onChange(date); }
      catch (e) { o.toast && o.toast(e.message); }
    };
    load(date);
  }

  const api = { SECTIONS, parsePaste, parseOcr, matchKnown, viewHtml, mountEditor, mapFromEntries, groupLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ROSTER = api;
})(typeof window !== 'undefined' ? window : this);
