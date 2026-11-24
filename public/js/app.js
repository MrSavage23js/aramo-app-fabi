'use strict';
/* =====================================================================
   Control de Personal y Dotación · Grupo Aramo
   Interfaz de una sola página (sin dependencias).
   ===================================================================== */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PLANTAS = ['ARAMO', 'VELADORAS', 'OBRA', 'VILAFLOR'];
const TALLAS = ['CHICA', 'MEDIANA', 'GRANDE', 'EXTRA GRANDE'];
const TIPOS_INC = ['Falta', 'Retardo', 'Incapacidad', 'Permiso', 'Vacaciones', 'Suspensión', 'Otro'];
const JUEGOS = ['Juego 1', 'Juego 2', 'Juego 3'];
const emptyJuego = () => ({ talla: '', color: '', forma: '', tipo: '' });

let S = { emps: [], inc: [] };
let byId = new Map();
let ME = null;
let tab = (location.hash || '').slice(1) || 'emp';
const F = { q: '', planta: '', depto: '', falt: false };
const R = { juego: '0', planta: '' };
const I = { mes: '', planta: '', q: '' };

const isAdmin = () => ME && ME.rol === 'admin';
const uniq = (f) => [...new Set(S.emps.flatMap(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const botasList = () => {
  const b = new Set(['22', '23', '24', '25', '26', '27', '28', '29', '30']);
  S.emps.forEach((e) => e.bota && e.bota !== 'N/A' && b.add(e.bota));
  return [...b].sort((x, y) => x - y).concat('N/A');
};
/** Fecha local YYYY-MM-DD (toISOString usa UTC y en la noche da el día siguiente) */
const hoy = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const mesNombre = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ---------- API ---------- */
async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith('login')) {
    location.replace('login.html');
    throw new Error('Sesión expirada');
  }
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}

async function load() {
  const d = await api('GET', 'api/data');
  S = d;
  byId = new Map(S.emps.map((e) => [e.id, e]));
}

let toastTimer;
function toast(m, err = false) {
  const t = $('#toast');
  t.textContent = m;
  t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, err ? 4500 : 2600);
}

/** Desactiva un botón mientras corre una acción asíncrona (evita dobles clics) */
async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); } finally { if (btn.isConnected) btn.disabled = false; }
}

/** Botón de borrar en dos pasos: primer clic pide confirmación */
function confirmBtn(btn, label, fn) {
  btn.onclick = () => {
    if (btn.dataset.s) return busy(btn, fn);
    btn.dataset.s = '1';
    btn.classList.add('confirm');
    const prev = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { if (btn.isConnected) { delete btn.dataset.s; btn.classList.remove('confirm'); btn.textContent = prev; } }, 4000);
  };
}

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

/* ---------- NAV ---------- */
const TABS = [['emp', 'Empleados'], ['res', 'Resumen para pedido'], ['inc', 'Incidencias'], ['pen', 'Pendientes']];
function renderNav() {
  const np = S.emps.filter((e) => faltantes(e).length).length;
  $('#nav').innerHTML = TABS.map(([k, l]) =>
    `<button data-tab="${k}" class="${tab === k ? 'on' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${l}${k === 'pen' && np ? `<span class="badge">${np}</span>` : ''}</button>`).join('');
}
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); render(); }
});
function render() {
  if (!TABS.some(([k]) => k === tab)) tab = 'emp';
  renderNav();
  ({ emp: vEmp, res: vRes, inc: vInc, pen: vPen })[tab]();
}

function renderUser() {
  $('#user').innerHTML = `<span>${esc(ME.nombre || ME.usuario)}</span><span class="tag">${esc(ME.rol)}</span><button class="btn sm" id="logout">Salir</button>`;
  $('#logout').onclick = async () => { await api('POST', 'api/logout', {}).catch(() => {}); location.replace('login.html'); };
  document.body.classList.toggle('ro', !isAdmin());
}

