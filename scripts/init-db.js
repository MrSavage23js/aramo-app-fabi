// Crea la base de datos y las tablas, aplica migraciones y carga datos iniciales si está vacía.
//   npm run db:init
//
// Datos iniciales:
//   - Usa SEED_FILE si está definido,
//   - si no, scripts/seed.local.json (tus datos reales, NO se sube a git),
//   - si no, scripts/seed.example.json (datos ficticios de demostración).
// Para no importar nada:  SEED_FILE=none npm run db:init
'use strict';
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { db } = require('../src/config');

const MIGRATIONS = [
  // [tabla, columna, definición] — para bases creadas con versiones anteriores
  ['incidencias', 'creado_por', "VARCHAR(50) NOT NULL DEFAULT '' AFTER obs"],
  ['empleados', 'actualizado', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER creado'],
];

function pickSeed() {
  const env = process.env.SEED_FILE;
  if (env) return env.toLowerCase() === 'none' ? null : path.resolve(env);
  const local = path.join(__dirname, 'seed.local.json');
  return fs.existsSync(local) ? local : path.join(__dirname, 'seed.example.json');
}

async function waitForDb(opts, tries = 30) {
  for (let i = 1; ; i++) {
    try { return await mysql.createConnection(opts); } catch (e) {
      if (i >= tries || !['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST'].includes(e.code)) throw e;
      console.log(`Esperando a MySQL (${i}/${tries})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

(async () => {
  const conn = await waitForDb({
    host: db.host, port: db.port, user: db.user, password: db.password,
    multipleStatements: true, charset: 'utf8mb4',
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${db.database}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

  for (const [table, col, def] of MIGRATIONS) {
    const [[{ n }]] = await conn.query(
      'SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
      [db.database, table, col]);
    if (!n) {
      await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
      console.log(`Migración: agregada columna ${table}.${col}`);
    }
  }
  console.log(`Base "${db.database}" lista.`);

  const [[{ n }]] = await conn.query('SELECT COUNT(*) n FROM empleados');
  const seedFile = pickSeed();
  if (n > 0) {
    console.log(`La tabla empleados ya tiene ${n} registros; no se importa nada.`);
  } else if (!seedFile) {
    console.log('SEED_FILE=none: no se importan datos.');
  } else {
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    const ids = [];
    await conn.beginTransaction();
    for (const e of seed.emps || []) {
      const [r] = await conn.query(
        'INSERT INTO empleados (nombre, planta, depto, puesto, genero, bota, nota, dot) VALUES (?,?,?,?,?,?,?,?)',
        [e.nombre, e.planta, e.depto || '', e.puesto || '', e.genero || '', e.bota || '', e.nota || '', e.dot ? 1 : 0]);
      ids.push(r.insertId);
      const rows = [0, 1, 2].map((i) => {
        const j = (e.juegos && e.juegos[i]) || {};
        return [r.insertId, i + 1, j.talla || '', j.color || '', j.forma || '', j.tipo || ''];
      });
      await conn.query('INSERT INTO dotacion (empleado_id, juego, talla, color, forma, tipo) VALUES ?', [rows]);
    }
    // En los archivos semilla, "emp" de una incidencia es el índice del empleado en la lista
    for (const i of seed.inc || []) {
      if (ids[i.emp]) {
        await conn.query('INSERT INTO incidencias (empleado_id, fecha, tipo, obs) VALUES (?,?,?,?)',
          [ids[i.emp], i.fecha, i.tipo, i.obs || '']);
      }
    }
    await conn.commit();
    console.log(`Importados ${ids.length} empleados desde ${path.basename(seedFile)}.`);
  }

  const [[{ u }]] = await conn.query('SELECT COUNT(*) u FROM usuarios');
  if (!u) console.log('\n⚠  No hay usuarios. Crea el primero con:  npm run user:add -- admin --rol admin\n');
  await conn.end();
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
