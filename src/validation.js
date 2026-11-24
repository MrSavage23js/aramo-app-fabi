'use strict';

const PLANTAS = ['ARAMO', 'VELADORAS', 'OBRA', 'VILAFLOR'];
const GENEROS = ['', 'DAMA', 'CABALLERO'];
const TIPOS_INC = ['Falta', 'Retardo', 'Incapacidad', 'Permiso', 'Vacaciones', 'Suspensión', 'Otro'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const up = (v, max) => str(v, max).toUpperCase();

/** Entero positivo o error 400 */
function toId(v, what = 'ID') {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw bad(`${what} inválido`);
  return n;
}

/** Fecha real YYYY-MM-DD (rechaza 2026-02-31) */
function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Valida y normaliza el cuerpo de un empleado */
function parseEmp(b) {
  if (!b || typeof b !== 'object') throw bad('Datos inválidos');
  const nombre = up(b.nombre, 150);
  if (!nombre) throw bad('Falta el nombre');
  if (!PLANTAS.includes(b.planta)) throw bad('Planta inválida');
  const genero = GENEROS.includes(b.genero) ? b.genero : '';
  const bota = up(b.bota, 10);
  if (bota && bota !== 'N/A' && !/^\d{1,2}(\.5)?$/.test(bota)) throw bad('Talla de bota inválida (usa un número como 25 o 25.5, o N/A)');
  const juegos = [0, 1, 2].map((i) => {
    const j = (Array.isArray(b.juegos) && b.juegos[i]) || {};
    return [up(j.talla, 20), up(j.color, 30), up(j.forma, 30), up(j.tipo, 20)];
  });
  return {
    nombre, planta: b.planta, genero, juegos, bota,
    depto: up(b.depto, 60), puesto: up(b.puesto, 80),
    nota: str(b.nota, 255), dot: b.dot ? 1 : 0,
  };
}

/** Valida una incidencia */
function parseInc(b) {
  if (!b || typeof b !== 'object') throw bad('Datos inválidos');
  const emp = toId(b.emp, 'Empleado');
  if (!isDate(b.fecha)) throw bad('Fecha inválida');
  if (!TIPOS_INC.includes(b.tipo)) throw bad('Tipo de incidencia inválido');
  return { emp, fecha: b.fecha, tipo: b.tipo, obs: str(b.obs, 255) };
}

module.exports = { PLANTAS, GENEROS, TIPOS_INC, HttpError, str, up, toId, isDate, parseEmp, parseInc };
