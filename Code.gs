/**
 * Backend: ระบบตรวจห้องเรียน / เขตพื้นที่  (Google Apps Script Web App)
 * ใช้ Google Sheet ที่ผูกกับสคริปต์ (Extensions > Apps Script จากชีต)
 * ชีตจะถูกสร้างอัตโนมัติเมื่อเรียกใช้ครั้งแรก  — ดู README.md
 * ตั้งรหัสแอดมินที่ชีต Config (key = adminPin) ค่าเริ่มต้น 1234 ให้เปลี่ยนทันที
 */
var TZ = 'Asia/Bangkok';
// ===== ตั้งรหัสผ่านที่นี่ (แก้ได้เลย แล้ว Deploy เวอร์ชันใหม่) =====
// ถ้าเว้นว่าง '' ระบบจะใช้รหัสที่ตั้งไว้ในชีต Config / หน้าตั้งค่าแทน
var ADMIN_PIN = '1234';   // รหัสแอดมิน
var ROSTER_PIN = '5678';  // รหัสผู้จัดเวร
// ==============================================================
var SHEETS = {
  Inspections: ['key', 'kind', 'date', 'level', 'room', 'scores', 'total', 'submittedAt', 'updatedAt', 'submittedDate'],
  Teams: ['key', 'kind', 'date', 'level', 'names', 'buildingOpen', 'updatedAt'],
  Unavail: ['key', 'kind', 'date', 'level', 'room', 'reason', 'text', 'updatedAt'],
  Names: ['name'],
  Reasons: ['reason'],
  Config: ['key', 'value'],
  Cycles: ['id', 'kind', 'month', 'startDate', 'label'],
  EditLog: ['time', 'by', 'key', 'itemId', 'oldValue', 'newValue'],
  Summaries: ['id', 'kind', 'type', 'ref', 'pdfUrl', 'updatedAt'],
  Roster: ['key', 'date', 'section', 'grp', 'names', 'updatedAt'],
  Published: ['id', 'kind', 'type', 'ref', 'label', 'payload', 'publishedAt']
};

