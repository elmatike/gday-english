// Progreso en la nube: cada usuario inicia sesión con Google y G'day guarda su progreso en una carpeta
// privada de su propio Google Drive (la "carpeta de la app": no se ve en Drive y G'day no ve nada más).
// Se sube solo unos segundos después de cada cambio y se baja al abrir la app o al volver a ella.
// El inicio de sesión lo hace el servidor (gday_auth.py): acá solo se pide un permiso corto para hablar con Drive.

const DRIVE = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
import { revlogAll, revlogMerge } from './revlog.js';

// el historial de respuestas va aparte (revlog.js): crece con los meses y no hace falta bajarlo para estudiar
const FILES = { progress: 'gday-progress.json', col: 'gday-collection.json.gz', revlog: 'gday-revlog.json.gz' };
const GZ = kind => kind !== 'progress';
const LAST = 'gday-cloud';  // en este navegador: cuándo se sincronizó por última vez y con qué cuenta

export const cloud = { configured: null, signedIn: false, email: '', state: 'idle', at: 0, error: '' };
let tok = null, tokP = null, hooks = null, ids = {}, pushT = 0, busy = Promise.resolve(), dirty = { progress: false, col: false, revlog: false }, revUp = 0;

const lastSync = () => { try { return JSON.parse(localStorage.getItem(LAST)) || {}; } catch { return {}; } };
const setLast = patch => { try { localStorage.setItem(LAST, JSON.stringify({ ...lastSync(), ...patch })); } catch {} };

