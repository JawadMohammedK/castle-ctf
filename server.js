require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const cors     = require('cors');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const { getDb, run, get, all, rawAll } = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'castle-weak-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: false }
}));

// ── All routes wrapped in async because sql.js needs to initialize ──
app.use(async (req, res, next) => {
  await getDb();
  next();
});

// ══════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: 'Fill all fields' });
  try {
    run('INSERT INTO players (username, password) VALUES (?, ?)', [username, password]);
    res.json({ message: 'Registered! You may enter the castle.' });
  } catch {
    res.json({ error: 'Username already taken' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const player = get('SELECT * FROM players WHERE username = ? AND password = ?', [username, password]);
  if (!player) return res.status(401).json({ error: 'Wrong credentials. The castle doors remain shut.' });
  req.session.player = { id: player.id, username: player.username, score: player.score };
  res.json({ message: `Welcome, ${username}. The gates open for you.`, username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'You have left the castle.' });
});

app.get('/api/me', (req, res) => {
  if (!req.session.player) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.player);
});

// ══════════════════════════════════════════
//  CHALLENGE 1 — IDOR
// ══════════════════════════════════════════
app.get('/api/scroll', (req, res) => {
  const id = req.query.id;
  if (!id) return res.json({ error: 'Provide an ?id= parameter' });
  const user = get('SELECT id, username, role, secret_scroll FROM users WHERE id = ?', [id]);
  if (!user) return res.json({ error: 'No scroll found for that id' });
  res.json(user);
});

// ══════════════════════════════════════════
//  CHALLENGE 2 — SQL INJECTION
// ══════════════════════════════════════════
app.get('/api/gate', (req, res) => {
  const name = req.query.name || '';
  const query = `SELECT id, name, open_time, guard FROM gates WHERE name = '${name}'`;
  const result = rawAll(query);
  res.json({ query_used: query, ...result });
});

// ══════════════════════════════════════════
//  CHALLENGE 3 — BROKEN ACCESS CONTROL
// ══════════════════════════════════════════
app.get('/api/room/:id', (req, res) => {
  const roleHeader = req.headers['x-role'] || 'peasant';
  const room = get('SELECT * FROM rooms WHERE id = ?', [req.params.id]);
  if (!room) return res.json({ error: 'Room not found' });
  if (room.is_private && roleHeader !== 'admin' && roleHeader !== 'mage' && roleHeader !== 'guard') {
    return res.status(403).json({ error: 'Access denied. Only castle staff may enter.', hint: 'Perhaps the right role would open this door...' });
  }
  res.json(room);
});

// ══════════════════════════════════════════
//  CHALLENGE 4 — HIDDEN ENDPOINT
// ══════════════════════════════════════════
app.get('/api/v0/debug/dump', (req, res) => {
  const users = all('SELECT id, username, role, email, secret_scroll FROM users', []);
  res.json({ warning: 'This endpoint should not be publicly accessible', flag: 'FLAG{hidden_endpoint_discovered_by_enumeration}', users });
});

// ══════════════════════════════════════════
//  CHALLENGE 5 — MASS ASSIGNMENT
// ══════════════════════════════════════════
app.post('/api/profile', (req, res) => {
  const { userId, username, role } = req.body;
  if (!userId) return res.json({ error: 'Provide userId' });
  run('UPDATE users SET username = ?, role = ? WHERE id = ?', [username, role, userId]);
  const updated = get('SELECT id, username, role FROM users WHERE id = ?', [userId]);
  res.json({ message: 'Profile updated', updated, flag: role === 'admin' ? 'FLAG{mass_assignment_you_crowned_yourself}' : null });
});

// ══════════════════════════════════════════
//  CHALLENGE 6 — STORED XSS
// ══════════════════════════════════════════
app.post('/api/announce', (req, res) => {
  const { author, message } = req.body;
  if (!author || !message) return res.json({ error: 'Fill all fields' });
  run('INSERT INTO announcements (author, message) VALUES (?, ?)', [author, message]);
  res.json({ message: 'Announcement posted to the castle board!' });
});

app.get('/api/announcements', (req, res) => {
  const announcements = all('SELECT * FROM announcements ORDER BY id DESC', []);
  res.json(announcements);
});

// ══════════════════════════════════════════
//  CHALLENGE 7 — WEAK JWT
// ══════════════════════════════════════════
app.post('/api/token/issue', (req, res) => {
  const { username } = req.body;
  const token = jwt.sign({ username, role: 'peasant' }, 'weakkey123', { expiresIn: '1h' });
  res.json({ token, hint: 'Your seal of passage. Guard it well — or tamper with it.' });
});