// ---------- helpers ----------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) {
    s = ss_().insertSheet(name);
    s.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    s.getRange(2, 1, s.getMaxRows() - 1, SHEETS[name].length).setNumberFormat('@'); // เก็บเป็นข้อความทั้งหมด
    s.setFrozenRows(1);
    if (name === 'Config') {
      s.getRange(2, 1, 4, 2).setValues([
        ['adminPin', '1234'],
        ['schoolName', 'โรงเรียนศีขรภูมิพิสัย'],
        ['term', 'ภาคเรียนที่ 1 ปีการศึกษา 2569'],
        ['rosterPin', '5678']
      ]);
    }
    if (name === 'Reasons') {
      s.getRange(2, 1, 4, 1).setValues([['อาคารไม่เปิด'], ['ห้องล็อก'], ['มีกิจกรรมในห้อง'], ['ห้องกำลังซ่อมแซม']]);
    }
  }
  return s;
}
var SCHEMA_VER = '4'; // เพิ่มเลขนี้เมื่อมีชีตใหม่
var MEMO = {};
function initAll_() {
  var pr = PropertiesService.getScriptProperties();
  if (pr.getProperty('schema') === SCHEMA_VER) return; // สร้างชีตเฉพาะครั้งแรก (เร็วขึ้นมาก)
  Object.keys(SHEETS).forEach(sheet_);
  pr.setProperty('schema', SCHEMA_VER);
}
function rows_(name) {
  if (MEMO[name]) return MEMO[name]; // อ่านชีตซ้ำในคำขอเดียวกันไม่ต้องอ่านใหม่
  var s = sheet_(name), v = s.getDataRange().getValues();
  var h = v.shift(), out = [];
  v.forEach(function (r, i) {
    if (r[0] === '' && r[1] === '') return;
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j] instanceof Date ? Utilities.formatDate(r[j], TZ, 'yyyy-MM-dd') : String(r[j]); });
    out.push(o);
  });
  MEMO[name] = out;
  return out;
}
function put_(name, obj, row) {
  MEMO = {};
  var s = sheet_(name), cols = SHEETS[name];
  var vals = cols.map(function (c) { return obj[c] === undefined ? '' : String(obj[c]); });
  if (row) s.getRange(row, 1, 1, cols.length).setNumberFormat('@').setValues([vals]);
  else {
    var r = s.getLastRow() + 1;
    s.getRange(r, 1, 1, cols.length).setNumberFormat('@').setValues([vals]);
  }
}
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function cfg_(k) {
  var r = rows_('Config').filter(function (x) { return x.key === k; })[0];
  return r ? r.value : '';
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function key_(kind, date, level, room) { return [kind, date, level, room].filter(function (x) { return x !== undefined && x !== ''; }).join('|'); }
function adminPin_() { return ADMIN_PIN || cfg_('adminPin'); }
function rosterPin_() { return ROSTER_PIN || cfg_('rosterPin') || '5678'; }
// ล็อกชั่วคราวเมื่อใส่รหัสผิดติดกัน 5 ครั้ง (10 นาที) กันการเดารหัส  — นับแยกแอดมิน/ผู้จัดเวร
var PIN_MAX_FAIL = 5, PIN_LOCK_SEC = 600;
function pinCheck_(who, ok) {
  var c = CacheService.getScriptCache(), k = 'pinfail_' + who, n = Number(c.get(k) || 0);
  if (n >= PIN_MAX_FAIL) throw new Error('ใส่รหัสผิดหลายครั้ง ถูกล็อกชั่วคราว กรุณาลองใหม่ในอีก 10 นาที');
  if (ok) { if (n) c.remove(k); return; }
  c.put(k, String(n + 1), PIN_LOCK_SEC);
  throw new Error(who === 'admin' ? 'รหัสแอดมินไม่ถูกต้อง' : 'รหัสผ่านไม่ถูกต้อง');
}
function checkAdmin_(p) { pinCheck_('admin', String(p.pin) === String(adminPin_())); }
function checkRoster_(p) {
  var pin = String(p.pin);
  pinCheck_('roster', pin === String(rosterPin_()) || pin === String(adminPin_()));
}
var ROSTER_SECTIONS = ['flag', 'late', 'classroom', 'zone', 'pnn', 'radio'];
function validDate_(d) { return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today_(); }
function validKind_(k) { return k === 'classroom' || k === 'zone'; }

// ---------- routing ----------
function doGet(e) { return handle_(e.parameter || {}); }
function doPost(e) {
  var p = {};
  try { p = JSON.parse(e.postData.contents); } catch (x) { p = e.parameter || {}; }
  return handle_(p);
}
function handle_(p) {
  var lock = LockService.getScriptLock();
  try {
    initAll_();
    var fn = ACTIONS[p.action];
    if (!fn) throw new Error('ไม่รู้จักคำสั่ง: ' + p.action);
    var write = /^(submit|edit|save|roster(Save)|admin(Edit|Set|Add|Del|Clear))/.test(p.action);
    if (write) lock.waitLock(20000);
    return out_({ ok: true, data: fn(p) });
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ---------- actions ----------
var ACTIONS = {
  // ผู้ตรวจ ----------------------------------------------------
  init: function () {
    var cache = CacheService.getScriptCache(), hit = cache.get('init'), o;
    if (hit) o = JSON.parse(hit);
    else {
      o = {
        names: rows_('Names').map(function (r) { return r.name; }),
        reasons: rows_('Reasons').map(function (r) { return r.reason; }),
        schoolName: cfg_('schoolName'), term: cfg_('term'),
        headBuilding: cfg_('headBuilding'), councilPresident: cfg_('councilPresident'), advisor: cfg_('advisor'), activityChair: cfg_('activityChair'), lineUrl: cfg_('lineUrl'), holidays: (function () { try { return JSON.parse(cfg_('holidays') || '[]'); } catch (e) { return []; } })()
      };
      cache.put('init', JSON.stringify(o), 300);
    }
    o.today = today_();
    return o;
  },
  // ข้อมูลตอนเข้าชั้น: สถานะห้อง + ชื่อเวร ในคำขอเดียว
  levelData: function (p) {
    var st = ACTIONS.status(p), names = [];
    var e = rows_('Roster').filter(function (r) { return r.date === p.date && r.section === p.kind && r.grp === String(p.level); })[0];
    if (e) names = JSON.parse(e.names || '[]');
    return { status: st, rosterNames: names };
  },
  // ผลของชั้นในวันนั้น (ใช้สร้างรูปใบประเมินหลังตรวจเสร็จ)
  dayData: function (p) {
    if (!validKind_(p.kind)) throw new Error('ประเภทไม่ถูกต้อง');
    var d = rangeData_(p.kind, p.date, p.date), L = String(p.level);
    return {
      inspections: d.inspections.filter(function (r) { return r.level === L; }),
      teams: d.teams.filter(function (r) { return r.level === L; }),
      unavail: d.unavail.filter(function (r) { return r.level === L; })
    };
  },
  // จำนวนห้องที่ตรวจแล้วของวันนั้น (ใช้แสดงหน้าแรก)
  dayCount: function (p) {
    var out = { classroom: 0, zone: 0, unClassroom: 0, unZone: 0 };
    rows_('Inspections').forEach(function (r) { if (r.date === p.date && out[r.kind] !== undefined) out[r.kind]++; });
    rows_('Unavail').forEach(function (r) { if (r.date === p.date) { if (r.kind === 'classroom') out.unClassroom++; else if (r.kind === 'zone') out.unZone++; } });
    return out;
  },
  // สถิติทั้งวัน: ห้องที่ตรวจแล้ว (พร้อมคะแนน) และห้องที่ตรวจไม่ได้ (พร้อมเหตุผล) ใช้แสดงหน้าผู้ตรวจ
  dayStats: function (p) {
    var ins = [], un = [];
    rows_('Inspections').forEach(function (r) { if (r.date === p.date) ins.push({ kind: r.kind, level: String(r.level), room: String(r.room), total: Number(r.total) }); });
    rows_('Unavail').forEach(function (r) { if (r.date === p.date) un.push({ kind: r.kind, level: String(r.level), room: String(r.room), reason: r.reason || '' }); });
    return { inspections: ins, unavail: un };
  },
  // สถานะห้องของระดับชั้นในวันนั้น
  status: function (p) {
    if (!validKind_(p.kind)) throw new Error('ประเภทไม่ถูกต้อง');
    var tk = key_(p.kind, p.date, p.level);
    var team = rows_('Teams').filter(function (r) { return r.key === tk; })[0] || null;
    var done = rows_('Inspections').filter(function (r) { return r.kind === p.kind && r.date === p.date && r.level === String(p.level); })
      .map(function (r) { return { room: r.room, total: Number(r.total), submittedDate: r.submittedDate }; });
    var un = rows_('Unavail').filter(function (r) { return r.kind === p.kind && r.date === p.date && r.level === String(p.level); })
      .map(function (r) { return { room: r.room, reason: r.reason, text: r.text }; });
    return { team: team && { names: JSON.parse(team.names || '[]'), buildingOpen: team.buildingOpen }, done: done, unavail: un, today: today_() };
  },
  saveTeam: function (p) {
    if (!validKind_(p.kind) || !validDate_(p.date)) throw new Error('วันที่หรือประเภทไม่ถูกต้อง');
    var names = (p.names || []).map(function (s) { return String(s).trim(); }).filter(Boolean).slice(0, 3);
    if (!names.length) throw new Error('ต้องมีผู้ตรวจอย่างน้อย 1 คน');
    var k = key_(p.kind, p.date, p.level), ex = rows_('Teams').filter(function (r) { return r.key === k; })[0];
    put_('Teams', { key: k, kind: p.kind, date: p.date, level: p.level, names: JSON.stringify(names), buildingOpen: p.buildingOpen || '', updatedAt: now_() }, ex && ex._row);
    return true;
  },
  // ห้องที่ตรวจไม่ได้ (เฉพาะห้องเรียน) — ส่งทั้งชุดทับของเดิม
  saveUnavail: function (p) {
    if (!validKind_(p.kind) || !validDate_(p.date)) throw new Error('วันที่หรือประเภทไม่ถูกต้อง');
    var s = sheet_('Unavail'), all = rows_('Unavail');
    all.filter(function (r) { return r.kind === p.kind && r.date === p.date && r.level === String(p.level); })
      .sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { s.deleteRow(r._row); });
    (p.items || []).forEach(function (it) {
      put_('Unavail', { key: key_(p.kind, p.date, p.level, it.room), kind: p.kind, date: p.date, level: p.level, room: it.room, reason: it.reason || '', text: it.text || '', updatedAt: now_() });
    });
    return true;
  },
  getInspection: function (p) {
    var r = rows_('Inspections').filter(function (x) { return x.key === key_(p.kind, p.date, p.level, p.room); })[0];
    return r ? { scores: JSON.parse(r.scores), total: Number(r.total), submittedDate: r.submittedDate } : null;
  },
  // ส่งผลตรวจ (ครั้งแรก) — ถ้ามีแล้วตอบ already
  submit: function (p) {
    if (!validKind_(p.kind) || !validDate_(p.date)) throw new Error('วันที่หรือประเภทไม่ถูกต้อง');
    var k = key_(p.kind, p.date, p.level, p.room);
    var ex = rows_('Inspections').filter(function (r) { return r.key === k; })[0];
    if (ex) return { already: true };
    var sc = cleanScores_(p.kind, p.scores);
    put_('Inspections', { key: k, kind: p.kind, date: p.date, level: p.level, room: p.room, scores: JSON.stringify(sc.scores), total: sc.total, submittedAt: now_(), updatedAt: now_(), submittedDate: today_() });
    return { already: false, total: sc.total };
  },
  // ผู้ตรวจแก้ไขของตนเอง ภายในวันที่กดส่ง
  editOwn: function (p) {
    var k = key_(p.kind, p.date, p.level, p.room);
    var ex = rows_('Inspections').filter(function (r) { return r.key === k; })[0];
    if (!ex) throw new Error('ยังไม่มีผลตรวจให้แก้ไข');
    if (ex.submittedDate !== today_()) throw new Error('แก้ไขได้เฉพาะภายในวันที่กดส่ง');
    var sc = cleanScores_(p.kind, p.scores);
    var before = {}; try { before = JSON.parse(ex.scores || '{}'); } catch (e) {}
    Object.keys(sc.scores).forEach(function (id) { // บันทึกประวัติเมื่อผู้ตรวจแก้คะแนนของตัวเองในวันเดียวกัน
      if (String(before[id]) !== String(sc.scores[id])) put_('EditLog', { time: now_(), by: 'ผู้ตรวจ', key: k, itemId: id, oldValue: before[id], newValue: sc.scores[id] });
    });
    ex.scores = JSON.stringify(sc.scores); ex.total = sc.total; ex.updatedAt = now_();
    put_('Inspections', ex, ex._row);
    return { total: sc.total };
  },

  // ประกาศผลออนไลน์ (สาธารณะ): มีเฉพาะอันดับ เหรียญ และรางวัล ไม่มีคะแนน ---------------
  publicResults: function () {
    return rows_('Published').map(function (r) { return { id: r.id, kind: r.kind, type: r.type, ref: r.ref, label: r.label, publishedAt: r.publishedAt, levels: JSON.parse(r.payload || '[]') }; })
      .sort(function (a, b) { return a.ref < b.ref ? 1 : a.ref > b.ref ? -1 : 0; }).slice(0, 60);
  },
  adminSetPublish: function (p) {
    checkAdmin_(p);
    if (!validKind_(p.kind) || (p.type !== 'week' && p.type !== 'month') || !/^\d{4}-\d{2}-\d{2}$/.test(p.ref)) throw new Error('ข้อมูลไม่ถูกต้อง');
    var id = [p.kind, p.type, p.ref].join('|'), ex = rows_('Published').filter(function (r) { return r.id === id; })[0];
    // เก็บเฉพาะอันดับ/เหรียญ/รางวัล ตัดฟิลด์อื่นทิ้ง
    var levels = (p.levels || []).map(function (L) { return { level: String(L.level), rooms: (L.rooms || []).map(function (r) { return { room: String(r.room), rank: r.rank || null, medal: r.medal || '', award: r.award || '' }; }) }; });
    put_('Published', { id: id, kind: p.kind, type: p.type, ref: p.ref, label: String(p.label || ''), payload: JSON.stringify(levels), publishedAt: now_() }, ex && ex._row);
    return true;
  },
  adminDelPublish: function (p) {
    checkAdmin_(p);
    var ex = rows_('Published').filter(function (r) { return r.id === p.id; })[0];
    if (ex) { sheet_('Published').deleteRow(ex._row); MEMO = {}; }
    return true;
  },
  // เวร ---------------------------------------------------------
  rosterGet: function (p) {
    return rows_('Roster').filter(function (r) { return r.date === p.date; })
      .map(function (r) { return { section: r.section, grp: r.grp, names: JSON.parse(r.names || '[]') }; });
  },
  // รายการวันที่ที่เคยจัดเวร (ใหม่สุดก่อน) พร้อมจำนวนชื่อ
  rosterDates: function (p) {
    var m = {};
    rows_('Roster').forEach(function (r) { var n = JSON.parse(r.names || '[]').length; m[r.date] = (m[r.date] || 0) + n; });
    return Object.keys(m).sort().reverse().slice(0, 90).map(function (d) { return { date: d, count: m[d] }; });
  },
  rosterLogin: function (p) { checkRoster_(p); return true; },
  // ส่งทั้งชุดของวัน ทับของเดิม (entries = [{section, grp, names}])
  rosterSave: function (p) {
    checkRoster_(p);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error('วันที่ไม่ถูกต้อง');
    var s = sheet_('Roster');
    rows_('Roster').filter(function (r) { return r.date === p.date; })
      .sort(function (a, b) { return b._row - a._row; }).forEach(function (r) { s.deleteRow(r._row); });
    (p.entries || []).forEach(function (e) {
      if (ROSTER_SECTIONS.indexOf(e.section) < 0) return;
      var names = (e.names || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
      if (!names.length) return;
      put_('Roster', { key: [p.date, e.section, e.grp || ''].join('|'), date: p.date, section: e.section, grp: e.grp || '', names: JSON.stringify(names), updatedAt: now_() });
    });
    return true;
  },
  // เวรในช่วงวันที่ (ผู้จัดเวรหรือแอดมินเรียกได้) ใช้ทำสถิติเวรรายคน
  rosterRange: function (p) {
    checkRoster_(p);
    return rows_('Roster').filter(function (r) { return r.date >= p.from && r.date <= p.to; })
      .map(function (r) { return { date: r.date, section: r.section, grp: r.grp, names: JSON.parse(r.names || '[]') }; });
  },
  adminRosterRange: function (p) {
    checkAdmin_(p);
    return rows_('Roster').filter(function (r) { return r.date >= p.from && r.date <= p.to; })
      .map(function (r) { return { date: r.date, section: r.section, grp: r.grp, names: JSON.parse(r.names || '[]') }; });
  },
  adminSetRosterPin: function (p) {
    checkAdmin_(p);
    if (ROSTER_PIN) throw new Error('รหัสผู้จัดเวรถูกตั้งไว้ในโค้ด Apps Script (ROSTER_PIN) ให้แก้ที่นั่น');
    if (!p.newPin || String(p.newPin).length < 4) throw new Error('รหัสใหม่ต้องมีอย่างน้อย 4 ตัว');
    var ex = rows_('Config').filter(function (r) { return r.key === 'rosterPin'; })[0];
    put_('Config', { key: 'rosterPin', value: p.newPin }, ex && ex._row);
    return true;
  },

  // แอดมิน -----------------------------------------------------
  adminLogin: function (p) { checkAdmin_(p); return true; },
  adminList: function (p) { // ผลดิบในช่วงวันที่ พร้อมทีมผู้ตรวจและห้องที่ตรวจไม่ได้
    checkAdmin_(p);
    return rangeData_(p.kind, p.from, p.to);
  },
  adminEdit: function (p) { // แก้ได้ทุกช่อง (itemId) ตลอดเวลา พร้อมบันทึกประวัติ
    checkAdmin_(p);
    var ex = rows_('Inspections').filter(function (r) { return r.key === p.key; })[0];
    if (!ex) throw new Error('ไม่พบรายการ');
    var scores = JSON.parse(ex.scores), v = Number(p.value);
    var item = findItem_(ex.kind, p.itemId);
    if (!item) throw new Error('ไม่มีหัวข้อนี้');
    if (isNaN(v) || allowedOf_(ex.kind, p.itemId).indexOf(v) < 0) throw new Error('คะแนนที่เลือกได้: ' + allowedOf_(ex.kind, p.itemId).join(', '));
    put_('EditLog', { time: now_(), by: 'admin', key: p.key, itemId: p.itemId, oldValue: scores[p.itemId], newValue: v });
    scores[p.itemId] = v;
    ex.scores = JSON.stringify(scores);
    ex.total = Object.keys(scores).reduce(function (a, i) { return a + Number(scores[i] || 0); }, 0);
    ex.updatedAt = now_();
    put_('Inspections', ex, ex._row);
    return { total: ex.total };
  },
  adminHistory: function (p) {
    checkAdmin_(p);
    return rows_('EditLog').filter(function (r) { return !p.key || r.key === p.key; }).reverse().slice(0, 500);
  },
  rosterSetNames: function (p) { checkRoster_(p); replaceList_('Names', 'name', p.list); return true; },
  adminSetNames: function (p) { checkAdmin_(p); replaceList_('Names', 'name', p.list); return true; },
  adminSetReasons: function (p) { checkAdmin_(p); replaceList_('Reasons', 'reason', p.list); return true; },
  adminSetConfig: function (p) {
    checkAdmin_(p);
    CacheService.getScriptCache().remove('init');
    var allow = ['schoolName', 'term', 'headBuilding', 'councilPresident', 'activityChair', 'lineUrl', 'advisor', 'deputyDirector', 'director', 'holidays', 'digestEmail'];
    var cur = rows_('Config');
    Object.keys(p.values || {}).forEach(function (k) {
      if (allow.indexOf(k) < 0) return;
      var ex = cur.filter(function (r) { return r.key === k; })[0];
      put_('Config', { key: k, value: p.values[k] }, ex && ex._row);
    });
    return true;
  },
  adminGetConfig: function (p) {
    checkAdmin_(p);
    var o = {}; rows_('Config').forEach(function (r) { if (r.key !== 'adminPin') o[r.key] = r.value; });
    return o;
  },
  adminChangePin: function (p) {
    checkAdmin_(p);
    if (ADMIN_PIN) throw new Error('รหัสแอดมินถูกตั้งไว้ในโค้ด Apps Script (ADMIN_PIN) ให้แก้ที่นั่น');
    if (!p.newPin || String(p.newPin).length < 4) throw new Error('รหัสใหม่ต้องมีอย่างน้อย 4 ตัว');
    var ex = rows_('Config').filter(function (r) { return r.key === 'adminPin'; })[0];
    put_('Config', { key: 'adminPin', value: p.newPin }, ex && ex._row);
    return true;
  },
  // ล้างข้อมูลทดสอบ: นับก่อน แล้วล้างพร้อมสำเนาสำรองอัตโนมัติ
  adminCountData: function (p) { checkAdmin_(p); return countData_(p); },
  adminClearData: function (p) {
    checkAdmin_(p);
    if (p.confirm !== 'ล้างข้อมูล') throw new Error('ต้องพิมพ์คำว่า ล้างข้อมูล เพื่อยืนยัน');
    var c = countData_(p), url = backupCopy_('สำรองก่อนล้างข้อมูล ' + p.from + ' ถึง ' + p.to + ' (สร้าง ' + now_() + ')');
    var r = rangeFns_(p.from, p.to, !!p.roster), removed = {};
    removed.Inspections = filterSheet_('Inspections', function (o) { return !r.inR(o.date); });
    removed.Teams = filterSheet_('Teams', function (o) { return !r.inR(o.date); });
    removed.Unavail = filterSheet_('Unavail', function (o) { return !r.inR(o.date); });
    removed.EditLog = filterSheet_('EditLog', function (o) { return !r.inR(String(o.key).split('|')[1] || ''); });
    if (p.roster) removed.Roster = filterSheet_('Roster', function (o) { return !r.inR(o.date); });
    CacheService.getScriptCache().remove('init'); MEMO = {};
    put_('EditLog', { time: now_(), by: 'admin', key: 'system', itemId: 'ล้างข้อมูล ' + p.from + '..' + p.to, oldValue: JSON.stringify(removed), newValue: '' });
    return { removed: removed, backup: url };
  },
  // สำรองและอีเมลสรุปอัตโนมัติ
  adminAutoStatus: function (p) { checkAdmin_(p); return autoStatus_(); },
  adminAutoSetup: function (p) { checkAdmin_(p); autoOn_(); return autoStatus_(); },
  adminAutoOff: function (p) { checkAdmin_(p); autoOff_(); return autoStatus_(); },
  adminBackupNow: function (p) { checkAdmin_(p); return { url: backupCopy_('สำรองด้วยมือ ' + now_()) }; },
  adminDigestNow: function (p) { checkAdmin_(p); return dailyDigest_(true); },
  // รอบเดือน (4 สัปดาห์เริ่มวันจันทร์) แอดมินเปิดเอง
  adminListCycles: function (p) { checkAdmin_(p); return rows_('Cycles').filter(function (r) { return !p.kind || r.kind === p.kind; }); },
  adminAddCycle: function (p) {
    checkAdmin_(p);
    var d = new Date(p.startDate + 'T00:00:00+07:00');
    if (isNaN(d) || d.getDay() !== 1) throw new Error('วันเริ่มต้องเป็นวันจันทร์');
    put_('Cycles', { id: Utilities.getUuid().slice(0, 8), kind: p.kind, month: p.month, startDate: p.startDate, label: p.label || '' });
    return true;
  },
  adminDelCycle: function (p) {
    checkAdmin_(p);
    var ex = rows_('Cycles').filter(function (r) { return r.id === p.id; })[0];
    if (ex) sheet_('Cycles').deleteRow(ex._row);
    return true;
  },
  // เก็บ PDF ล่าสุดของสรุป (ไฟล์เดียวต่อรายการ เขียนทับ)  base64 -> Drive
  adminSavePdf: function (p) {
    checkAdmin_(p);
    var folder = driveFolder_();
    var name = [p.kind, p.type, p.ref].join('_') + '.pdf';
    var it = folder.getFilesByName(name);
    while (it.hasNext()) it.next().setTrashed(true);
    var blob = Utilities.newBlob(Utilities.base64Decode(p.base64), 'application/pdf', name);
    var f = folder.createFile(blob);
    var id = [p.kind, p.type, p.ref].join('|');
    var ex = rows_('Summaries').filter(function (r) { return r.id === id; })[0];
    put_('Summaries', { id: id, kind: p.kind, type: p.type, ref: p.ref, pdfUrl: f.getUrl(), updatedAt: now_() }, ex && ex._row);
    return { url: f.getUrl() };
  },
  adminSummaries: function (p) { checkAdmin_(p); return rows_('Summaries'); }
};

// ---------- internals ----------
function validRange_(p) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.from)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.to)) || p.from > p.to) throw new Error('ช่วงวันที่ไม่ถูกต้อง');
  if (p.to > today_()) throw new Error('เลือกวันที่ล่วงหน้าไม่ได้');
}
function rangeFns_(from, to) { return { inR: function (d) { return !!d && d >= from && d <= to; } }; }
function countData_(p) {
  validRange_(p);
  var r = rangeFns_(p.from, p.to), n = {};
  n.Inspections = rows_('Inspections').filter(function (o) { return r.inR(o.date); }).length;
  n.Teams = rows_('Teams').filter(function (o) { return r.inR(o.date); }).length;
  n.Unavail = rows_('Unavail').filter(function (o) { return r.inR(o.date); }).length;
  n.EditLog = rows_('EditLog').filter(function (o) { return r.inR(String(o.key).split('|')[1] || ''); }).length;
  n.Roster = rows_('Roster').filter(function (o) { return r.inR(o.date); }).length;
  return n;
}
// เขียนชีตใหม่โดยเก็บเฉพาะแถวที่ keep() เป็นจริง คืนจำนวนแถวที่ลบ
function filterSheet_(name, keep) {
  var s = sheet_(name), cols = SHEETS[name], last = s.getLastRow();
  if (last < 2) return 0;
  var vals = s.getRange(2, 1, last - 1, cols.length).getValues(), kept = [], removed = 0;
  vals.forEach(function (row) {
    var o = {};
    cols.forEach(function (c, j) { o[c] = row[j] instanceof Date ? Utilities.formatDate(row[j], TZ, 'yyyy-MM-dd') : String(row[j]); });
    if (keep(o)) kept.push(row); else removed++;
  });
  if (!removed) return 0;
  s.getRange(2, 1, last - 1, cols.length).clearContent();
  if (kept.length) s.getRange(2, 1, kept.length, cols.length).setNumberFormat('@').setValues(kept);
  MEMO = {};
  return removed;
}
function backupFolder_() {
  var n = 'สำรองข้อมูลระบบตรวจ', it = DriveApp.getFoldersByName(n);
  return it.hasNext() ? it.next() : DriveApp.createFolder(n);
}
function backupCopy_(name) {
  return DriveApp.getFileById(ss_().getId()).makeCopy(name, backupFolder_()).getUrl();
}
// ทำงานอัตโนมัติ (ตั้งเวลาด้วยปุ่มในหน้าตั้งค่าแอดมิน): สำรองทุกวันศุกร์ เก็บ 8 ชุดล่าสุด
function weeklyBackup() {
  backupCopy_('สำรองรายสัปดาห์ ' + today_());
  var files = [], it = backupFolder_().getFiles();
  while (it.hasNext()) { var f = it.next(); if (f.getName().indexOf('สำรองรายสัปดาห์ ') === 0) files.push(f); }
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : a.getName() > b.getName() ? -1 : 0; });
  files.slice(8).forEach(function (f) { f.setTrashed(true); });
}
var DIGEST_LEVELS_ = [1, 2, 3, 4, 5, 6], DIGEST_ROOMS_ = 12;
function digestEmail_() { return cfg_('digestEmail') || Session.getEffectiveUser().getEmail(); }
// อีเมลสรุปตอนเย็น: ห้องที่ยังไม่ได้ตรวจของวันนี้ (ข้ามเสาร์-อาทิตย์และวันหยุดที่ตั้งไว้)
function dailyDigest() { return dailyDigest_(false); }
function dailyDigest_(force) {
  MEMO = {};
  var d = today_();
  if (!force) {
    if (Number(Utilities.formatDate(new Date(), TZ, 'u')) >= 6) return { skipped: 'weekend' };
    var hol = []; try { hol = JSON.parse(cfg_('holidays') || '[]'); } catch (e) {}
    if (hol.some(function (h) { return h && h.d === d; })) return { skipped: 'holiday' };
  }
  var lines = [], missing = 0, names = { classroom: 'ห้องเรียน', zone: 'เขตพื้นที่' };
  ['classroom', 'zone'].forEach(function (kind) {
    var seen = {};
    rows_('Inspections').forEach(function (r) { if (r.kind === kind && r.date === d) seen[r.level + '/' + r.room] = 1; });
    rows_('Unavail').forEach(function (r) { if (r.kind === kind && r.date === d) seen[r.level + '/' + r.room] = 1; });
    var kl = [];
    DIGEST_LEVELS_.forEach(function (L) {
      var m = [];
      for (var R = 1; R <= DIGEST_ROOMS_; R++) if (!seen[L + '/' + R]) m.push(R);
      if (m.length) { missing += m.length; kl.push('  ม.' + L + ': ' + (m.length === DIGEST_ROOMS_ ? 'ยังไม่ตรวจเลย' : 'ห้อง ' + m.join(', '))); }
    });
    lines.push('[' + names[kind] + ']' + (kl.length ? '' : ' ตรวจครบทุกห้องแล้ว'));
    kl.forEach(function (x) { lines.push(x); });
  });
  var to = digestEmail_(); if (!to) return { skipped: 'no-email' };
  var subject = 'สรุปการตรวจ ' + d + ': ' + (missing ? 'ยังไม่ได้ตรวจ ' + missing + ' ห้อง' : 'ครบทุกห้อง');
  MailApp.sendEmail(to, subject, lines.join('\n') + '\n\n(อีเมลอัตโนมัติจากระบบตรวจห้องเรียนและเขตพื้นที่)');
  return { sentTo: to, missing: missing };
}
var AUTO_FUNCS_ = ['weeklyBackup', 'dailyDigest'];
function autoOff_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (AUTO_FUNCS_.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t); });
}
function autoOn_() {
  autoOff_();
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(18).inTimezone(TZ).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(17).nearMinute(30).inTimezone(TZ).create();
}
function autoStatus_() {
  var n = ScriptApp.getProjectTriggers().filter(function (t) { return AUTO_FUNCS_.indexOf(t.getHandlerFunction()) >= 0; }).length;
  return { on: n >= 2, email: digestEmail_() };
}
function setupAuto() { autoOn_(); } // เรียกจากตัวแก้ไข Apps Script ได้เช่นกัน
function driveFolder_() {
  var n = 'ผลตรวจห้อง-เขต (PDF ล่าสุด)', it = DriveApp.getFoldersByName(n);
  return it.hasNext() ? it.next() : DriveApp.createFolder(n);
}
function replaceList_(name, col, list) {
  CacheService.getScriptCache().remove('init');
  MEMO = {};
  var s = sheet_(name), n = s.getLastRow();
  if (n > 1) s.getRange(2, 1, n - 1, 1).clearContent();
  var clean = (list || []).map(function (x) { return String(x).trim(); }).filter(Boolean);
  clean = clean.filter(function (x, i) { return clean.indexOf(x) === i; });
  if (clean.length) s.getRange(2, 1, clean.length, 1).setNumberFormat('@').setValues(clean.map(function (x) { return [x]; }));
}
function rangeData_(kind, from, to) {
  var ins = rows_('Inspections').filter(function (r) { return r.kind === kind && r.date >= from && r.date <= to; })
    .map(function (r) { return { key: r.key, date: r.date, level: r.level, room: r.room, scores: JSON.parse(r.scores), total: Number(r.total), updatedAt: r.updatedAt }; });
  var teams = rows_('Teams').filter(function (r) { return r.kind === kind && r.date >= from && r.date <= to; })
    .map(function (r) { return { date: r.date, level: r.level, names: JSON.parse(r.names || '[]'), buildingOpen: r.buildingOpen }; });
  var un = rows_('Unavail').filter(function (r) { return r.kind === kind && r.date >= from && r.date <= to; })
    .map(function (r) { return { date: r.date, level: r.level, room: r.room, reason: r.reason, text: r.text }; });
  return { inspections: ins, teams: teams, unavail: un };
}

