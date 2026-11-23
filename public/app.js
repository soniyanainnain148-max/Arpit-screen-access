const $ = (s) => document.querySelector(s);
const api = (u, o = {}) => fetch(u, o).then((r) => r.ok ? r.json() : Promise.reject(r));

function show(on) {
  $('#auth').classList.toggle('hide', on);
  $('#dash').classList.toggle('hide', !on);
  $('#out').classList.toggle('hide', !on);
  if (on) load();
}

$('#login').onclick = async () => {
  await api('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: $('#email').value, password: $('#pass').value }) });
  show(true);
};

$('#reg').onclick = async () => {
  await api('/api/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: $('#email').value, password: $('#pass').value }) });
  show(true);
};

$('#out').onclick = async () => { await api('/api/logout', { method: 'POST' }); show(false); };

$('#go').onclick = async () => {
  const f = $('#apk').files[0];
  if (!f) return alert('APK select karo');
  if (f.size > 4.4 * 1024 * 1024) {
    alert('APK 4.4MB se bada hai. Vercel function ka body limit 4.5MB hai — build fail hoga. Chhota APK use karo ya host badlo.');
  }
  const fd = new FormData();
  fd.append('apk', f);
  fd.append('name', $('#name').value);
  try {
    const r = await api('/api/builds', { method: 'POST', body: fd });
    $('#apk').value = ''; $('#name').value = '';
    poll(r.id);
  } catch {
    alert('Upload fail. Size limit ya session check karo.');
  }
};

async function load() {
  let rows = [];
  try { rows = await api('/api/builds'); } catch { return; }

  const list = $('#list');
  list.innerHTML = '';
  if (!rows.length) { list.innerHTML = '<div class="card mono">Abhi koi build nahi.</div>'; return; }

  for (const b of rows) {
    const url = `${location.origin}/p/${b.id}`;
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <b>${b.name}</b>
        <span class="tag ${b.status === 'ready' ? 'on' : b.status === 'failed' ? 'off' : ''}">${String(b.status).toUpperCase()}</span>
      </div>
      <p class="mono" style="margin:8px 0">${b.pkg || '—'}</p>
      <div class="row">
        <span class="tag">${b.devices} DEVICES</span>
        <span class="tag ${b.online ? 'on' : ''}">${b.online} LIVE</span>
      </div>
      ${b.status === 'failed' && b.err ? `<pre class="mono" style="white-space:pre-wrap;max-height:160px;overflow:auto;margin:10px 0;font-size:11px">${b.err.replace(/</g, '&lt;')}</pre>` : ''}
      <div class="row" style="margin-top:12px">
        <button class="ghost" data-open="${b.id}">PANEL</button>
        ${b.status === 'ready' ? `<button class="ghost" data-copy="${url}">LINK</button><a href="/apks/${b.id}.apk"><button class="ghost">APK</button></a>` : ''}
        <button class="danger" data-del="${b.id}">DEL</button>
      </div>`;
    list.appendChild(el);
  }

  list.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = () => navigator.clipboard.writeText(b.dataset.copy); });
  list.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { location.href = `/p/${b.dataset.open}`; }; });
  list.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('Delete?')) return;
      await api(`/api/builds/${b.dataset.del}`, { method: 'DELETE' });
      load();
    };
  });
}

function poll(id) {
  const t = setInterval(async () => {
    try {
      const b = await api(`/api/builds/${id}`);
      if (b.status !== 'building') { clearInterval(t); load(); }
    } catch { clearInterval(t); }
  }, 2500);
  load();
}

api('/api/builds').then(() => show(true)).catch(() => show(false));