/* ---------- permiso ---------- */
async function token(force) {
  if (!force && tok && tok.exp > Date.now() + 60e3) return tok.access;
  tokP ??= (async () => {
    try {
      const r = await fetch('/api/auth?a=token', { cache: 'no-store', credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (d.error === 'noconfig' || r.status === 404) { cloud.configured = false; cloud.signedIn = false; return null; }
      cloud.configured = true;
      cloud.signedIn = !!d.signedIn; cloud.email = d.email || cloud.email;
      if (!d.access_token) { tok = null; if (d.expired) cloud.error = 'expired'; return null; }
      tok = { access: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
      return tok.access;
    } catch { cloud.error = 'offline'; return null; }
    finally { tokP = null; }
  })();
  return tokP;
}

async function drive(url, opts = {}, retry = true) {
  const t = await token();
  if (!t) throw new Error('nologin');
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
  if (r.status === 401 && retry) { tok = null; await token(true); return drive(url, opts, false); }
  if (!r.ok) throw new Error('drive ' + r.status);
  return r;
}

async function fileId(kind) {
  if (ids[kind]) return ids[kind];
  const q = encodeURIComponent(`name='${FILES[kind]}' and trashed=false`);
  const d = await (await drive(`${DRIVE}?spaces=appDataFolder&q=${q}&fields=files(id,appProperties)&orderBy=modifiedTime desc`)).json();
  return ids[kind] = d.files?.[0]?.id || null;
}

async function download(kind) {
  const id = await fileId(kind);
  if (!id) return null;
  const r = await drive(`${DRIVE}/${id}?alt=media`);
  if (GZ(kind)) return JSON.parse(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text());
  return r.json();
}

// subida "reanudable": sirve para archivos de cualquier tamaño (los mazos con muchas notas pueden pesar varios MB)
async function upload(kind, data, savedAt) {
  let body = new Blob([JSON.stringify(data)], { type: 'application/json' });
  if (GZ(kind)) body = await new Response(body.stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const id = await fileId(kind);
  const meta = id ? { appProperties: { savedAt: String(savedAt) } } : { name: FILES[kind], parents: ['appDataFolder'], appProperties: { savedAt: String(savedAt) } };
  const start = await drive(id ? `${UPLOAD}/${id}?uploadType=resumable` : `${UPLOAD}?uploadType=resumable`, {
    method: id ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': GZ(kind) ? 'application/gzip' : 'application/json' },
    body: JSON.stringify(meta),
  });
  const loc = start.headers.get('Location');
  if (!loc) throw new Error('drive upload');
  const done = await (await drive(loc, { method: 'PUT', body })).json();
  ids[kind] = done.id || id;
}

/* ---------- mezcla ---------- */
// Lo normal es estudiar en un dispositivo a la vez: gana la copia guardada más tarde.
// Igual, para no perder nada si se estudió en dos lados sin conexión:
// - cada tarjeta se queda con su repaso más reciente,
// - cada día del historial suma lo máximo de cada contador,
// - las tarjetas propias nuevas de los dos lados se juntan, y las borradas siguen borradas.
// las tarjetas propias se llaman "c-" + fecha de creación en base 36 (8 letras) + un número
const createdOf = id => parseInt(String(id).slice(2, 10), 36) || 0;
export function mergeProgress(local, remote, since) {
  if (!remote?.savedAt) return local;
  if (!local?.savedAt) return remote;
  const [n, o] = local.savedAt >= remote.savedAt ? [local, remote] : [remote, local];
  if ((n.resetAt || 0) > (o.savedAt || 0)) return n;  // se borró todo a propósito
  const m = { ...n, cards: { ...(n.cards || {}) }, log: { ...(n.log || {}) } };
  for (const [id, c] of Object.entries(o.cards || {})) {
    const x = m.cards[id];
    if (!x || (c?.last || 0) > (x?.last || 0)) m.cards[id] = c;
  }
  for (const [d, L] of Object.entries(o.log || {})) {
    const x = m.log[d];
    if (!x) { m.log[d] = L; continue; }
    const y = { ...x };
    for (const k in L) if (typeof L[k] === 'number') y[k] = Math.max(x[k] || 0, L[k]);
    m.log[d] = y;
  }
  mergeExercises(m, n, o, since);
  const have = new Set((n.custom || []).map(e => e.id));
  const extra = (o.custom || []).filter(e => !have.has(e.id) && (!since || createdOf(e.id) > since));
  if (extra.length) m.custom = [...(n.custom || []), ...extra];
  return m;
}
// Lo que hiciste en cada dispositivo se suma, no se pisa: ejercicios vistos, frases leídas, "Ya la sé", diario, etc.
// n = la copia más nueva, o = la otra. Ante un conflicto gana la más nueva.
const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const maxNums = (a, b) => { const y = { ...obj(b), ...obj(a) }; for (const k in obj(b)) if (typeof b[k] === 'number' && typeof y[k] === 'number') y[k] = Math.max(y[k], b[k]); return y; };
function mergeExercises(m, n, o, since) {
  // por cada ejercicio: la fecha más reciente en que lo viste
  m.seen = { ...obj(o.seen), ...obj(n.seen) };
  for (const k in obj(o.seen)) if (k !== 'v') m.seen[k] = maxNums(n.seen?.[k], o.seen[k]);
  // estadísticas por frase, situación o sonido: lo mayor de cada número
  for (const f of ['shadow', 'roles', 'sounds']) {
    m[f] = { ...obj(o[f]), ...obj(n[f]) };
    for (const id in obj(o[f])) if (n[f]?.[id]) m[f][id] = maxNums(n[f][id], o[f][id]);
  }
  // "Ya la sé" de los dos lados se juntan (lo demás —suspendidas, enterradas, marcas— queda como en la copia más nueva,
  // así lo que deshiciste en un lado no vuelve a aparecer)
  m.susp = { ...obj(n.susp) };
  for (const [cid, v] of Object.entries(obj(o.susp))) if (v === 'known' && !(cid in m.susp)) m.susp[cid] = v;
  // contadores por día de cada mazo
  m.dlog = { ...obj(o.dlog), ...obj(n.dlog) };
  for (const d in obj(o.dlog)) if (n.dlog?.[d]) { m.dlog[d] = { ...o.dlog[d], ...n.dlog[d] }; for (const did in o.dlog[d]) if (n.dlog[d][did]) m.dlog[d][did] = maxNums(n.dlog[d][did], o.dlog[d][did]); }
  if ((o.dictation?.n || 0) > (n.dictation?.n || 0)) m.dictation = o.dictation;
  // listas: se juntan sin duplicar
  const union = (a, b, key) => { const out = [...(a || [])], ks = new Set(out.map(key)); for (const x of b || []) if (!ks.has(key(x))) { ks.add(key(x)); out.push(x); } return out; };
  // del diario se suman solo las entradas nuevas del otro lado (las que borraste no vuelven)
  const born = id => parseInt(String(id).slice(1), 36) || 0;
  m.journal = union(n.journal, (o.journal || []).filter(x => !since || born(x.id) > since), x => x.id).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
  m.speak = union(n.speak, o.speak, x => JSON.stringify(x)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- sincronizar ---------- */
const run = fn => (busy = busy.then(fn, fn));

async function pull() {
  if (!hooks || !(await token())) return;
  cloud.state = 'sync';
  hooks.changed?.();
  try {
    const since = lastSync().email === cloud.email ? (lastSync().at || 0) : 0;
    // progreso
    const remote = await download('progress');
    const local = hooks.getProgress();
    const fresh = !local.savedAt || since === 0 && isBlank(local);
    const merged = fresh ? (remote || local) : mergeProgress(local, remote, since);
    if (remote && !same(merged, local)) hooks.setProgress(merged, fresh ? 'recovered' : 'updated');
    if (!remote || !same(merged, remote)) dirty.progress = true;
    // mazos importados (solo en la versión publicada; en tu compu están en la carpeta data)
    const lc = hooks.getCol?.();
    if (lc) {
      const rc = await download('col');
      if (rc && (rc.savedAt || 0) > (lc.savedAt || 0)) await hooks.setCol(rc);
      else if (!rc || (lc.savedAt || 0) > (rc.savedAt || 0)) dirty.col = true;
    }
    // historial de respuestas: se juntan las dos copias sin repetir filas
    try {
      const rr = await download('revlog');
      await revlogMerge(rr);
      if (!rr || revlogAll().length > rr.length) dirty.revlog = true;
    } catch (e) { if (e.message === 'nologin') throw e; }
    await flush(true);
    cloud.state = 'ok'; cloud.error = ''; cloud.at = Date.now();
    setLast({ at: Date.now(), email: cloud.email });
  } catch (e) {
    cloud.state = 'error'; cloud.error = e.message === 'nologin' ? '' : 'offline';
  }
  hooks.changed?.();
}
// un navegador recién estrenado (sin estudiar nada) no debe pisar el progreso de la nube
const isBlank = p => !Object.keys(p.cards || {}).length && !Object.keys(p.log || {}).length && !(p.custom || []).length;

// el historial pesa más que el progreso: se sube como mucho cada 2 minutos, o enseguida al cerrar la pestaña
async function flush(force) {
  if (dirty.revlog && (force || Date.now() - revUp > 120e3)) {
    dirty.revlog = false; revUp = Date.now();
    try { await upload('revlog', revlogAll(), Date.now()); } catch (e) { dirty.revlog = true; throw e; }
  }
  if (dirty.progress) {
    dirty.progress = false;
    const p = hooks.getProgress();
    try { await upload('progress', p, p.savedAt || Date.now()); } catch (e) { dirty.progress = true; throw e; }
  }
  if (dirty.col) {
    dirty.col = false;
    const c = hooks.getCol?.();
    if (c) try { await upload('col', c, c.savedAt || Date.now()); } catch (e) { dirty.col = true; throw e; }
  }
}

async function push(force) {
  if (!cloud.signedIn || (!dirty.progress && !dirty.col && !dirty.revlog)) return;
  try {
    await flush(force);
    cloud.state = 'ok'; cloud.error = ''; cloud.at = Date.now();
    setLast({ at: Date.now(), email: cloud.email });
  } catch (e) { cloud.state = 'error'; cloud.error = 'offline'; }
  hooks.changed?.();
}

// la app avisa cada vez que guarda: se sube a los pocos segundos (y enseguida si se cierra la pestaña)
export function cloudSaved(kind = 'progress') {
  dirty[kind] = true;
  if (!cloud.signedIn) return;
  clearTimeout(pushT);
  pushT = setTimeout(() => run(() => push()), 4000);
}

let lastPull = 0;
const pullSoon = () => { if (cloud.signedIn && Date.now() - lastPull > 20e3) { lastPull = Date.now(); run(pull); } };

export async function cloudInit(h) {
  hooks = h;
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  const msg = p.get('cloud');
  if (msg) history.replaceState(null, '', location.pathname + location.hash.split('?')[0]);
  await token();
  hooks.changed?.();
  if (msg === 'ok') hooks.toast?.(cloud.signedIn ? `Sesión iniciada: ${cloud.email}` : 'No se pudo iniciar sesión');
  else if (msg === 'noscope') hooks.toast?.('Para guardar tu progreso, dejá tildado el permiso de Google Drive');
  else if (msg === 'error') hooks.toast?.('No se pudo iniciar sesión con Google. Probá de nuevo');
  else if (msg === 'noconfig') hooks.toast?.('El inicio de sesión con Google todavía no está configurado');
  if (cloud.signedIn) { lastPull = Date.now(); await run(pull); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearTimeout(pushT); run(() => push(true)); } else pullSoon();
  });
  addEventListener('online', pullSoon);
  setInterval(() => { if (!document.hidden) pullSoon(); }, 120e3);
}

export function cloudLogin() { location.href = '/api/auth?a=login'; }
export async function cloudLogout() {
  await run(() => push(true)).catch(() => {});
  try { await fetch('/api/auth?a=logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
  tok = null; ids = {}; Object.assign(cloud, { signedIn: false, email: '', state: 'idle', at: 0, error: '' });
  setLast({ at: 0, email: '' });
  hooks?.changed?.();
}
export const cloudSyncNow = () => { lastPull = Date.now(); return run(pull); };
