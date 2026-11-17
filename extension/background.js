// G'day · servicio de fondo: diccionario de G'day y libreta de palabras.
// Primero prueba G'day en tu compu (python3 server.py); si no está, usa la versión publicada.
const LOCAL = 'http://localhost:5190';
const WEB = 'https://gday-english.vercel.app';
const DECK = 'Palabras de videos';

async function call(base, path, opts, ms) {
  const r = await fetch(base + path, { ...opts, signal: AbortSignal.timeout(ms) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || r.status);
  return d;
}
// solo el servidor de tu compu guarda tarjetas directamente
const api = (path, opts) => call(LOCAL, path, opts, 4000);
// el diccionario está en los dos lados
async function dictApi(path) {
  try { return await call(LOCAL, path, {}, 800); } catch { return call(WEB, path, {}, 15000); }
}
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// manda la palabra a G'day como tarjeta (frente: palabra y frase; reverso: traducción)
const deckNameOf = gday => (gday?.deckName || DECK).trim() || DECK;
const noteOf = item => ({
    flds: [`${esc(item.word)}${item.ctx ? `<div style="font-size:.7em;opacity:.65;margin-top:8px">${esc(item.ctx)}</div>` : ''}`,
      `${esc(item.tr)}${item.ctxTr ? `<div style="font-size:.7em;opacity:.65;margin-top:8px">${esc(item.ctxTr)}</div>` : ''}`],
    tags: ['extension', item.kind === 'frase' ? 'frase' : 'palabra'],
  });
async function toGday(item) {
  const { gday } = await chrome.storage.sync.get('gday');
  const deckName = item.deckName || deckNameOf(gday);
  const { gdayDids = {} } = await chrome.storage.local.get('gdayDids');
  const gdayDid = gdayDids[deckName];
  const note = noteOf(item);
  const body = did => JSON.stringify({ op: 'addNotes', mid: 'basic', notes: [note], src: 'extension', ...(did ? { did } : { deckName }) });
  try {
    const d = await api('/api/col', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(gdayDid) });
    if (!gdayDid) await chrome.storage.local.set({ gdayDids: { ...gdayDids, [deckName]: d.did } });
  } catch (e) {
    if (!gdayDid) throw e;
    // el mazo se borró en G'day: se crea de nuevo
    const d = await api('/api/col', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(null) });
    await chrome.storage.local.set({ gdayDids: { ...gdayDids, [deckName]: d.did } });
  }
}

async function saveWord(item) {
  const { words = [] } = await chrome.storage.local.get('words');
  const key = item.word.toLowerCase();
  if (words.some(w => w.word.toLowerCase() === key)) return { ok: true, dup: true };
  words.unshift({ ...item, ts: Date.now(), synced: false });
  const { gday } = await chrome.storage.sync.get('gday');
  let synced = false;
  if (gday?.sendToGday !== false && item.tr) {
    try { await toGday(item); synced = true; words[0].synced = true; } catch {}
  }
  await chrome.storage.local.set({ words: words.slice(0, 2000) });
  return { ok: true, gday: synced };
}

// reintenta pasar a G'day las palabras que se guardaron con el servidor apagado
async function syncPending() {
  const { words = [] } = await chrome.storage.local.get('words');
  let n = 0;
  for (const w of words.filter(x => !x.synced && x.tr).reverse()) {
    try { await toGday(w); w.synced = true; n++; } catch { break; }
  }
  if (n) await chrome.storage.local.set({ words });
  return n;
}

// La página de G'day (web o local) pide las palabras pendientes y las agrega a sus tarjetas (ver bridge.js)
async function pending() {
  const { words = [] } = await chrome.storage.local.get('words');
  const { gday } = await chrome.storage.sync.get('gday');
  if (gday?.sendToGday === false) return { deckName: deckNameOf(gday), items: [] };
  const items = words.filter(w => !w.synced && w.tr).reverse().map(w => ({ key: w.word.toLowerCase(), note: noteOf(w), ...(w.deckName ? { deckName: w.deckName } : {}) }));
  return { deckName: deckNameOf(gday), items };
}
async function markSynced(keys) {
  const set = new Set(keys);
  const { words = [] } = await chrome.storage.local.get('words');
  words.forEach(w => { if (set.has(w.word.toLowerCase())) w.synced = true; });
  await chrome.storage.local.set({ words });
}

