'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const pool = require('./db');
const auth = require('./auth');
const { HttpError, str, toId, parseEmp, parseInc } = require('./validation');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Permite servir por HTTP en la red interna sin forzar HTTPS
      upgradeInsecureRequests: config.httpsOnly ? [] : null,
    },
  },
  hsts: config.httpsOnly,
  crossOriginOpenerPolicy: config.httpsOnly,
  originAgentCluster: config.httpsOnly,
}));
app.use(express.json({ limit: '100kb' }));
// Sin caché larga: el navegador revalida con ETag, así cada actualización se ve al instante
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: 0 }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------- Salud (para Docker / hosting) ---------- */
app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

/* ---------- Protección CSRF: las peticiones que modifican deben venir del mismo sitio ---------- */
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = ''; }
    if (host !== req.get('host')) return next(new HttpError(403, 'Origen no permitido'));
  }
  if (!req.is('application/json') && req.headers['content-length'] !== '0' && req.method !== 'DELETE') {
    return next(new HttpError(415, 'Se esperaba JSON'));
  }
  next();
});

/* ---------- Sesión ---------- */
const limiter = auth.createRateLimiter({ max: 10, windowMs: 15 * 60e3 });
const cookieOpts = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.httpsOnly,
  path: '/',
  maxAge: config.sessionHours * 3600e3,
});

app.post('/api/login', wrap(async (req, res) => {
  const usuario = str(req.body?.usuario, 50).toLowerCase();
  const password = String(req.body?.password ?? '');
  const key = `${req.ip}|${usuario}`;
  if (limiter.blocked(key) || limiter.blocked(req.ip)) {
    throw new HttpError(429, 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.');
  }
  const [[u]] = await pool.query('SELECT id, hash FROM usuarios WHERE usuario=? AND activo=1', [usuario]);
  const ok = u ? await auth.verifyPassword(password, u.hash) : (await auth.hashPassword(password), false);
  if (!ok) {
    limiter.fail(key);
    limiter.fail(req.ip);
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  limiter.clear(key);
  res.cookie(auth.COOKIE, auth.createToken(u.id, config.sessionSecret, config.sessionHours), cookieOpts());
  res.json({ ok: true });
}));

app.post('/api/logout', (req, res) => {
  res.clearCookie(auth.COOKIE, { ...cookieOpts(), maxAge: undefined });
  res.json({ ok: true });
});

// A partir de aquí todas las rutas /api requieren sesión
app.use('/api', wrap(async (req, res, next) => {
  const id = auth.readToken(auth.parseCookies(req.headers.cookie)[auth.COOKIE], config.sessionSecret);
  if (!id) throw new HttpError(401, 'Sesión no iniciada');
  const [[u]] = await pool.query('SELECT id, usuario, nombre, rol FROM usuarios WHERE id=? AND activo=1', [id]);
  if (!u) throw new HttpError(401, 'Sesión no válida');
  req.user = u;
  next();
}));

const soloAdmin = (req, res, next) =>
  next(req.user.rol === 'admin' ? undefined : new HttpError(403, 'Tu usuario es de solo consulta'));

app.get('/api/me', (req, res) => res.json(req.user));

/* ---------- Datos completos (empleados con sus 3 juegos + incidencias) ---------- */
app.get('/api/data', wrap(async (req, res) => {
  const [emps] = await pool.query('SELECT id, nombre, planta, depto, puesto, genero, bota, nota, dot FROM empleados ORDER BY planta, nombre');
  const [dot] = await pool.query('SELECT empleado_id, juego, talla, color, forma, tipo FROM dotacion');
  const [inc] = await pool.query('SELECT id, empleado_id AS emp, fecha, tipo, obs, creado_por AS por FROM incidencias ORDER BY fecha DESC, id DESC');
  const map = new Map(emps.map((e) => [e.id, {
    ...e, dot: !!e.dot,
    juegos: [0, 1, 2].map(() => ({ talla: '', color: '', forma: '', tipo: '' })),
  }]));
  dot.forEach((d) => {
    const e = map.get(d.empleado_id);
    if (e && d.juego >= 1 && d.juego <= 3) e.juegos[d.juego - 1] = { talla: d.talla, color: d.color, forma: d.forma, tipo: d.tipo };
  });
  res.json({ emps: [...map.values()], inc });
}));

async function saveJuegos(conn, id, juegos) {
  const rows = juegos.map((j, i) => [id, i + 1, ...j]);
  await conn.query(
    `INSERT INTO dotacion (empleado_id, juego, talla, color, forma, tipo) VALUES ?
     ON DUPLICATE KEY UPDATE talla=VALUES(talla), color=VALUES(color), forma=VALUES(forma), tipo=VALUES(tipo)`,
    [rows]);
}

async function inTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/* ---------- Empleados ---------- */
app.post('/api/emps', soloAdmin, wrap(async (req, res) => {
  const e = parseEmp(req.body);
  const id = await inTransaction(async (conn) => {
    const [r] = await conn.query(
      'INSERT INTO empleados (nombre, planta, depto, puesto, genero, bota, nota, dot) VALUES (?,?,?,?,?,?,?,?)',
      [e.nombre, e.planta, e.depto, e.puesto, e.genero, e.bota, e.nota, e.dot]);
    await saveJuegos(conn, r.insertId, e.juegos);
    return r.insertId;
  });
  res.status(201).json({ id });
}));

app.put('/api/emps/:id', soloAdmin, wrap(async (req, res) => {
  const id = toId(req.params.id);
  const e = parseEmp(req.body);
  await inTransaction(async (conn) => {
    const [r] = await conn.query(
      'UPDATE empleados SET nombre=?, planta=?, depto=?, puesto=?, genero=?, bota=?, nota=?, dot=? WHERE id=?',
      [e.nombre, e.planta, e.depto, e.puesto, e.genero, e.bota, e.nota, e.dot, id]);
    if (!r.affectedRows) throw new HttpError(404, 'Empleado no encontrado');
    await saveJuegos(conn, id, e.juegos);
  });
  res.json({ ok: true });
}));

app.delete('/api/emps/:id', soloAdmin, wrap(async (req, res) => {
  // borra dotación e incidencias en cascada
  const [r] = await pool.query('DELETE FROM empleados WHERE id=?', [toId(req.params.id)]);
  if (!r.affectedRows) throw new HttpError(404, 'Empleado no encontrado');
  res.json({ ok: true });
}));

/* ---------- Incidencias ---------- */
app.post('/api/inc', soloAdmin, wrap(async (req, res) => {
  const i = parseInc(req.body);
  const [r] = await pool.query(
    'INSERT INTO incidencias (empleado_id, fecha, tipo, obs, creado_por) VALUES (?,?,?,?,?)',
    [i.emp, i.fecha, i.tipo, i.obs, req.user.usuario]);
  res.status(201).json({ id: r.insertId });
}));

app.delete('/api/inc/:id', soloAdmin, wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM incidencias WHERE id=?', [toId(req.params.id)]);
  if (!r.affectedRows) throw new HttpError(404, 'Incidencia no encontrada');
  res.json({ ok: true });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

/* ---------- Errores ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Datos demasiado grandes' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ya existe un empleado con ese nombre' });
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'Empleado inexistente' });
  if (['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'PROTOCOL_CONNECTION_LOST'].includes(err.code)) {
    console.error('Base de datos no disponible:', err.code);
    return res.status(503).json({ error: 'Base de datos no disponible' });
  }
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Error del servidor' });
});

module.exports = app;
