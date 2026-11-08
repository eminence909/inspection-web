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
  Roster: ['key', 'date', 'section', 'grp', 'names', 'updatedAt']
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
function checkAdmin_(p) { if (String(p.pin) !== String(adminPin_())) throw new Error('รหัสแอดมินไม่ถูกต้อง'); }
function checkRoster_(p) {
  var pin = String(p.pin);
  if (pin !== String(rosterPin_()) && pin !== String(adminPin_())) throw new Error('รหัสผ่านไม่ถูกต้อง');
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
    var write = /^(submit|edit|save|roster(Save)|admin(Edit|Set|Add|Del))/.test(p.action);
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
        headBuilding: cfg_('headBuilding'), councilPresident: cfg_('councilPresident'), advisor: cfg_('advisor')
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
    ex.scores = JSON.stringify(sc.scores); ex.total = sc.total; ex.updatedAt = now_();
    put_('Inspections', ex, ex._row);
    return { total: sc.total };
  },

  // เวร ---------------------------------------------------------
  rosterGet: function (p) {
    return rows_('Roster').filter(function (r) { return r.date === p.date; })
      .map(function (r) { return { section: r.section, grp: r.grp, names: JSON.parse(r.names || '[]') }; });
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
    return rows_('EditLog').filter(function (r) { return !p.key || r.key === p.key; }).reverse().slice(0, 300);
  },
  adminSetNames: function (p) { checkAdmin_(p); replaceList_('Names', 'name', p.list); return true; },
  adminSetReasons: function (p) { checkAdmin_(p); replaceList_('Reasons', 'reason', p.list); return true; },
  adminSetConfig: function (p) {
    checkAdmin_(p);
    CacheService.getScriptCache().remove('init');
    var allow = ['schoolName', 'term', 'headBuilding', 'councilPresident', 'advisor', 'deputyDirector', 'director'];
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