/* ---------- EMPLEADOS ---------- */
function filtered() {
  const q = F.q.toLowerCase().trim();
  return S.emps.filter((e) => (!q || e.nombre.toLowerCase().includes(q) || e.puesto.toLowerCase().includes(q))
    && (!F.planta || e.planta === F.planta) && (!F.depto || e.depto === F.depto) && (!F.falt || faltantes(e).length));
}

function vEmp() {
  const deps = uniq((e) => [e.depto]);
  $('#app').innerHTML = `
  <div class="kpis">
    <div class="kpi"><b>${S.emps.length}</b><span>Empleados</span></div>
    ${PLANTAS.map((p) => `<div class="kpi"><b>${S.emps.filter((e) => e.planta === p).length}</b><span>${p}</span></div>`).join('')}
  </div>
  <div class="card">
   <div class="bar">
    <input id="fq" type="search" placeholder="Buscar nombre o puesto…" value="${esc(F.q)}" style="min-width:220px" aria-label="Buscar">
    <select id="fp" aria-label="Planta"><option value="">Todas las plantas</option>${PLANTAS.map((p) => `<option ${F.planta === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
    <select id="fd" aria-label="Departamento"><option value="">Todos los deptos.</option>${deps.map((d) => `<option ${F.depto === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
    <label class="chk"><input type="checkbox" id="ff" ${F.falt ? 'checked' : ''}> Solo con datos faltantes</label>
    <span class="sp"></span>
    <button class="btn" id="exp">Exportar CSV</button>
    <button class="btn p admin-only" id="add">+ Nuevo empleado</button>
   </div>
   <div id="tbl" class="tw"></div>
  </div>`;
  $('#fq').oninput = (e) => { F.q = e.target.value; drawTbl(); };
  $('#fp').onchange = (e) => { F.planta = e.target.value; drawTbl(); };
  $('#fd').onchange = (e) => { F.depto = e.target.value; drawTbl(); };
  $('#ff').onchange = (e) => { F.falt = e.target.checked; drawTbl(); };
  $('#add').onclick = () => openEmp(null);
  $('#exp').onclick = () => exportEmp(filtered());
  drawTbl();
}

function drawTbl() {
  const L = filtered();
  $('#tbl').innerHTML = L.length
    ? `<table><thead><tr><th>Nombre</th><th>Planta</th><th>Departamento</th><th>Puesto</th><th>Bota</th><th>Playera (juego 1)</th><th></th></tr></thead><tbody>${
      L.map((e) => {
        const j = e.juegos[0];
        const f = faltantes(e);
        return `<tr><td><b>${esc(e.nombre)}</b>${e.nota ? `<br><span class="note">${esc(e.nota)}</span>` : ''}</td>
        <td><span class="tag ${esc(e.planta)}">${esc(e.planta)}</span></td><td>${esc(e.depto)}</td><td>${esc(e.puesto)}</td><td>${esc(e.bota)}</td>
        <td>${j.talla ? esc([j.talla, j.color, j.forma, j.tipo].filter(Boolean).join(' · ')) : ''}${f.length ? `<div class="miss">Falta: ${f.join(', ')}</div>` : ''}</td>
        <td><button class="btn sm" data-ed="${e.id}">${isAdmin() ? 'Editar' : 'Ver'}</button></td></tr>`;
      }).join('')}</tbody></table><div class="mut" style="margin-top:8px">${L.length} de ${S.emps.length}</div>`
    : '<div class="empty">Sin resultados</div>';
  $$('[data-ed]', $('#tbl')).forEach((b) => { b.onclick = () => openEmp(+b.dataset.ed); });
}

const dl = (id, vals) => `<datalist id="${id}">${vals.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

function openEmp(id) {
  const orig = id ? byId.get(id) : null;
  if (id && !orig) { toast('Empleado no encontrado', true); return; }
  // Copia: no se modifica el estado hasta que el servidor confirme
  const e = orig ? structuredClone(orig)
    : { id: 0, nombre: '', planta: 'VELADORAS', depto: '', puesto: '', genero: '', bota: '', nota: '', dot: true, juegos: [emptyJuego(), emptyJuego(), emptyJuego()] };
  const ro = !isAdmin();
  const dis = ro ? 'disabled' : '';
  const tl = [...new Set([...TALLAS, 'N/A', ...uniq((x) => x.juegos.map((j) => j.talla))])];
  const js = e.juegos.map((j, i) => `<div class="js"><b>${JUEGOS[i]}</b>${i === 0 && !ro ? '<button type="button" class="btn sm copy" id="cpj">Copiar a juegos 2 y 3</button>' : ''}
    <div class="f" style="margin-top:6px">
    <label>Talla<select data-j="${i}" data-k="talla" ${dis}><option value=""></option>${tl.map((t) => `<option ${j.talla === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label>Color<input list="dl-color" data-j="${i}" data-k="color" value="${esc(j.color)}" ${dis}></label>
    <label>Forma<input list="dl-forma" data-j="${i}" data-k="forma" value="${esc(j.forma)}" ${dis}></label>
    <label>Tipo<input list="dl-tipo" data-j="${i}" data-k="tipo" value="${esc(j.tipo)}" ${dis}></label></div></div>`).join('');

  $('#modal').innerHTML = `<form class="dlg" id="empf" novalidate><h2>${ro ? 'Empleado' : id ? 'Editar empleado' : 'Nuevo empleado'}</h2>
  <div class="f">
   <label class="w">Nombre<input id="e_nombre" value="${esc(e.nombre)}" maxlength="150" required ${dis}></label>
   <label>Planta<select id="e_planta" ${dis}>${PLANTAS.map((p) => `<option ${e.planta === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
   <label>Departamento<input id="e_depto" list="dl-depto" value="${esc(e.depto)}" maxlength="60" ${dis}></label>
   <label>Puesto<input id="e_puesto" list="dl-puesto" value="${esc(e.puesto)}" maxlength="80" ${dis}></label>
   <label>Género<select id="e_genero" ${dis}><option value=""></option>${['DAMA', 'CABALLERO'].map((g) => `<option ${e.genero === g ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
   <label>Talla de bota (N/A si no usa)<input id="e_bota" list="dl-bota" value="${esc(e.bota)}" maxlength="10" ${dis}></label>
   <label>Recibe dotación<select id="e_dot" ${dis}><option value="1" ${e.dot ? 'selected' : ''}>Sí</option><option value="0" ${!e.dot ? 'selected' : ''}>No</option></select></label>
   <label class="w">Nota (ingreso, observaciones)<input id="e_nota" value="${esc(e.nota)}" maxlength="255" ${dis}></label>
  </div>${js}
  ${dl('dl-depto', uniq((x) => [x.depto]))}${dl('dl-puesto', uniq((x) => [x.puesto]))}${dl('dl-color', uniq((x) => x.juegos.map((j) => j.color)))}${dl('dl-forma', uniq((x) => x.juegos.map((j) => j.forma)))}${dl('dl-tipo', uniq((x) => x.juegos.map((j) => j.tipo)))}${dl('dl-bota', botasList())}
  <div class="bar" style="margin:16px 0 0">${id && !ro ? '<button type="button" class="btn d" id="e_del">Eliminar</button>' : ''}<span class="sp"></span>
   <button type="button" class="btn" id="e_cancel">${ro ? 'Cerrar' : 'Cancelar'}</button>${ro ? '' : '<button type="submit" class="btn p" id="e_ok">Guardar</button>'}</div></form>`;
  openM();
  if (!ro) $('#e_nombre').focus();
  $('#e_cancel').onclick = closeM;
  if (ro) return;

  $('#cpj').onclick = () => {
    const src = Object.fromEntries($$('[data-j="0"]', $('#modal')).map((i) => [i.dataset.k, i.value]));
    $$('[data-j="1"],[data-j="2"]', $('#modal')).forEach((i) => { i.value = src[i.dataset.k]; });
    toast('Juego 1 copiado a los juegos 2 y 3');
  };
  if (id) {
    confirmBtn($('#e_del'), '¿Seguro? Clic para eliminar', async () => {
      await api('DELETE', 'api/emps/' + id);
      await load(); closeM(); render(); toast('Empleado eliminado');
    });
  }
  $('#empf').onsubmit = (ev) => {
    ev.preventDefault();
    busy($('#e_ok'), async () => {
      const nombre = $('#e_nombre').value.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!nombre) { $('#e_nombre').focus(); throw new Error('Falta el nombre'); }
      if (S.emps.some((x) => x.nombre === nombre && x.id !== id)) throw new Error('Ya existe un empleado con ese nombre');
      const bota = $('#e_bota').value.trim().toUpperCase();
      if (bota && bota !== 'N/A' && !/^\d{1,2}(\.5)?$/.test(bota)) { $('#e_bota').focus(); throw new Error('Talla de bota inválida: usa un número (25 o 25.5) o N/A'); }
      const o = {
        nombre, bota,
        planta: $('#e_planta').value,
        depto: $('#e_depto').value.trim().toUpperCase(),
        puesto: $('#e_puesto').value.trim().toUpperCase(),
        genero: $('#e_genero').value,
        nota: $('#e_nota').value.trim(),
        dot: $('#e_dot').value === '1',
        juegos: [emptyJuego(), emptyJuego(), emptyJuego()],
      };
      $$('[data-j]', $('#modal')).forEach((i) => { o.juegos[+i.dataset.j][i.dataset.k] = i.value.trim().toUpperCase(); });
      if (id) await api('PUT', 'api/emps/' + id, o); else await api('POST', 'api/emps', o);
      await load(); closeM(); render(); toast('Guardado');
    });
  };
}

function openM() { $('#modal').classList.add('on'); document.body.style.overflow = 'hidden'; }
function closeM() { $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; document.body.style.overflow = ''; }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeM(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').classList.contains('on')) closeM(); });

/* ---------- RESUMEN ---------- */
const bars = (entries, fmt = (k) => k) => {
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return entries.map(([k, n]) => `<div class="hb"><span title="${esc(fmt(k))}">${esc(fmt(k))}</span><div class="track"><i style="width:${(n / max) * 100}%"></i></div><em>${n}</em></div>`).join('')
    || '<div class="empty">Sin datos</div>';
};

function vRes() {
  const base = S.emps.filter((e) => e.dot && (!R.planta || e.planta === R.planta));
  const bc = {};
  let sinB = 0;
  base.forEach((e) => { if (e.bota === 'N/A') return; if (e.bota) bc[e.bota] = (bc[e.bota] || 0) + 1; else sinB++; });
  const bk = Object.keys(bc).sort((a, b) => a - b);
  const js = R.juego === '0' ? [0, 1, 2] : [+R.juego - 1];
  const pc = {};
  let sinP = 0;
  base.forEach((e) => js.forEach((i) => {
    const j = e.juegos[i];
    if (!j.talla || j.talla === 'N/A') return;
    const k = [j.talla, j.color, j.forma, j.tipo].join('|');
    pc[k] = (pc[k] || 0) + 1;
  }));
  base.forEach((e) => { if (js.some((i) => !e.juegos[i].talla)) sinP++; });
  const rows = Object.entries(pc).map(([k, n]) => [...k.split('|'), n])
    .sort((a, b) => b[4] - a[4] || TALLAS.indexOf(a[0]) - TALLAS.indexOf(b[0]));
  const tot = rows.reduce((s, r) => s + r[4], 0);
  const byT = {};
  rows.forEach((r) => { byT[r[0]] = (byT[r[0]] || 0) + r[4]; });
  const byD = {};
  base.forEach((e) => { const d = e.depto || '(sin depto.)'; byD[d] = (byD[d] || 0) + 1; });
  const pares = Object.values(bc).reduce((a, b) => a + b, 0);
  const tallasOrden = TALLAS.concat(Object.keys(byT).filter((t) => !TALLAS.includes(t))).filter((t) => byT[t]);

  $('#app').innerHTML = `
  <div class="card"><div class="bar"><b>Calcula el pedido para el proveedor</b><span class="sp"></span>
   <select id="rp" aria-label="Planta"><option value="">Todas las plantas</option>${PLANTAS.map((p) => `<option ${R.planta === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
   <select id="rj" aria-label="Juego"><option value="0" ${R.juego === '0' ? 'selected' : ''}>Los 3 juegos</option>${JUEGOS.map((j, i) => `<option value="${i + 1}" ${R.juego === String(i + 1) ? 'selected' : ''}>${j}</option>`).join('')}</select>
   <button class="btn" id="prt">Imprimir</button>
   <button class="btn" id="expP">Exportar pedido CSV</button></div>
   <div class="mut">Cuenta solo empleados que reciben dotación (${base.length}). Se recalcula con cada cambio.</div></div>
  <div class="kpis">
   <div class="kpi"><b>${tot}</b><span>Playeras a pedir</span></div>
   <div class="kpi"><b>${pares}</b><span>Pares de botas</span></div>
   <div class="kpi"><b class="${sinB ? 'bad' : 'ok'}">${sinB}</b><span>Sin talla de bota</span></div>
   <div class="kpi"><b class="${sinP ? 'bad' : 'ok'}">${sinP}</b><span>Sin talla de playera</span></div>
  </div>
  <div class="grid">
   <div class="card"><h2>Botas por número</h2>${bars(bk.map((k) => [k, bc[k]]), (k) => 'N° ' + k)}</div>
   <div class="card"><h2>Playeras por talla</h2>${bars(tallasOrden.map((t) => [t, byT[t]]))}</div>
   <div class="card"><h2>Personal por departamento</h2>${bars(Object.entries(byD).sort((a, b) => b[1] - a[1]))}</div>
  </div>
  <div class="card"><h2>Detalle de playeras (talla · color · forma · tipo)</h2><div class="tw">
   <table><thead><tr><th>Talla</th><th>Color</th><th>Forma</th><th>Tipo</th><th class="num">Cantidad</th></tr></thead><tbody>
   ${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1]) || '<span class="miss">sin color</span>'}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td class="num"><b>${r[4]}</b></td></tr>`).join('')
     || '<tr><td colspan="5" class="empty">Sin datos</td></tr>'}
   <tr><td colspan="4"><b>Total</b></td><td class="num"><b>${tot}</b></td></tr></tbody></table></div></div>`;
  $('#rp').onchange = (e) => { R.planta = e.target.value; vRes(); };
  $('#rj').onchange = (e) => { R.juego = e.target.value; vRes(); };
  $('#prt').onclick = () => window.print();
  $('#expP').onclick = () => csvOut(`pedido_${R.planta || 'todas'}_${hoy()}.csv`,
    [['Talla', 'Color', 'Forma', 'Tipo', 'Cantidad'], ...rows, ['', '', '', 'Total', tot], [], ['Botas número', 'Cantidad'], ...bk.map((k) => [k, bc[k]]), ['Total', pares]]);
}

/* ---------- INCIDENCIAS ---------- */
function incFiltered() {
  const q = I.q.toLowerCase().trim();
  return S.inc.filter((i) => {
    const e = byId.get(i.emp) || {};
    return (!I.mes || i.fecha.startsWith(I.mes)) && (!I.planta || e.planta === I.planta) && (!q || (e.nombre || '').toLowerCase().includes(q));
  });
}

function vInc() {
  const meses = [...new Set(S.inc.map((i) => i.fecha.slice(0, 7)))].sort().reverse();
  if (I.mes && !meses.includes(I.mes)) I.mes = '';
  $('#app').innerHTML = `
  <div class="card admin-only"><h2>Registrar incidencia</h2>
   <form class="f" id="incf">
    <label>Empleado<input id="i_emp" list="dl-emps" placeholder="Escribe para buscar…" autocomplete="off"></label>
    <label>Fecha<input type="date" id="i_fecha" value="${hoy()}" max="${hoy().slice(0, 4) + 1}-12-31"></label>
    <label>Tipo<select id="i_tipo">${TIPOS_INC.map((t) => `<option>${t}</option>`).join('')}</select></label>
    <label>Observaciones<input id="i_obs" maxlength="255"></label>
    <label style="justify-content:flex-end"><button class="btn p" id="i_add">Registrar</button></label>
   </form>
   <datalist id="dl-emps">${S.emps.map((e) => `<option value="${esc(e.nombre)}">`).join('')}</datalist></div>
  <div class="card"><div class="bar"><input id="iq" type="search" placeholder="Buscar empleado…" value="${esc(I.q)}" aria-label="Buscar empleado">
   <select id="im" aria-label="Mes"><option value="">Todos los meses</option>${meses.map((m) => `<option value="${m}" ${I.mes === m ? 'selected' : ''}>${mesNombre(m)}</option>`).join('')}</select>
   <select id="ip" aria-label="Planta"><option value="">Todas las plantas</option>${PLANTAS.map((p) => `<option ${I.planta === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
   <span class="sp"></span><span id="itags"></span>
   <button class="btn" id="expI">Exportar CSV</button></div>
   <div id="ilist" class="tw"></div></div>`;

  if (isAdmin()) {
    $('#incf').onsubmit = (ev) => {
      ev.preventDefault();
      busy($('#i_add'), async () => {
        const e = S.emps.find((x) => x.nombre === $('#i_emp').value.trim().replace(/\s+/g, ' ').toUpperCase());
        if (!e) { $('#i_emp').focus(); throw new Error('Elige un empleado de la lista'); }
        if (!$('#i_fecha').value) throw new Error('Falta la fecha');
        await api('POST', 'api/inc', { emp: e.id, fecha: $('#i_fecha').value, tipo: $('#i_tipo').value, obs: $('#i_obs').value.trim() });
        await load();
        $('#i_emp').value = ''; $('#i_obs').value = '';
        renderNav(); vInc(); toast('Incidencia registrada');
        $('#i_emp').focus();
      });
    };
  }
  $('#iq').oninput = (e) => { I.q = e.target.value; drawInc(); };
  $('#im').onchange = (e) => { I.mes = e.target.value; drawInc(); };
  $('#ip').onchange = (e) => { I.planta = e.target.value; drawInc(); };
  $('#expI').onclick = () => csvOut(`incidencias${I.mes ? '_' + I.mes : ''}.csv`,
    [['Fecha', 'Empleado', 'Planta', 'Tipo', 'Observaciones', 'Registró'], ...incFiltered().map((i) => { const e = byId.get(i.emp) || {}; return [i.fecha, e.nombre, e.planta, i.tipo, i.obs, i.por]; })]);
  drawInc();
}

function drawInc() {
  const L = incFiltered();
  const por = {};
  L.forEach((i) => { por[i.tipo] = (por[i.tipo] || 0) + 1; });
  $('#itags').innerHTML = Object.entries(por).map(([t, n]) => `<span class="tag">${esc(t)}: ${n}</span>`).join(' ');
  $('#ilist').innerHTML = L.length
    ? `<table><thead><tr><th>Fecha</th><th>Empleado</th><th>Planta</th><th>Tipo</th><th>Observaciones</th><th></th></tr></thead><tbody>${
      L.map((i) => {
        const e = byId.get(i.emp) || { nombre: '(eliminado)', planta: '' };
        return `<tr><td style="white-space:nowrap">${esc(i.fecha)}</td><td>${esc(e.nombre)}</td><td><span class="tag ${esc(e.planta)}">${esc(e.planta)}</span></td><td>${esc(i.tipo)}</td>
        <td>${esc(i.obs)}${i.por ? `<div class="mut" style="font-size:11px">por ${esc(i.por)}</div>` : ''}</td><td><button class="btn sm d admin-only" data-di="${i.id}">Quitar</button></td></tr>`;
      }).join('')}</tbody></table><div class="mut" style="margin-top:8px">${L.length} incidencia${L.length === 1 ? '' : 's'}</div>`
    : `<div class="empty">${S.inc.length ? 'Ninguna incidencia coincide con los filtros.' : 'Aún no hay incidencias registradas.'}</div>`;
  $$('[data-di]', $('#ilist')).forEach((b) => confirmBtn(b, '¿Quitar?', async () => {
    await api('DELETE', 'api/inc/' + b.dataset.di);
    await load(); drawInc(); toast('Incidencia eliminada');
  }));
}

/* ---------- PENDIENTES ---------- */
function vPen() {
  const L = S.emps.map((e) => [e, faltantes(e)]).filter((x) => x[1].length);
  $('#app').innerHTML = `<div class="card"><div class="bar"><h2 style="margin:0">Empleados con datos por completar (${L.length})</h2><span class="sp"></span><button class="btn" id="expF">Exportar CSV</button></div>
  ${L.length ? `<div class="tw"><table><thead><tr><th>Empleado</th><th>Planta</th><th>Falta</th><th></th></tr></thead><tbody>${
    L.map(([e, f]) => `<tr><td><b>${esc(e.nombre)}</b></td><td><span class="tag ${esc(e.planta)}">${esc(e.planta)}</span></td><td class="miss">${f.join(', ')}</td><td><button class="btn sm" data-ed="${e.id}">${isAdmin() ? 'Completar' : 'Ver'}</button></td></tr>`).join('')
  }</tbody></table></div>` : '<div class="empty">Todo completo 🎉</div>'}</div>`;
  $$('[data-ed]', $('#app')).forEach((b) => { b.onclick = () => openEmp(+b.dataset.ed); });
  $('#expF').onclick = () => csvOut('pendientes.csv', [['Empleado', 'Planta', 'Falta'], ...L.map(([e, f]) => [e.nombre, e.planta, f.join('; ')])]);
}

/* ---------- CSV ---------- */
function exportEmp(list) {
  csvOut('empleados.csv', [
    ['Nombre', 'Planta', 'Departamento', 'Puesto', 'Género', 'Bota', 'Recibe dotación', 'Nota', ...JUEGOS.flatMap((j) => [j + ' talla', j + ' color', j + ' forma', j + ' tipo'])],
    ...list.map((e) => [e.nombre, e.planta, e.depto, e.puesto, e.genero, e.bota, e.dot ? 'SÍ' : 'NO', e.nota, ...e.juegos.flatMap((j) => [j.talla, j.color, j.forma, j.tipo])]),
  ]);
}

function csvOut(name, rows) {
  // BOM para que Excel abra bien los acentos; se neutralizan fórmulas (=, +, -, @) por seguridad
  const cell = (c) => {
    let s = String(c ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const txt = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  try {
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Archivo listo');
    return;
  } catch { /* algunos navegadores bloquean la descarga; se muestra para copiar */ }
  $('#modal').innerHTML = `<div class="dlg"><h2>${esc(name)}</h2><p class="mut">No se pudo descargar aquí. Copia el contenido y pégalo en Excel o en un archivo .csv.</p><textarea class="csv" id="csvt" readonly></textarea><div class="bar" style="margin-top:10px"><span class="sp"></span><button class="btn" id="cc">Copiar</button><button class="btn p" id="cx">Cerrar</button></div></div>`;
  $('#csvt').value = txt;
  openM();
  $('#cx').onclick = closeM;
  $('#cc').onclick = async () => {
    try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { $('#csvt').select(); toast('Selecciona y copia (Ctrl+C)'); }
  };
}

/* ---------- INICIO ---------- */
const setHeaderHeight = () => document.documentElement.style.setProperty('--hh', $('header').offsetHeight + 'px');
window.addEventListener('resize', setHeaderHeight);

(async () => {
  try {
    ME = await api('GET', 'api/me');
    renderUser();
    setHeaderHeight();
    await load();
    render();
  } catch (e) {
    if (e.message === 'Sesión expirada') return;
    $('#app').innerHTML = `<div class="card empty"><p>${esc(e.message)}</p><button class="btn p" id="retry">Reintentar</button></div>`;
    $('#retry').onclick = () => location.reload();
  }
})();
