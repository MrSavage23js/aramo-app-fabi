'use strict';
require('dotenv').config();
const crypto = require('crypto');

const env = process.env;
const isProd = env.NODE_ENV === 'production';
const bool = (v) => /^(1|true|yes|si|sí)$/i.test(String(v || ''));

let sessionSecret = env.SESSION_SECRET || '';
if (sessionSecret.length < 32) {
  if (isProd) {
    console.error('ERROR: SESSION_SECRET debe tener al menos 32 caracteres en producción.');
    console.error('Genera uno con:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('AVISO: SESSION_SECRET no definido; se usa uno temporal (las sesiones se cerrarán al reiniciar).');
}

const dbName = env.DB_NAME || 'aramo_personal';
if (!/^[A-Za-z0-9_]+$/.test(dbName)) {
  console.error('ERROR: DB_NAME solo puede contener letras, números y guion bajo.');
  process.exit(1);
}

module.exports = {
  isProd,
  port: +(env.PORT || 3000),
  host: env.HOST || '0.0.0.0',
  // Detrás de un proxy (Nginx, Render, Railway...) para que req.ip y cookies "secure" funcionen
  trustProxy: bool(env.TRUST_PROXY),
  // Activa cookies "Secure" y HSTS. Solo si la app se sirve por HTTPS.
  httpsOnly: bool(env.HTTPS_ONLY),
  sessionSecret,
  sessionHours: +(env.SESSION_HOURS || 12),
  db: {
    host: env.DB_HOST || 'localhost',
    port: +(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: dbName,
  },
};
