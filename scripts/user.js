// Gestión de usuarios desde la terminal.
//
//   npm run user:add -- <usuario> [--rol admin|consulta] [--nombre "Nombre completo"]
//   npm run user:passwd -- <usuario>
//   npm run user:list
//   npm run user:disable -- <usuario>
//   npm run user:enable -- <usuario>
//
// La contraseña se pide de forma interactiva (no queda en el historial),
// o se puede pasar por la variable de entorno USER_PASSWORD (útil en Docker/CI).
'use strict';
const readline = require('readline');
const { hashPassword } = require('../src/auth');
const pool = require('../src/db');

const [cmd, usuarioArg, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    rl.question(question, (ans) => { rl.close(); process.stdout.write('\n'); resolve(ans); });
  });
}

async function getPassword() {
  if (process.env.USER_PASSWORD) return process.env.USER_PASSWORD;
  const p1 = await askHidden('Contraseña: ');
  const p2 = await askHidden('Repite la contraseña: ');
  if (p1 !== p2) throw new Error('Las contraseñas no coinciden');
  return p1;
}

function checkPassword(p) {
  if (p.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
}

function needUser() {
  const u = String(usuarioArg || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(u)) throw new Error('Usuario inválido (3-50 caracteres: letras, números, . _ -)');
  return u;
}

(async () => {
  switch (cmd) {
    case 'add': {
      const usuario = needUser();
      const rol = opt('rol') || 'consulta';
      if (!['admin', 'consulta'].includes(rol)) throw new Error('Rol inválido: usa admin o consulta');
      const pass = await getPassword();
      checkPassword(pass);
      await pool.query('INSERT INTO usuarios (usuario, nombre, hash, rol) VALUES (?,?,?,?)',
        [usuario, opt('nombre') || '', await hashPassword(pass), rol]);
      console.log(`Usuario "${usuario}" creado con rol ${rol}.`);
      break;
    }
    case 'passwd': {
      const usuario = needUser();
      const pass = await getPassword();
      checkPassword(pass);
      const [r] = await pool.query('UPDATE usuarios SET hash=? WHERE usuario=?', [await hashPassword(pass), usuario]);
      console.log(r.affectedRows ? 'Contraseña actualizada.' : 'No existe ese usuario.');
      break;
    }
    case 'disable':
    case 'enable': {
      const usuario = needUser();
      const [r] = await pool.query('UPDATE usuarios SET activo=? WHERE usuario=?', [cmd === 'enable' ? 1 : 0, usuario]);
      console.log(r.affectedRows ? `Usuario ${cmd === 'enable' ? 'activado' : 'desactivado'}.` : 'No existe ese usuario.');
      break;
    }
    case 'list': {
      const [rows] = await pool.query('SELECT usuario, nombre, rol, activo, creado FROM usuarios ORDER BY usuario');
      console.table(rows.map((r) => ({ ...r, activo: r.activo ? 'sí' : 'no' })));
      break;
    }
    default:
      console.log('Uso: node scripts/user.js add|passwd|list|disable|enable <usuario> [--rol admin|consulta] [--nombre "..."]');
      process.exitCode = 1;
  }
})()
  .catch((e) => {
    console.error('Error:', e.code === 'ER_DUP_ENTRY' ? 'Ese usuario ya existe' : e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
