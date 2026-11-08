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
  const thDig = s => String(s).replace(/[๑-๖]/g, c => '๑๒๓๔๕๖'.indexOf(c) + 1);

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
    $('rs').onclick = async () => {
      try { await o.api('rosterSave', { date, entries: entriesFromMap(state) }); o.toast && o.toast('บันทึกเวรแล้ว'); o.onChange && o.onChange(date); }
      catch (e) { o.toast && o.toast(e.message); }
    };
    load(date);
  }

  const api = { SECTIONS, parsePaste, viewHtml, mountEditor, mapFromEntries, groupLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ROSTER = api;
})(typeof window !== 'undefined' ? window : this);
