const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret';

const sign = (uid) => jwt.sign({ uid }, SECRET, { expiresIn: '30d' });

function guard(req, res, next) {
  const t = req.cookies.t || req.headers.authorization?.replace('Bearer ', '');
  try {
    req.uid = jwt.verify(t, SECRET).uid;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

const hash = (pw) => bcrypt.hashSync(pw, 10);
const verify = (pw, h) => bcrypt.compareSync(pw, h);

module.exports = { sign, guard, hash, verify };
