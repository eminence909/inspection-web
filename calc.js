/* ฟังก์ชันคำนวณคะแนน (ใช้ร่วมกันทั้งหน้าเว็บ, PDF และเทสต์ใน Node) */
(function (root) {
  const CR = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./criteria.js') : root.CRITERIA;

  // scores: { '1.1': 5, ... } -> { cats:[{no,sum,max}], total }
  function dailyTotals(kind, scores) {
    const def = CR[kind];
    let total = 0;
    const cats = def.categories.map(c => {
      const sum = c.items.reduce((a, i) => a + (Number(scores[i.id]) || 0), 0);
      total += sum;
      return { no: c.no, sum, max: c.max };
    });
    return { cats, total };
  }

  function isComplete(kind, scores) {
    return CR[kind].categories.every(c => c.items.every(i => {
      const v = scores[i.id];
      return v !== undefined && v !== null && v !== '' && Number(v) >= 0 && Number(v) <= i.max;
    }));
  }

  // days: array of daily totals (number) หรือ null เมื่อไม่ได้ประเมิน
  function weekly(days) {
    const done = days.filter(d => typeof d === 'number');
    if (!done.length) return { total: 0, count: 0, percent: null, medal: null };
    const total = done.reduce((a, b) => a + b, 0);
    const percent = total / (100 * done.length) * 100;
    return { total, count: done.length, percent, medal: medalOf(percent) };
  }

  function medalOf(p) {
    if (p === null || p === undefined) return null;
    return CR.MEDALS.find(m => p >= m.min);
  }

  // รายเดือน: weeks = [{total,count}] (4 สัปดาห์) -> รวม/400 และ %
  function monthly(weeks) {
    const count = weeks.reduce((a, w) => a + (w.count || 0), 0);
    const total = weeks.reduce((a, w) => a + (w.total || 0), 0);
    if (!count) return { total: 0, count: 0, percent: null, medal: null };
    const percent = total / (100 * count) * 100;
    return { total, count, percent, medal: medalOf(percent) };
  }

  // จัดอันดับ: rows = [{id, percent, tie:[catSum4, catSum5]}] -> เรียงมากไปน้อย
  function rank(rows) {
    return rows.filter(r => r.percent !== null)
      .sort((a, b) => {
        if (b.percent !== a.percent) return b.percent - a.percent;
        const ta = a.tie || [], tb = b.tie || [];
        for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
          const d = (tb[i] || 0) - (ta[i] || 0);
          if (d) return d;
        }
        return 0;
      });
  }
  const AWARDS = ['ชนะเลิศ', 'รองชนะเลิศอันดับ 1', 'รองชนะเลิศอันดับ 2', 'ชมเชย', 'ชมเชย'];

  const api = { dailyTotals, isComplete, weekly, monthly, medalOf, rank, AWARDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CALC = api;
})(typeof window !== 'undefined' ? window : this);