// ----- เกณฑ์ฝั่งเซิร์ฟเวอร์ (คะแนนเต็มต่อข้อ) ต้องตรงกับ criteria.js -----
function maxMap_(kind) {
  var m = {}, i, c;
  if (kind === 'classroom') {
    for (c = 1; c <= 5; c++) for (i = 1; i <= 4; i++) m[c + '.' + i] = 5;
  } else {
    for (c = 1; c <= 4; c++) for (i = 1; i <= 4; i++) m[c + '.' + i] = c === 1 ? 10 : 5;
  }
  return m;
}
function allowedOf_(kind, id) {
  var max = maxMap_(kind)[id];
  if (!max) return null;
  return max === 10 ? [10, 8, 6, 4, 3, 2, 1, 0] : [5, 4, 3, 2, 1, 0]; // ตามเกณฑ์: ข้อ 10 คะแนนเลือกได้ 10, 8, 6, 4 และ 3-0
}
function findItem_(kind, id) { var m = maxMap_(kind); return m[id] ? { max: m[id] } : null; }
function cleanScores_(kind, scores) {
  var m = maxMap_(kind), out = {}, total = 0;
  Object.keys(m).forEach(function (id) {
    var v = Number((scores || {})[id]);
    if (isNaN(v) || allowedOf_(kind, id).indexOf(v) < 0 || (scores || {})[id] === '' || (scores || {})[id] === null || (scores || {})[id] === undefined)
      throw new Error('คะแนนข้อ ' + id + ' ไม่ครบหรือไม่ถูกต้อง');
    out[id] = v; total += v;
  });
  return { scores: out, total: total };
}
