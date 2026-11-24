'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

const base = { nombre: '  perez   lopez juan ', planta: 'aramo', bota: '25', juegos: [{ talla: 'mediana', color: 'azul' }] };

test('normEmp normaliza nombre, planta, mayúsculas y juegos', () => {
  const e = L.normEmp(base);
  assert.equal(e.nombre, 'PEREZ LOPEZ JUAN');
  assert.equal(e.planta, 'ARAMO');
  assert.deepEqual(e.juegos[0], { talla: 'MEDIANA', color: 'AZUL', forma: '', tipo: '' });
  assert.deepEqual(e.juegos[2], L.emptyJuego());
  assert.equal(e.dot, true);
});

test('normEmp rechaza datos inválidos', () => {
  assert.throws(() => L.normEmp({ ...base, nombre: ' ' }), /nombre/);
  assert.throws(() => L.normEmp({ ...base, planta: 'OTRA' }), /Planta/);
  assert.throws(() => L.normEmp({ ...base, bota: 'grande' }), /bota/);
  assert.throws(() => L.normEmp(null), /inválidos/);
});

test('normEmp: botas N/A, medias tallas, género desconocido y talla mal escrita', () => {
  assert.equal(L.normEmp({ ...base, bota: 'n/a' }).bota, 'N/A');
  assert.equal(L.normEmp({ ...base, bota: '25.5' }).bota, '25.5');
  assert.equal(L.normEmp({ ...base, genero: 'X' }).genero, '');
  assert.equal(L.normEmp({ ...base, juegos: [{ talla: 'extra grand' }] }).juegos[0].talla, 'EXTRA GRANDE');
});

test('isDate y normInc', () => {
  assert.ok(L.isDate('2026-02-28'));
  assert.ok(!L.isDate('2026-02-31'));
  assert.ok(!L.isDate('2026-2-1'));
  assert.deepEqual(L.normInc({ fecha: '2026-11-24', tipo: 'Falta', obs: ' x ' }), { fecha: '2026-11-24', tipo: 'Falta', obs: 'x' });
  assert.throws(() => L.normInc({ fecha: '2026-11-24', tipo: 'Fiesta' }), /Tipo/);
});

test('faltantes', () => {
  const e = { depto: 'X', puesto: 'Y', genero: 'DAMA', dot: true, bota: '', juegos: [{ talla: 'CHICA', color: '', forma: 'POLO', tipo: 'CORTA' }] };
  assert.deepEqual(L.faltantes(e), ['talla de bota', 'color']);
  assert.deepEqual(L.faltantes({ ...e, dot: false }), []);
});

test('csvCell escapa comillas y neutraliza fórmulas', () => {
  assert.equal(L.csvCell('a,b'), '"a,b"');
  assert.equal(L.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(L.csvCell('-5'), '-5');
  assert.equal(L.csvCell(null), '');
});

test('hoy usa la fecha local', () => {
  const d = new Date(2026, 10, 24, 23, 30);
  assert.equal(L.hoy(d), '2026-11-24');
});

test('los datos de demostración son válidos', () => {
  const seed = require('../data/seed.example.json');
  seed.emps.forEach((e) => L.normEmp(e));
  seed.inc.forEach((i) => { L.normInc(i); assert.ok(seed.emps[i.emp]); });
});
