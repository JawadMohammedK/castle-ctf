const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'castle.db');

let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    seedDatabase();
    saveDb();
  }
  return db;
}

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const results = [];
  const stmt = db.prepare(sql);
  stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function rawAll(sql) {
  try {
    const results = [];
    const stmt = db.prepare(sql);
    while (stmt.step()) results.push(stmt.getAsObject());
    stmt.free();
    return { results };
  } catch (e) {
    return { error: e.message };
  }
}

function seedDatabase() {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE, password TEXT,
    role TEXT DEFAULT 'peasant', email TEXT, secret_scroll TEXT)`);

  db.run(`CREATE TABLE IF NOT EXISTS gates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, open_time TEXT, guard TEXT, flag TEXT)`);

  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, owner_id INTEGER, content TEXT, is_private INTEGER DEFAULT 1)`);

  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS vault (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pin TEXT, treasure TEXT)`);

  db.run(`CREATE TABLE IF NOT EXISTS solves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT, challenge_id TEXT, solved_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  db.run(`CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE, password TEXT,
    score INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  const users = [
    [1,'king_aldric','kingpass123','admin','king@castle.ctf','FLAG{idor_1_royal_scroll_revealed}'],
    [2,'guard_brynn','guardpass456','guard','guard@castle.ctf','FLAG{idor_2_guard_scroll_stolen}'],
    [3,'mage_sylara','magepass789','mage','mage@castle.ctf','FLAG{idor_3_arcane_scroll_leaked}'],
    [4,'player','player123','peasant','you@castle.ctf','FLAG{idor_0_this_is_your_own_scroll}'],
  ];
  users.forEach(u => db.run(`INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?)`, u));

  const gates = [
    [1,'Main Gate','08:00 AM','Guard Brynn','FLAG{sqli_1_main_gate_time_exposed}'],
    [2,'Shadow Gate','02:00 AM','Shadow Watch','FLAG{sqli_2_shadow_gate_never_sleeps}'],
    [3,'Royal Gate','06:00 AM','Royal Guard','FLAG{sqli_3_royal_passage_unlocked}'],
  ];
  gates.forEach(g => db.run(`INSERT OR IGNORE INTO gates VALUES (?,?,?,?,?)`, g));

  const rooms = [
    [1,'Throne Room',1,'The king sits here. Secrets of the realm are kept in this chamber. FLAG{bac_1_throne_room_breached}',1],
    [2,'Guard Barracks',2,'Soldiers rest here. No flag here.',1],
    [3,'Mage Tower',3,'Ancient spells and scrolls. FLAG{bac_2_mage_tower_infiltrated}',1],
    [4,'Dungeon',1,'Dark and cold. Prisoners kept here.',0],
  ];
  rooms.forEach(r => db.run(`INSERT OR IGNORE INTO rooms VALUES (?,?,?,?,?)`, r));

  db.run(`INSERT OR IGNORE INTO announcements (author,message) VALUES ('King Aldric','The castle gates will be inspected tomorrow at dawn.')`);
  db.run(`INSERT OR IGNORE INTO vault (id,pin,treasure) VALUES (1,'7734','FLAG{bruteforce_vault_cracked_open}')`);
}

module.exports = { getDb, run, get, all, rawAll, saveDb };