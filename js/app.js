'use strict';
/* =====================================================================
   Control de Personal y Dotación · Grupo Aramo
   Página estática (GitHub Pages) + Supabase (base de datos y login).
   ===================================================================== */

const { PLANTAS, TALLAS, TIPOS_INC, emptyJuego, normJuegos, normEmp, normInc, faltantes, csvCell, hoy, up } = window.Logic;
const JUEGOS = ['Juego 1', 'Juego 2', 'Juego 3'];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let sb = null;          // cliente de Supabase
let ME = null;          // perfil del usuario actual
let S = { emps: [], inc: [] };
let byId = new Map();
let tab = (location.hash || '').slice(1) || 'emp';
const F = { q: '', planta: '', depto: '', falt: false };
const R = { juego: '0', planta: '' };
const I = { mes: '', planta: '', q: '' };

const isAdmin = () => !!ME && ME.rol === 'admin';
const uniq = (f) => [...new Set(S.emps.flatMap(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const botasList = () => {
  const b = new Set(['22', '23', '24', '25', '26', '27', '28', '29', '30']);
  S.emps.forEach((e) => e.bota && e.bota !== 'N/A' && b.add(e.bota));
  return [...b].sort((x, y) => x - y).concat('N/A');
};
const mesNombre = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const appUrl = () => location.origin + location.pathname;

/* ---------- Errores de Supabase en lenguaje claro ---------- */
function errMsg(e) {
  const m = String(e?.message || e || '');
  const map = {
    23505: 'Ya existe un empleado con ese nombre',
    23514: 'Algún dato no es válido',
    23503: 'El empleado ya no existe',
    42501: 'Tu usuario no tiene permiso para esta acción',
    PGRST301: 'Tu sesión expiró, vuelve a entrar',
  };
  if (map[e?.code]) return map[e.code];
  if (e?.code === 'P0001') return m;
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos';
  if (/Email not confirmed/i.test(m)) return 'Primero confirma tu correo (revisa tu bandeja de entrada o spam)';
  if (/already registered|already been registered/i.test(m)) return 'Ya existe una cuenta con ese correo';
  if (/Password should be at least/i.test(m)) return 'La contraseña es muy corta (mínimo 8 caracteres)';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No se pudo conectar con el servidor. Revisa tu internet.';
  return m || 'Error desconocido';
}
async function q(promise) {
  const { data, error } = await promise;
  if (error) {
    if (error.code === 'PGRST301' || error.status === 401) setTimeout(() => sb.auth.signOut(), 1500);
    throw new Error(errMsg(error));
  }
  return data;
}
/** Lee todas las filas (Supabase devuelve máximo 1000 por consulta) */
async function fetchAll(table, cols, order) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let query = sb.from(table).select(cols).range(from, from + 999);
    order.forEach(([c, asc]) => { query = query.order(c, { ascending: asc }); });
    const rows = await q(query);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

async function load() {
  const [emps, inc] = await Promise.all([
    fetchAll('empleados', 'id,nombre,planta,depto,puesto,genero,bota,nota,dot,juegos', [['planta', true], ['nombre', true]]),
    fetchAll('incidencias', 'id,empleado_id,fecha,tipo,obs,creado_por', [['fecha', false], ['id', false]]),
  ]);
  S = {
    emps: emps.map((e) => ({ ...e, juegos: normJuegos(e.juegos) })),
    inc: inc.map((i) => ({ id: i.id, emp: i.empleado_id, fecha: i.fecha, tipo: i.tipo, obs: i.obs, por: i.creado_por })),
  };
  byId = new Map(S.emps.map((e) => [e.id, e]));
}

/* ---------- Utilidades de interfaz ---------- */
let toastTimer;
function toast(m, err = false) {
  const t = $('#toast');
  t.textContent = m;
  t.className = 'on' + (err ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, err ? 5000 : 2600);
}
/** Desactiva un botón mientras corre una acción (evita dobles clics) */
async function busy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try { await fn(); } catch (e) { toast(errMsg(e), true); } finally { if (btn.isConnected) btn.disabled = false; }
}
/** Borrar en dos pasos: el primer clic pide confirmación */
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
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openM() { $('#modal').classList.add('on'); document.body.style.overflow = 'hidden'; }
function closeM() { $('#modal').classList.remove('on'); $('#modal').innerHTML = ''; document.body.style.overflow = ''; }
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeM(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').classList.contains('on')) closeM(); });

/* =====================================================================
   ACCESO: configuración, login, registro, recuperación
   ===================================================================== */
const LOGO = '<div class="logo" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M10 7l3-2h6l3 2 5 3.5-2.5 4.5-2.5-1.3V26H10V13.7L7.5 15 5 10.5z"/></svg></div>';
const bindTheme = (id) => { const b = document.getElementById(id); if (b) b.onclick = () => window.Theme.toggle(); };

function authShell(inner) {
  $('#hdr').hidden = true;
  closeM();
  $('#app').innerHTML = `<div class="login">${window.Theme.button('th_auth')}<div class="box">${LOGO}<h1>Control de Personal<small>Grupo Aramo</small></h1>${inner}</div></div>`;
  bindTheme('th_auth');
}

function vSetup() {
  authShell(`<p>Falta conectar la página con Supabase.</p>
   <p class="mut">Edita el archivo <code>js/config.js</code> del repositorio y pega la <b>Project URL</b> y la clave <b>anon / publishable</b> de tu proyecto. Las instrucciones están en el README.</p>`);
}

function vLogin(msg = '') {
  authShell(`<form id="lf">
    <label>Correo<input id="l_email" type="email" autocomplete="username" required></label>
    <label>Contraseña<input id="l_pass" type="password" autocomplete="current-password" required></label>
    <p class="err" role="alert">${esc(msg)}</p>
    <button class="btn p" id="l_go">Entrar</button>
   </form>
   <div class="links"><a href="#" id="to_reg">Crear cuenta</a><a href="#" id="to_rec">¿Olvidaste tu contraseña?</a></div>`);
  $('#l_email').focus();
  $('#to_reg').onclick = (e) => { e.preventDefault(); vRegister(); };
  $('#to_rec').onclick = (e) => { e.preventDefault(); vRecover(); };
  $('#lf').onsubmit = (ev) => {
    ev.preventDefault();
    busy($('#l_go'), async () => {
      $('.err').textContent = '';
      try {
        const { session } = await q(sb.auth.signInWithPassword({ email: $('#l_email').value.trim(), password: $('#l_pass').value }));
        await boot(session);
      } catch (e) { $('.err').textContent = e.message; $('#l_pass').select(); }
    });
  };
}

function vRegister() {
  authShell(`<form id="rf">
    <p class="mut" style="margin:0">Después de crear tu cuenta, un administrador debe activarla para que puedas ver los datos.</p>
    <label>Nombre<input id="r_nom" autocomplete="name" maxlength="100" required></label>
    <label>Correo<input id="r_email" type="email" autocomplete="email" required></label>
    <label>Contraseña (mínimo 8)<input id="r_pass" type="password" autocomplete="new-password" minlength="8" required></label>
    <p class="err" role="alert"></p>
    <button class="btn p" id="r_go">Crear cuenta</button>
   </form><div class="links"><a href="#" id="to_log">Ya tengo cuenta</a></div>`);
  $('#r_nom').focus();
  $('#to_log').onclick = (e) => { e.preventDefault(); vLogin(); };
  $('#rf').onsubmit = (ev) => {
    ev.preventDefault();
    busy($('#r_go'), async () => {
      $('.err').textContent = '';
      if ($('#r_pass').value.length < 8) { $('.err').textContent = 'La contraseña debe tener al menos 8 caracteres'; return; }
      try {
        const { session } = await q(sb.auth.signUp({
          email: $('#r_email').value.trim(),
          password: $('#r_pass').value,
          options: { data: { nombre: $('#r_nom').value.trim() }, emailRedirectTo: appUrl() },
        }));
        if (session) await boot(session);
        else authShell('<p><b>¡Cuenta creada!</b></p><p>Te enviamos un correo para confirmarla (revisa también spam). Después, pide a un administrador que la active.</p><div class="links"><a href="./">Volver a entrar</a></div>');
      } catch (e) { $('.err').textContent = e.message; }
    });
  };
}

function vRecover() {
  authShell(`<form id="pf">
    <p class="mut" style="margin:0">Te enviaremos un enlace para crear una contraseña nueva.</p>
    <label>Correo<input id="p_email" type="email" autocomplete="email" required></label>
    <p class="err" role="alert"></p>
    <button class="btn p" id="p_go">Enviar enlace</button>
   </form><div class="links"><a href="#" id="to_log">Volver</a></div>`);
  $('#p_email').focus();
  $('#to_log').onclick = (e) => { e.preventDefault(); vLogin(); };
  $('#pf').onsubmit = (ev) => {
    ev.preventDefault();
    busy($('#p_go'), async () => {
      try {
        await q(sb.auth.resetPasswordForEmail($('#p_email').value.trim(), { redirectTo: appUrl() }));
        authShell('<p>Si el correo está registrado, recibirás un enlace en unos minutos (revisa spam).</p><div class="links"><a href="./">Volver</a></div>');
      } catch (e) { $('.err').textContent = e.message; }
    });
  };
}

function vNewPassword() {
  authShell(`<form id="nf">
    <p style="margin:0"><b>Crea tu contraseña nueva</b></p>
    <label>Contraseña nueva (mínimo 8)<input id="n_pass" type="password" autocomplete="new-password" minlength="8" required></label>
    <p class="err" role="alert"></p>
    <button class="btn p" id="n_go">Guardar</button></form>`);
  $('#n_pass').focus();
  $('#nf').onsubmit = (ev) => {
    ev.preventDefault();
    busy($('#n_go'), async () => {
      try {
        await q(sb.auth.updateUser({ password: $('#n_pass').value }));
        toast('Contraseña actualizada');
        const { data } = await sb.auth.getSession();
        await boot(data.session);
      } catch (e) { $('.err').textContent = e.message; }
    });
  };
}

function vPending(email) {
  authShell(`<p><b>Tu cuenta está pendiente de activación.</b></p>
   <p class="mut">Pide a un administrador que active <b>${esc(email)}</b> en la sección <i>Usuarios</i>.</p>
   <p class="mut" style="font-size:12px">¿Eres el primer usuario? Ejecuta en Supabase → SQL Editor:<br>
   <code>update public.perfiles set rol='admin', activo=true where email='${esc(email)}';</code></p>
   <div class="bar" style="margin:0"><button class="btn" id="pd_retry">Ya me activaron</button><span class="sp"></span><button class="btn" id="pd_out">Salir</button></div>`);
  $('#pd_retry').onclick = () => location.reload();
  $('#pd_out').onclick = () => sb.auth.signOut();
}

/** Tras iniciar sesión: carga el perfil y la app */
async function boot(session) {
  if (!session) return vLogin();
  const perfil = await q(sb.from('perfiles').select('id,email,nombre,rol,activo').eq('id', session.user.id).maybeSingle());
  if (!perfil || !perfil.activo) return vPending(session.user.email);
  ME = perfil;
  $('#hdr').hidden = false;
  renderUser();
  setHeaderHeight();
  $('#app').innerHTML = '<div class="loading">Cargando datos…</div>';
  await load();
  render();
}

/* =====================================================================
   APP
   ===================================================================== */
const TABS = () => [['emp', 'Empleados'], ['res', 'Resumen para pedido'], ['inc', 'Incidencias'], ['pen', 'Pendientes']]
  .concat(isAdmin() ? [['adm', 'Usuarios y datos']] : []);

function renderNav() {
  const np = S.emps.filter((e) => faltantes(e).length).length;
  $('#nav').innerHTML = TABS().map(([k, l]) =>
    `<button data-tab="${k}" class="${tab === k ? 'on' : ''}" ${tab === k ? 'aria-current="page"' : ''}>${l}${k === 'pen' && np ? `<span class="badge">${np}</span>` : ''}</button>`).join('');
}
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { tab = b.dataset.tab; history.replaceState(null, '', '#' + tab); render(); }
});
function render() {
  if (!TABS().some(([k]) => k === tab)) tab = 'emp';
  renderNav();
  ({ emp: vEmp, res: vRes, inc: vInc, pen: vPen, adm: vAdm })[tab]();
}
function renderUser() {
  const nombre = ME.nombre || ME.email;
  $('#user').innerHTML = `<span title="${esc(ME.email)}">${esc(nombre)}</span><div class="avatar" title="${esc(ME.email)}">${esc(nombre.trim().charAt(0).toUpperCase())}</div>`
    + `<span class="tag">${esc(ME.rol)}</span>${window.Theme.button('th_app')}<button class="btn sm" id="logout">Salir</button>`;
  bindTheme('th_app');
  $('#logout').onclick = () => sb.auth.signOut();
  document.body.classList.toggle('ro', !isAdmin());
}
const setHeaderHeight = () => document.documentElement.style.setProperty('--hh', $('#hdr').offsetHeight + 'px');
window.addEventListener('resize', setHeaderHeight);

/* ---------- EMPLEADOS ---------- */
function filtered() {
  const q2 = F.q.toLowerCase().trim();
  return S.emps.filter((e) => (!q2 || e.nombre.toLowerCase().includes(q2) || e.puesto.toLowerCase().includes(q2))
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
    : `<div class="empty">${S.emps.length ? 'Sin resultados' : 'Aún no hay empleados.' + (isAdmin() ? ' Agrégalos con «+ Nuevo empleado» o impórtalos en «Usuarios y datos».' : '')}</div>`;
  $$('[data-ed]', $('#tbl')).forEach((b) => { b.onclick = () => openEmp(+b.dataset.ed); });
}

const dl = (id, vals) => `<datalist id="${id}">${vals.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;

function openEmp(id) {
  const orig = id ? byId.get(id) : null;
  if (id && !orig) { toast('Empleado no encontrado', true); return; }
  // Copia: el estado no cambia hasta que la base de datos confirma
  const e = orig ? structuredClone(orig)
    : { id: 0, nombre: '', planta: 'VELADORAS', depto: '', puesto: '', genero: '', bota: '', nota: '', dot: true, juegos: [emptyJuego(), emptyJuego(), emptyJuego()] };
  const ro = !isAdmin();
  const dis = ro ? 'disabled' : '';
  const tl = [...new Set([...TALLAS, 'N/A', ...uniq((x) => x.juegos.map((j) => j.talla))])];
  const js = e.juegos.map((j, i) => `<div class="js"><b>${JUEGOS[i]}</b>${i === 0 && !ro ? '<button type="button" class="btn sm copy" id="cpj">Copiar a juegos 2 y 3</button>' : ''}
    <div class="f" style="margin-top:6px">
    <label>Talla<select data-j="${i}" data-k="talla" ${dis}><option value=""></option>${tl.map((t) => `<option ${j.talla === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
    <label>Color<input list="dl-color" data-j="${i}" data-k="color" value="${esc(j.color)}" maxlength="30" ${dis}></label>
    <label>Forma<input list="dl-forma" data-j="${i}" data-k="forma" value="${esc(j.forma)}" maxlength="30" ${dis}></label>
    <label>Tipo<input list="dl-tipo" data-j="${i}" data-k="tipo" value="${esc(j.tipo)}" maxlength="20" ${dis}></label></div></div>`).join('');

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
  $('#e_cancel').onclick = closeM;
  if (ro) return;
  $('#e_nombre').focus();

  $('#cpj').onclick = () => {
    const src = Object.fromEntries($$('[data-j="0"]', $('#modal')).map((i) => [i.dataset.k, i.value]));
    $$('[data-j="1"],[data-j="2"]', $('#modal')).forEach((i) => { i.value = src[i.dataset.k]; });
    toast('Juego 1 copiado a los juegos 2 y 3');
  };
  if (id) {
    confirmBtn($('#e_del'), '¿Seguro? Clic para eliminar', async () => {
      const rows = await q(sb.from('empleados').delete().eq('id', id).select('id'));
      if (!rows.length) throw new Error('No se pudo eliminar (quizá ya no existe)');
      await load(); closeM(); render(); toast('Empleado eliminado');
    });
  }
  $('#empf').onsubmit = (ev) => {
    ev.preventDefault();
    busy($('#e_ok'), async () => {
      const raw = {
        nombre: $('#e_nombre').value, planta: $('#e_planta').value, depto: $('#e_depto').value, puesto: $('#e_puesto').value,
        genero: $('#e_genero').value, bota: $('#e_bota').value, nota: $('#e_nota').value, dot: $('#e_dot').value === '1',
        juegos: [emptyJuego(), emptyJuego(), emptyJuego()],
      };
      $$('[data-j]', $('#modal')).forEach((i) => { raw.juegos[+i.dataset.j][i.dataset.k] = i.value; });
      const o = normEmp(raw);
      if (S.emps.some((x) => x.nombre === o.nombre && x.id !== id)) throw new Error('Ya existe un empleado con ese nombre');
      if (id) {
        const rows = await q(sb.from('empleados').update(o).eq('id', id).select('id'));
        if (!rows.length) throw new Error('No se pudo guardar (quizá el empleado fue eliminado)');
      } else {
        await q(sb.from('empleados').insert(o));
      }
      await load(); closeM(); render(); toast('Guardado');
    });
  };
}

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
  const q2 = I.q.toLowerCase().trim();
  return S.inc.filter((i) => {
    const e = byId.get(i.emp) || {};
    return (!I.mes || i.fecha.startsWith(I.mes)) && (!I.planta || e.planta === I.planta) && (!q2 || (e.nombre || '').toLowerCase().includes(q2));
  });
}

function vInc() {
  const meses = [...new Set(S.inc.map((i) => i.fecha.slice(0, 7)))].sort().reverse();
  if (I.mes && !meses.includes(I.mes)) I.mes = '';
  $('#app').innerHTML = `
  <div class="card admin-only"><h2>Registrar incidencia</h2>
   <form class="f" id="incf">
    <label>Empleado<input id="i_emp" list="dl-emps" placeholder="Escribe para buscar…" autocomplete="off"></label>
    <label>Fecha<input type="date" id="i_fecha" value="${hoy()}"></label>
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
        const e = S.emps.find((x) => x.nombre === up($('#i_emp').value, 150));
        if (!e) { $('#i_emp').focus(); throw new Error('Elige un empleado de la lista'); }
        const inc = normInc({ fecha: $('#i_fecha').value, tipo: $('#i_tipo').value, obs: $('#i_obs').value });
        await q(sb.from('incidencias').insert({ empleado_id: e.id, ...inc }));
        await load();
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
    const rows = await q(sb.from('incidencias').delete().eq('id', +b.dataset.di).select('id'));
    if (!rows.length) throw new Error('No se pudo quitar (quizá ya no existe)');
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

/* ---------- USUARIOS Y DATOS (solo admin) ---------- */
async function vAdm() {
  $('#app').innerHTML = `
  <div class="card"><h2>Usuarios</h2>
   <p class="mut" style="margin-top:0">Cada persona crea su cuenta en la pantalla de entrada («Crear cuenta») y aquí la activas y le das un rol.
   <b>admin</b> puede modificar todo; <b>consulta</b> solo puede ver y exportar.</p>
   <div id="ulist" class="tw"><div class="loading">Cargando…</div></div></div>
  <div class="card"><h2>Respaldo</h2>
   <p class="mut" style="margin-top:0">Descarga todos los empleados e incidencias en un archivo. Hazlo con frecuencia y guárdalo en un lugar seguro: ese archivo contiene datos personales.</p>
   <button class="btn" id="bk">Descargar respaldo (JSON)</button></div>
  <div class="card"><h2>Importar empleados</h2>
   <p class="mut" style="margin-top:0">Carga un respaldo o el archivo <code>seed.local.json</code>. Los empleados que ya existen (mismo nombre) se omiten, no se sobrescriben.</p>
   <div class="bar"><input type="file" id="imf" accept=".json,application/json"><button class="btn p" id="imb" disabled>Importar</button></div>
   <div id="imr" class="mut"></div></div>`;
  $('#bk').onclick = backup;
  let parsed = null;
  $('#imf').onchange = async (e) => {
    parsed = null;
    $('#imb').disabled = true;
    const file = e.target.files[0];
    if (!file) return;
    try {
      parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.emps)) throw new Error('El archivo no tiene una lista "emps"');
      $('#imr').textContent = `Archivo listo: ${parsed.emps.length} empleados y ${(parsed.inc || []).length} incidencias.`;
      $('#imb').disabled = false;
    } catch (err) { $('#imr').textContent = 'Archivo inválido: ' + err.message; }
  };
  $('#imb').onclick = () => busy($('#imb'), async () => { $('#imr').textContent = 'Importando…'; $('#imr').textContent = await importData(parsed); });
  await drawUsers();
}

async function drawUsers() {
  const us = await q(sb.from('perfiles').select('id,email,nombre,rol,activo,creado').order('activo').order('creado', { ascending: false }));
  $('#ulist').innerHTML = `<table><thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Activo</th><th>Alta</th></tr></thead><tbody>${
    us.map((u) => `<tr data-u="${esc(u.id)}"><td>${esc(u.email)}${u.id === ME.id ? ' <span class="tag">tú</span>' : ''}</td><td>${esc(u.nombre)}</td>
     <td><select data-k="rol" aria-label="Rol">${['consulta', 'admin'].map((r) => `<option ${u.rol === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
     <td><label class="chk"><input type="checkbox" data-k="activo" ${u.activo ? 'checked' : ''}> ${u.activo ? 'Sí' : '<span class="miss">Pendiente</span>'}</label></td>
     <td class="mut">${esc(String(u.creado).slice(0, 10))}</td></tr>`).join('')}</tbody></table>`;
  $$('[data-k]', $('#ulist')).forEach((el) => {
    el.onchange = async () => {
      const id = el.closest('tr').dataset.u;
      const val = el.type === 'checkbox' ? el.checked : el.value;
      el.disabled = true;
      try {
        const rows = await q(sb.from('perfiles').update({ [el.dataset.k]: val }).eq('id', id).select('id'));
        if (!rows.length) throw new Error('No se pudo actualizar');
        toast('Usuario actualizado');
        if (id === ME.id) { location.reload(); return; }
      } catch (err) { toast(err.message, true); }
      await drawUsers();
    };
  });
}

function backup() {
  const idx = new Map(S.emps.map((e, i) => [e.id, i]));
  const data = {
    _formato: 'aramo-respaldo-1',
    _fecha: new Date().toISOString(),
    emps: S.emps.map(({ id, ...e }) => e),
    inc: S.inc.filter((i) => idx.has(i.emp)).map((i) => ({ emp: idx.get(i.emp), fecha: i.fecha, tipo: i.tipo, obs: i.obs, por: i.por })),
  };
  download(`respaldo_aramo_${hoy()}.json`, JSON.stringify(data, null, 1), 'application/json');
  toast('Respaldo descargado');
}

async function importData(seed) {
  const errs = [];
  const rows = new Map();
  seed.emps.forEach((e, i) => {
    try { const o = normEmp(e); if (!rows.has(o.nombre)) rows.set(o.nombre, o); } catch (x) { errs.push(`Empleado #${i + 1} (${e?.nombre || 'sin nombre'}): ${x.message}`); }
  });
  const antes = S.emps.length;
  const list = [...rows.values()];
  for (let i = 0; i < list.length; i += 500) {
    await q(sb.from('empleados').upsert(list.slice(i, i + 500), { onConflict: 'nombre', ignoreDuplicates: true }));
  }
  await load();
  const byName = new Map(S.emps.map((e) => [e.nombre, e.id]));
  const ya = new Set(S.inc.map((i) => [i.emp, i.fecha, i.tipo, i.obs].join('|')));
  const incs = [];
  (seed.inc || []).forEach((i, n) => {
    const src = seed.emps[i.emp];
    const empId = src && byName.get(up(src.nombre, 150));
    try {
      if (!empId) throw new Error('empleado no encontrado');
      const o = normInc(i);
      const k = [empId, o.fecha, o.tipo, o.obs].join('|');
      if (!ya.has(k)) { ya.add(k); incs.push({ empleado_id: empId, ...o }); }
    } catch (x) { errs.push(`Incidencia #${n + 1}: ${x.message}`); }
  });
  for (let i = 0; i < incs.length; i += 500) await q(sb.from('incidencias').insert(incs.slice(i, i + 500)));
  if (incs.length) await load();
  renderNav();
  return `Listo: ${S.emps.length - antes} empleados nuevos, ${incs.length} incidencias nuevas.`
    + (errs.length ? ` ${errs.length} registros omitidos por errores: ${errs.slice(0, 5).join(' · ')}${errs.length > 5 ? '…' : ''}` : '');
}

/* ---------- CSV ---------- */
function exportEmp(list) {
  csvOut('empleados.csv', [
    ['Nombre', 'Planta', 'Departamento', 'Puesto', 'Género', 'Bota', 'Recibe dotación', 'Nota', ...JUEGOS.flatMap((j) => [j + ' talla', j + ' color', j + ' forma', j + ' tipo'])],
    ...list.map((e) => [e.nombre, e.planta, e.depto, e.puesto, e.genero, e.bota, e.dot ? 'SÍ' : 'NO', e.nota, ...e.juegos.flatMap((j) => [j.talla, j.color, j.forma, j.tipo])]),
  ]);
}
function csvOut(name, rows) {
  // BOM para que Excel abra bien los acentos
  const txt = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  try { download(name, txt, 'text/csv;charset=utf-8'); toast('Archivo listo'); return; } catch { /* se muestra para copiar */ }
  $('#modal').innerHTML = `<div class="dlg"><h2>${esc(name)}</h2><p class="mut">No se pudo descargar aquí. Copia el contenido y pégalo en Excel o en un archivo .csv.</p><textarea class="csv" id="csvt" readonly></textarea><div class="bar" style="margin-top:10px"><span class="sp"></span><button class="btn" id="cc">Copiar</button><button class="btn p" id="cx">Cerrar</button></div></div>`;
  $('#csvt').value = txt;
  openM();
  $('#cx').onclick = closeM;
  $('#cc').onclick = async () => {
    try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { $('#csvt').select(); toast('Selecciona y copia (Ctrl+C)'); }
  };
}

/* =====================================================================
   INICIO
   ===================================================================== */
(async () => {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY || !window.supabase) return vSetup();
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  let recovering = false;
  sb.auth.onAuthStateChange((event) => {
    // No llamar a Supabase dentro de este callback (recomendación oficial): se difiere con setTimeout
    if (event === 'PASSWORD_RECOVERY') { recovering = true; setTimeout(vNewPassword, 0); }
    if (event === 'SIGNED_OUT') { ME = null; S = { emps: [], inc: [] }; setTimeout(() => vLogin(), 0); }
  });
  try {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (recovering) return;
    if (!data.session) return vLogin();
    await boot(data.session);
  } catch (e) {
    authShell(`<p class="err">${esc(errMsg(e))}</p><button class="btn p" id="retry">Reintentar</button>`);
    $('#retry').onclick = () => location.reload();
  }
})();
