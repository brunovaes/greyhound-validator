const { db } = require('../db/database');
const BASE = process.env.BASE_PATH || '/greyhound';

function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect(BASE + '/login');
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.session.userId);
  if (!user) { req.session.destroy(); return res.redirect(BASE + '/login'); }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.redirect(BASE + '/login');
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.session.userId);
  if (!user || user.role !== 'admin') return res.status(403).send('Acesso negado.');
  req.user = user;
  next();
}

module.exports = { requireLogin, requireAdmin };
