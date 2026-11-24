/* Lógica pura (sin DOM ni red): validación y utilidades.
   Se usa en el navegador (window.Logic) y en las pruebas con Node. */
(function (root) {
  'use strict';

  const PLANTAS = ['ARAMO', 'VELADORAS', 'OBRA', 'VILAFLOR'];
  const GENEROS = ['', 'DAMA', 'CABALLERO'];
  const TALLAS = ['CHICA', 'MEDIANA', 'GRANDE', 'EXTRA GRANDE'];
  const TIPOS_INC = ['Falta', 'Retardo', 'Incapacidad', 'Permiso', 'Vacaciones', 'Suspensión', 'Otro'];
  const JUEGO_KEYS = ['talla', 'color', 'forma', 'tipo'];
  const LIM = { talla: 20, color: 30, forma: 30, tipo: 20 };

  const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const up = (v, max) => str(v, max).toUpperCase();
  const emptyJuego = () => ({ talla: '', color: '', forma: '', tipo: '' });

  function normJuegos(juegos) {
    return [0, 1, 2].map((i) => {
      const j = (Array.isArray(juegos) && juegos[i]) || {};
      const o = {};
      JUEGO_KEYS.forEach((k) => { o[k] = up(j[k], LIM[k]); });
      if (o.talla === 'EXTRA GRAND') o.talla = 'EXTRA GRANDE';
      return o;
    });
  }

  /** Valida y normaliza un empleado. Lanza Error con mensaje para el usuario. */
  function normEmp(b) {
    if (!b || typeof b !== 'object') throw new Error('Datos inválidos');
    const nombre = up(b.nombre, 150);
    if (!nombre) throw new Error('Falta el nombre');
    const planta = up(b.planta, 20);
    if (!PLANTAS.includes(planta)) throw new Error('Planta inválida: ' + (b.planta || '(vacía)'));
    const bota = up(b.bota, 10);
    if (bota && bota !== 'N/A' && !/^\d{1,2}(\.5)?$/.test(bota)) throw new Error('Talla de bota inválida: usa un número (25 o 25.5) o N/A');
    const genero = up(b.genero, 20);
    return {
      nombre, planta, bota,
      genero: GENEROS.includes(genero) ? genero : '',
      depto: up(b.depto, 60),
      puesto: up(b.puesto, 80),
      nota: str(b.nota, 255),
      dot: b.dot === undefined ? true : !!b.dot,
      juegos: normJuegos(b.juegos),
    };
  }

  /** Fecha real YYYY-MM-DD (rechaza 2026-02-31) */
  function isDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  function normInc(b) {
    if (!b || typeof b !== 'object') throw new Error('Datos inválidos');
    if (!isDate(b.fecha)) throw new Error('Fecha inválida');
    if (!TIPOS_INC.includes(b.tipo)) throw new Error('Tipo de incidencia inválido');
    return { fecha: b.fecha, tipo: b.tipo, obs: str(b.obs, 255) };
  }

  /** Datos que faltan por capturar de un empleado */
  function faltantes(e) {
    const m = [];
    if (!e.depto) m.push('departamento');
    if (!e.puesto) m.push('puesto');
    if (!e.genero) m.push('género');
    if (e.dot) {
      if (!e.bota) m.push('talla de bota');
      const j = e.juegos[0];
      if (!j.talla) m.push('talla de playera');
      else if (j.talla !== 'N/A') {
        if (!j.color) m.push('color');
        if (!j.forma) m.push('forma');
        if (!j.tipo) m.push('tipo');
      }
    }
    return m;
  }

  /** Celda CSV segura: comillas y neutraliza fórmulas (=, +, -, @) para Excel */
  function csvCell(c) {
    let s = String(c ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** Fecha local YYYY-MM-DD (toISOString usa UTC y en la noche da el día siguiente) */
  function hoy(d = new Date()) {
    return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  }

  const Logic = { PLANTAS, GENEROS, TALLAS, TIPOS_INC, str, up, emptyJuego, normJuegos, normEmp, isDate, normInc, faltantes, csvCell, hoy };
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  else root.Logic = Logic;
})(typeof window !== 'undefined' ? window : globalThis);
