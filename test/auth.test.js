'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/auth');

const SECRET = 'x'.repeat(40);

test('hash y verificación de contraseña', async () => {
  const h = await auth.hashPassword('secreto123');
  assert.match(h, /^scrypt\$/);
  assert.ok(await auth.verifyPassword('secreto123', h));
  assert.ok(!(await auth.verifyPassword('otra', h)));
  assert.ok(!(await auth.verifyPassword('secreto123', 'basura')));
});

test('token de sesión: válido, alterado, otro secreto y expirado', () => {
  const t = auth.createToken(7, SECRET, 1);
  assert.equal(auth.readToken(t, SECRET), 7);
  assert.equal(auth.readToken(t + 'a', SECRET), null);
  assert.equal(auth.readToken(t, 'y'.repeat(40)), null);
  assert.equal(auth.readToken(auth.createToken(7, SECRET, -1), SECRET), null);
  assert.equal(auth.readToken(undefined, SECRET), null);
});

test('parseCookies', () => {
  assert.deepEqual(auth.parseCookies('a=1; b=hola%20mundo; mala=%E0'), { a: '1', b: 'hola mundo' });
});

test('límite de intentos', () => {
  const rl = auth.createRateLimiter({ max: 2, windowMs: 60e3 });
  assert.ok(!rl.blocked('k'));
  rl.fail('k'); rl.fail('k');
  assert.ok(rl.blocked('k'));
  rl.clear('k');
  assert.ok(!rl.blocked('k'));
});
