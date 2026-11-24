'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEmp, parseInc, isDate, toId } = require('../src/validation');

const base = { nombre: '  perez   lopez juan ', planta: 'ARAMO', bota: '25', juegos: [{ talla: 'mediana', color: 'azul' }] };

test('parseEmp normaliza nombre, mayúsculas y juegos', () => {
  const e = parseEmp(base);
  assert.equal(e.nombre, 'PEREZ LOPEZ JUAN');
  assert.deepEqual(e.juegos[0], ['MEDIANA', 'AZUL', '', '']);
  assert.deepEqual(e.juegos[2], ['', '', '', '']);
  assert.equal(e.dot, 0);
});

test('parseEmp rechaza datos inválidos', () => {
  assert.throws(() => parseEmp({ ...base, nombre: ' ' }), /nombre/);
  assert.throws(() => parseEmp({ ...base, planta: 'OTRA' }), /Planta/);
  assert.throws(() => parseEmp({ ...base, bota: 'grande' }), /bota/);
  assert.throws(() => parseEmp(null), /inválidos/);
});

test('parseEmp acepta botas N/A, medias tallas y vacío', () => {
  assert.equal(parseEmp({ ...base, bota: 'n/a' }).bota, 'N/A');
  assert.equal(parseEmp({ ...base, bota: '25.5' }).bota, '25.5');
  assert.equal(parseEmp({ ...base, bota: '' }).bota, '');
});

test('parseEmp ignora género desconocido', () => {
  assert.equal(parseEmp({ ...base, genero: 'X' }).genero, '');
});

test('isDate valida fechas reales', () => {
  assert.ok(isDate('2026-02-28'));
  assert.ok(!isDate('2026-02-31'));
  assert.ok(!isDate('2026-2-1'));
  assert.ok(!isDate(undefined));
});

test('parseInc', () => {
  assert.deepEqual(parseInc({ emp: '3', fecha: '2026-11-24', tipo: 'Falta', obs: ' x ' }), { emp: 3, fecha: '2026-11-24', tipo: 'Falta', obs: 'x' });
  assert.throws(() => parseInc({ emp: 'abc', fecha: '2026-11-24', tipo: 'Falta' }), /Empleado/);
  assert.throws(() => parseInc({ emp: 1, fecha: '2026-11-24', tipo: 'Fiesta' }), /Tipo/);
});

test('toId', () => {
  assert.equal(toId('12'), 12);
  assert.throws(() => toId('1.5'));
  assert.throws(() => toId('-1'));
});