app.get('/api/tower/enter', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No seal provided' });
  try {
    const decoded = jwt.verify(token, 'weakkey123', { algorithms: ['HS256', 'none'] });
    if (decoded.role !== 'king') {
      return res.status(403).json({ error: 'Only the king may enter the tower', yourRole: decoded.role });
    }
    res.json({ message: "You have entered the King's Tower!", flag: 'FLAG{jwt_weak_secret_or_none_alg_bypass}' });
  } catch (e) {
    res.status(401).json({ error: 'Invalid seal', detail: e.message });
  }
});

// ══════════════════════════════════════════
//  CHALLENGE 8 — PATH TRAVERSAL
// ══════════════════════════════════════════
app.get('/api/letter', (req, res) => {
  const file = req.query.file || 'welcome.txt';
  const filePath = path.join(__dirname, 'public', 'letters', file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ file, content });
  } catch (e) {
    res.json({ error: `Cannot read file: ${e.message}`, attempted_path: filePath });
  }
});

// ══════════════════════════════════════════
//  CHALLENGE 9 — BRUTE FORCE
// ══════════════════════════════════════════
app.post('/api/vault', (req, res) => {
  const { pin } = req.body;
  const vault = get('SELECT * FROM vault WHERE pin = ?', [pin]);
  if (!vault) return res.json({ error: 'Wrong pin. The vault remains sealed.' });
  res.json({ message: 'The vault swings open!', treasure: vault.treasure });
});

// ══════════════════════════════════════════
//  FLAG SUBMISSION
// ══════════════════════════════════════════
const VALID_FLAGS = {
  'FLAG{idor_1_royal_scroll_revealed}':              { challengeId: 'ch1', points: 100 },
  'FLAG{idor_2_guard_scroll_stolen}':                { challengeId: 'ch1', points: 100 },
  'FLAG{idor_3_arcane_scroll_leaked}':               { challengeId: 'ch1', points: 100 },
  'FLAG{sqli_1_main_gate_time_exposed}':             { challengeId: 'ch2', points: 150 },
  'FLAG{sqli_2_shadow_gate_never_sleeps}':           { challengeId: 'ch2', points: 150 },
  'FLAG{sqli_3_royal_passage_unlocked}':             { challengeId: 'ch2', points: 150 },
  'FLAG{bac_1_throne_room_breached}':                { challengeId: 'ch3', points: 200 },
  'FLAG{bac_2_mage_tower_infiltrated}':              { challengeId: 'ch3', points: 200 },
  'FLAG{hidden_endpoint_discovered_by_enumeration}': { challengeId: 'ch4', points: 150 },
  'FLAG{mass_assignment_you_crowned_yourself}':      { challengeId: 'ch5', points: 200 },
  'FLAG{jwt_weak_secret_or_none_alg_bypass}':        { challengeId: 'ch7', points: 250 },
  'FLAG{bruteforce_vault_cracked_open}':             { challengeId: 'ch9', points: 150 },
  'FLAG{path_traversal_kings_letter_read}':          { challengeId: 'ch8', points: 200 },
  'FLAG{stored_xss_castle_board_pwned}':             { challengeId: 'ch6', points: 200 },
};

app.post('/api/submit-flag', (req, res) => {
  if (!req.session.player) return res.status(401).json({ error: 'Login first' });
  const { flag } = req.body;
  const entry = VALID_FLAGS[flag?.trim()];
  if (!entry) return res.json({ correct: false, message: 'The seal does not match. Keep trying.' });
  const already = get('SELECT * FROM solves WHERE username = ? AND challenge_id = ?', [req.session.player.username, entry.challengeId + '_' + flag]);
  if (already) return res.json({ correct: true, message: 'Already captured this flag!', alreadySolved: true });
  run('INSERT INTO solves (username, challenge_id) VALUES (?, ?)', [req.session.player.username, entry.challengeId + '_' + flag]);
  run('UPDATE players SET score = score + ? WHERE username = ?', [entry.points, req.session.player.username]);
  req.session.player.score += entry.points;
  res.json({ correct: true, message: `🏆 Flag captured! +${entry.points} points`, points: entry.points });
});

// ══════════════════════════════════════════
//  SCOREBOARD
// ══════════════════════════════════════════
app.get('/api/scoreboard', (req, res) => {
  const scores = all('SELECT username, score FROM players ORDER BY score DESC LIMIT 20', []);
  res.json(scores);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n⚔️  Castle CTF running on http://localhost:${PORT}\n`);
});