// "+ Palabras": guarda las palabras elegidas en el episodio y las lleva a G'day sin que tengas que hacer nada.
// Si tu compu tiene el servidor de G'day, van directo. Si no, se avisa a la pestaña de G'day abierta; y si no hay ninguna,
// se abre G'day en segundo plano, agrega las tarjetas (y las sube a tu Google Drive si iniciaste sesión) y se cierra sola.
const GDAY_TABS = [WEB + '/*', LOCAL + '/*', 'http://127.0.0.1:5190/*'];
async function mine(items) {
  let added = 0;
  for (const it of items) { const r = await saveWord(it); if (!r.dup) added++; }
  const left = (await pending()).items.length;
  if (!left) return { added, where: 'gday' };
  const tabs = await chrome.tabs.query({ url: GDAY_TABS });
  if (tabs.length) { for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'nudge' }).catch(() => {}); return { added, where: 'tab' }; }
  const t = await chrome.tabs.create({ url: WEB + '/#cards', active: false });
  await chrome.storage.session.set({ autoTab: t.id });
  return { added, where: 'opened' };
}
async function closeAutoTab(tabId) {
  const { autoTab } = await chrome.storage.session.get('autoTab');
  if (autoTab == null || autoTab !== tabId) return;
  await chrome.storage.session.remove('autoTab');
  setTimeout(() => chrome.tabs.remove(tabId).catch(() => {}), 12000);  // unos segundos para que termine de subir a Drive
}

// Minutos de videos con subtítulos en inglés, por día, hasta que G'day los suma a tu tiempo de inmersión.
// Se guardan en orden (uno por vez) para no perder segundos si llegan dos mensajes juntos.
const dayKey = () => new Date().toLocaleDateString('sv');
let watchQ = Promise.resolve();
const watchDo = fn => (watchQ = watchQ.then(async () => {
  const { gdayWatch = {} } = await chrome.storage.local.get('gdayWatch');
  const r = fn(gdayWatch);
  for (const [k, v] of Object.entries(gdayWatch)) if (!(v > 0)) delete gdayWatch[k];
  await chrome.storage.local.set({ gdayWatch });
  return r;
}).catch(() => {}));
const addWatch = sec => watchDo(w => { const k = dayKey(); w[k] = Math.min(16 * 3600, (w[k] || 0) + Math.max(0, Math.min(60, Math.floor(+sec || 0)))); });
const watchPending = () => watchDo(w => ({ ...w }));
const watchDone = days => watchDo(w => { for (const [k, v] of Object.entries(days || {})) if (w[k]) w[k] -= Math.max(0, Math.floor(+v || 0)); });

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (m.type === 'badge' && sender.tab?.id != null) {  // "EN" o "EN+ES" en el ícono cuando hay subtítulos
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: m.text });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#7c3aed' });
    return reply({ ok: true });
  }
  (async () => {
    try {
      if (m.type === 'pending') return reply(await pending());
      if (m.type === 'watch') { await addWatch(m.sec); return reply({ ok: true }); }
      if (m.type === 'watchPending') return reply({ days: await watchPending() });
      if (m.type === 'watchDone') { await watchDone(m.days); return reply({ ok: true }); }
      // traducción de subtítulos al español con el servidor publicado de G'day
      if (m.type === 'translate') return reply(await call(WEB, '/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: (m.lines || []).slice(0, 80) }) }, 50000));
      if (m.type === 'synced') { await markSynced(m.keys || []); if (sender.tab) closeAutoTab(sender.tab.id); return reply({ ok: true }); }
      if (m.type === 'profile') { await chrome.storage.local.set({ gdayProfile: { level: m.level, known: m.known, levels: m.levels, mastered: m.mastered || [], hours: m.hours || 0, at: Date.now() } }); return reply({ ok: true }); }
      if (m.type === 'mine') return reply(await mine(m.items || []));
      if (m.type === 'dict') return reply(await dictApi('/api/dict?w=' + encodeURIComponent(m.cands.join('|'))));
      if (m.type === 'save') return reply(await saveWord(m.item));
      if (m.type === 'ping') {
        try { await api('/api/ping'); return reply({ ok: true, local: true, synced: await syncPending() }); }
        catch { await call(WEB, '/api/ping', {}, 8000); return reply({ ok: true, local: false, pending: (await pending()).items.length }); }
      }
      if (m.type === 'sync') {
        try { await api('/api/ping'); } catch { return reply({ web: WEB + '/#cards' }); }
        return reply({ n: await syncPending() });
      }
    } catch (e) { reply({ error: String(e.message || e) }); }
  })();
  return true;
});
