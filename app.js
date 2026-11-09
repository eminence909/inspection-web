/* หน้าผู้ตรวจ (ไม่ต้องล็อกอิน) */
(function () {
  const CR = window.CRITERIA, K = window.CALC;
  const $app = document.getElementById('app');
  const $back = document.getElementById('back');
  const IC = {
    arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    leaf: '<svg viewBox="0 0 24 24"><path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z"/><path d="M4 21c3-6 6-9 11-12"/></svg>',
    school: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6M12 10h.01"/></svg>',
    help: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 17h.01"/></svg>',
    list: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>'
  };
  const S = { kind: null, date: null, level: null, team: null, status: null, init: null, room: null, scores: {}, editing: false, stack: [] };

  // ---------- util ----------
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  function thDate(d) { const [y, m, dd] = d.split('-').map(Number); const w = new Date(y, m - 1, dd).getDay(); return `วัน${DAYS[w]}ที่ ${dd} ${MONTHS[m - 1]} ${y + 543}`; }
  function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }
  function kindName() { return S.kind === 'classroom' ? 'ตรวจห้องเรียน' : 'ตรวจเขตพื้นที่'; }
  async function api(action, p) {
    let r;
    try { r = await fetch(window.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action }, p || {})) }); }
    catch (e) { const x = new Error('ไม่มีสัญญาณอินเทอร์เน็ต'); x.net = true; throw x; }
    const j = await r.json();
    if (!j.ok) throw new Error(j.error);
    return j.data;
  }
  // ---- คิวส่งผลเมื่อไม่มีสัญญาณ ----
  const getQ = () => { try { return JSON.parse(localStorage.getItem('queue') || '[]'); } catch (e) { return []; } };
  const setQ = q => { try { localStorage.setItem('queue', JSON.stringify(q)); } catch (e) {} };
  const sameRoom = (a, b) => a.kind === b.kind && a.date === b.date && String(a.level) === String(b.level) && String(a.room) === String(b.room);
  function enqueue(action, params) { const q = getQ().filter(x => !sameRoom(x.params, params)); q.push({ action, params, ts: Date.now() }); setQ(q); }
  let flushing = false;
  async function flushQueue() {
    if (flushing) return 0; flushing = true; let sent = 0;
    try {
      let q = getQ();
      while (q.length) {
        try { await api(q[0].action, q[0].params); } catch (e) { if (e.net) break; } // ข้อผิดพลาดอื่น (เช่นแก้ไขเกินวัน) ทิ้งรายการ
        q.shift(); setQ(q); sent++;
      }
    } finally { flushing = false; }
    if (sent) toast('ส่งผลที่ค้างไว้แล้ว ' + sent + ' รายการ');
    return sent;
  }
  window.addEventListener('online', () => flushQueue().then(() => { if (S.level && S.status && document.getElementById('img')) enterLevel(); }));
  const qBanner = () => getQ().length ? `<div class="note" style="margin-bottom:12px;display:flex;gap:10px;align-items:center"><span style="flex:1">มีผลตรวจรอส่ง ${getQ().length} รายการ (ส่งอัตโนมัติเมื่อมีสัญญาณ)</span><button class="btn sec" id="qs" style="margin:0;width:auto;padding:8px 14px">ส่งตอนนี้</button></div>` : '';
  function bindQ() { const b = document.getElementById('qs'); if (b) b.onclick = () => flushQueue().then(n => { if (!n) toast('ยังส่งไม่ได้ ลองใหม่เมื่อมีสัญญาณ'); }); }
  function loading() { $app.innerHTML = '<div class="spin">กำลังโหลด...</div>'; }
  function fail(e) { toast(e.message || 'เกิดข้อผิดพลาด'); console.error(e); }
  function header(title, sub, back) {
    document.getElementById('hTitle').textContent = title;
    document.getElementById('hSub').textContent = sub || '';
    $back.hidden = !back; $back.onclick = back || null;
    window.scrollTo(0, 0);
  }
  function bar(html) { let b = document.querySelector('.bar'); if (b) b.remove(); if (html) { b = document.createElement('div'); b.className = 'bar'; b.innerHTML = '<div class="in">' + html + '</div>'; document.body.appendChild(b); } return b; }
  const draftKey = () => ['draft', S.kind, S.date, S.level, S.room].join('|');
  function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify(S.scores)); } catch (e) {} }
  function loadDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || '{}'); } catch (e) { return {}; } }
  function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }

  // ---------- 1 หน้าแรก ----------
  async function home() {
    bar(); header('ระบบตรวจห้องเรียนและเขตพื้นที่', '');
    const today0 = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    if (!S.init) {
      let cached = null; try { cached = JSON.parse(localStorage.getItem('init') || 'null'); } catch (e) {}
      if (cached) { // แสดงหน้าแรกทันทีจากข้อมูลที่จำไว้ แล้วอัปเดตเงียบ ๆ ด้านหลัง
        S.init = Object.assign({}, cached, { today: today0() });
        api('init').then(r => { S.init = r; try { localStorage.setItem('init', JSON.stringify(r)); } catch (e) {} }).catch(() => {});
      } else {
      loading();
      try { S.init = await api('init'); try { localStorage.setItem('init', JSON.stringify(S.init)); } catch (e) {} } catch (e) { $app.innerHTML = '<div class="card">เชื่อมต่อระบบไม่ได้ ตรวจสอบ config.js<br><span class="muted">' + esc(e.message) + '</span></div>'; return; }
      }
    }
    S.date = S.date || S.init.today;
    $app.innerHTML = qBanner() + `
      <section class="hero"><div class="bigword">CLEAN</div>
        <div class="eyebrow">สภานักเรียน · ${esc(S.init.schoolName || '')}</div>
        <h1>ตรวจห้องเรียน<br>และเขตพื้นที่</h1>
        <p>${esc(S.init.term || '')}</p></section>
      <div class="stats" id="stats"><div><b>-</b><span>ตรวจห้องเรียน</span></div><div><b>-</b><span>ตรวจเขตพื้นที่</span></div><div><b>72</b><span>ห้องทั้งหมด</span></div><div><b>100</b><span>คะแนนเต็ม</span></div></div>
      <div class="card"><label for="dt">วันที่ตรวจ</label>
        <input type="date" id="dt" value="${S.date}" max="${S.init.today}">
        <div class="muted" id="dtl" style="margin-top:6px">${thDate(S.date)}</div></div>
      <div class="menu">
        <button class="mcard" data-k="zone"><span class="go">${IC.arrow}</span><span class="ic">${IC.leaf}</span><span><b>ตรวจเขตพื้นที่</b><small>Sripisai Clean Zone</small></span></button>
        <button class="mcard" data-k="classroom"><span class="go">${IC.arrow}</span><span class="ic">${IC.school}</span><span><b>ตรวจห้องเรียน</b><small>The SMART Classroom</small></span></button>
      </div>
      <button class="rowbtn" id="rosterBtn"><span class="ic">${IC.list}</span><span class="t">ดูเวรประจำวัน</span>${IC.arrow.replace('<svg','<svg width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:2"')}</button>
      <button class="rowbtn" id="guideBtn" style="margin-top:10px"><span class="ic">${IC.help}</span><span class="t">วิธีการใช้งานเว็บนี้</span>${IC.arrow.replace('<svg','<svg width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:2"')}</button>
      <button class="rowbtn" id="lineBtn" style="margin-top:10px"><span class="ic">${IC.help}</span><span class="t">ติดต่อแอดมิน / แจ้งปัญหา (ไลน์)</span>${IC.arrow.replace('<svg','<svg width="18" height="18" style="stroke:currentColor;fill:none;stroke-width:2"')}</button>
      <div style="text-align:center;margin-top:16px"><a href="roster.html" class="muted">สำหรับผู้จัดเวร</a></div>`;
    bindQ();
    document.getElementById('rosterBtn').onclick = viewRoster;
    document.getElementById('guideBtn').onclick = viewGuide;
    document.getElementById('lineBtn').onclick = () => {
      const u = (S.init && S.init.lineUrl) || window.LINE_URL || '';
      if (/^https?:\/\//.test(u)) window.open(u, '_blank', 'noopener');
      else toast('แอดมินยังไม่ได้ตั้งลิงก์ไลน์ (แอดมิน: ตั้งค่า > ลิงก์ไลน์แอดมิน)');
    };
    const loadStats = () => {
      const d = S.date; api('dayCount', { date: d }).then(r => {
        if (d !== S.date || !document.getElementById('stats')) return;
        const b = document.querySelectorAll('#stats b'); const f = (n, u) => (n = Number(n) || 0, u = Number(u) || 0, n + u >= 72) ? '<i class="ok">ครบ</i>' : (n + u) + '/72';
        b[0].innerHTML = f(r.classroom, r.unClassroom); b[1].innerHTML = f(r.zone, r.unZone);
      }).catch(() => {});
    };
    loadStats();
    const dt = document.getElementById('dt');
    dt.onchange = () => {
      if (!dt.value || dt.value > S.init.today) { dt.value = S.init.today; toast('เลือกวันที่ล่วงหน้าไม่ได้'); }
      S.date = dt.value; document.getElementById('dtl').textContent = thDate(S.date); loadStats();
    };
    $app.querySelectorAll('.mcard').forEach(b => b.onclick = () => { S.kind = b.dataset.k; pickLevel(); });
  }

  // ---------- ดูเวร ----------
  // ---------- วิธีการใช้งาน ----------
  const GUIDE = [
    ['เลือกวันที่และประเภท', 'หน้าแรกเลือกวันที่ตรวจ (ย้อนหลังได้ แต่เลือกวันล่วงหน้าไม่ได้) แล้วเลือก "ตรวจเขตพื้นที่" หรือ "ตรวจห้องเรียน"'],
    ['เลือกระดับชั้นและใส่ชื่อผู้ตรวจ', 'เลือกชั้น ม.1–ม.6 ที่อยู่ในเวรของคุณ จากนั้นเลือกชื่อผู้ตรวจ 1–3 คน ระบบติ๊กชื่อตามตารางเวรของวันนั้นให้ ถ้ามีชื่ออื่นเพิ่มสามารถพิมพ์เองได้ ถ้าไม่แน่ใจว่าเวรของใคร กด "ดูเวรประจำวัน" ที่หน้าแรกแล้วค้นหาชื่อตัวเอง'],
    ['อาคารเปิดหรือปิด (เฉพาะตรวจห้องเรียน)', 'เลือกว่าอาคารเปิดหรือปิด ถ้าห้องไหนตรวจไม่ได้ เช่น ห้องล็อก ให้ติ๊กห้องนั้นแล้วเลือกเหตุผลหรือพิมพ์เพิ่ม ห้องเหล่านี้จะไม่ถูกนำมาคิดคะแนน'],
    ['เลือกห้องแล้วให้คะแนน', 'กดห้องที่ยังไม่ตรวจ แล้วกดปุ่มคะแนนทีละข้อ ถ้าไม่แน่ใจกด "ดูเกณฑ์คะแนน" จะเห็นคำอธิบายของแต่ละระดับ ทำครบทุกข้อในหมวดหนึ่ง ระบบจะเลื่อนไปหมวดถัดไปให้เอง'],
    ['ตรวจสอบและส่ง', 'หน้าตรวจสอบจะเห็นคะแนนรายข้อ ผลรวมแต่ละหมวด และคะแนนรวม ถ้าถูกต้องกด "ยืนยันส่งผลตรวจ" ถ้าคะแนนดูผิดปกติ เช่น 0 หรือเต็มทุกข้อ ระบบจะเตือนให้ตรวจอีกครั้ง'],
    ['แก้ไขหลังส่ง', 'ห้องที่ส่งแล้วจะขึ้น "ตรวจแล้ว" และแก้ไขได้ภายในวันเดียวกันที่ส่ง ถ้าต้องการแก้ภายหลังให้แจ้งแอดมิน'],
    ['ไม่มีสัญญาณอินเทอร์เน็ต', 'ยังตรวจและกดส่งได้ ผลจะเก็บในเครื่องแล้วขึ้น "รอส่ง" เมื่อกลับมามีสัญญาณระบบจะส่งให้เอง อย่าล้างข้อมูลเบราว์เซอร์ก่อนส่งเสร็จ'],
    ['ตรวจครบแล้ว: บันทึกใบ เซ็นชื่อ และอัปลงไลน์', 'เมื่อตรวจครบทุกห้องของชั้นนั้น กด "ดาวน์โหลดใบประเมินเป็นรูปภาพ" เพื่อบันทึกใบ จากนั้นนำใบไปเซ็นชื่อให้ครบ แล้วนำใบที่เซ็นแล้วไปอัปโหลดลงอัลบั้มในไลน์กลุ่ม']
  ];
  function viewGuide() {
    bar(); header('วิธีการใช้งาน', 'สำหรับผู้ตรวจ', home);
    $app.innerHTML = GUIDE.map((g, i) => `<div class="card" style="display:flex;gap:12px"><div class="gno">${i + 1}</div><div><h3 style="margin-bottom:4px">${esc(g[0])}</h3><div>${esc(g[1])}</div></div></div>`).join('') +
      `<div class="note" style="margin-top:4px"><b>อย่าลืม:</b> หลังตรวจเสร็จต้องบันทึกใบ นำไปเซ็นชื่อ และอัปลงอัลบั้มในไลน์กลุ่มทุกครั้ง</div>`;
  }

  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  // ดึงข้อมูลพร้อมจำไว้ในเครื่อง: ไม่มีเน็ตใช้ข้อมูลที่จำไว้ล่าสุด
  async function cached(key, action, params) {
    try { const d = await api(action, params); lsSet(key, d); return { d, old: false }; }
    catch (e) { const c = lsGet(key); if (e.net && c) return { d: c, old: true }; throw e; }
  }
  async function viewRoster() {
    bar(); header('ดูเวร', thDate(S.date), home); loading();
    try {
      const [r1, r2] = await Promise.all([cached('ro|' + S.date, 'rosterGet', { date: S.date }), cached('rdates', 'rosterDates', {}).catch(() => ({ d: [], old: false }))]);
      const es = r1.d, dates = r2.d || [], old = r1.old || r2.old;
      $app.innerHTML = `${old ? '<div class="note" style="margin-bottom:10px">ออฟไลน์: แสดงข้อมูลที่จำไว้ล่าสุดในเครื่อง</div>' : ''}
        <div class="card"><h2>เลือกวัน</h2><div id="rh"></div>
        <label for="rd" style="margin-top:10px">หรือเลือกวันที่เอง</label><input type="date" id="rd" value="${S.date}" max="${S.init.today}">
        <div class="muted" style="margin:6px 0 4px">${thDate(S.date)}</div></div>
        <div class="card"><label for="rq">ค้นหาชื่อของฉัน</label><input type="text" id="rq" placeholder="พิมพ์ชื่อหรือนามสกุล" autocomplete="off"></div><div id="rl"></div>`;
      const rl = document.getElementById('rl'), rq = document.getElementById('rq'), rh = document.getElementById('rh');
      rh.innerHTML = window.ROSTER.historyHtml(dates, S.date, S.init.today);
      rh.querySelectorAll('.hchip').forEach(b => b.onclick = () => { S.date = b.dataset.d; viewRoster(); });
      const on = rh.querySelector('.on'); if (on) rh.scrollLeft = Math.max(0, on.offsetLeft - 20);
      const show = () => { rl.innerHTML = window.ROSTER.viewHtml(es, rq.value); };
      rq.oninput = show; show();
      document.getElementById('rd').onchange = e => { if (e.target.value && e.target.value <= S.init.today) { S.date = e.target.value; viewRoster(); } };
    } catch (e) { fail(e); home(); }
  }

  // ---------- 2 เลือกระดับชั้น ----------
  function pickLevel() {
    bar(); header(kindName(), thDate(S.date), home);
    $app.innerHTML = '<div class="card"><h2>เลือกระดับชั้น</h2><div class="grid" id="lv"></div></div>';
    const g = document.getElementById('lv');
    CR.LEVELS.forEach(l => { const b = document.createElement('button'); b.className = 'tile'; b.textContent = 'ม.' + l; b.onclick = () => { S.level = String(l); enterLevel(); }; g.appendChild(b); });
  }
  async function enterLevel() {
    loading();
    try {
      const lk = ['lv', S.kind, S.date, S.level].join('|'); let ld;
      try { ld = await api('levelData', { kind: S.kind, date: S.date, level: S.level }); try { localStorage.setItem(lk, JSON.stringify(ld)); } catch (e) {} }
      catch (e) { let c = null; try { c = JSON.parse(localStorage.getItem(lk) || 'null'); } catch (x) {} if (e.net && c) { ld = c; toast('ออฟไลน์: ใช้ข้อมูลที่จำไว้ล่าสุด'); } else throw e; }
      S.status = ld.status; S.team = S.status.team; S.rosterNames = ld.rosterNames || [];
      if (!S.team) return teamStep(); else return rooms();
    } catch (e) { fail(e); pickLevel(); }
  }

  // ---------- 3 ผู้ตรวจ + อาคารเปิด/ปิด ----------
  let tmp = null;
  function teamStep() {
    bar(); header(`ม.${S.level} · ผู้ตรวจ`, kindName() + ' · ' + thDate(S.date), S.team ? rooms : pickLevel);
    tmp = { names: (S.team ? S.team.names.slice() : (S.rosterNames || []).slice(0, 3)), open: S.team ? S.team.buildingOpen : '', un: {} };
    S.status.unavail.forEach(u => tmp.un[u.room] = { reason: u.reason, text: u.text });
    draw();
    function draw() {
      const list = S.init.names.slice();
      tmp.names.forEach(n => { if (list.indexOf(n) < 0) list.push(n); });
      let h = `<div class="card"><h2>ผู้ตรวจ <span class="muted">(1–3 คน)</span></h2>${!S.team && (S.rosterNames || []).length ? '<div class="note" style="margin-bottom:8px">ติ๊กชื่อจากเวรวันนี้ให้แล้ว แก้ไขได้</div>' : ''}<div class="chips">` +
        list.map(n => `<button class="chip ${tmp.names.includes(n) ? 'on' : ''}" data-n="${esc(n)}">${esc(n)}</button>`).join('') +
        `</div><div class="row"><input type="text" id="nn" placeholder="พิมพ์ชื่อเพิ่ม"><button class="btn sec" id="add" style="margin:0;flex:0 0 90px">เพิ่ม</button></div>
        <div class="muted" style="margin-top:6px">เลือกแล้ว ${tmp.names.length}/3 คน</div></div>`;
      if (S.kind === 'classroom') {
        h += `<div class="card"><h2>อาคารเรียนวันนี้</h2><div class="seg">
          <button class="tile ${tmp.open === 'open' ? 'sel' : ''}" data-o="open">อาคารเปิด</button>
          <button class="tile ${tmp.open === 'closed' ? 'sel' : ''}" data-o="closed">ปิด / บางห้องเข้าไม่ได้</button></div></div>`;
        if (tmp.open === 'closed') h += unavailCard();
      }
      h += `<button class="btn" id="go">ถัดไป</button>`;
      $app.innerHTML = h;
      $app.querySelectorAll('.chip').forEach(c => c.onclick = () => {
        const n = c.dataset.n, i = tmp.names.indexOf(n);
        if (i >= 0) tmp.names.splice(i, 1); else if (tmp.names.length < 3) tmp.names.push(n); else toast('เลือกได้สูงสุด 3 คน');
        draw();
      });
      document.getElementById('add').onclick = () => {
        const v = document.getElementById('nn').value.trim(); if (!v) return;
        if (tmp.names.length >= 3) return toast('เลือกได้สูงสุด 3 คน');
        if (!tmp.names.includes(v)) tmp.names.push(v); draw();
      };
      $app.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { tmp.open = b.dataset.o; draw(); });
      bindUnavail(draw);
      document.getElementById('go').onclick = saveTeam;
    }
  }
  function unavailCard() {
    const all = Object.keys(tmp.un).length === CR.ROOMS;
    let h = `<div class="card"><h2>ห้องที่ตรวจไม่ได้</h2>
      <button class="btn sec" id="all" style="margin:0 0 10px">${all ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}</button><div class="grid g4">`;
    for (let r = 1; r <= CR.ROOMS; r++) h += `<button class="tile ${tmp.un[r] ? 'sel' : ''}" data-r="${r}">${S.level}/${r}</button>`;
    h += '</div>';
    if (Object.keys(tmp.un).length) {
      h += `<h3 style="margin-top:14px">เหตุผล</h3><select id="rs"><option value="">-- เลือกเหตุผล --</option>` +
        S.init.reasons.map(x => `<option>${esc(x)}</option>`).join('') + `</select>
        <input type="text" id="rt" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" style="margin-top:8px">
        <div class="muted" style="margin-top:6px">เหตุผลนี้ใช้กับห้องที่เลือกทั้งหมด</div>`;
      const f = tmp.un[Object.keys(tmp.un)[0]];
      setTimeout(() => { const s = document.getElementById('rs'), t = document.getElementById('rt'); if (s) { s.value = f.reason || ''; t.value = f.text || ''; } }, 0);
    }
    return h + '</div>';
  }
  function bindUnavail(redraw) {
    const all = document.getElementById('all'); if (!all) return;
    const keep = () => { const s = document.getElementById('rs'), t = document.getElementById('rt'); if (s) Object.keys(tmp.un).forEach(r => tmp.un[r] = { reason: s.value, text: t.value }); };
    all.onclick = () => {
      keep();
      if (Object.keys(tmp.un).length === CR.ROOMS) tmp.un = {}; else for (let r = 1; r <= CR.ROOMS; r++) tmp.un[r] = tmp.un[r] || { reason: '', text: '' };
      redraw();
    };
    $app.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { keep(); const r = b.dataset.r; if (tmp.un[r]) delete tmp.un[r]; else tmp.un[r] = { reason: '', text: '' }; redraw(); });
    const s = document.getElementById('rs'), t = document.getElementById('rt');
    if (s) { s.onchange = keep; t.oninput = keep; }
  }
  async function saveTeam() {
    if (!tmp.names.length) return toast('เลือกผู้ตรวจอย่างน้อย 1 คน');
    let items = [];
    if (S.kind === 'classroom') {
      if (!tmp.open) return toast('เลือกสถานะอาคารก่อน');
      if (tmp.open === 'closed') {
        const s = document.getElementById('rs'), t = document.getElementById('rt');
        const rooms = Object.keys(tmp.un);
        if (!rooms.length) return toast('เลือกห้องที่ตรวจไม่ได้อย่างน้อย 1 ห้อง');
        if (!s.value && !t.value.trim()) return toast('ระบุเหตุผล');
        items = rooms.map(r => ({ room: r, reason: s.value, text: t.value.trim() }));
      }
    }
    loading();
    try {
      await api('saveTeam', { kind: S.kind, date: S.date, level: S.level, names: tmp.names, buildingOpen: S.kind === 'classroom' ? tmp.open : '' });
      if (S.kind === 'classroom') await api('saveUnavail', { kind: S.kind, date: S.date, level: S.level, items });
      await enterLevel();
    } catch (e) { fail(e); teamStep(); }
  }

  const bandCls = t => t >= 80 ? 'b-g' : t >= 70 ? 'b-s' : t >= 60 ? 'b-b' : t >= 50 ? 'b-p' : 'b-f';
  // ---------- 4 รายการห้อง ----------
  function rooms() {
    bar(); header(`ม.${S.level} · เลือกห้อง`, kindName() + ' · ' + thDate(S.date), pickLevel);
    const done = {}, un = {};
    S.status.done.forEach(d => done[d.room] = d); S.status.unavail.forEach(u => un[u.room] = u);
    getQ().forEach(x => { const p = x.params; if (p.kind === S.kind && p.date === S.date && String(p.level) === String(S.level) && !(done[p.room] && !done[p.room].pending)) done[p.room] = { room: p.room, total: K.dailyTotals(S.kind, p.scores).total, pending: true, scores: p.scores }; });
    const n = Object.keys(done).length;
    let h = qBanner() + `<div class="card"><div class="row" style="align-items:center"><div><b>ผู้ตรวจ:</b> ${esc(S.team.names.join(', '))}
      ${S.kind === 'classroom' ? '<br><span class="badge">อาคาร' + (S.team.buildingOpen === 'open' ? 'เปิด' : 'ปิด') + '</span>' : ''}</div>
      <button class="btn sec" id="et" style="margin:0;flex:0 0 120px;padding:8px">แก้ไขทีม</button></div></div>
      <div class="card"><h2>ห้อง ม.${S.level}/1–${CR.ROOMS} <span class="muted">(ตรวจแล้ว ${n}/${CR.ROOMS})</span></h2>
      <div class="prog"><i style="width:${Math.round((n + Object.keys(un).length) / CR.ROOMS * 100)}%"></i></div><div class="grid">`;
    for (let r = 1; r <= CR.ROOMS; r++) {
      if (un[r]) h += `<button class="tile un" data-r="${r}" data-s="un">${S.level}/${r}<small>${esc(un[r].reason || 'ตรวจไม่ได้')}</small></button>`;
      else if (done[r]) h += `<button class="tile done ${bandCls(done[r].total)}" data-r="${r}" data-s="done">${S.level}/${r}<small>${done[r].pending ? 'รอส่ง' : 'ตรวจแล้ว'} ${done[r].total}</small></button>`;
      else h += `<button class="tile" data-r="${r}" data-s="new">${S.level}/${r}<small>ยังไม่ตรวจ</small></button>`;
    }
    h += `</div></div><button class="btn sec" id="img" ${n ? '' : 'disabled'}>ดาวน์โหลดใบประเมินเป็นรูปภาพ</button>${n + Object.keys(un).length >= CR.ROOMS ? '<div class="note" style="margin-top:10px"><b>ตรวจครบทุกห้องแล้ว</b><br>1) กดดาวน์โหลดใบเป็นรูปภาพเพื่อบันทึกใบ 2) นำใบไปเซ็นชื่อ 3) อัปใบที่เซ็นแล้วลงอัลบั้มในไลน์กลุ่ม</div>' : ''}`;
    $app.innerHTML = h;
    document.getElementById('img').onclick = async () => {
      const b = document.getElementById('img'); b.disabled = true; b.textContent = 'กำลังสร้างรูปภาพ...';
      try {
        await window.loadPdfStack();
        const data = await api('dayData', { kind: S.kind, date: S.date, level: S.level });
        await window.PDFX.dailyImage({ kind: S.kind, date: S.date, level: S.level, data, cfg: S.init });
        toast('ดาวน์โหลดรูปภาพแล้ว');
      } catch (e) { fail(e); }
      b.disabled = false; b.textContent = 'ดาวน์โหลดใบประเมินเป็นรูปภาพ';
    };
    bindQ();
    document.getElementById('et').onclick = teamStep;
    $app.querySelectorAll('.tile').forEach(b => b.onclick = () => {
      const r = b.dataset.r, s = b.dataset.s;
      if (s === 'un') return toast('ห้องนี้ตรวจไม่ได้: ' + (un[r].reason || '') + (un[r].text ? ' (' + un[r].text + ')' : ''));
      S.room = r;
      if (s === 'done') return doneRoom(done[r]);
      S.editing = false; S.scores = loadDraft(); form();
    });
  }
  async function doneRoom(d) {
    if (d.pending) {
      bar(); header(`ม.${S.level}/${S.room}`, 'รอส่ง', rooms);
      $app.innerHTML = `<div class="card"><h2>รอส่งขึ้นระบบ</h2><p>คะแนนรวม <b>${d.total}</b> / 100 (บันทึกในเครื่องแล้ว จะส่งอัตโนมัติเมื่อมีสัญญาณ)</p><button class="btn warn" id="ed">แก้ไขผลการตรวจ</button></div>`;
      document.getElementById('ed').onclick = () => { S.scores = Object.assign({}, d.scores); S.editing = 'pending'; form(); };
      return;
    }
    const canEdit = d.submittedDate === S.status.today;
    bar(); header(`ม.${S.level}/${S.room}`, 'ตรวจแล้ว', rooms);
    $app.innerHTML = `<div class="card"><h2>ห้องนี้ตรวจแล้ว</h2><p>คะแนนรวม <b>${d.total}</b> / 100</p>
      ${canEdit ? '<button class="btn warn" id="ed">แก้ไขผลการตรวจ (ภายในวันนี้)</button>' : '<div class="note">แก้ไขได้เฉพาะภายในวันที่กดส่ง หากต้องการแก้ไขให้แจ้งแอดมิน</div>'}
      <button class="btn sec" id="vw">ดูรายละเอียด</button></div>`;
    const load = async () => { loading(); const r = await api('getInspection', { kind: S.kind, date: S.date, level: S.level, room: S.room }); return r.scores; };
    document.getElementById('vw').onclick = async () => { try { S.scores = await load(); review(true); } catch (e) { fail(e); } };
    if (canEdit) document.getElementById('ed').onclick = async () => { try { S.scores = await load(); S.editing = true; form(); } catch (e) { fail(e); } };
  }

  // ---------- 5 กรอกคะแนน ----------
  function form() {
    const def = CR[S.kind];
    header(`ม.${S.level}/${S.room}`, kindName() + (S.editing ? ' · แก้ไข' : ''), () => { rooms(); });
    let h = '';
    def.categories.forEach(c => {
      h += `<div class="cat" data-c="${c.no}" role="button" tabindex="0"><span>${c.no}. ${esc(c.title)}</span><span><span data-sub="${c.no}"></span><svg class="chev" viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6"/></svg></span></div><div class="cbody" data-cb="${c.no}">`;
      c.items.forEach(it => {
        const vals = K.allowedValues(it);
        h += `<div class="item" data-id="${it.id}"><div class="t">${it.id} ${esc(it.title)} <span>(เต็ม ${it.max})</span></div>
          <div class="opts">${vals.map(v => `<button class="opt" data-v="${v}">${v}</button>`).join('')}</div>
          <button class="info" type="button">ดูเกณฑ์คะแนน</button>
          <div class="bands">${it.bands.map(b => `<div><b>${b[0] === b[1] ? b[0] : b[0] + '–' + b[1]}</b> · ${esc(b[2])}</div>`).join('')}</div></div>`;
      });
      h += '</div>';
    });
    $app.innerHTML = h;
    const refresh = () => {
      $app.querySelectorAll('.item').forEach(el => {
        const v = S.scores[el.dataset.id];
        el.querySelectorAll('.opt').forEach(o => o.classList.toggle('on', v !== undefined && Number(o.dataset.v) === Number(v)));
      });
      const t = K.dailyTotals(S.kind, S.scores);
      t.cats.forEach(c => { const e = $app.querySelector(`[data-sub="${c.no}"]`); if (e) e.textContent = c.sum + '/' + c.max; });
      const filled = def.categories.reduce((a, c) => a + c.items.filter(i => S.scores[i.id] !== undefined).length, 0);
      const all = def.categories.reduce((a, c) => a + c.items.length, 0);
      document.getElementById('sum').textContent = `ตอบแล้ว ${filled}/${all} · ${t.total}/100`;
      document.getElementById('rv').disabled = filled < all;
    };
    const catDone = c => c.items.every(i => S.scores[i.id] !== undefined);
    const setOpen = (no, open) => { const cb = $app.querySelector(`[data-cb="${no}"]`), ch = $app.querySelector(`.cat[data-c="${no}"]`); if (cb) cb.classList.toggle('closed', !open); if (ch) ch.classList.toggle('closed', !open); };
    const firstOpen = def.categories.find(c => !catDone(c));
    if (firstOpen) def.categories.forEach(c => { if (catDone(c)) setOpen(c.no, false); });
    $app.querySelectorAll('.cat').forEach(ct => { const tg = () => setOpen(ct.dataset.c, ct.classList.contains('closed')); ct.onclick = tg; ct.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tg(); } }; });
    const goTo = el => { if (!el) return; const r = el.getBoundingClientRect(); const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; window.scrollTo({ top: window.scrollY + r.top - 90, behavior: reduce ? 'auto' : 'smooth' }); el.classList.add('nxt'); setTimeout(() => el.classList.remove('nxt'), 900); };
    bar('<span class="sum" id="sum"></span><button class="btn" id="rv" style="flex:1">ตรวจสอบก่อนส่ง</button>');
    $app.querySelectorAll('.opt').forEach(o => o.onclick = () => {
      const item = o.closest('.item'), had = S.scores[item.dataset.id] !== undefined;
      S.scores[item.dataset.id] = Number(o.dataset.v); saveDraft(); refresh();
      if (had) return; // แก้คำตอบเดิม ไม่เลื่อน
      const cat = def.categories.find(c => c.items.some(i => i.id === item.dataset.id));
      const nxt = cat.items.find(i => S.scores[i.id] === undefined);
      if (nxt) setTimeout(() => goTo($app.querySelector(`.item[data-id="${nxt.id}"]`)), 180);
      else {
        const nc = def.categories.find(c => !catDone(c));
        setTimeout(() => { setOpen(cat.no, false); if (nc) { setOpen(nc.no, true); goTo($app.querySelector(`.cat[data-c="${nc.no}"]`)); } else document.getElementById('rv').scrollIntoView({ block: 'end' }); }, 350);
      }
    });
    $app.querySelectorAll('.info').forEach(b => b.onclick = () => b.nextElementSibling.classList.toggle('show'));
    document.getElementById('rv').onclick = () => review(false);
    refresh();
  }

  // ---------- 6 ตรวจสอบก่อนส่ง ----------
  function review(viewOnly) {
    const def = CR[S.kind], t = K.dailyTotals(S.kind, S.scores);
    header(`ม.${S.level}/${S.room} · ตรวจสอบ`, kindName(), viewOnly ? () => rooms() : form);
    let h = `<div class="card"><div class="muted">${thDate(S.date)} · ผู้ตรวจ ${esc(S.team.names.join(', '))}</div><table class="rv">`;
    def.categories.forEach((c, ci) => {
      c.items.forEach(it => { h += `<tr><td>${it.id} ${esc(it.title)}</td><td>${S.scores[it.id]}</td></tr>`; });
      h += `<tr class="sub"><td>รวมหมวด ${c.no}</td><td>${t.cats[ci].sum}/${c.max}</td></tr>`;
    });
    h += `</table><div class="tot">รวมทั้งหมด ${t.total} / 100</div></div>`;
    const vals = def.categories.flatMap(c => c.items.map(i => ({ v: Number(S.scores[i.id]), max: i.max })));
    S.anom = '';
    if (!viewOnly) {
      if (vals.every(x => x.v === 0)) S.anom = 'คุณให้ 0 คะแนนทุกข้อ';
      else if (vals.every(x => x.v === x.max)) S.anom = 'คุณให้คะแนนเต็มทุกข้อ';
      else if (vals.every(x => x.v === vals[0].v)) S.anom = 'คุณให้คะแนนเท่ากันทุกข้อ (' + vals[0].v + ')';
    }
    S.confirmAnom = false;
    if (S.anom) h = `<div class="note bad" style="margin-bottom:12px"><b>${S.anom}</b><br>กรุณาตรวจสอบอีกครั้งว่าถูกต้อง ถ้าถูกต้องกดยืนยันส่งสองครั้ง</div>` + h;
    $app.innerHTML = h;
    if (viewOnly) return bar('<button class="btn sec" id="ok" style="margin:0">กลับ</button>'), document.getElementById('ok').onclick = rooms;
    bar('<button class="btn sec" id="bk" style="margin:0;flex:1">แก้ไข</button><button class="btn" id="sb" style="margin:0;flex:2">ยืนยันส่งผลตรวจ</button>');
    document.getElementById('bk').onclick = form;
    document.getElementById('sb').onclick = submit;
  }
  async function submit() {
    const sb = document.getElementById('sb');
    if (S.anom && !S.confirmAnom) { S.confirmAnom = true; sb.textContent = 'ยืนยันอีกครั้ง (' + S.anom + ')'; toast('คะแนนผิดปกติ กดยืนยันอีกครั้งเพื่อส่ง'); return; }
    sb.disabled = true; sb.textContent = 'กำลังส่ง...';
    const base = { kind: S.kind, date: S.date, level: S.level, room: S.room, scores: S.scores };
    try {
      await flushQueue();
      if (S.editing === true) await api('editOwn', base);
      else {
        const r = await api('submit', base);
        if (r.already) { toast('ห้องนี้ตรวจแล้ว'); S.status = await api('status', { kind: S.kind, date: S.date, level: S.level }); return rooms(); }
      }
      clearDraft(); toast('บันทึกผลตรวจเรียบร้อย');
      S.status = await api('status', { kind: S.kind, date: S.date, level: S.level });
      S.editing = false; rooms();
    } catch (e) {
      if (e.net) { // ไม่มีสัญญาณ: เก็บไว้ในเครื่องแล้วส่งภายหลัง
        enqueue('submit', base); clearDraft(); S.editing = false;
        toast('ไม่มีสัญญาณ: บันทึกในเครื่องแล้ว จะส่งให้อัตโนมัติ'); return rooms();
      }
      fail(e); sb.disabled = false; sb.textContent = 'ยืนยันส่งผลตรวจ';
    }
  }

  flushQueue();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  home();
})();
