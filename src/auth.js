'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const COOKIE = 'aramo_sid';
const KEYLEN = 64;

/* ---------- Contraseñas (scrypt, sin dependencias nativas) ---------- */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password), salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [alg, saltB64, keyB64] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(key, expected);
}

/* ---------- Token de sesión firmado (HMAC-SHA256) ---------- */
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function createToken(userId, secret, hours) {
  const payload = b64u(JSON.stringify({ u: userId, exp: Date.now() + hours * 3600e3 }));
  return `${payload}.${sign(payload, secret)}`;
}

/** Devuelve el id de usuario si el token es válido y no ha expirado; si no, null. */
function readToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload, secret));
  const got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Number.isInteger(u) && exp > Date.now() ? u : null;
  } catch { return null; }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) {
      try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignora cookies mal formadas */ }
    }
  });
  return out;
}

/* ---------- Límite de intentos de login (en memoria) ---------- */
function createRateLimiter({ max = 10, windowMs = 15 * 60e3 } = {}) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs);
  timer.unref();
  return {
    /** true si la clave ya superó el límite */
    blocked(key) { const h = hits.get(key); return !!h && h.reset > Date.now() && h.n >= max; },
    fail(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
      else h.n++;
    },
    clear(key) { hits.delete(key); },
  };
}

module.exports = { COOKIE, hashPassword, verifyPassword, createToken, readToken, parseCookies, createRateLimiter };
