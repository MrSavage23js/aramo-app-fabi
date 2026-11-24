'use strict';
document.getElementById('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const go = document.getElementById('go');
  const err = document.getElementById('err');
  err.textContent = '';
  go.disabled = true;
  try {
    const r = await fetch('api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: document.getElementById('u').value, password: document.getElementById('p').value }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
    location.replace('./');
  } catch (e) {
    err.textContent = e.message === 'Failed to fetch' ? 'No se pudo conectar con el servidor' : e.message;
    document.getElementById('p').select();
  } finally {
    go.disabled = false;
  }
});
