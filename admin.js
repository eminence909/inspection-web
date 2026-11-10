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
    const tabs = [['daily', 'ผลรายวัน / แก้ไข'], ['weekly', 'สรุปรายสัปดาห์'], ['monthly', 'สรุปรายเดือน'], ['insights', 'ภาพรวม / แจ้งเตือน'], ['roster', 'เวร / สถานะการส่ง'], ['settings', 'ตั้งค่า']];
    $app.innerHTML = `<div class="tabs" id="tabs">${tabs.map(t => `<button data-t="${t[0]}" class="${st.tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>
      <div class="seg" style="margin-bottom:14px"><button class="tile ${st.kind === 'zone' ? 'sel' : ''}" data-k="zone">เขตพื้นที่</button><button class="tile ${st.kind === 'classroom' ? 'sel' : ''}" data-k="classroom">ห้องเรียน</button></div>
      <div id="pane"></div>`;
    document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => { st.tab = b.dataset.t; shell(); });
    document.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { st.kind = b.dataset.k; st.week = null; shell(); });
    ({ daily, weekly, monthly, insights, roster, settings }[st.tab])();
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
        <div class="scroll"><table class="dt cards"><tr><th>ห้อง</th>${items.map(i => `<th>${i.id}</th>`).join('')}<th>รวม</th></tr>`;
      for (let r = 1; r <= CR.ROOMS; r++) {
        const x = by[r];
        if (x) h += `<tr data-key="${esc(x.key)}"><td class="l"><b>${st.level}/${r}</b></td>${items.map(i => `<td data-l="${i.id}"><input data-i="${i.id}" data-max="${i.max}" value="${x.scores[i.id]}" inputmode="numeric"></td>`).join('')}<td data-l="รวม"><b class="tt">${x.total}</b></td></tr>`;
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
      <button class="btn" id="up" style="margin:0">อัปเดต</button><button class="btn warn" id="pdf" style="margin:0">PDF</button>${levelSel('il')}<button class="btn sec" id="img" style="margin:0">รูปภาพ</button></div><div id="pub" class="pubbar"></div><div id="wv" class="spin">กำลังโหลด...</div></div>`;
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
    publishBar('week');
    document.getElementById('img').onclick = () => st.cur ? withPdf(() => window.PDFX.weekImage({ kind: st.kind, cur: st.cur, week: st.week, api, level: document.getElementById('il').value })) : toast('รอโหลดข้อมูลก่อน');
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
      <button class="btn" id="up" style="margin:0">อัปเดต</button><button class="btn warn" id="pdf" style="margin:0">PDF</button>${levelSel('il')}<button class="btn sec" id="img" style="margin:0">รูปภาพ</button></div><div id="pub" class="pubbar"></div><div id="mv" class="spin">กำลังโหลด...</div></div>`;
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
    publishBar('month');
    document.getElementById('img').onclick = () => st.cur ? withPdf(() => window.PDFX.monthImage({ kind: st.kind, cur: st.cur, cycle: st.cycle, cycleLabel: st.cycleLabel, api, level: document.getElementById('il').value })) : toast('รอโหลดข้อมูลก่อน');
    load();
  }
  // ---------- เผยแพร่ผลออนไลน์ (หน้า results.html) ----------
  // เผยแพร่เฉพาะอันดับ + เหรียญ (+ รางวัลรายเดือน) ไม่ส่งคะแนนออกไป
  function publishBar(type) {
    const box = document.getElementById('pub'); if (!box) return;
    const ref = type === 'week' ? st.week : st.cycle, id = [st.kind, type, ref].join('|');
    const link = location.href.replace(/admin\.html.*$/, '') + 'results.html';
    box.innerHTML = '<span class="muted">กำลังตรวจสอบสถานะการเผยแพร่...</span>';
    api('publicResults').then(list => {
      const ex = list.find(x => x.id === id);
      box.innerHTML = `<div class="note" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:200px">${ex ? '<b>เผยแพร่แล้ว</b> (อัปเดตล่าสุด ' + esc(ex.publishedAt || '') + ')' : 'ยังไม่ได้เผยแพร่ผลนี้ให้นักเรียนดู'}<br><small class="muted">แสดงเฉพาะอันดับและเหรียญ ไม่แสดงคะแนน · ลิงก์: ${esc(link)}</small></span>
        <button class="btn" id="pb" style="margin:0;width:auto;padding:10px 16px">${ex ? 'อัปเดตผลที่เผยแพร่' : 'เผยแพร่ผล'}</button>${ex ? '<button class="btn sec" id="pu" style="margin:0;width:auto;padding:10px 16px">ยกเลิกเผยแพร่</button><button class="btn sec" id="pl" style="margin:0;width:auto;padding:10px 16px">คัดลอกลิงก์</button>' : ''}</div>`;
      document.getElementById('pb').onclick = () => {
        if (!st.cur) return toast('รอโหลดข้อมูลก่อน');
        const rk = rooms => { // อันดับตามร้อยละ (เท่ากันได้อันดับเดียวกัน)
          const ok = rooms.filter(r => r.count && r.percent !== null).sort((x, y) => y.percent - x.percent); const m = {};
          ok.forEach((r, i) => { m[r.room] = i > 0 && Math.abs(ok[i - 1].percent - r.percent) < 1e-9 ? m[ok[i - 1].room] : i + 1; }); return m;
        };
        let levels, label;
        if (type === 'week') { const w = st.cur.w; label = 'สัปดาห์ ' + thd(st.week) + ' – ' + thd(SM.addDays(st.week, 4)); levels = w.levels.map(L => { const m = rk(L.rooms); return { level: L.level, rooms: L.rooms.map(r => ({ room: r.room, rank: r.count ? m[r.room] : null, medal: r.count && r.medal ? r.medal.key : '' })) }; }); }
        else { const mm = st.cur.m; label = (st.cycleLabel || 'รายเดือน') + ' (' + thd(st.cycle) + ' – ' + thd(SM.addDays(st.cycle, 25)) + ')'; levels = mm.levels.map(L => ({ level: L.level, rooms: L.rooms.map(r => ({ room: r.room, rank: r.count ? r.rank : null, medal: r.count && r.medal ? r.medal.key : '', award: r.award || '' })) })); }
        api('adminSetPublish', { kind: st.kind, type, ref, label, levels }).then(() => { toast('เผยแพร่แล้ว'); publishBar(type); }).catch(fail);
      };
      const pu = document.getElementById('pu'); if (pu) pu.onclick = () => confirm('ยกเลิกการเผยแพร่ผลนี้?') && api('adminDelPublish', { id }).then(() => { toast('ยกเลิกแล้ว'); publishBar(type); }).catch(fail);
      const pl = document.getElementById('pl'); if (pl) pl.onclick = () => { try { navigator.clipboard.writeText(link).then(() => toast('คัดลอกลิงก์แล้ว')); } catch (e) { toast(link); } };
    }).catch(e => { box.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; });
  }
  function exportPdf(type) {
    if (!st.cur) return toast('รอโหลดข้อมูลก่อน');
    withPdf(() => window.PDFX.export({ kind: st.kind, type, cur: st.cur, week: st.week, cycle: st.cycle, cycleLabel: st.cycleLabel, api }));
  }

  // ---------- เวร / สถานะการส่งใบประเมิน ----------

  // ---------- ภาพรวม / แจ้งเตือนคะแนนต่ำซ้ำ / ส่งออก CSV ----------
  // ห้องที่ยังไม่ได้ตรวจ/ส่งไม่ครบ ในช่วงวันที่ (วันที่ไม่มีการตรวจเลยทั้งโรงเรียนถือว่าเป็นวันหยุด ไม่นับค้าง)
  async function overdueCard(from, to) {
    const box = document.getElementById('od'); if (!box) return; box.innerHTML = '<div class="card spin">กำลังตรวจสอบห้องค้างตรวจ...</div>';
    try {
      const [cl, zn, ro] = await Promise.all([api('adminList', { kind: 'classroom', from, to }), api('adminList', { kind: 'zone', from, to }), api('adminRosterRange', { from, to })]);
      const today = todayISO(), hourBkk = new Date(Date.now() + 7 * 3600e3).getUTCHours(), late = hourBkk >= 12;
      let hols = {}; try { (JSON.parse((await api('adminGetConfig')).holidays || '[]')).forEach(h => hols[h.d] = h.r || 'วันหยุด'); } catch (e) {}
      const names = {}; ro.forEach(r => names[r.date + '|' + r.section + '|' + r.grp] = r.names);
      const cnt = (data, d, l) => data.inspections.filter(x => x.date === d && x.level === String(l)).length + data.unavail.filter(x => x.date === d && x.level === String(l)).length;
      const anyDone = d => [cl, zn].some(x => x.inspections.some(i => i.date === d) || x.unavail.some(i => i.date === d));
      const rows = [], off = []; let d = from;
      for (let g = 0; g < 400 && d <= to; g++, d = SM.addDays(d, 1)) {
        const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue;
        if (hols[d]) { if (!anyDone(d)) { off.push(d); continue; } }
        if (d === today ? false : !anyDone(d)) { if (d < today) off.push(d); continue; }
        const items = [];
        [['classroom', 'ห้อง', cl], ['zone', 'เขต', zn]].forEach(x => CR.LEVELS.forEach(l => { const n = cnt(x[2], d, l); if (n < CR.ROOMS) items.push({ txt: x[1] + ' ม.' + l + ' (' + n + '/' + CR.ROOMS + ')', who: (names[d + '|' + x[0] + '|' + l] || []).join(', '), zero: n === 0 }); }));
        if (items.length) rows.push({ d, items, today: d === today });
      }
      if (!rows.length) { box.innerHTML = '<div class="card"><h3>ห้องที่ยังไม่ได้ตรวจ</h3><div class="note ok">ไม่มีห้องค้างตรวจในช่วงนี้</div>' + (off.length ? '<div class="muted" style="margin-top:6px">วันที่ไม่มีการตรวจเลย (ไม่นับค้าง): ' + off.map(thd).join(', ') + '</div>' : '') + '</div>'; return; }
      box.innerHTML = `<div class="card"><h3>ห้องที่ยังไม่ได้ตรวจเกินเวลา</h3>
        <div class="muted" style="margin-bottom:8px">รายการที่ยังส่งไม่ครบ ${rows.length} วัน${late ? '' : ' (วันนี้จะนับว่าเกินเวลาหลัง 12:00 น.)'} · แสดงรายชื่อเวรของชั้นนั้นเพื่อไปตามได้ง่าย</div>
        ${rows.map(r => `<div class="odr ${r.today && !late ? 'soft' : ''}"><div class="odh"><b>${thd(r.d)}</b><span class="badge ${r.today && !late ? 'warn' : 'bad'}">${r.today ? (late ? 'วันนี้ เกินเวลา' : 'วันนี้ ยังไม่ครบ') : 'ค้างตรวจ'} ${r.items.length} รายการ</span></div>
          ${r.items.map(i => `<div class="odi"><span>${esc(i.txt)}${i.zero ? ' <small class="muted">ยังไม่ส่งเลย</small>' : ''}</span><span class="muted">${esc(i.who || 'ไม่ได้จัดเวร')}</span></div>`).join('')}</div>`).join('')}
        ${off.length ? '<div class="muted" style="margin-top:6px">วันที่ไม่มีการตรวจเลย (ไม่นับค้าง): ' + off.map(thd).join(', ') + '</div>' : ''}</div>`;
    } catch (e) { box.innerHTML = '<div class="card"><div class="note bad">' + esc(e.message) + '</div></div>'; }
  }

  async function insights() {
    st.from = st.from || SM.addDays(todayISO(), -13); st.to = st.to || todayISO(); st.thr = st.thr || 50; st.rep = st.rep || 2;
    pane().innerHTML = `<div class="card"><div class="tb"><div><label>ตั้งแต่</label><input type="date" id="f" value="${st.from}" max="${todayISO()}"></div>
      <div><label>ถึง</label><input type="date" id="t" value="${st.to}" max="${todayISO()}"></div></div>
      <div class="tb"><div><label>เตือนเมื่อคะแนนต่ำกว่า</label><select id="th">${[50, 60, 70, 80].map(v => `<option ${v === st.thr ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>ซ้ำอย่างน้อย (วัน)</label><select id="rp">${[2, 3, 4, 5].map(v => `<option ${v === st.rep ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div></div>
      <div id="od"></div><div id="ins" class="spin">กำลังโหลด...</div>`;
    const reload = () => { st.from = document.getElementById('f').value; st.to = document.getElementById('t').value; st.thr = Number(document.getElementById('th').value); st.rep = Number(document.getElementById('rp').value); insights(); };
    ['f', 't', 'th', 'rp'].forEach(i => document.getElementById(i).onchange = reload);
    if (!st.from || !st.to || st.from > st.to) { document.getElementById('ins').innerHTML = '<div class="note">ช่วงวันที่ไม่ถูกต้อง</div>'; return; }
    overdueCard(st.from, st.to);
    try {
      const data = await api('adminList', { kind: st.kind, from: st.from, to: st.to });
      const ins = data.inspections;
      if (!ins.length) { document.getElementById('ins').innerHTML = '<div class="card"><div class="note">ไม่มีผลตรวจในช่วงนี้</div></div>'; return; }
      // เฉลี่ยรายชั้น
      const lv = {}; ins.forEach(r => { (lv[r.level] = lv[r.level] || []).push(r.total); });
      const avg = x => x.reduce((s, v) => s + v, 0) / x.length;
      const bars = CR.LEVELS.map(l => { const x = lv[l]; const v = x ? avg(x) : null; return `<div class="brow"><span>ม.${l}</span><div class="bt"><i style="width:${v || 0}%"></i></div><b>${v == null ? '-' : v.toFixed(1)}</b></div>`; }).join('');
      // แนวโน้มรายวัน
      const dd = {}; ins.forEach(r => { (dd[r.date] = dd[r.date] || []).push(r.total); });
      const days = Object.keys(dd).sort();
      const trend = days.map(d => { const v = avg(dd[d]); return `<div class="tcol" title="${thd(d)}: ${v.toFixed(1)}"><i style="height:${Math.max(2, v)}%"></i><small>${thd(d).split(' ').slice(0, 2).join(' ')}</small></div>`; }).join('');
      // คะแนนต่ำซ้ำ
      const low = {}; ins.forEach(r => { if (r.total < st.thr) { const k = r.level + '/' + r.room; (low[k] = low[k] || []).push(r); } });
      const al = Object.keys(low).filter(k => low[k].length >= st.rep).sort((x, y) => low[y].length - low[x].length);
      const alHtml = al.length ? `<div class="scroll"><table class="dt"><tr><th>ห้อง</th><th>จำนวนวัน</th><th>วันที่</th><th>เฉลี่ย</th></tr>${al.map(k => `<tr><td class="l"><b>${k}</b></td><td>${low[k].length}</td><td class="l">${low[k].map(r => thd(r.date)).join(', ')}</td><td>${avg(low[k].map(r => r.total)).toFixed(1)}</td></tr>`).join('')}</table></div>` : `<div class="note">ไม่มีห้องที่คะแนนต่ำกว่า ${st.thr} ซ้ำ ${st.rep} วันขึ้นไป</div>`;
      document.getElementById('ins').innerHTML = `
        <div class="card"><h3>ห้องคะแนนต่ำซ้ำ</h3>${alHtml}</div>
        <div class="card"><h3>คะแนนเฉลี่ยรายระดับชั้น</h3>${bars}<div class="muted">เฉลี่ยจาก ${ins.length} ใบประเมิน</div></div>
        <div class="card"><h3>แนวโน้มคะแนนเฉลี่ยรายวัน</h3><div class="trend">${trend}</div></div>
        <button class="btn" id="csv">ดาวน์โหลดไฟล์ Excel (CSV) ช่วงวันที่นี้</button>`;
      document.getElementById('csv').onclick = () => exportCsv(data);
    } catch (e) { fail(e); }
  }
  function exportCsv(data) {
    const def = CR[st.kind], items = []; def.categories.forEach(c => c.items.forEach(i => items.push(i)));
    const teamOf = {}; data.teams.forEach(t => teamOf[t.date + '|' + t.level] = t);
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['วันที่', 'ชั้น', 'ห้อง', 'ผู้ตรวจ'].concat(st.kind === 'classroom' ? ['อาคาร'] : []).concat(items.map(i => i.id)).concat(['รวม', 'หมายเหตุ']);
    const rows = [];
    data.inspections.slice().sort((x, y) => x.date.localeCompare(y.date) || x.level - y.level || x.room - y.room).forEach(r => {
      const t = teamOf[r.date + '|' + r.level];
      rows.push([r.date, r.level, r.room, t ? t.names.join(', ') : ''].concat(st.kind === 'classroom' ? [t ? (t.buildingOpen === 'open' ? 'เปิด' : t.buildingOpen === 'closed' ? 'ปิด' : '') : ''] : []).concat(items.map(i => r.scores[i.id])).concat([r.total, '']));
    });
    data.unavail.forEach(u => {
      const t = teamOf[u.date + '|' + u.level];
      rows.push([u.date, u.level, u.room, t ? t.names.join(', ') : ''].concat(st.kind === 'classroom' ? [''] : []).concat(items.map(() => '')).concat(['', 'ตรวจไม่ได้: ' + (u.reason || '') + (u.text ? ' ' + u.text : '')]));
    });
    const csv = '﻿' + [head].concat(rows).map(r => r.map(q).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const el = document.createElement('a'); el.href = url; el.download = (st.kind === 'zone' ? 'zone' : 'classroom') + '_' + st.from + '_' + st.to + '.csv';
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('ดาวน์โหลดแล้ว เปิดด้วย Excel ได้เลย');
  }

  async function roster(date) {
    date = date || st.date;
    pane().innerHTML = `<div class="card"><div class="tb"><div><label>วันที่</label><input type="date" id="sd" value="${date}" max="${todayISO()}"></div>
      <button class="btn sec" id="rf" style="margin:0;flex:0 0 100px">รีเฟรช</button><button class="btn warn" id="rpdf" style="margin:0;flex:0 0 110px">PDF ใบเวร</button><button class="btn warn" id="rimg" style="margin:0;flex:0 0 110px">รูปใบเวร</button></div><div id="stt" class="spin">กำลังโหลด...</div></div><div id="ed"></div>`;
    document.getElementById('sd').onchange = e => { if (e.target.value) { st.date = e.target.value; roster(st.date); } };
    document.getElementById('rf').onclick = () => roster(date);
    document.getElementById('rpdf').onclick = () => withPdf(() => window.PDFX.roster({ date, api }));
    document.getElementById('rimg').onclick = () => withPdf(() => window.PDFX.rosterImage({ date, api }));
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
    const box = document.createElement('div'); document.getElementById('pane').appendChild(box);
    window.ROSTER.mountStats(box, { api, date, toast });
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
      <div class="card"><h2>ชื่อที่แสดงในเอกสาร PDF</h2>${field('schoolName', 'ชื่อโรงเรียน')}${field('term', 'ภาคเรียน/ปีการศึกษา')}${field('headBuilding', 'หัวหน้าอาคาร/ชื่อผู้ลงนาม (ถ้าต้องการพิมพ์ชื่อ)')}${field('councilPresident', 'ประธานสภานักเรียน')}${field('activityChair', 'ประธานกิจกรรม (พิมพ์ในช่อง ผู้ตรวจ/ประธานกิจกรรม เมื่อผู้ตรวจไม่ถึง 3 คน)')}${field('advisor', 'ที่ปรึกษาสภานักเรียน')}${field('lineUrl', 'ลิงก์ไลน์แอดมิน (เช่น https://line.me/ti/p/~ไอดี) ใช้กับปุ่ม ติดต่อแอดมิน')}${field('deputyDirector', 'รองผู้อำนวยการฝ่ายบริหารงานทั่วไป')}${field('director', 'ผู้อำนวยการโรงเรียน')}
        <div class="muted" style="margin-top:6px">เว้นว่างไว้ = เว้นเส้นให้เซ็นด้วยมือ</div><button class="btn" id="sc">บันทึก</button></div>
      <div class="card"><h2>วันหยุด / วันไม่ตรวจ</h2><div class="muted">วันที่ระบุไว้จะไม่ถูกนับว่าห้องค้างตรวจ และผู้ตรวจจะเห็นป้ายบอกว่าเป็นวันหยุด</div>
        <div class="tb" style="margin-top:8px"><div><label>วันที่</label><input type="date" id="hd"></div><div><label>เหตุผล (ถ้ามี)</label><input type="text" id="hr" placeholder="เช่น วันหยุดชดเชย"></div><button class="btn sec" id="ha">เพิ่ม</button></div>
        <div id="hl"></div></div>
      <div class="card"><h2>รอบสรุปรายเดือนที่เปิดไว้</h2>${cycles.length ? cycles.map(c => `<div class="row" style="align-items:center;margin:6px 0"><span>${c.kind === 'zone' ? 'เขต' : 'ห้อง'} · ${esc(c.label)} · ${thd(c.startDate)}</span><button class="btn sec" data-d="${c.id}" style="margin:0;flex:0 0 80px;padding:6px">ลบ</button></div>`).join('') : '<div class="muted">ไม่มี</div>'}</div>
      <div class="card"><h2>รหัสผ่านผู้จัดเวร</h2><div class="muted">ลิงก์หน้าจัดเวร: roster.html</div><input type="password" id="rp" placeholder="รหัสใหม่ผู้จัดเวร (อย่างน้อย 4 ตัว)"><button class="btn" id="crp">เปลี่ยนรหัสผู้จัดเวร</button></div>
      <div class="card"><h2>นำเข้าไฟล์สำรองผลตรวจ</h2><div class="muted">ใช้เมื่อผู้ตรวจส่งผลไม่สำเร็จเพราะไม่มีสัญญาณ แล้วส่งไฟล์สำรอง (.json) มาให้ทางไลน์ เลือกไฟล์แล้วระบบส่งผลเข้าชีตให้</div><input type="file" id="qf" accept=".json,application/json"><button class="btn sec" id="qi">นำเข้าและส่งผล</button><div id="qr" class="muted"></div></div>
      <div class="card"><h2>เปลี่ยนรหัสผ่านแอดมิน</h2><input type="password" id="np" placeholder="รหัสใหม่ (อย่างน้อย 4 ตัว)"><button class="btn" id="cp">เปลี่ยนรหัส</button></div>`;
      document.getElementById('qi').onclick = async () => {
        const f = document.getElementById('qf').files[0], out = document.getElementById('qr'); if (!f) return toast('เลือกไฟล์ก่อน');
        let j; try { j = JSON.parse(await f.text()); } catch (e) { return toast('ไฟล์ไม่ถูกต้อง'); }
        const items = (j && j.type === 'inspection-queue' && j.items) || []; if (!items.length) return toast('ไม่พบรายการในไฟล์');
        let ok = 0, bad = []; out.textContent = 'กำลังส่ง...';
        for (const q of items) { try { await api(q.action, q.params); ok++; } catch (e) { bad.push((q.params && (q.params.level + '/' + q.params.room)) + ': ' + e.message); } }
        out.innerHTML = 'ส่งสำเร็จ ' + ok + '/' + items.length + (bad.length ? '<br>ไม่สำเร็จ: ' + bad.map(esc).join('<br>') : ''); toast('นำเข้าเสร็จแล้ว');
      };
      let hol = []; try { hol = JSON.parse(cfg.holidays || '[]'); } catch (e) {}
      const drawHol = () => {
        hol.sort((x, y) => x.d < y.d ? -1 : 1);
        document.getElementById('hl').innerHTML = hol.length ? hol.map((h, i) => `<div class="row" style="align-items:center;margin:6px 0"><span>${thd(h.d)}${h.r ? ' · ' + esc(h.r) : ''}</span><button class="btn sec" data-h="${i}" style="margin:0;flex:0 0 80px;padding:6px">ลบ</button></div>`).join('') : '<div class="muted" style="margin-top:6px">ยังไม่มีวันหยุดที่ตั้งไว้</div>';
        document.querySelectorAll('[data-h]').forEach(b => b.onclick = () => saveHol(hol.filter((_, i) => i !== Number(b.dataset.h))));
      };
      const saveHol = list => api('adminSetConfig', { values: { holidays: JSON.stringify(list) } }).then(() => { hol = list; drawHol(); toast('บันทึกแล้ว'); }).catch(fail);
      document.getElementById('ha').onclick = () => { const d = document.getElementById('hd').value; if (!d) return toast('เลือกวันที่ก่อน'); if (hol.some(h => h.d === d)) return toast('มีวันนี้อยู่แล้ว'); saveHol(hol.concat([{ d, r: document.getElementById('hr').value.trim() }])); document.getElementById('hd').value = ''; document.getElementById('hr').value = ''; };
      drawHol();
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
