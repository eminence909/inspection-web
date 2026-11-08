/* หน้าแอดมิน */
(function () {
  const CR = window.CRITERIA, K = window.CALC, SM = window.SUMMARY;
  const $app = document.getElementById('app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const SMON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const DN = ['จ', 'อ', 'พ', 'พฤ', 'ศ'];
  const thd = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${SMON[m - 1]} ${String(y + 543).slice(2)}`; };
  const thm = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y + 543}`; };
  const pct = p => p === null || p === undefined ? '' : (Math.round(p * 100) / 100).toFixed(2);
  const NA = 'ไม่มีการประเมิน';
  function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }
  const todayISO = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

  let PIN = ''; try { PIN = sessionStorage.getItem('pin') || ''; } catch (e) {}
  const st = { kind: 'classroom', tab: 'daily', date: todayISO(), level: '1', month: todayISO().slice(0, 7) };

  async function api(action, p) {
    const r = await fetch(window.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, pin: PIN }, p || {})) });
    const j = await r.json(); if (!j.ok) throw new Error(j.error); return j.data;
  }
  const withPdf = fn => { toast('กำลังสร้างไฟล์...'); return window.loadPdfStack().then(fn).then(() => toast('เสร็จแล้ว')).catch(fail); };
  const levelSel = id => `<select id="${id}" style="width:auto;flex:0 0 78px">${CR.LEVELS.map(l => `<option value="${l}">ม.${l}</option>`).join('')}</select>`;
  const fail = e => toast(e.message || 'เกิดข้อผิดพลาด');
  const kn = () => st.kind === 'classroom' ? 'ห้องเรียน' : 'เขตพื้นที่';

  // ---------- login ----------
  function login() {
    document.getElementById('logout').hidden = true;
    $app.innerHTML = `<div class="card" style="max-width:380px;margin:40px auto"><h2>เข้าสู่ระบบแอดมิน</h2>
      <label>รหัสผ่าน</label><input type="password" id="pin" style="width:100%;font:inherit;padding:11px;border:1px solid var(--line);border-radius:12px">
      <button class="btn" id="ok">เข้าสู่ระบบ</button></div>`;
    const go = async () => {
      PIN = document.getElementById('pin').value;
      try { await api('adminLogin'); try { sessionStorage.setItem('pin', PIN); } catch (e) {} shell(); }
      catch (e) { PIN = ''; fail(e); }
    };
    document.getElementById('ok').onclick = go;
    document.getElementById('pin').onkeydown = e => { if (e.key === 'Enter') go(); };
  }
  document.getElementById('logout').onclick = () => { PIN = ''; try { sessionStorage.removeItem('pin'); } catch (e) {} login(); };

  // ---------- shell ----------
  function shell() {
    document.getElementById('logout').hidden = false;
    const tabs = [['daily', 'ผลรายวัน / แก้ไข'], ['weekly', 'สรุปรายสัปดาห์'], ['monthly', 'สรุปรายเดือน'], ['roster', 'เวร / สถานะการส่ง'], ['settings', 'ตั้งค่า']];
    $app.innerHTML = `<div class="tabs" id="tabs">${tabs.map(t => `<button data-t="${t[0]}" class="${st.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
      <div class="seg" style="margin-bottom:14px"><button class="tile ${st.kind === 'zone' ? 'sel' : ''}" data-k="zone">เขตพื้นที่</button><button class="tile ${st.kind === 'classroom' ? 'sel' : ''}" data-k="classroom">ห้องเรียน</button></div>
      <div id="pane"></div>`;
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { st.tab = b.dataset.t; shell(); });
    document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { st.kind = b.dataset.k; st.week = null; shell(); });
    ({ daily, weekly, monthly, roster, settings }[st.tab])();
  }
  const pane = () => document.getElementById('pane');

  // ---------- ผลรายวัน / แก้ไข ----------
  async function daily() {
    pane().innerHTML = `<div class="card"><div class="tb"><div><label>วันที่</label><input type="date" id="d" value="${st.date}" max="${todayISO()}"></div>
      <div><label>ระดับชั้น</label><select id="l">${CR.LEVELS.map(l => `<option value="${l}" ${String(l) === st.level ? 'selected' : ''}>ม.${l}</option>`).join('')}</select></div></div>
      <div id="tbl" class="spin">กำลังโหลด...</div></div>`;
    document.getElementById('d').onchange = e => { st.date = e.target.value; daily(); };
    document.getElementById('l').onchange = e => { st.level = e.target.value; daily(); };
    try {
      const data = await api('adminList', { kind: st.kind, from: st.date, to: st.date });
      const def = CR[st.kind], items = [], itemById = {}; def.categories.forEach(c => c.items.forEach(i => { items.push(i); itemById[i.id] = i; }));
      const by = {}; data.inspections.filter(r => r.level === st.level).forEach(r => by[r.room] = r);
      const team = data.teams.find(t => t.level === st.level), un = {}; data.unavail.filter(u => u.level === st.level).forEach(u => un[u.room] = u);
      let h = `<div class="muted" style="margin-bottom:8px">ผู้ตรวจ: ${team ? esc(team.names.join(', ')) : '— ยังไม่มี'}${team && team.buildingOpen ? ' · อาคาร' + (team.buildingOpen === 'open' ? 'เปิด' : 'ปิด') : ''} · แก้ตัวเลขในช่องได้ทันที (บันทึกประวัติอัตโนมัติ)</div>
        <div class="scroll"><table class="dt"><tr><th>ห้อง</th>${items.map(i => `<th>${i.id}</th>`).join('')}<th>รวม</th></tr>`;
      for (let r = 1; r <= CR.ROOMS; r++) {
        const x = by[r];
        if (x) h += `<tr data-key="${esc(x.key)}"><td class="l"><b>${st.level}/${r}</b></td>${items.map(i => `<td><input data-i="${i.id}" data-max="${i.max}" value="${x.scores[i.id]}" inputmode="numeric"></td>`).join('')}<td><b class="tt">${x.total}</b></td></tr>`;
        else h += `<tr><td class="l"><b>${st.level}/${r}</b></td><td colspan="${items.length + 1}" class="na l">${un[r] ? esc(un[r].reason + (un[r].text ? ' · ' + un[r].text : '')) : NA}</td></tr>`;
      }
      document.getElementById('tbl').outerHTML = h + '</table></div><div class="row"><button class="btn sec" id="hist" style="margin-top:12px">ดูประวัติการแก้ไข</button><button class="btn warn" id="dpdf" style="margin-top:12px">PDF ม.1–6</button><button class="btn sec" id="dimg" style="margin-top:12px">รูปภาพ ม.' + st.level + '</button></div><div id="hl"></div>';
      pane().querySelectorAll('input[data-i]').forEach(inp => { inp.dataset.old = inp.value; inp.onchange = async () => {
        const v = Number(inp.value), ok = K.allowedValues(itemById[inp.dataset.i]);
        if (inp.value === '' || isNaN(v) || ok.indexOf(v) < 0) { inp.value = inp.dataset.old; return toast('คะแนนที่เลือกได้: ' + ok.join(', ')); }
        const tr = inp.closest('tr');
        try { const r = await api('adminEdit', { key: tr.dataset.key, itemId: inp.dataset.i, value: v }); inp.dataset.old = inp.value; tr.querySelector('.tt').textContent = r.total; toast('บันทึกแล้ว'); }
        catch (e) { inp.value = inp.dataset.old; fail(e); }
      }; });
      document.getElementById('dpdf').onclick = () => withPdf(() => window.PDFX.daily({ kind: st.kind, date: st.date, api }));
      document.getElementById('dimg').onclick = () => withPdf(async () => window.PDFX.dailyImage({ kind: st.kind, date: st.date, level: st.level, data, cfg: await api('adminGetConfig') }));
      document.getElementById('hist').onclick = async () => {
        try {
          const rows = (await api('adminHistory', {})).filter(r => r.key.indexOf('|' + st.date + '|' + st.level + '|') > 0);
          document.getElementById('hl').innerHTML = rows.length ? `<div class="scroll" style="margin-top:10px"><table class="dt"><tr><th>เวลา</th><th>ห้อง</th><th>ข้อ</th><th>เดิม</th><th>ใหม่</th></tr>${rows.map(r => `<tr><td>${esc(r.time.replace('T', ' '))}</td><td>${esc(r.key.split('|')[3])}</td><td>${esc(r.itemId)}</td><td>${esc(r.oldValue)}</td><td>${esc(r.newValue)}</td></tr>`).join('')}</table></div>` : '<div class="muted" style="margin-top:8px">ยังไม่มีประวัติการแก้ไขของวันนี้/ชั้นนี้</div>';
        } catch (e) { fail(e); }
      };
    } catch (e) { document.getElementById('tbl').textContent = e.message; }
  }

  // ---------- สรุปรายสัปดาห์ ----------
  function weekly() {
    if (st.week) return weekView();
    const mons = SM.mondaysOfMonth(st.month);
    pane().innerHTML = `<div class="card"><div class="tb"><div><label>เดือน</label><input type="month" id="m" value="${st.month}"></div></div>
      <h3>สัปดาห์ในเดือน ${thm(st.month)}</h3><div class="grid">${mons.map((m, i) => `<button class="tile" data-w="${m}">สัปดาห์ที่ ${i + 1}<small>${thd(m)} – ${thd(SM.addDays(m, 4))}</small></button>`).join('')}</div></div>`;
    document.getElementById('m').onchange = e => { if (e.target.value) { st.month = e.target.value; weekly(); } };
    pane().querySelectorAll('[data-w]').forEach(b => b.onclick = () => { st.week = b.dataset.w; weekly(); });
  }
  async function weekView() {
    pane().innerHTML = `<div class="card"><div class="tb"><button class="btn sec" id="bk" style="margin:0;flex:0 0 100px">กลับ</button>
      <b style="flex:2">สรุป${kn()} ${thd(st.week)} – ${thd(SM.addDays(st.week, 4))}</b>
      <button class="btn" id="up" style="margin:0">อัปเดต</button><button class="btn warn" id="pdf" style="margin:0">PDF</button>${levelSel('il')}<button class="btn sec" id="img" style="margin:0">รูปภาพ</button></div><div id="wv" class="spin">กำลังโหลด...</div></div>`;
    document.getElementById('bk').onclick = () => { st.week = null; weekly(); };
    const load = async () => {
      document.getElementById('wv').innerHTML = 'กำลังโหลด...';
      try {
        const data = await api('adminList', { kind: st.kind, from: st.week, to: SM.addDays(st.week, 4) });
        const w = SM.weekSummary(st.kind, st.week, data); st.cur = { type: 'week', w, data };
        document.getElementById('wv').innerHTML = w.levels.map(L => levelWeekTable(L, w.dates)).join('');
      } catch (e) { document.getElementById('wv').textContent = e.message; }
    };
    document.getElementById('up').onclick = load;
    document.getElementById('pdf').onclick = () => exportPdf('week');
    document.getElementById('img').onclick = () => st.cur ? withPdf(() => window.PDFX.weekImage({ kind: st.kind, cur: st.cur, week: st.week, level: document.getElementById('il').value })) : toast('รอโหลดข้อมูลก่อน');
    load();
  }
  function levelWeekTable(L, dates) {
    let h = `<h3 style="margin-top:16px">ม.${L.level}</h3><div class="scroll"><table class="dt"><tr><th>ห้อง</th>${dates.map((d, i) => `<th>${DN[i]}<br><span class="na">${thd(d)}</span></th>`).join('')}<th>รวม</th><th>ร้อยละ</th><th>ผล</th></tr>`;
    L.rooms.forEach(r => {
      h += `<tr class="${r.medal ? r.medal.key : ''}"><td class="l"><b>${L.level}/${r.room}</b></td>${r.days.map(d => d === null ? '<td class="na">' + NA + '</td>' : `<td>${d}</td>`).join('')}`;
      h += r.count ? `<td><b>${r.total}</b></td><td>${pct(r.percent)}</td><td>${r.medal.label}</td></tr>` : `<td colspan="3" class="na">${NA}</td></tr>`;
    });
    return h + '</table></div>';
  }

  // ---------- สรุปรายเดือน ----------
  async function monthly() {
    if (st.cycle) return monthView();
    pane().innerHTML = '<div class="card spin">กำลังโหลด...</div>';
    let cycles = [];
    try { cycles = await api('adminListCycles', { kind: st.kind }); } catch (e) { return fail(e); }
    const mine = cycles.filter(c => c.month === st.month);
    pane().innerHTML = `<div class="card"><div class="tb"><div><label>เดือน</label><input type="month" id="m" value="${st.month}"></div></div>
      <h3>รอบสรุป ${thm(st.month)} (${kn()})</h3>
      ${mine.length ? `<div class="grid">${mine.map(c => `<button class="tile" data-c="${c.startDate}" data-l="${esc(c.label || '')}">${esc(c.label || 'รอบเดือน')}<small>${thd(c.startDate)} – ${thd(SM.addDays(c.startDate, 25))}</small></button>`).join('')}</div>` : '<div class="note">ยังไม่ได้เปิดรอบของเดือนนี้</div>'}
      <h3 style="margin-top:16px">เปิดรอบใหม่ (4 สัปดาห์ เริ่มวันจันทร์)</h3>
      <div class="tb"><div><label>วันจันทร์เริ่มต้น</label><select id="sd">${SM.mondaysOfMonth(st.month).map(m => `<option value="${m}">${thd(m)}</option>`).join('')}</select></div>
      <div><label>ชื่อรอบ</label><input type="text" id="lb" placeholder="เช่น เดือนพฤศจิกายน"></div>
      <button class="btn" id="add" style="margin:0;flex:0 0 120px">เปิดรอบ</button></div></div>`;
    document.getElementById('m').onchange = e => { if (e.target.value) { st.month = e.target.value; monthly(); } };
    document.getElementById('lb').value = MONTHS[Number(st.month.slice(5)) - 1];
    pane().querySelectorAll('[data-c]').forEach(b => b.onclick = () => { st.cycle = b.dataset.c; st.cycleLabel = b.dataset.l; monthly(); });
    document.getElementById('add').onclick = async () => {
      try { await api('adminAddCycle', { kind: st.kind, month: st.month, startDate: document.getElementById('sd').value, label: document.getElementById('lb').value }); toast('เปิดรอบแล้ว'); monthly(); } catch (e) { fail(e); }
    };
  }
  async function monthView() {
    pane().innerHTML = `<div class="card"><div class="tb"><button class="btn sec" id="bk" style="margin:0;flex:0 0 100px">กลับ</button>
      <b style="flex:2">สรุป${kn()}รายเดือน ${thd(st.cycle)} – ${thd(SM.addDays(st.cycle, 25))}</b>
      <button class="btn" id="up" style="margin:0">อัปเดต</button><button class="btn warn" id="pdf" style="margin:0">PDF</button>${levelSel('il')}<button class="btn sec" id="img" style="margin:0">รูปภาพ</button></div><div id="mv" class="spin">กำลังโหลด...</div></div>`;
    document.getElementById('bk').onclick = () => { st.cycle = null; monthly(); };
    const load = async () => {
      document.getElementById('mv').innerHTML = 'กำลังโหลด...';
      try {
        const data = await api('adminList', { kind: st.kind, from: st.cycle, to: SM.addDays(st.cycle, 25) });
        const m = SM.monthSummary(st.kind, st.cycle, data); st.cur = { type: 'month', m, data };
        document.getElementById('mv').innerHTML = m.levels.map(L => {
          let h = `<h3 style="margin-top:16px">ม.${L.level}</h3><div class="scroll"><table class="dt"><tr><th>ห้อง</th>${m.mondays.map((d, i) => `<th>สัปดาห์ ${i + 1}<br><span class="na">%</span></th>`).join('')}<th>รวม</th><th>ร้อยละ</th><th>ผล</th><th>รางวัล</th></tr>`;
          L.rooms.forEach(r => {
            h += `<tr class="${r.medal ? r.medal.key : ''}"><td class="l"><b>${L.level}/${r.room}</b></td>${r.weeks.map(w => w === null ? '<td class="na">' + NA + '</td>' : `<td>${pct(w)}</td>`).join('')}`;
            h += r.count ? `<td><b>${pct(r.total)}</b></td><td>${pct(r.percent)}</td><td>${r.medal.label}</td><td><b>${esc(r.award || '')}</b></td></tr>` : `<td colspan="4" class="na">${NA}</td></tr>`;
          });
          return h + '</table></div>';
        }).join('');
      } catch (e) { document.getElementById('mv').textContent = e.message; }
    };
    document.getElementById('up').onclick = load;
    document.getElementById('pdf').onclick = () => exportPdf('month');
    document.getElementById('img').onclick = () => st.cur ? withPdf(() => window.PDFX.monthImage({ kind: st.kind, cur: st.cur, cycle: st.cycle, cycleLabel: st.cycleLabel, level: document.getElementById('il').value })) : toast('รอโหลดข้อมูลก่อน');
    load();
  }
  function exportPdf(type) {
    if (!st.cur) return toast('รอโหลดข้อมูลก่อน');
    withPdf(() => window.PDFX.export({ kind: st.kind, type, cur: st.cur, week: st.week, cycle: st.cycle, cycleLabel: st.cycleLabel, api }));
  }

  // ---------- เวร / สถานะการส่งใบประเมิน ----------
  async function roster(date) {
    date = date || st.date;
    pane().innerHTML = `<div class="card"><div class="tb"><div><label>วันที่</label><input type="date" id="sd" value="${date}" max="${todayISO()}"></div>
      <button class="btn sec" id="rf" style="margin:0;flex:0 0 100px">รีเฟรช</button><button class="btn warn" id="rpdf" style="margin:0;flex:0 0 140px">PDF ใบเวร</button></div><div id="stt" class="spin">กำลังโหลด...</div></div><div id="ed"></div>`;
    document.getElementById('sd').onchange = e => { if (e.target.value) { st.date = e.target.value; roster(st.date); } };
    document.getElementById('rf').onclick = () => roster(date);
    document.getElementById('rpdf').onclick = () => withPdf(() => window.PDFX.roster({ date, api }));
    statsCard(date);
    window.ROSTER.mountEditor(document.getElementById('ed'), { api, date, toast, onChange: d => { st.date = d; roster(d); } });
    try {
      const [ro, cl, zn] = await Promise.all([api('rosterGet', { date }), api('adminList', { kind: 'classroom', from: date, to: date }), api('adminList', { kind: 'zone', from: date, to: date })]);
      const rm = window.ROSTER.mapFromEntries(ro);
      const row = (sec, data, l) => {
        const names = rm[sec + '|' + l] || [];
        const done = data.inspections.filter(x => x.level === String(l)).length, un = data.unavail.filter(x => x.level === String(l)).length;
        const team = data.teams.find(t => t.level === String(l));
        let tag;
        if (done + un >= CR.ROOMS) tag = '<span class="badge">ส่งครบ ' + done + '/' + CR.ROOMS + (un ? ' · ตรวจไม่ได้ ' + un : '') + '</span>';
        else if (done + un > 0) tag = '<span class="badge warn">ส่งแล้ว ' + done + '/' + CR.ROOMS + (un ? ' · ตรวจไม่ได้ ' + un : '') + '</span>';
        else tag = '<span class="badge bad">ยังไม่ส่ง</span>';
        const used = team ? team.names.join(', ') : '';
        return `<tr><td><b>ม.${l}</b></td><td class="l">${esc(names.join(', ')) || '<span class="na">ไม่ได้จัดเวร</span>'}${used && used !== names.join(', ') ? '<br><span class="na">ผู้ตรวจจริง: ' + esc(used) + '</span>' : ''}</td><td>${tag}</td></tr>`;
      };
      const tbl = (title, sec, data) => `<h3 style="margin-top:12px">${title}</h3><div class="scroll"><table class="dt"><tr><th>ชั้น</th><th>รายชื่อเวร</th><th>สถานะใบประเมิน</th></tr>${CR.LEVELS.map(l => row(sec, data, l)).join('')}</table></div>`;
      const pend = [];
      [['ห้อง', 'classroom', cl], ['เขต', 'zone', zn]].forEach(x => CR.LEVELS.forEach(l => {
        const n = x[2].inspections.filter(i => i.level === String(l)).length + x[2].unavail.filter(i => i.level === String(l)).length;
        if (n < CR.ROOMS) pend.push(x[0] + ' ม.' + l + (n ? ' (' + n + '/' + CR.ROOMS + ')' : ''));
      }));
      const banner = pend.length ? `<div class="note bad" style="margin-top:10px"><b>ยังส่งไม่ครบ:</b> ${esc(pend.join(' · '))}</div>` : '<div class="note ok" style="margin-top:10px"><b>ส่งใบประเมินครบทุกชั้นแล้ว</b></div>';
      document.getElementById('stt').outerHTML = banner + tbl('ตรวจห้องเรียน', 'classroom', cl) + tbl('ตรวจเขตพื้นที่', 'zone', zn) + '<div class="muted" style="margin-top:8px">แก้ไขรายชื่อเวรได้ในส่วนด้านล่าง</div>';
    } catch (e) { document.getElementById('stt').textContent = e.message; }
  }

  // ---------- สถิติการเข้าเวรต่อเดือน ----------
  function statsCard(date) {
    const ym = date.slice(0, 7), box = document.createElement('div');
    box.className = 'card'; box.innerHTML = `<h2>สถิติการเข้าเวรรายเดือน</h2><div class="tb"><div><label>เดือน</label><input type="month" id="sm" value="${ym}"></div></div><div id="so" class="muted">กำลังโหลด...</div>`;
    document.getElementById('pane').appendChild(box);
    const load = async () => {
      const m = box.querySelector('#sm').value, o = box.querySelector('#so'); if (!m) return;
      try {
        const last = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5), 0)).getUTCDate();
        const rows = await api('adminRosterRange', { from: m + '-01', to: m + '-' + String(last).padStart(2, '0') });
        const cnt = {}; const days = {};
        rows.forEach(r => r.names.forEach(n => {
          const c = cnt[n] = cnt[n] || { cl: 0, zn: 0, ot: 0, d: {} };
          if (!c.d[r.date + r.section]) { c.d[r.date + r.section] = 1; if (r.section === 'classroom') c.cl++; else if (r.section === 'zone') c.zn++; else c.ot++; }
        }));
        const list = Object.keys(cnt).map(n => ({ n, cl: cnt[n].cl, zn: cnt[n].zn, ot: cnt[n].ot, t: cnt[n].cl + cnt[n].zn + cnt[n].ot })).sort((a, b) => b.t - a.t || a.n.localeCompare(b.n, 'th'));
        o.innerHTML = list.length ? `<div class="scroll"><table class="dt"><tr><th>ชื่อ</th><th>ตรวจห้อง</th><th>ตรวจเขต</th><th>อื่น ๆ</th><th>รวม (ครั้ง)</th></tr>${list.map(x => `<tr><td class="l">${esc(x.n)}</td><td>${x.cl}</td><td>${x.zn}</td><td>${x.ot}</td><td><b>${x.t}</b></td></tr>`).join('')}</table></div>` : 'ยังไม่มีข้อมูลเวรในเดือนนี้';
      } catch (e) { o.textContent = e.message; }
    };
    box.querySelector('#sm').onchange = load; load();
  }

  // ---------- ตั้งค่า ----------
  async function settings() {
    pane().innerHTML = '<div class="card spin">กำลังโหลด...</div>';
    try {
      const [init, cfg, cycles] = await Promise.all([api('init'), api('adminGetConfig'), api('adminListCycles', {})]);
      const field = (k, lb) => `<label>${lb}</label><input type="text" data-c="${k}" value="${esc(cfg[k] || '')}">`;
      pane().innerHTML = `
      <div class="card"><h2>รายชื่อผู้ตรวจ</h2><div class="muted">หนึ่งชื่อต่อหนึ่งบรรทัด</div><textarea id="nm">${esc(init.names.join('\n'))}</textarea><button class="btn" id="sn">บันทึกรายชื่อ</button></div>
      <div class="card"><h2>เหตุผลที่ตรวจไม่ได้</h2><div class="muted">หนึ่งเหตุผลต่อหนึ่งบรรทัด</div><textarea id="rs">${esc(init.reasons.join('\n'))}</textarea><button class="btn" id="sr">บันทึกเหตุผล</button></div>
      <div class="card"><h2>ชื่อที่แสดงในเอกสาร PDF</h2>${field('schoolName', 'ชื่อโรงเรียน')}${field('term', 'ภาคเรียน/ปีการศึกษา')}${field('headBuilding', 'หัวหน้าอาคาร/ชื่อผู้ลงนาม (ถ้าต้องการพิมพ์ชื่อ)')}${field('councilPresident', 'ประธานสภานักเรียน')}${field('advisor', 'ที่ปรึกษาสภานักเรียน')}${field('deputyDirector', 'รองผู้อำนวยการฝ่ายบริหารงานทั่วไป')}${field('director', 'ผู้อำนวยการโรงเรียน')}
        <div class="muted" style="margin-top:6px">เว้นว่างไว้ = เว้นเส้นให้เซ็นด้วยมือ</div><button class="btn" id="sc">บันทึก</button></div>
      <div class="card"><h2>รอบสรุปรายเดือนที่เปิดไว้</h2>${cycles.length ? cycles.map(c => `<div class="row" style="align-items:center;margin:6px 0"><span>${c.kind === 'zone' ? 'เขต' : 'ห้อง'} · ${esc(c.label)} · ${thd(c.startDate)}</span><button class="btn sec" data-d="${c.id}" style="margin:0;flex:0 0 80px;padding:6px">ลบ</button></div>`).join('') : '<div class="muted">ไม่มี</div>'}</div>
      <div class="card"><h2>รหัสผ่านผู้จัดเวร</h2><div class="muted">ลิงก์หน้าจัดเวร: roster.html</div><input type="password" id="rp" placeholder="รหัสใหม่ผู้จัดเวร (อย่างน้อย 4 ตัว)"><button class="btn" id="crp">เปลี่ยนรหัสผู้จัดเวร</button></div>
      <div class="card"><h2>เปลี่ยนรหัสผ่านแอดมิน</h2><input type="password" id="np" placeholder="รหัสใหม่ (อย่างน้อย 4 ตัว)"><button class="btn" id="cp">เปลี่ยนรหัส</button></div>`;
      const lines = id => document.getElementById(id).value.split('\n').map(s => s.trim()).filter(Boolean);
      document.getElementById('sn').onclick = () => api('adminSetNames', { list: lines('nm') }).then(() => toast('บันทึกแล้ว')).catch(fail);
      document.getElementById('sr').onclick = () => api('adminSetReasons', { list: lines('rs') }).then(() => toast('บันทึกแล้ว')).catch(fail);
      document.getElementById('sc').onclick = () => { const v = {}; pane().querySelectorAll('[data-c]').forEach(i => v[i.dataset.c] = i.value.trim()); api('adminSetConfig', { values: v }).then(() => toast('บันทึกแล้ว')).catch(fail); };
      pane().querySelectorAll('[data-d]').forEach(b => b.onclick = () => { if (confirm('ลบรอบนี้?')) api('adminDelCycle', { id: b.dataset.d }).then(settings).catch(fail); });
      document.getElementById('crp').onclick = () => api('adminSetRosterPin', { newPin: document.getElementById('rp').value }).then(() => toast('เปลี่ยนรหัสผู้จัดเวรแล้ว')).catch(fail);
      document.getElementById('cp').onclick = () => { const n = document.getElementById('np').value; api('adminChangePin', { newPin: n }).then(() => { PIN = n; try { sessionStorage.setItem('pin', n); } catch (e) {} toast('เปลี่ยนรหัสแล้ว'); }).catch(fail); };
    } catch (e) { fail(e); }
  }

  if (PIN) api('adminLogin').then(shell).catch(login); else login();
})();
