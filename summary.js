/* คำนวณสรุปรายสัปดาห์/รายเดือนจากผลดิบ (ใช้ร่วมกับหน้าแอดมินและ PDF) */
(function (root) {
  const K = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./calc.js') : root.CALC;
  const CR = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./criteria.js') : root.CRITERIA;

  function addDays(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
  }
  function isMonday(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1; }
  // วันจันทร์ที่ตกอยู่ในเดือน 'YYYY-MM'
  function mondaysOfMonth(ym) {
    const out = []; let d = ym + '-01';
    while (d.slice(0, 7) === ym) { if (isMonday(d)) out.push(d); d = addDays(d, 1); }
    return out;
  }
  function index(data) { // key date|level|room -> inspection
    const m = {}; (data.inspections || []).forEach(r => m[r.date + '|' + r.level + '|' + r.room] = r); return m;
  }

  function weekSummary(kind, monday, data, idx) {
    idx = idx || index(data);
    const dates = [0, 1, 2, 3, 4].map(i => addDays(monday, i));
    const levels = CR.LEVELS.map(l => {
      const rooms = [];
      for (let r = 1; r <= CR.ROOMS; r++) {
        const days = dates.map(d => { const x = idx[d + '|' + l + '|' + r]; return x ? x.total : null; });
        const w = K.weekly(days);
        rooms.push({ room: r, days, total: w.total, count: w.count, percent: w.percent, medal: w.medal });
      }
      const teams = {}; (data.teams || []).forEach(t => { if (String(t.level) === String(l) && dates.includes(t.date)) teams[t.date] = t.names; });
      return { level: l, rooms, teams };
    });
    return { monday, dates, levels };
  }

  // รอบ 4 สัปดาห์เริ่มวันจันทร์ start
  function monthSummary(kind, start, data) {
    const idx = index(data);
    const mondays = [0, 1, 2, 3].map(i => addDays(start, i * 7));
    const weeks = mondays.map(m => weekSummary(kind, m, data, idx));
    const levels = CR.LEVELS.map((l, li) => {
      const rooms = [];
      for (let r = 1; r <= CR.ROOMS; r++) {
        const wk = weeks.map(w => w.levels[li].rooms[r - 1]);
        const ws = wk.map(x => x.percent);
        const m = K.monthly(wk.map(x => ({ total: x.percent === null ? 0 : x.percent, count: x.percent === null ? 0 : 1 })));
        // คะแนนรวมแต่ละหมวด (ใช้ตัดสินเมื่อเท่ากัน)
        const catSum = {};
        weeks.forEach(w => w.dates.forEach(d => {
          const x = idx[d + '|' + l + '|' + r];
          if (x) K.dailyTotals(kind, x.scores).cats.forEach(c => catSum[c.no] = (catSum[c.no] || 0) + c.sum);
        }));
        const tie = CR[kind].tieBreak.map(n => catSum[n] || 0);
        rooms.push({ room: r, weeks: ws, total: m.total, count: m.count, percent: m.percent, medal: m.medal, tie });
      }
      const ranked = K.rank(rooms.map(x => ({ id: x.room, percent: x.percent === null ? null : Math.round(x.percent * 1e6) / 1e6, tie: x.tie })));
      ranked.forEach((x, i) => { const rm = rooms.find(z => z.room === x.id); rm.rank = i + 1; rm.award = K.AWARDS[i] || null; });
      return { level: l, rooms };
    });
    return { start, mondays, weeks, levels };
  }

  const api = { addDays, isMonday, mondaysOfMonth, weekSummary, monthSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SUMMARY = api;
})(typeof window !== 'undefined' ? window : this);
