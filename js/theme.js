/* Tema claro / oscuro.
   Se carga en <head> (antes de pintar) para que no haya parpadeo.
   Primera visita: sigue el modo del sistema. Después recuerda la elección. */
(function () {
  'use strict';
  var KEY = 'aramo-tema';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function current() { var s = saved(); return s === 'dark' || s === 'light' ? s : (mq && mq.matches ? 'dark' : 'light'); }
  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#1f1823' : '#ffffff');
  }
  apply(current());
  // Si el usuario no ha elegido, seguir los cambios del sistema
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!saved()) apply(current()); });

  window.Theme = {
    get: current,
    toggle: function () {
      var t = current() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, t); } catch (e) { /* modo privado */ }
      apply(t);
      return t;
    },
    /** HTML del botón sol/luna */
    button: function (id) {
      return '<button type="button" class="btn theme" id="' + id + '" title="Cambiar a modo claro u oscuro" aria-label="Cambiar a modo claro u oscuro">'
        + '<svg class="sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
        + '<svg class="moon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>';
    },
  };
})();
