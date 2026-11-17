// Tarjetas estilo Anki: varios mazos, importación, explorador, editor, opciones y tienda.
import { DECK, AUSSIE } from './data.js';
import { PACKS } from './shop-data.js';
import { loadBrowserCol, saveBrowserCol, applyOp, importFile } from './browser-col.js';
import { S, save, log, toast, esc, say, sayNext, hush, listen, micMsg, canHear, words, compare, SR, render, dayKey, schedule, fmtDays,
  getSession, nextStep, sessBanner, STEP_SECS, routeArg, addCustom, planFor, stepDone, levelInfo, checkLevel, totalHours, studyDay, dayNo, dayAt } from './app.js';
import { W6, sequences, usable, optimize } from './fsrs.js';
import { revlogAll, revlogReady, revlogAdd, revlogRemove } from './revlog.js';
import { cloud } from './cloud.js';

const $ = s => document.querySelector(s);
const MIN = 6e4;
let COL = { decks: {}, models: {}, notes: {}, cards: [] }, colOk = null, colMode = null;  // colMode: 'server' (tu compu) o 'browser' (versión publicada)
let cardIndex = new Map();      // 'n:nota:orden' -> { nid, ord, did }
let A = {};                     // estado de la pantalla actual
const undoStack = [];

/* ---------- colección del servidor ---------- */
function setCol(c) {
  COL = c;
  cardIndex = new Map(c.cards.map(([nid, ord, did]) => [`n:${nid}:${ord}`, { nid, ord, did }]));
}
export async function loadCollection() {
  try {
    const r = await fetch('/api/collection', { cache: 'no-store' });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw 0;
    setCol(await r.json()); colOk = true; colMode = 'server';
  } catch {
    // sin servidor local: los mazos se guardan dentro del navegador
    try { setCol(await loadBrowserCol()); colOk = true; colMode = 'browser'; } catch { colOk = false; }
  }
  render();
  pullExt();
}
// para la sincronización con Google Drive (cloud.js): solo los mazos guardados en el navegador
export const colForCloud = () => colMode === 'browser' ? COL : null;
export async function colFromCloud(c) {
  for (const k of ['decks', 'models', 'notes']) c[k] ??= {};
  c.cards ??= [];
  setCol(c); await saveBrowserCol(c, true); render();
}

/* ---------- extensión: trae las palabras guardadas en videos (ver extension/bridge.js) ---------- */
export const ext = { version: null };
let extBusy = false;
const toExt = msg => window.postMessage({ __gdayExt: msg.type, ...msg }, location.origin);
function pullExt() { if (colOk && ext.version && !extBusy) { sendProfile(); toExt({ type: 'pull' }); } }
// Le pasa a la extensión tu nivel y las palabras que ya tenés, para que el botón "+ Palabras" elija solo las útiles para vos.
// Va por el mismo puente (bridge.js), dentro de tu Chrome: no pasa por ningún servidor.
const firstWord = html => String(html || '').split(/<div|<br|\n/i)[0].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '').trim().toLowerCase().replace(/^to /, '');
// Palabras que ya sabés (las mismas que cuentan para tu nivel): "Ya la sé" o FSRS con estabilidad de 3 semanas o más.
// Las usa el medidor de vocabulario de los videos (vocab.js) y también la extensión.
export function masteredWords() {
  const out = new Set();
  for (const cid of new Set([...Object.keys(S.cards), ...Object.keys(S.susp)])) {
    const c = S.cards[cid];
    if (!(S.susp[cid] === 'known' || (!S.susp[cid] && c && c.step == null && c.s >= 21))) continue;
    const t = cid.startsWith('n:') ? firstWord(COL?.notes?.[cid.split(':')[1]]?.flds?.[0]) : firstWord(entryOf(cid.replace(/>[rp]$/, ''))?.en);
    if (t && !/\s/.test(t) && t.length < 30) out.add(t);
  }
  return out;
}
function sendProfile() {
  const known = new Set();
  for (const cid of new Set([...Object.keys(S.cards), ...Object.keys(S.susp)])) {
    let t;
    if (cid.startsWith('n:')) t = firstWord(COL.notes[cid.split(':')[1]]?.flds?.[0]);
    else t = firstWord(entryOf(cid.replace(/>[rp]$/, ''))?.en);
    if (t && !/\s/.test(t) && t.length < 30) known.add(t);
  }
  const levels = {};
  for (const e of DECK) { const w = e.en.toLowerCase().replace(/^to /, ''); if (!/\s/.test(w)) levels[w] ??= e.lvl; }
  toExt({ type: 'profile', level: S.settings.level, known: [...known], levels, mastered: [...masteredWords()], hours: totalHours() });
}
window.addEventListener('message', async e => {
  const d = e.data;
  if (e.source !== window || e.origin !== location.origin || !d || typeof d.__gdayExt !== 'string') return;
  if (d.__gdayExt === 'nudge') pullExt();
  if (d.__gdayExt === 'ready') {
    const first = !ext.version;
    ext.version = String(d.version || '?');
    if (first) { pullExt(); if (location.hash === '#settings') render(); }
  }
  if (d.__gdayExt === 'words' && Array.isArray(d.items) && d.items.length && colOk && !extBusy) {
    extBusy = true;
    try {
      // cada palabra puede traer su mazo (las del botón "+ Palabras" van a "Series y pelis::<título>")
      const groups = new Map();
      for (const i of d.items) { const n = String(i.deckName || d.deckName || 'Palabras de videos'); if (!groups.has(n)) groups.set(n, []); groups.get(n).push(i); }
      const msgs = [];
      for (const [name, items] of groups) {
        const did = Object.entries(COL.decks).find(([, x]) => x.name === name)?.[0];
        const have = new Set(did ? COL.cards.filter(c => c[2] === did).map(c => String(COL.notes[c[0]]?.flds?.[0] || '').toLowerCase()) : []);
        const fresh = items.filter(i => Array.isArray(i?.note?.flds) && !have.has(String(i.note.flds[0]).toLowerCase()));
        if (!fresh.length) continue;
        await colOp({ op: 'addNotes', mid: 'basic', src: 'extension', notes: fresh.map(i => ({ flds: i.note.flds.map(String), tags: (i.note.tags || []).map(String) })), ...(did ? { did } : { deckName: name }) });
        msgs.push(`${fresh.length} en “${name.split('::').pop()}”`);
      }
      if (msgs.length) { toast(`Palabras nuevas de tus videos: ${msgs.join(' · ')}`); render(); }
      toExt({ type: 'done', keys: d.items.map(i => String(i.key)) });
    } catch { /* se reintenta la próxima vez */ }
    extBusy = false;
  }
});
// Tiempo de videos mirados con la extensión: suma a tu inmersión del día en que lo miraste (y por lo tanto a tus horas,
// al ranking y a las monedas). Después se le avisa a la extensión cuánto se sumó, para que no lo mande dos veces.
window.addEventListener('message', e => {
  const d = e.data;
  if (e.source !== window || e.origin !== location.origin || d?.__gdayExt !== 'watch' || !d.days || typeof d.days !== 'object') return;
  // la extensión manda fechas de calendario (el día de estudio de G'day cambia a las 4 de la mañana)
  const calToday = new Date().toLocaleDateString('sv'), took = {};
  let total = 0;
  for (const [k, v] of Object.entries(d.days)) {
    const sec = Math.floor(+v || 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > calToday || sec <= 0) continue;
    const L = (S.log[k] ??= { sec: 0, new: 0, rev: 0, shadow: 0, speak: 0, extra: 0 });
    const add = Math.max(0, Math.min(sec, 16 * 3600 - (L.sec || 0)));
    L.sec = (L.sec || 0) + add; L.immSec = (L.immSec || 0) + add; L.extSec = (L.extSec || 0) + add;
    took[k] = sec; total += add;
  }
  if (!Object.keys(took).length) return;
  save(); toExt({ type: 'watchDone', days: took });
  if (total >= 60) { toast(`+${Math.round(total / 60)} min de videos con la extensión`); render(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) pullExt(); });
toExt({ type: 'hello' });
async function colOp(op) {
  if (colMode === 'browser') {
    const res = applyOp(COL, op);
    setCol(COL); await saveBrowserCol(COL);
    return { ...res, col: COL };
  }
  const r = await fetch('/api/col', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(op) });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error || 'No se pudo guardar');
  setCol(d.col);
  return d;
}
// dónde quedan tus mazos: con sesión de Google, también en tu Drive (cloud.js); las imágenes y audios, solo acá
const needServer = () => colOk === false ? '<p class="tip">Este navegador no permite guardar mazos (puede pasar en modo privado).</p>'
  : colMode !== 'browser' ? ''
  : cloud.signedIn ? '<p class="muted">Tus mazos se guardan en este navegador y en tu Google Drive, así los tenés en cualquier dispositivo. Las imágenes y audios de los mazos de Anki importados quedan solo en este navegador.</p>'
  : '<p class="muted">Tus mazos se guardan solo en este navegador. <a class="link" href="#settings">Iniciá sesión con Google</a> en Ajustes y se guardan también en tu Drive.</p>';

/* ---------- mazos ---------- */
const BUILTIN = { gday: "G'day · Inglés cotidiano", mine: 'Mis tarjetas', aussie: 'Jerga australiana' };
const entryOf = id => (id.startsWith('c-') ? S.custom : id.startsWith('au-') ? AUSSIE : DECK).find(e => e.id === id);
const deckName = did => BUILTIN[did] || COL.decks[did]?.name || 'Mazo';
function deckList() {
  const out = [{ id: 'gday', name: BUILTIN.gday, builtin: true }];
  if (S.custom.length) out.push({ id: 'mine', name: BUILTIN.mine, builtin: true });
  if (S.settings.aussie) out.push({ id: 'aussie', name: BUILTIN.aussie, builtin: true });
  const imported = Object.entries(COL.decks).map(([id, d]) => ({ id, name: d.name, src: d.src }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return out.concat(imported);
}
function deckOf(cid) {
  if (cid.startsWith('n:')) return cardIndex.get(cid)?.did;
  const id = cid.slice(0, -2);
  return id.startsWith('c-') ? 'mine' : id.startsWith('au-') ? (S.settings.aussie ? 'aussie' : null) : 'gday';
}
// un mazo incluye sus submazos ("Inglés" incluye "Inglés::Verbos")
function deckSet(did) {
  if (did === 'all') return new Set(deckList().map(d => d.id));
  if (BUILTIN[did]) return new Set([did]);
  const name = COL.decks[did]?.name;
  return new Set(Object.entries(COL.decks).filter(([, d]) => d.name === name || d.name.startsWith(name + '::')).map(([id]) => id));
}

/* ---------- mazos de G'day: escalones de dificultad que rotan ---------- */
// El mazo de G'day se divide en mazos chicos de 30 palabras, ordenados de más fácil a más difícil
// (Básico 1, Básico 2… Intermedio 1… Avanzado N). Cada día entran solo 3: el primero sin terminar de tu nivel
// (la "frontera") y 2 que rotan entre los 5 siguientes, así hay variedad y la dificultad sube de a poco.
// Si marcás "Ya la sé" 5 veces seguidas en palabras nuevas, se salta el mazo donde más las marcaste y entra uno más difícil.
// El progreso de cada palabra sigue guardado por palabra (S.cards / S.susp): los mazos se calculan, no se guardan.
const MZ_SIZE = 30, MZ_DAY = 3, MZ_STREAK = 5, LVL_NAMES = ['Básico', 'Intermedio', 'Avanzado'];
let MZ = null, MZ_OF = null;
function mazos() {
  if (MZ) return MZ;
  MZ = []; MZ_OF = new Map();
  for (const lvl of [1, 2, 3]) {
    const list = DECK.filter(e => e.lvl === lvl && !e.rare);  // las poco usadas no entran (ver RARE en data.js)
    for (let i = 0; i < list.length; i += MZ_SIZE) {
      let ents = list.slice(i, i + MZ_SIZE);
      if (ents.length < MZ_SIZE / 2 && MZ.at(-1)?.lvl === lvl) { MZ.at(-1).ents.push(...ents); continue; }  // el resto chico se suma al anterior
      MZ.push({ id: `L${lvl}-${i / MZ_SIZE + 1}`, lvl, name: `${LVL_NAMES[lvl - 1]} ${i / MZ_SIZE + 1}`, ents });
    }
  }
  MZ.forEach((m, i) => { m.tier = i; m.ents.forEach(e => MZ_OF.set(e.id, m)); });
  return MZ;
}
const mazoOf = cid => { mazos(); return MZ_OF.get(cid.replace(/>[rp]$/, '')); };
// palabras de un mazo que todavía no viste (ni marcaste como sabidas ni suspendiste)
const mzLeft = m => m.ents.filter(e => !S.cards[e.id + '>r'] && !S.susp[e.id + '>r']).length;
const mzSkip = () => (S.mzSkip ??= {});
// orden: desde tu nivel (y desde el "piso" de dificultad, S.mzFloor) hacia arriba; al final, lo más fácil que eso
function mzCandidates() {
  const lvl = S.settings.level, floor = S.mzFloor || 0, all = mazos(), skip = mzSkip();
  const up = all.filter(m => m.lvl >= lvl && m.tier >= floor);
  return [...up, ...all.filter(m => !up.includes(m))].filter(m => !skip[m.id] && mzLeft(m) > 0);
}
const dayNum = () => Math.floor(Date.parse(dayKey()) / 864e5);
// los mazos de hoy: se eligen una vez por día; si uno se termina o se salta, entra el siguiente más difícil
function todayMazos() {
  const today = dayKey(), cand = mzCandidates(), byId = new Map(mazos().map(m => [m.id, m]));
  if (S.mzDay?.day !== today || !Array.isArray(S.mzDay.ids)) {
    const pool = cand.slice(1, 6), dn = dayNum(), pick = [cand[0]];
    for (let k = 0; pick.length < MZ_DAY && k < pool.length; k++) { const m = pool[(dn * 2 + k) % pool.length]; if (m && !pick.includes(m)) pick.push(m); }
    S.mzDay = { ...S.mzDay, day: today, ids: pick.filter(Boolean).map(m => m.id) };
  }
  let act = S.mzDay.ids.map(id => byId.get(id)).filter(m => m && !mzSkip()[m.id] && mzLeft(m) > 0);
  if (act.length < Math.min(MZ_DAY, cand.length)) {
    const top = Math.max(-1, ...act.map(m => m.tier));
    for (const m of [...cand.filter(m => m.tier > top), ...cand]) { if (act.length >= MZ_DAY) break; if (!act.includes(m)) act.push(m); }
    S.mzDay.ids = act.map(m => m.id);
  }
  return act;
}
// "Ya la sé" muchas veces seguidas en palabras nuevas: se salta el mazo y entra uno más difícil
function knownStreak(cid) {
  const k = (S.kstreak ??= { n: 0, by: {} });
  k.n++;
  const key = cid.startsWith('n:') ? cardIndex.get(cid)?.did : mazoOf(cid)?.id || deckOf(cid);
  if (!key) return null;
  k.by[key] = (k.by[key] || 0) + 1;
  if (k.n % MZ_STREAK) return null;
  // cada MZ_STREAK seguidas se salta el mazo que más "Ya la sé" juntó en esta racha (si empatan, el más fácil)
  const tierOf = x => mazos().find(m => m.id === x)?.tier ?? 1e9;
  const [top] = Object.entries(k.by).sort((a, b) => b[1] - a[1] || tierOf(a[0]) - tierOf(b[0]));
  delete k.by[top[0]];
  const m = mazos().find(x => x.id === top[0]);
  if (m) {
    const act = todayMazos(), top = Math.max(m.tier, ...act.map(x => x.tier));
    mzSkip()[m.id] = dayKey();
    // cuanto más larga la racha, más grande el salto: 5 seguidas → el mazo siguiente; 10 → salta 1;
    // 15 → salta 3; 20 → salta 7… y desde 10 seguidas sube el "piso": los mazos más fáciles quedan para el final
    const jump = 2 ** (Math.floor(k.n / MZ_STREAK) - 1) - 1;
    const ahead = mzCandidates().filter(x => x.tier > top);
    const next = ahead[Math.min(jump, ahead.length - 1)];
    if (!next) { todayMazos(); return 'Esas ya las sabés: seguimos con los otros mazos de hoy'; }
    if (jump > 0) {
      S.mzFloor = next.tier;
      S.mzDay.ids = mzCandidates().filter(x => x.tier >= next.tier).slice(0, MZ_DAY).map(x => x.id);
      return `¡Vas muy bien! Subimos la dificultad: ahora ${next.name}`;
    }
    S.mzDay.ids = [...act.filter(x => x !== m).map(x => x.id), next.id];
    return `Esas ya las sabés: pasamos a ${next.name}`;
  }
  // en otros mazos: se deja descansar hoy y entra otro
  ((S.mzDay ??= { day: dayKey() }).rest ??= {})[top[0]] = dayKey();
  return `Esas ya las sabés: hoy seguimos con otro mazo`;
}
const resetStreak = () => { if (S.kstreak) S.kstreak = { n: 0, by: {} }; };

// Todas las tarjetas de una palabra (inglés→español y al revés, o las hermanas de una nota importada):
// "Ya la sé" las marca a todas, así la palabra no vuelve en ninguna dirección.
const siblings = cid => cid.startsWith('n:') ? [...cardIndex.keys()].filter(k => k.split(':')[1] === cid.split(':')[1]) : [cid.replace(/>[rp]$/, '') + '>r', cid.replace(/>[rp]$/, '') + '>p'];
// Como Anki, las fechas de repaso se corren un poco al azar (±15% hasta una semana, ±10% hasta 20 días, ±5% después),
// así las palabras que aprendiste el mismo día no vuelven todas juntas el mismo día. El "azar" sale del id de la tarjeta
// y de cuántas veces la respondiste: el botón muestra exactamente la fecha que después se guarda.
function fuzz(days, cid, reps) {
  if (days < 3) return days;
  const delta = Math.max(1, Math.round(days * (days < 7 ? 0.15 : days < 20 ? 0.1 : 0.05)));
  let h = 7;
  for (const ch of cid + '#' + reps) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.max(3, days - delta + Math.round(((h >>> 0) % 1001) / 1000 * 2 * delta));
}
// Palabras que se te olvidan una y otra vez ("sanguijuelas" en Anki): a los 5 olvidos en repaso, la app te avisa
// y te deja elegir entre seguir con ella o sacarla. c.lc = olvidos en repaso; c.leechAt = a cuántos vuelve a avisar.
const LEECH = 5;
const isLeech = c => !!c && (c.lc || 0) >= (c.leechAt || LEECH);

const OPT_DEFAULT = { newPerDay: 20, revPerDay: 200, steps: '1 10', relearn: '10', order: 'seq' };
function opts(did) {
  const o = { ...OPT_DEFAULT, ...S.deckOpts[did] };
  if (did === 'gday') o.newPerDay = S.settings.newPerDay;
  return o;
}
const dayLog = did => ((S.dlog[dayKey()] ??= {})[did] ??= { new: 0, rev: 0, extra: 0 });
const parseSteps = s => String(s).split(/[\s,]+/).map(x => { const m = x.match(/^(\d+(?:\.\d+)?)([smhd]?)$/); if (!m) return null;
  return +m[1] * ({ s: 1 / 60, m: 1, h: 60, d: 1440 }[m[2] || 'm']); }).filter(x => x > 0);

// tarjetas nuevas de un mazo, en orden
function newCards(did, max) {
  const out = [], today = dayKey();
  if (max <= 0) return out;
  const fromEntries = list => {
    for (const e of list) {
      if (out.length >= max) break;
      const r = e.id + '>r', p = e.id + '>p';
      if (S.susp[r] && S.susp[p]) continue;
      if (!S.cards[r]) { if (!S.susp[r] && S.bury[r] !== today) out.push(r); }
      else if (!S.cards[p] && S.cards[r].ok && studyDay(S.cards[r].last) !== today && !S.susp[p] && S.bury[p] !== today) out.push(p);
    }
  };
  if (did === 'gday') {
    // primero las que pediste practicar (boost); después los mazos de hoy, intercalados (una de cada uno);
    // si se terminan, los siguientes mazos en orden de dificultad, y al final los que saltaste
    const map = new Map(DECK.map(e => [e.id, e])), act = todayMazos();
    const order = [...S.boost.map(id => map.get(id)).filter(Boolean)];
    // intercalado entre lo que le queda a cada mazo (la dirección inglés→español nueva, o la español→inglés pendiente)
    // (con las mismas reglas que fromEntries: solo lo que puede salir hoy)
    const pend = e => { const r = e.id + '>r', p = e.id + '>p', cr = S.cards[r];
      return cr ? !S.cards[p] && cr.ok && studyDay(cr.last) !== today && !S.susp[p] && S.bury[p] !== today : !S.susp[r] && S.bury[r] !== today; };
    // la cola se recalcula después de cada tarjeta: se arranca por un mazo distinto según cuántas nuevas viste hoy,
    // si no, el primer mazo ganaría siempre
    const lists = act.map(m => m.ents.filter(pend)), dl = dayLog('gday'), sh = lists.length ? (dl.new + (dl.kn || 0)) % lists.length : 0;
    lists.push(...lists.splice(0, sh));
    for (let i = 0, more = true; more; i++) { more = false; for (const l of lists) if (i < l.length) { order.push(l[i]); more = true; } }
    const rest = mzCandidates().filter(m => !act.includes(m));
    order.push(...rest.flatMap(m => m.ents), ...mazos().filter(m => mzSkip()[m.id]).flatMap(m => m.ents));
    const seen = new Set();
    fromEntries(order.filter(e => !seen.has(e.id) && seen.add(e.id)));
  } else if (did === 'mine') fromEntries(S.custom);
  else if (did === 'aussie') fromEntries(AUSSIE);
  else {
    let list = COL.cards.filter(c => c[2] === did);
    if (opts(did).order === 'random') {
      let seed = [...today + did].reduce((a, ch) => a * 31 + ch.charCodeAt(0) | 0, 7);
      const rnd = () => ((seed = seed * 1103515245 + 12345 | 0) >>> 0) / 2 ** 32;
      list = list.map(c => [rnd(), c]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    }
    // tarjetas hermanas: si ya respondiste otra tarjeta de la misma nota hoy, esta espera a mañana
    const seenNotes = new Set();
    for (const [k, c] of Object.entries(S.cards)) if (k.startsWith('n:') && c.last && studyDay(c.last) === today) seenNotes.add(k.split(':')[1]);
    for (const [nid, ord] of list) {
      if (out.length >= max) break;
      const cid = `n:${nid}:${ord}`;
      if (S.cards[cid] || S.susp[cid] || S.bury[cid] === today || seenNotes.has(nid)) continue;
      seenNotes.add(nid);  // como Anki: una sola tarjeta nueva por nota por día
      out.push(cid);
    }
  }
  return out;
}

// cola de estudio: aprendiendo, para repasar y nuevas
function gather(did) {
  const now = Date.now(), today = dayKey(), set = deckSet(did);
  const learn = [], rev = {}, ahead = [];
  for (const [cid, c] of Object.entries(S.cards)) {
    const d = deckOf(cid);
    if (!d || !set.has(d) || S.susp[cid] || S.bury[cid] === today || !c.due) continue;
    if (c.step != null) (c.due <= now ? learn : ahead).push(cid);
    else if (c.due <= now) (rev[d] ??= []).push(cid);
  }
  const byDue = (a, b) => S.cards[a].due - S.cards[b].due;
  learn.sort(byDue); ahead.sort(byDue);
  const revList = [], fresh = [];
  const auto = S.settings.autoNew !== false;
  // con varios mazos agregados, las nuevas salen solo de algunos por día (rotan); los repasos, de todos
  const others = [...set].filter(d => d !== 'gday' && d !== 'mine');
  let newFrom = null;
  if (auto && did === 'all' && others.length > 1) {
    const k = others.length > 3 ? 2 : 1, rest = S.mzDay?.rest || {}, dn = dayNum();
    newFrom = new Set(['gday', 'mine']);
    for (let i = 0; i < others.length && newFrom.size < 2 + k; i++) {
      const d = others[(dn + i) % others.length];
      if (rest[d] !== today && newCards(d, 1).length) newFrom.add(d);
    }
  }
  for (const d of set) {
    const o = opts(d), dl = dayLog(d);
    revList.push(...(rev[d] || []).sort(byDue).slice(0, Math.max(0, o.revPerDay - dl.rev)));
    if (newFrom && !newFrom.has(d)) continue;
    // con el ajuste automático, el mazo de G'day no tiene un número fijo: manda el tiempo (ver autoNewLeft)
    fresh.push(...newCards(d, (auto && d === 'gday' ? 9999 : o.newPerDay) + dl.extra - dl.new));
  }
  revList.sort(byDue);
  // con el ajuste automático, las nuevas se reparten: 2 del mazo de G'day por cada 1 de los otros mazos,
  // así los mazos agregados por nivel también avanzan sin sumar tiempo al día
  if (auto && set.size > 1) {
    // se cuenta lo que ya respondiste hoy: la cola se recalcula después de cada tarjeta, y si no, la de los otros mazos
    // quedaba siempre tercera y nunca salía
    const main = fresh.filter(c => deckOf(c) === 'gday'), rest = fresh.filter(c => deckOf(c) !== 'gday');
    const seenToday = d => dayLog(d).new + (dayLog(d).kn || 0);  // kn: nuevas marcadas "Ya la sé"
    let m = seenToday('gday'), r = [...set].reduce((a, d) => a + (d === 'gday' ? 0 : seenToday(d)), 0);
    fresh.length = 0;
    while (main.length || rest.length) {
      if (main.length && (m < 2 * (r + 1) || !rest.length)) { fresh.push(main.shift()); m++; } else { fresh.push(rest.shift()); r++; }
    }
  }
  // "Estudiar 10 nuevas más" (dl.extra) se suma al límite automático
  const extra = [...set].reduce((a, d) => a + (dayLog(d).extra || 0), 0);
  return { learn, rev: revList, fresh: auto ? fresh.slice(0, autoNewLeft() + extra) : fresh, ahead };
}
// Tarjetas nuevas según tu tiempo (el método: no un número fijo de palabras, sino ~20 min de tarjetas por día).
// Una vez por día se calcula cuántas nuevas entran en los minutos de tarjetas, descontando los repasos que tocan hoy.
// Si los repasos crecen (la "bola de nieve"), entran menos nuevas; si sobran minutos, más.
function autoNewLeft() {
  const today = dayKey();
  if (S.dayPlan?.day !== today) {
    let due = 0;
    const now = Date.now();
    for (const [cid, c] of Object.entries(S.cards)) if (c.due && c.due <= now + 864e5 && !S.susp[cid] && deckOf(cid)) due++;
    const ans = S.pace?.ans || 9, budget = planFor().cards * 60;
    // un repaso lleva ~1,3 respuestas; una palabra nueva, ~3 (la primera vez y sus pasos de aprendizaje)
    const n = Math.floor((budget - due * 1.3 * ans) / (3 * ans));
    S.dayPlan = { day: today, newMax: Math.max(0, Math.min(40, n)), due };
  }
  const L = log(), left = S.dayPlan.newMax - (L.new || 0);
  if (left > 0) return left;
  // la cuenta es una estimación: si ya salieron todas pero todavía te quedan minutos de tarjetas hoy, siguen entrando de a una
  return (L.cardsSec || 0) < planFor().cards * 60 && (L.new || 0) < 80 ? 1 : 0;
}
export function counts(did = 'all') {
  const g = gather(did);
  return { learn: g.learn.length + g.ahead.filter(c => S.cards[c].due - Date.now() < 20 * MIN).length, rev: g.rev.length, fresh: g.fresh.length };
}

/* ---------- respuestas con pasos de aprendizaje ---------- */
function nextState(cid, g, now = Date.now()) {
  const prev = S.cards[cid], o = opts(deckOf(cid));
  const learning = !prev || prev.step != null, relearning = prev?.step != null && prev.lapses > 0 && prev.reps > 1;
  const steps = parseSteps(relearning ? o.relearn : o.steps);
  const f = schedule(prev && prev.reps ? prev : null, g, now);
  if (learning) {
    // como Anki: otra vez vuelve al primer paso, difícil repite el paso, bien avanza, fácil gradúa
    const cur = prev?.step ?? 0;
    // al salir de aprendizaje (rv: 0) la palabra vuelve mañana, pase lo que pase con FSRS (ver el calendario abajo)
    if (g === 4 || !steps.length) return { ...f, step: null, due: dayAt(1, now), days: 1, rv: 0 };
    // "Medio" (= bien): sale de aprendizaje y vuelve mañana, en vez de a los 10 minutos
    if (g === 3) return { ...f, step: null, due: dayAt(1, now), days: 1, rv: 0 };
    if (g === 1) return { ...f, step: 0, due: now + steps[0] * MIN, days: 0, mins: steps[0] };
    if (g === 2) {
      const mins = cur + 1 < steps.length ? (steps[cur] + steps[cur + 1]) / 2 : steps[cur] * 1.5;
      return { ...f, step: cur, due: now + mins * MIN, days: 0, mins };
    }
    const step = cur + 1;
    if (step >= steps.length) return { ...f, step: null, due: dayAt(1, now), days: 1, rv: 0 };
    return { ...f, step, due: now + steps[step] * MIN, days: 0, mins: steps[step] };
  }
  if (g === 1) {
    const rs = parseSteps(o.relearn);
    if (rs.length) return { ...f, step: 0, due: now + rs[0] * MIN, days: 0, mins: rs[0] };
    return { ...f, step: null, rv: 0 };
  }
  // Calendario de repasos: la aprendés el día D → la repasás D+1 → D+2 → después FSRS, nunca antes de 3 días más.
  // rv = repasos hechos desde que salió de aprendizaje. Las tarjetas de antes no lo tienen: se deduce de reps
  // (una nueva que pasó con "Medio" tiene reps 1), así nadie pierde ni repite lo que ya tenía.
  const rv = prev.rv ?? Math.max(0, (prev.reps || 1) - 1);
  if (rv < 1) return { ...f, step: null, due: dayAt(1, now), days: 1, rv: rv + 1 };
  const days = fuzz(Math.max(f.days, 3), cid, prev.reps || 0);
  return { ...f, step: null, due: dayAt(days, now), days, rv: rv + 1 };
}
const ivlLabel = st => st.step != null ? (st.mins < 60 ? `${Math.round(st.mins)} min` : st.mins < 1440 ? `${Math.round(st.mins / 60)} h` : `${Math.round(st.mins / 1440)} d`) : fmtDays(st.days);

function answer(cid, g, ms) {
  const prev = S.cards[cid], did = deckOf(cid), dl = dayLog(did), L = log();
  const wasNew = !prev, wasRev = prev && prev.step == null;
  const rl = revlogAdd(cid, g, ms);
  undoStack.push({ cid, prev: prev ? { ...prev } : null, did, day: dayKey(), wasNew, wasRev, rl, streak: S.kstreak && JSON.parse(JSON.stringify(S.kstreak)) });
  if (undoStack.length > 30) undoStack.shift();
  if (wasNew) resetStreak();
  if (wasNew) { dl.new++; L.new++; } else if (wasRev) { dl.rev++; L.rev++; }
  const st = nextState(cid, g);
  delete st.mins;
  const lc = (prev?.lc || 0) + (wasRev && g === 1 ? 1 : 0);
  if (lc) st.lc = lc;
  if (prev?.leechAt) st.leechAt = prev.leechAt;
  S.cards[cid] = st;
  save();
  return !isLeech(prev) && isLeech(st);
}
function undo() {
  const u = undoStack.pop();
  if (!u) return toast('No hay nada para deshacer');
  if (u.streak !== undefined) S.kstreak = u.streak;
  if (u.rl) revlogRemove(u.rl);
  if (u.known) {
    for (const [k, v] of Object.entries(u.susp)) if (v === undefined) delete S.susp[k]; else S.susp[k] = v;
    if (u.kn && u.day === dayKey()) dayLog(u.did).kn = Math.max(0, (dayLog(u.did).kn || 0) - 1);
    save(); A = { did: A.did, cid: u.cid, shown: false }; toast('Vuelve a aparecer'); return render();
  }
  if (u.prev) S.cards[u.cid] = u.prev; else delete S.cards[u.cid];
  if (u.day === dayKey()) {
    const dl = dayLog(u.did), L = log();
    if (u.wasNew) { dl.new = Math.max(0, dl.new - 1); L.new = Math.max(0, L.new - 1); }
    if (u.wasRev) { dl.rev = Math.max(0, dl.rev - 1); L.rev = Math.max(0, L.rev - 1); }
  }
  save();
  A = { did: A.did, cid: u.cid, shown: false };
  toast('Respuesta deshecha');
  render();
}

/* ---------- plantillas de Anki ---------- */
const strip = h => String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\[sound:[^\]]+\]/g, '').replace(/\s+/g, ' ').trim();
function cloze(text, n, side, only) {
  let found = [];
  const out = text.replace(/\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g, (m, k, ans, hint) => {
    if (+k !== n) return ans;
    found.push(ans);
    return side === 'q' ? `<span class="cloze">[${hint ? esc(hint) : '...'}]</span>` : `<span class="cloze">${ans}</span>`;
  });
  return only ? found.join(', ') : out;
}
function typeCompare(expected, typed) {
  if (!typed) return `<div class="typecmp">${esc(expected)}</div>`;
  const r = compare(expected, typed);
  return `<div class="typecmp"><div>${r.shown.map((w, i) => `<span class="${r.hit[i] ? 'ok' : 'miss'}">${esc(w)}</span>`).join(' ')}</div>
    <div class="you">Escribiste: ${esc(typed)}</div></div>`;
}
// como Anki: un campo con solo una imagen o un audio cuenta como lleno
const filled = v => !!strip(v) || /<img|\[sound:|<video|<audio/i.test(v || '');
function renderTpl(t, fields, ctx) {
  const val = name => name === 'Tags' ? ctx.tags.join(' ') : name === 'Deck' ? ctx.deck : name === 'Subdeck' ? ctx.deck.split('::').pop()
    : name === 'Card' ? ctx.card : name === 'Type' ? ctx.model : fields[name] ?? '';
  let prev;
  do {
    prev = t;
    t = t.replace(/\{\{([#^])\s*([^}]+?)\s*\}\}((?:(?!\{\{[#^])[\s\S])*?)\{\{\/\s*\2\s*\}\}/g,
      (m, k, name, inner) => ((k === '#') === filled(val(name.trim())) ? inner : ''));
  } while (t !== prev);
  return t.replace(/\{\{([^#^/{}][^{}]*?)\}\}/g, (m, key) => {
    key = key.trim();
    if (key === 'FrontSide') return ctx.front || '';
    const parts = key.split(':').map(x => x.trim()), name = parts.pop(), filters = parts;
    let v = val(name);
    if (filters.includes('type')) {
      const expected = filters.includes('cloze') ? strip(cloze(v, ctx.ord, 'a', true)) : strip(v);
      return ctx.side === 'q' ? '<input id="typeans" class="typeans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escribí la respuesta">'
        : typeCompare(expected, ctx.typed);
    }
    for (const f of filters.reverse()) {
      if (f === 'cloze') v = cloze(v, ctx.ord, ctx.side);
      else if (f === 'text') v = esc(strip(v));
      else if (f === 'hint') v = v ? `<details class="hint"><summary>Pista</summary>${v}</details>` : '';
    }
    return v;
  });
}
function noteCard(cid, typed) {
  const { nid, ord, did } = cardIndex.get(cid), n = COL.notes[nid], m = COL.models[n?.mid];
  if (!n || !m) return null;
  const fields = Object.fromEntries(m.fields.map((k, i) => [k, n.flds[i] ?? '']));
  const t = m.kind === 'cloze' ? m.tmpls[0] : m.tmpls[ord] || m.tmpls[0];
  const ctx = { ord: ord + 1, tags: n.tags || [], deck: deckName(did), card: t.name, model: m.name, typed };
  const q = renderTpl(t.q, fields, { ...ctx, side: 'q' });
  const a = renderTpl(t.a, fields, { ...ctx, side: 'a', front: q.replace(/<input id="typeans"[^>]*>/, '') });
  return { q, a, css: m.css || '', note: n, model: m };
}
const sounds = html => [...String(html).matchAll(/\[sound:([^\]]+)\]/g)].map(x => x[1]);
const withAudio = html => String(html).replace(/\[sound:([^\]]+)\]/g, (m, f) => `<audio controls preload="none" src="${esc(f)}"></audio>`);
const playSound = f => new Audio('/api/media/' + encodeURIComponent(f)).play().catch(() => {});

function frameDoc(html, css) {
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/api/media/">
<style>html,body{margin:0;padding:0;background:transparent}.card{padding:22px 18px;border-radius:16px;min-height:40px;overflow-wrap:anywhere}
img{max-width:100%;height:auto}audio{max-width:100%;margin:6px 0}.typeans{font-size:20px;padding:10px;width:85%;margin-top:12px;border-radius:10px;border:1px solid #999}
.typecmp{font-size:20px;margin-top:10px}.typecmp .ok{color:#16a34a}.typecmp .miss{color:#dc2626;text-decoration:underline}.typecmp .you{font-size:14px;opacity:.7;margin-top:4px}
details.hint{cursor:pointer;margin-top:8px}${css}</style></head><body><div class="card">${withAudio(html)}</div></body></html>`;
}
function mountFrames() {
  document.querySelectorAll('iframe.cardframe[data-k]').forEach(el => {
    const data = frames[el.dataset.k];
    if (!data) return;
    el.srcdoc = frameDoc(data.html, data.css);
    el.onload = () => {
      const d = el.contentDocument; if (!d) return;
      const fit = () => { el.style.height = d.documentElement.scrollHeight + 'px'; };
      fit();
      d.querySelectorAll('img').forEach(i => i.addEventListener('load', fit));
      new ResizeObserver(fit).observe(d.body);
      d.addEventListener('keydown', onKey);
      const inp = d.getElementById('typeans');
      if (inp) { inp.focus(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); show(); } }); }
    };
  });
}
let frames = {};
const frameTag = (k, html, css) => { frames[k] = { html, css }; return `<iframe class="cardframe" sandbox="allow-same-origin" data-k="${k}" title="Tarjeta"></iframe>`; };

/* ---------- pantalla: lista de mazos ---------- */
function decksView() {
  const list = deckList(), total = counts('all');
  const num = c => `<span class="cnt"><b class="cn">${c.fresh}</b><b class="cl">${c.learn}</b><b class="cr">${c.rev}</b></span>`;
  return `<header class="top"><h2>Tarjetas</h2><a class="link" href="#browse">Explorar</a></header>
    <a class="btn primary big" href="#study/all">Estudiar todo · ${total.fresh + total.learn + total.rev}</a>
    <div class="legend"><span><i class="cn"></i>nuevas</span><span><i class="cl"></i>aprendiendo</span><span><i class="cr"></i>para repasar</span></div>
    <ul class="decks">${list.map(d => {
      // si el mazo padre existe se muestra con sangría; si no, con el nombre completo
      const parts = d.name.split('::'), parent = parts.slice(0, -1).join('::');
      const nested = parent && list.some(x => x.name === parent);
      const depth = nested ? parts.length - 1 : 0, label = nested ? parts.at(-1) : d.name.replace(/::/g, ' › ');
      return `<li style="padding-left:${14 + depth * 18}px"><a href="#study/${encodeURIComponent(d.id)}" class="dname">${esc(label)}</a>
        ${num(counts(d.id))}<a class="gear" href="#deckopts/${encodeURIComponent(d.id)}" title="Opciones del mazo">⋯</a></li>`;
    }).join('')}</ul>
    <a class="btn ghost big" href="#known">Palabras que ya sabés · ${knownList().length}</a>
    ${mazosBox()}
    <div class="grid2">
      <a class="btn ghost" href="#add">Agregar tarjeta</a>
      <button class="btn ghost" data-a="adeck">Crear mazo</button>
      <a class="btn ghost" href="#import">Importar mazo</a>
      <a class="btn ghost" href="#shop">Tienda de mazos</a>
    </div>
    ${needServer()}`;
}

// los mazos de G'day: cuáles entran hoy y cómo vas en cada uno
function mazosBox() {
  const act = todayMazos(), skip = mzSkip();
  const st = m => { const left = mzLeft(m); return act.includes(m) ? 'hoy' : skip[m.id] ? 'ya lo sabías' : !left ? 'completo' : m.tier < (S.mzFloor || 0) ? 'para después' : left < m.ents.length ? `${m.ents.length - left}/${m.ents.length}` : ''; };
  return `<details class="card left mazos"><summary><b>Mazos de G'day de hoy:</b> ${act.map(m => esc(m.name)).join(' · ') || 'todos completos'}</summary>
    <p class="muted">El mazo de G'day está dividido en ${mazos().length} mazos de ${MZ_SIZE} palabras, de más fácil a más difícil. Cada día entran ${MZ_DAY} y van rotando.
    Si marcás “Ya la sé” ${MZ_STREAK} veces seguidas en palabras nuevas, se salta el mazo donde más las marcaste y entra uno más difícil;
    si seguís marcando, los saltos son cada vez más grandes.</p>
    <ul class="list">${mazos().map(m => `<li class="${act.includes(m) ? 'on' : ''}"><b>${esc(m.name)}</b> <span class="muted">${esc(m.ents.slice(0, 3).map(e => e.en).join(', '))}…</span> <span class="meta">${st(m)}</span></li>`).join('')}</ul>
  </details>`;
}

/* ---------- tu fórmula personal (optimizador de FSRS) ---------- */
// Con tu historial de respuestas (revlog.js) se recalculan los 21 números de FSRS para que predigan cómo recordás vos.
// Corre en tu navegador: nada sale de tu compu o de tu Drive. Se hace sola una vez por mes (o si tu historial creció
// mucho), desde los 400 repasos. Solo se usa si predice mejor que la de fábrica.
const OPT_MIN = 400;
let optBusy = false;
const optData = () => { const seqs = sequences(revlogAll(), dayNo); return { seqs, n: usable(seqs) }; };
async function runOptimize(manual) {
  if (optBusy) return;
  await revlogReady();
  const { seqs, n } = optData();
  if (n < OPT_MIN) { if (manual) toast(`Hacen falta ${OPT_MIN} repasos y llevás ${n}`); return; }
  optBusy = true; if (location.hash === '#settings') render();
  try {
    const r = await optimize(seqs, W6, { onStep: p => { const el = document.getElementById('optpct'); if (el) el.textContent = Math.round(p * 100); } });
    const better = r.after < r.before * 0.995;
    S.fsrs = { w: better ? r.w : null, at: Date.now(), n, before: r.before, after: r.after };
    save();
    if (manual) toast(better ? 'Listo: ya se usa tu fórmula personal' : 'Recordás parecido al promedio: sigue la fórmula de fábrica');
  } catch { if (manual) toast('No se pudo calcular. Probá de nuevo más tarde'); }
  optBusy = false;
  if (location.hash === '#settings') render();
}
setTimeout(() => revlogReady().then(() => {
  const f = S.fsrs;
  if (f?.off || document.hidden) return;
  const { n } = optData();
  if (n >= OPT_MIN && (!f || Date.now() - f.at > 30 * 864e5 || n > (f.n || 0) * 1.5)) runOptimize(false);
}), 30e3);
export function fsrsBox() {
  const f = S.fsrs, { n } = optData(), pct = f?.w ? Math.round((1 - f.after / f.before) * 100) : 0;
  return `<div class="card left"><small>Cuándo vuelve cada palabra</small>
    <p>${f?.w ? `Se usa <b>tu fórmula personal</b>, calculada el ${new Date(f.at).toLocaleDateString('es-AR')} con ${f.n} repasos. Predice si te vas a acordar un ${pct}% mejor que la de fábrica.`
      : 'Se usa la fórmula de fábrica de FSRS-6 (la de Anki): el promedio de muchísimos estudiantes.'}</p>
    <p class="muted">Con tus repasos, G'day ajusta la fórmula a cómo recordás vos; se recalcula sola una vez por mes.
      ${n < OPT_MIN ? `Hacen falta ${OPT_MIN} repasos y llevás ${n}.` : ''} Tu historial: ${revlogAll().length} respuestas, guardadas en este navegador y, si iniciaste sesión, en tu Google Drive.</p>
    <div class="row wrap"><button class="btn ghost sm" data-a="aoptimize" ${n < OPT_MIN || optBusy ? 'disabled' : ''}>${optBusy ? 'Calculando… <span id="optpct">0</span>%' : 'Recalcular ahora'}</button>
    ${f?.w ? '<button class="btn ghost sm" data-a="afsrsreset">Volver a la de fábrica</button>' : ''}</div></div>`;
}

/* ---------- pantalla: palabras que ya sabés ---------- */
// Las que marcaste "Ya la sé" y las que FSRS da por sabidas (las recordás por 3 semanas o más), una por palabra.
function knownList() {
  const out = new Map();
  for (const cid of new Set([...Object.keys(S.susp), ...Object.keys(S.cards)])) {
    const c = S.cards[cid], how = S.susp[cid] === 'known' ? 'ya' : !S.susp[cid] && c && c.step == null && c.s >= 21 ? 'fsrs' : null;
    if (!how) continue;
    const key = cid.startsWith('n:') ? 'n:' + cid.split(':')[1] : cid.replace(/>[rp]$/, '');
    if (out.has(key) && out.get(key).how === 'ya') continue;
    let en, es;
    if (cid.startsWith('n:')) { if (!cardIndex.has(cid)) continue; const n = COL.notes[cid.split(':')[1]]; en = strip(n?.flds?.[0]); es = strip(n?.flds?.[1]); }
    else { const e = entryOf(key); if (!e) continue; en = e.en; es = e.es; }
    out.set(key, { key, cid, en, es, how, deck: deckName(deckOf(cid) || cardIndex.get(cid)?.did), mz: deckOf(cid) === 'gday' ? mazoOf(cid)?.name : '' });
  }
  return [...out.values()].sort((a, b) => a.en.localeCompare(b.en));
}
function knownView() {
  const all = knownList(), q = (A.kq || '').toLowerCase().trim();
  const list = q ? all.filter(w => (w.en + ' ' + w.es).toLowerCase().includes(q)) : all;
  return `<header class="top"><h2>Palabras que ya sabés</h2><a class="link" href="#cards">Volver</a></header>
    <p class="muted">${all.length} ${all.length === 1 ? 'palabra' : 'palabras'}. Son las que marcaste “Ya la sé” (no vuelven a las tarjetas) y las que repasaste tanto que las recordás por semanas.
    Si alguna se te olvidó, tocá “Volver a estudiar”.</p>
    <input id="kq" class="search" placeholder="Buscar en inglés o en español" value="${esc(A.kq || '')}" autocomplete="off">
    ${list.length ? `<ul class="list browse">${list.slice(0, 300).map(w => `<li><div class="grow" data-a="say" data-t="${esc(w.en)}"><b>${esc(w.en)}</b><span>${esc(w.es)}</span>
      <span class="meta">${w.how === 'ya' ? 'Ya la sé' : 'Aprendida con repasos'} · ${esc(w.mz || w.deck)}</span></div>
      <div class="col"><button class="link" data-a="arelearn" data-cid="${esc(w.cid)}">Volver a estudiar</button></div></li>`).join('')}</ul>
      ${list.length > 300 ? `<p class="muted">Se muestran 300 de ${list.length}. Buscá para encontrar las demás.</p>` : ''}`
    : `<div class="empty"><b>${q ? 'No encontré esa palabra' : 'Todavía no hay palabras acá'}</b><p class="muted">${q ? 'Probá con otra.' : 'Cuando marques “Ya la sé” en una tarjeta, aparece en esta lista.'}</p></div>`}`;
}

/* ---------- pantalla: estudio ---------- */
function pickCard(did) {
  const g = gather(did);
  return g.learn[0] || g.rev[0] || g.fresh[0] || (A.ahead && g.ahead[0]) || null;
}
function builtinCard(cid, shown) {
  const e = entryOf(cid.slice(0, -2)), prod = cid.endsWith('>p');
  if (!e) return '<p class="muted">Esta tarjeta ya no existe.</p>';
  const co = S.settings.cards || {};
  if (co.autoAudio !== false && !prod && !A.spoke) { A.spoke = true; say(e.en); }
  if (co.autoAudio !== false && prod && shown && !A.spoke) { A.spoke = true; say(e.en); }
  const key = e.en.replace(/^to /, '').replace(/[?.…]/g, '');
  const ex = e.ex ? esc(e.ex).replace(new RegExp(esc(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), m => `<b>${m}</b>`) : '';
  const front = prod
    ? `<small>Decilo en inglés</small><div class="word">${esc(e.es)}</div>
       ${canHear() && !shown && co.voiceAnswer !== false ? `<button class="btn ghost ${A.listening ? 'rec' : ''}" data-a="amic">${A.listening ? 'Escuchando… (tocá para terminar)' : 'Responder hablando'}</button>` : ''}
       ${A.heard != null ? `<p class="heard ${A.heardOk ? 'ok' : 'miss'}">Dijiste: “${esc(A.heard || '…')}”</p>` : ''}`
    : `<small>${cid.startsWith('au-') ? 'Australiano' : '¿Qué significa?'}</small><div class="word">${esc(e.en)}</div>
       <button class="btn ghost" data-a="say" data-t="${esc(e.en)}">Escuchar</button>`;
  const back = !shown ? '' : `<hr><div class="answer">${esc(prod ? e.en : e.es)}</div>
    ${prod ? `<button class="btn ghost" data-a="say" data-t="${esc(e.en)}">Escuchar</button>` : ''}
    ${ex && co.showExample !== false ? `<p class="ex" data-a="say" data-t="${esc(e.ex)}">${ex}</p><p class="exes">${esc(e.exEs)}</p>` : ''}`;
  return `<div class="card">${front}${back}</div>`;
}
// Con la voz natural, cada frase tarda unos segundos en generarse la primera vez: mientras mirás esta tarjeta,
// se preparan de fondo la frase de ejemplo y las próximas tarjetas, así suenan al instante.
let prefetchedFor = null;
function prefetchUpcoming(did, cid) {
  if (prefetchedFor === cid) return;
  prefetchedFor = cid;
  const cur = cid.startsWith('n:') ? null : entryOf(cid.slice(0, -2));
  const g = gather(did), next = [...g.learn, ...g.rev, ...g.fresh].filter(c => c !== cid && !c.startsWith('n:')).slice(0, 3);
  for (const c of next) { const e = entryOf(c.slice(0, -2)); if (e) sayNext(e.en); }
  if (cur?.ex) sayNext(cur.ex);
}
function studyView() {
  const did = routeArg() || 'all', session = getSession();
  if (A.did !== did) A = { did };
  frames = {};
  if (!A.cid || (!S.cards[A.cid] && A.answered)) {
    A.cid = pickCard(did); A.shown = false; A.spoke = false; A.heard = null; A.typed = ''; A.answered = false; A.t0 = Date.now();
  }
  const c = counts(did);
  const head = `${sessBanner()}<header class="top"><a class="link" href="#cards">← Mazos</a>
    <span class="cnt big"><b class="cn ${A.cid && !S.cards[A.cid] ? 'cur' : ''}">${c.fresh}</b><b class="cl">${c.learn}</b><b class="cr">${c.rev}</b></span></header>
    <p class="muted center">${esc(did === 'all' ? 'Todos los mazos' : deckName(did))}${A.cid && deckOf(A.cid) === 'gday' && mazoOf(A.cid) ? ' · ' + esc(mazoOf(A.cid).name) : ''}</p>`;
  if (!A.cid) {
    if (session) { setTimeout(nextStep); return ''; }
    const g = gather(did);
    if (g.ahead.length) {
      const mins = Math.max(1, Math.ceil((S.cards[g.ahead[0]].due - Date.now()) / MIN));
      return `${head}<div class="empty"><b>Casi listo</b><p class="muted">Te quedan tarjetas en aprendizaje. La próxima vuelve en ${mins} min.</p>
        <button class="btn primary" data-a="aahead">Estudiarlas ahora</button><a class="btn ghost" href="#cards">Volver a los mazos</a></div>`;
    }
    return `${head}<div class="empty"><b>¡Listo por hoy!</b><p class="muted">No quedan tarjetas en este mazo.</p>
      ${did !== 'all' ? '<button class="btn primary" data-a="amore">Estudiar 10 nuevas más</button>' : ''}
      <a class="btn ghost" href="#cards">Volver a los mazos</a></div>`;
  }
  const cid = A.cid, isNote = cid.startsWith('n:');
  prefetchUpcoming(did, cid);
  let body;
  if (isNote) {
    const nc = noteCard(cid, A.typed);
    if (!nc) { A.cid = null; setTimeout(render); return head; }
    if (!A.played) { A.played = true; const s = sounds(nc.q); if (s.length) playSound(s[0]); }
    if (A.shown && !A.playedA) { A.playedA = true; const qs = new Set(sounds(nc.q)); const s = sounds(nc.a).filter(x => !qs.has(x)); if (s.length) playSound(s[0]); }
    body = frameTag('study', A.shown ? nc.a : nc.q, nc.css);
  } else body = builtinCard(cid, A.shown);
  const flag = S.flags[cid];
  // tres botones: Difícil (= "otra vez" de Anki: vuelve pronto), Medio (= "bien": nueva o en aprendizaje vuelve mañana; después, cada vez más lejos) y "Ya la sé" (no vuelve nunca)
  const grades = [['Difícil', 1, 'g1'], ['Medio', 3, 'g3']].map(([t, g, k]) =>
    `<button class="g ${k}" data-a="agrade" data-g="${g}"><b>${t}</b><span>${ivlLabel(nextState(cid, g))}</span></button>`).join('')
    + '<button class="g g4" data-a="aknown"><b>Ya la sé</b><span>no mostrar más</span></button>';
  const lc = S.cards[cid]?.lc;
  const leech = !isLeech(S.cards[cid]) ? '' : `<div class="tip leech"><b>Esta palabra se te olvidó ${lc} veces.</b>
    Suele pasar con palabras que se parecen a otra o que todavía no usás. Probá decirla en voz alta dentro de la frase de ejemplo,
    o armá tu propia frase con ella. ¿Qué hacemos?
    <div class="row wrap"><button class="btn ghost sm" data-a="aleechkeep">Seguir practicándola</button>
    <button class="btn ghost sm" data-a="asusp">Sacarla de las tarjetas</button>
    ${isNote || cid.startsWith('c-') ? `<a class="btn ghost sm" href="#edit/${encodeURIComponent(cid)}">Editarla</a>` : ''}</div></div>`;
  return `${head}${leech}
    <div class="studycard ${flag ? 'flag' + flag : ''}">${body}</div>
    ${A.shown ? `<div class="grades">${grades}</div>` : '<button class="btn primary big" data-a="ashow">Mostrar respuesta</button>'}
    <div class="tools">
      <button data-a="aundo" title="Deshacer (Ctrl+Z)">Deshacer</button>
      ${isNote || cid.startsWith('c-') ? `<a href="#edit/${encodeURIComponent(cid)}" title="Editar (E)">Editar</a>` : ''}
      <button data-a="abury" title="Enterrar hasta mañana (-)">Enterrar</button>
      <button data-a="asusp" title="Suspender (@)">Suspender</button>
      <select data-flag="${esc(cid)}" title="Bandera">${['Sin bandera', 'Roja', 'Naranja', 'Verde', 'Azul'].map((f, i) => `<option value="${i}" ${(flag || 0) === i ? 'selected' : ''}>${f}</option>`).join('')}</select>
    </div>
    ${S.settings.cards?.keyHints !== false ? '<p class="hint keys">Teclas: espacio muestra · 1 difícil · 2 medio · 3 ya la sé · Ctrl+Z deshace · - entierra · @ suspende · E edita</p>' : ''}`;
}
studyView.after = mountFrames;

function show() {
  if (A.shown || !A.cid) return;
  const f = document.querySelector('iframe.cardframe');
  A.typed = f?.contentDocument?.getElementById('typeans')?.value || '';
  A.shown = true; render();
}
function grade(g) {
  if (!A.shown || !A.cid) return;
  // ritmo: segundos por respuesta (promedio móvil), para calcular cuántas tarjetas nuevas entran en tu tiempo
  if (A.t0) { const dt = Math.min(60, Math.max(2, (Date.now() - A.t0) / 1000)); S.pace = { ans: (S.pace?.ans || 9) * 0.9 + dt * 0.1 }; }
  if (answer(A.cid, g, A.t0 ? Date.now() - A.t0 : 0)) toast('Esta palabra ya se te olvidó 5 veces: la próxima vez que aparezca te propongo qué hacer');
  afterAnswer();
  A = { did: A.did, ahead: A.ahead };
  if (stepDone()) return nextStep();
  render();
}
function onKey(e) {
  const r = location.hash.split('/')[0];
  if (r !== '#study') return;
  const tag = (e.target.tagName || '').toLowerCase();
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); return undo(); }
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ((e.key === ' ' || e.key === 'Enter') && !A.shown) { e.preventDefault(); return show(); }
  if (A.shown && e.key === '1') return grade(1);
  if (A.shown && e.key === '2') return grade(3);
  if (A.shown && e.key === '3') return ankiActions.aknown();
  if ((e.key === ' ' || e.key === 'Enter') && A.shown) { e.preventDefault(); return grade(3); }
  if (e.key === '-') return ankiActions.abury();
  if (e.key === '@') return ankiActions.asusp();
  if (e.key === 'e' && A.cid && (A.cid.startsWith('n:') || A.cid.startsWith('c-'))) location.hash = 'edit/' + encodeURIComponent(A.cid);
  if (e.key === 'r' && A.cid) { const e2 = A.cid.startsWith('n:') ? null : entryOf(A.cid.slice(0, -2)); if (e2) say(e2.en); }
}
document.addEventListener('keydown', onKey);

/* ---------- pantalla: opciones del mazo ---------- */
function deckOptsView() {
  const did = routeArg(), o = opts(did), builtin = !!BUILTIN[did];
  if (!BUILTIN[did] && !COL.decks[did]) return `<header class="top"><h2>Mazo</h2><a class="link" href="#cards">Volver</a></header><p class="muted">Ese mazo no existe.</p>`;
  const nCards = did === 'gday' ? DECK.length * 2 : did === 'mine' ? S.custom.length * 2 : did === 'aussie' ? AUSSIE.length * 2 : COL.cards.filter(c => c[2] === did).length;
  return `<header class="top"><h2>${esc(deckName(did))}</h2><a class="link" href="#cards">Volver</a></header>
    <p class="muted">${nCards} tarjetas</p>
    <form data-form="deckopts" class="add">
      ${builtin ? '' : `<label class="field"><span>Nombre (usá :: para submazos, por ejemplo Inglés::Verbos)</span><input name="name" value="${esc(deckName(did))}"></label>`}
      <label class="field"><span>Tarjetas nuevas por día</span><input type="number" name="newPerDay" min="0" max="9999" value="${o.newPerDay}"></label>
      <label class="field"><span>Máximo de repasos por día</span><input type="number" name="revPerDay" min="0" max="9999" value="${o.revPerDay}"></label>
      <label class="field"><span>Pasos de aprendizaje (minutos, separados por espacio; también 1h o 1d)</span><input name="steps" value="${esc(o.steps)}"></label>
      <label class="field"><span>Pasos al olvidar una tarjeta</span><input name="relearn" value="${esc(o.relearn)}"></label>
      ${builtin ? '' : `<label class="field"><span>Orden de las nuevas</span><select name="order"><option value="seq" ${o.order === 'seq' ? 'selected' : ''}>En el orden del mazo</option><option value="random" ${o.order === 'random' ? 'selected' : ''}>Al azar</option></select></label>`}
      <button class="btn primary">Guardar opciones</button>
    </form>
    <div class="grid2">
      <a class="btn ghost" href="#browse/${encodeURIComponent(`deck:"${deckName(did)}"`)}">Ver sus tarjetas</a>
      <button class="btn ghost" data-a="aexport" data-did="${esc(did)}">Exportar (.txt)</button>
      ${did === 'aussie' ? '<button class="btn ghost" data-a="ahideaussie">Quitar de mis mazos</button>' : ''}
      ${builtin ? '' : `<button class="btn danger" data-a="adeldeck" data-did="${esc(did)}">Borrar mazo</button>`}
    </div>`;
}

/* ---------- pantalla: agregar tarjeta ---------- */
function addView() {
  const decks = deckList().filter(d => d.id === 'mine' || !d.builtin);
  if (!decks.some(d => d.id === 'mine')) decks.unshift({ id: 'mine', name: BUILTIN.mine });
  A.add ??= { did: S.lastAddDeck && decks.some(d => d.id === S.lastAddDeck) ? S.lastAddDeck : 'mine', mid: 'basicrev' };
  const did = A.add.did, simple = did === 'mine';
  const models = Object.entries(COL.models);
  const m = COL.models[A.add.mid] || COL.models.basicrev;
  return `<header class="top"><h2>Agregar tarjeta</h2><a class="link" href="#cards">Volver</a></header>
    <label class="field"><span>Mazo</span><select id="adddeck">${decks.map(d => `<option value="${esc(d.id)}" ${d.id === did ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
    ${simple ? `<form class="add" data-form="addmine">
        <input name="en" placeholder="Palabra o frase en inglés" required autocomplete="off">
        <input name="es" placeholder="Traducción" required autocomplete="off">
        <input name="ex" placeholder="Frase de ejemplo (opcional)" autocomplete="off">
        <p class="muted">En “Mis tarjetas” cada palabra se estudia en los dos sentidos, con audio y respuesta hablada.</p>
        <button class="btn primary">Agregar</button></form>`
    : `<label class="field"><span>Tipo de nota</span><select id="addmodel">${models.map(([id, x]) => `<option value="${esc(id)}" ${id === A.add.mid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <form class="add" data-form="addnote">
        ${m.fields.map((f, i) => `<label class="field"><span>${esc(f)}</span><textarea name="f${i}" rows="2" data-fld="${i}"></textarea></label>`).join('')}
        ${m.kind === 'cloze' ? '<button type="button" class="btn ghost" data-a="acloze">Marcar hueco en el texto seleccionado [...]</button><p class="muted">Ejemplo: I {{c1::ran}} home. Cada número distinto crea otra tarjeta.</p>' : ''}
        <label class="field"><span>Etiquetas (separadas por espacio)</span><input name="tags" autocomplete="off"></label>
        <button class="btn primary">Agregar</button></form>`}
    ${needServer()}`;
}

/* ---------- pantalla: editar ---------- */
function editView() {
  const cid = routeArg();
  if (cid.startsWith('c-')) {
    const e = entryOf(cid.slice(0, -2));
    if (!e) return '<p class="muted">Esa tarjeta ya no existe.</p>';
    return `<header class="top"><h2>Editar</h2><button class="link" data-a="aback">Volver</button></header>
      <form class="add" data-form="editmine" data-id="${esc(e.id)}">
        <label class="field"><span>Inglés</span><input name="en" value="${esc(e.en)}"></label>
        <label class="field"><span>Español</span><input name="es" value="${esc(e.es)}"></label>
        <label class="field"><span>Ejemplo</span><input name="ex" value="${esc(e.ex)}"></label>
        <label class="field"><span>Traducción del ejemplo</span><input name="exEs" value="${esc(e.exEs)}"></label>
        <button class="btn primary">Guardar</button></form>
      <button class="btn danger" data-a="adelmine" data-id="${esc(e.id)}">Borrar tarjeta</button>`;
  }
  const info = cardIndex.get(cid), n = info && COL.notes[info.nid], m = n && COL.models[n.mid];
  if (!m) return `<header class="top"><h2>Editar</h2><button class="link" data-a="aback">Volver</button></header><p class="muted">Esa tarjeta no se puede editar.</p>`;
  return `<header class="top"><h2>Editar nota</h2><button class="link" data-a="aback">Volver</button></header>
    <p class="muted">${esc(m.name)} · ${esc(deckName(info.did))}</p>
    <form class="add" data-form="editnote" data-nid="${esc(info.nid)}">
      ${m.fields.map((f, i) => `<label class="field"><span>${esc(f)}</span><textarea name="f${i}" rows="3">${esc(n.flds[i] || '')}</textarea></label>`).join('')}
      <label class="field"><span>Etiquetas</span><input name="tags" value="${esc((n.tags || []).join(' '))}"></label>
      <button class="btn primary">Guardar</button></form>
    <button class="btn danger" data-a="adelnote" data-nid="${esc(info.nid)}">Borrar nota y sus tarjetas</button>`;
}

/* ---------- pantalla: explorador ---------- */
function allCards() {
  const out = [];
  const add = (list, did) => { for (const e of list) for (const dir of ['r', 'p']) out.push({ cid: `${e.id}>${dir}`, did, q: dir === 'r' ? e.en : e.es, a: dir === 'r' ? e.es : e.en, text: `${e.en} ${e.es} ${e.ex || ''}`, tags: [] }); };
  add(DECK, 'gday'); add(S.custom, 'mine'); if (S.settings.aussie) add(AUSSIE, 'aussie');
  for (const [nid, ord, did] of COL.cards) {
    const n = COL.notes[nid]; if (!n) continue;
    const cid = `n:${nid}:${ord}`, m = COL.models[n.mid];
    const q = m?.kind === 'cloze' ? strip(cloze(n.flds[0] || '', ord + 1, 'q')) : strip(n.flds[0]);
    out.push({ cid, did, q, a: strip(n.flds[1]), text: strip(n.flds.join(' ')), tags: n.tags || [] });
  }
  return out;
}
function search(q) {
  const toks = [...q.matchAll(/(-?)(\w+):("[^"]*"|\S+)|(-?)"([^"]*)"|(-?)(\S+)/g)];
  const now = Date.now(), today = dayKey();
  const tests = toks.map(t => {
    if (t[2]) {
      const neg = !!t[1], key = t[2].toLowerCase(), v = t[3].replace(/^"|"$/g, '').toLowerCase();
      let fn;
      if (key === 'deck') fn = c => { const n = deckName(c.did).toLowerCase(); return n === v || n.startsWith(v + '::') || (v.endsWith('*') && n.startsWith(v.slice(0, -1))); };
      else if (key === 'tag') fn = c => c.tags.some(x => x.toLowerCase() === v || x.toLowerCase().startsWith(v + '::'));
      else if (key === 'is') fn = c => { const st = S.cards[c.cid]; return v === 'new' ? !st : v === 'due' ? st && st.due <= now : v === 'learn' ? st?.step != null
        : v === 'review' ? st && st.step == null : v === 'suspended' ? !!S.susp[c.cid] : v === 'known' ? S.susp[c.cid] === 'known' : v === 'buried' ? S.bury[c.cid] === today : v === 'leech' ? isLeech(S.cards[c.cid]) : false; };
      else if (key === 'flag') fn = c => (S.flags[c.cid] || 0) === +v;
      else fn = c => c.text.toLowerCase().includes(`${key}:${v}`);
      return neg ? c => !fn(c) : fn;
    }
    const neg = !!(t[4] || t[6]), v = (t[5] ?? t[7]).toLowerCase();
    return neg ? c => !c.text.toLowerCase().includes(v) : c => c.text.toLowerCase().includes(v);
  });
  return allCards().filter(c => tests.every(f => f(c)));
}
function browseView() {
  if (A.q == null) A.q = routeArg() || '';
  const res = search(A.q), shown = res.slice(0, 200);
  // para las notas importadas se muestra la pregunta y respuesta reales de cada tarjeta
  for (const c of shown) if (c.cid.startsWith('n:')) {
    const nc = noteCard(c.cid);
    if (nc) { c.q = strip(nc.q.replace(/<input[^>]*>/g, '')); c.a = strip(nc.a).replace(c.q, '').trim() || c.a; }
  }
  const status = c => { const st = S.cards[c.cid]; return S.susp[c.cid] === 'known' ? 'ya la sé' : S.susp[c.cid] ? 'suspendida' : !st ? 'nueva' : st.step != null ? 'aprendiendo' : st.due <= Date.now() ? 'para hoy' : `en ${fmtDays(Math.max(1, Math.round((st.due - Date.now()) / 864e5)))}`; };
  return `<header class="top"><h2>Explorar</h2><a class="link" href="#cards">Volver</a></header>
    <input id="bq" class="search" placeholder='Buscar… (ej: apple, deck:"Mis tarjetas", tag:verbos, is:due, is:new, is:suspended, flag:1)' value="${esc(A.q)}" autocomplete="off">
    <p class="muted">${res.length} tarjetas${res.length > 200 ? ' · se muestran 200' : ''}</p>
    ${res.length ? `<div class="row wrap"><button class="btn ghost sm" data-a="absusp" data-v="1">Suspender todas</button><button class="btn ghost sm" data-a="absusp" data-v="0">Reactivar todas</button>
      <button class="btn ghost sm" data-a="abforget">Olvidar progreso</button></div>` : ''}
    <ul class="list browse">${shown.map(c => `<li class="${S.susp[c.cid] ? 'susp' : ''} ${S.flags[c.cid] ? 'flag' + S.flags[c.cid] : ''}">
      <div class="grow"><b>${esc(c.q.slice(0, 90))}</b><span>${esc(c.a.slice(0, 90))}</span><span class="meta">${esc(deckName(c.did))} · ${status(c)}${c.tags.length ? ' · ' + esc(c.tags.join(' ')) : ''}</span></div>
      <div class="col"><a class="link" href="#preview/${encodeURIComponent(c.cid)}">Ver</a>${c.cid.startsWith('n:') || c.cid.startsWith('c-') ? `<a class="link" href="#edit/${encodeURIComponent(c.cid)}">Editar</a>` : ''}
        <button class="link" data-a="atogsusp" data-cid="${esc(c.cid)}">${S.susp[c.cid] ? 'Reactivar' : 'Suspender'}</button></div></li>`).join('')}</ul>`;
}

/* ---------- pantalla: vista previa ---------- */
function previewView() {
  const cid = routeArg();
  if (A.pcid !== cid) A = { pcid: cid };
  frames = {};
  let body;
  if (cid.startsWith('n:')) {
    const nc = cardIndex.has(cid) && noteCard(cid, A.typed);
    if (!nc) return '<p class="muted">Esa tarjeta no existe.</p>';
    body = frameTag('prev', A.shown ? nc.a : nc.q, nc.css);
  } else {
    const e = entryOf(cid.slice(0, -2));
    if (!e) return '<p class="muted">Esa tarjeta no existe.</p>';
    const prod = cid.endsWith('>p');
    body = `<div class="card"><div class="word">${esc(prod ? e.es : e.en)}</div>${A.shown ? `<hr><div class="answer">${esc(prod ? e.en : e.es)}</div>` : ''}</div>`;
  }
  const st = S.cards[cid];
  return `<header class="top"><h2>Vista previa</h2><button class="link" data-a="aback">Volver</button></header>
    <p class="muted center">${esc(deckName(deckOf(cid) || cardIndex.get(cid)?.did))} · ${st ? (st.step != null ? 'aprendiendo' : `intervalo ${fmtDays(st.days || 0)} · ${st.reps} repasos · ${st.lapses} olvidos`) : 'nueva'}</p>
    <div class="studycard">${body}</div>
    <button class="btn ${A.shown ? 'ghost' : 'primary'} big" data-a="aprevflip">${A.shown ? 'Ver pregunta' : 'Mostrar respuesta'}</button>`;
}
previewView.after = mountFrames;

/* ---------- pantalla: importar ---------- */
function importView() {
  return `<header class="top"><h2>Importar mazo</h2><a class="link" href="#cards">Volver</a></header>
    <div class="card left"><small>Formatos</small>
      <p><b>.apkg</b> o <b>.colpkg</b>: mazos de Anki, con imágenes y audio. Funcionan los de AnkiWeb y los que exportes desde Anki.</p>
      <p><b>.csv</b>, <b>.txt</b> o <b>.tsv</b>: una tarjeta por línea, con frente y reverso separados por tabulación, punto y coma o coma.</p></div>
    <label class="field check"><span>En CSV o TXT, crear también la tarjeta invertida</span><input type="checkbox" id="imprev"></label>
    <label class="btn primary big">${A.busy ? 'Importando…' : 'Elegir archivo'}<input type="file" id="impfile" accept=".apkg,.colpkg,.csv,.txt,.tsv" hidden></label>
    ${A.result ? `<div class="tip">${A.result}</div>` : ''}
    ${needServer()}`;
}

/* ---------- mazos que se agregan solos según tu nivel ---------- */
async function installPack(p, auto = false) {
  if (p.builtin) { S.settings.aussie = true; save(); toast(auto ? `Nuevo mazo por tu nivel: ${p.title}` : 'Mazo instalado'); return; }
  if (!colOk) throw new Error('Este navegador no permite guardar mazos');
  let did;
  if (p.apkg) {  // mazo de Anki guardado junto a la web: se baja una sola vez
    const blob = await (await fetch(p.apkg)).blob(), name = p.apkg.split('/').pop();
    if (colMode === 'browser') { await importFile(new File([blob], name), false, COL); setCol(COL); await saveBrowserCol(COL); }
    else {
      const r = await fetch(`/api/import?name=${encodeURIComponent(name)}&reverse=0`, { method: 'POST', body: blob });
      const d = await r.json(); if (!r.ok || d.error) throw new Error(d.error || 'No se pudo importar');
    }
    await loadCollection();
    did = Object.entries(COL.decks).find(([, x]) => x.name === p.title)?.[0] || true;
  } else {
    const notes = p.cards.map(([en, es, ex]) => ({ flds: [ex ? `${esc(en)}<div style="font-size:.7em;opacity:.65;margin-top:8px">${esc(ex)}</div>` : esc(en), esc(es)], tags: ['tienda'] }));
    did = (await colOp({ op: 'addNotes', deckName: p.title, mid: 'basicrev', notes, src: 'shop' })).did;
  }
  S.shop[p.id] = did; save(); toast(auto ? `Nuevo mazo por tu nivel: ${p.title}` : `Instalado: ${p.title}`);
}
// Después de cada respuesta: revisa si subiste de nivel y si toca agregar un mazo.
// Cada mazo se agrega una sola vez (S.autoPacks): si lo borrás, no vuelve.
let packBusy = false;
async function afterAnswer() {
  const up = checkLevel();
  if (S.settings.autoPacks === false || !colOk || packBusy) return;
  const { known } = levelInfo();
  const done = S.autoPacks ??= {};
  const p = PACKS.filter(x => x.unlock && known >= x.unlock && !done[x.id]).sort((x, y) => x.unlock - y.unlock)[0];
  if (!p) return;
  done[p.id] = Date.now(); save();
  const have = p.id === 'aussie' ? S.settings.aussie : S.shop[p.id] && COL.decks[S.shop[p.id]];
  if (have) return;
  packBusy = true;
  if (up) await new Promise(r => setTimeout(r, 3000));  // que primero se lea el aviso de nivel
  try { await installPack(p, true); } catch { delete done[p.id]; save(); }  // se reintenta más adelante
  packBusy = false;
}

/* ---------- pantalla: tienda ---------- */
function shopView() {
  const installed = id => { const did = S.shop[id]; return id === 'aussie' ? S.settings.aussie : did && COL.decks[did]; };
  return `<header class="top"><h2>Tienda de mazos</h2><a class="link" href="#cards">Volver</a></header>
    <p class="muted">Mazos gratis listos para estudiar. Se instalan como un mazo nuevo que podés editar.</p>
    <div class="tiles">${PACKS.map(p => `<div class="tile shop"><b>${esc(p.title)}</b><span>${esc(p.desc)}</span>
      <span class="meta">${p.builtin ? '34' : p.cards?.length || ''} tarjetas · ${esc(p.level)}${p.unlock ? ` · se agrega solo con ${p.unlock} palabras` : ''}</span>
      ${installed(p.id) ? '<span class="ok">Instalado</span>' : `<button class="btn primary sm" data-a="ainstall" data-id="${p.id}">Instalar</button>`}</div>`).join('')}</div>
    <h3>Mazos de la comunidad (AnkiWeb)</h3>
    <p class="muted">AnkiWeb tiene miles de mazos públicos y gratis. No permite que otras apps descarguen sus mazos automáticamente, así que se hace en dos pasos:</p>
    <ol class="steps"><li>Buscá un mazo y abrilo en AnkiWeb.</li><li>Tocá “Download” para bajar el archivo .apkg.</li><li>Volvé acá e importalo.</li></ol>
    <form data-form="ankiweb" class="searchbar"><input name="q" placeholder="Buscar en AnkiWeb (ej: english phrasal verbs)" autocomplete="off"><button class="btn primary">Buscar</button></form>
    <a class="btn ghost" href="#import">Importar el archivo descargado</a>
    ${needServer()}`;
}

/* ---------- exportar ---------- */
function exportDeck(did) {
  const lines = ['#separator:tab', '#html:true', `#deck:${deckName(did)}`];
  const clean = s => String(s || '').replace(/[\t\n\r]+/g, ' ');
  if (BUILTIN[did]) {
    const list = did === 'gday' ? DECK : did === 'mine' ? S.custom : AUSSIE;
    list.forEach(e => lines.push(`${clean(e.en)}\t${clean(e.es)}`));
  } else {
    const nids = [...new Set(COL.cards.filter(c => deckSet(did).has(c[2])).map(c => c[0]))];
    nids.forEach(nid => lines.push(COL.notes[nid].flds.map(clean).join('\t')));
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
  a.download = `${deckName(did).replace(/[^\w\- ]+/g, '_')}.txt`; a.click();
}

/* ---------- acciones ---------- */
const forget = cid => { delete S.cards[cid]; delete S.bury[cid]; };
export const ankiActions = {
  ashow: show,
  aprevflip() {
    const f = document.querySelector('iframe.cardframe');
    if (!A.shown) A.typed = f?.contentDocument?.getElementById('typeans')?.value || '';
    A.shown = !A.shown; render();
  },
  agrade: d => grade(+d.g),
  aundo: undo,
  aahead() { A.ahead = true; A.cid = null; render(); },
  amore() { dayLog(A.did).extra += 10; save(); A.cid = null; render(); },
  abury() { if (!A.cid) return; S.bury[A.cid] = dayKey(); save(); toast('Enterrada hasta mañana'); A = { did: A.did }; render(); },
  // "Ya la sé": la palabra no vuelve nunca, en ninguna dirección (queda suspendida con la marca 'known',
  // cuenta como palabra sabida y se puede ver en "Palabras que ya sabés")
  aknown() {
    if (!A.cid) return;
    const cid = A.cid, did = deckOf(cid), isNew = !S.cards[cid], sib = siblings(cid);
    undoStack.push({ cid, known: true, did, day: dayKey(), kn: isNew, rl: revlogAdd(cid, 4, A.t0 ? Date.now() - A.t0 : 0), susp: Object.fromEntries(sib.map(k => [k, S.susp[k]])), streak: S.kstreak && JSON.parse(JSON.stringify(S.kstreak)) });
    if (undoStack.length > 30) undoStack.shift();
    for (const k of sib) S.susp[k] = 'known';
    let msg = 'Listo, no la vas a ver más (Ctrl+Z para deshacer)';
    if (isNew) { const dl = dayLog(did); dl.kn = (dl.kn || 0) + 1; msg = knownStreak(cid) || msg; }
    save(); toast(msg); afterAnswer();
    A = { did: A.did }; if (stepDone()) return nextStep(); render();
  },
  // desde "Palabras que ya sabés": la palabra vuelve a las tarjetas (como nueva si la habías marcado "Ya la sé")
  arelearn(d) {
    for (const k of siblings(d.cid)) if (S.susp[k] === 'known') delete S.susp[k];
    const c = S.cards[d.cid];
    if (c && c.step == null && c.s >= 21) S.cards[d.cid] = { ...c, due: Date.now(), s: Math.min(c.s, 7) };  // vuelve a repasarse hoy
    save(); toast('Vuelve a tus tarjetas'); render();
  },
  aleechkeep() { const c = S.cards[A.cid]; if (!c) return; c.leechAt = (c.lc || 0) + LEECH; save(); toast(`Seguimos. Si se te olvida ${LEECH} veces más, te vuelvo a avisar`); render(); },
  async aoptimize() { delete S.fsrs?.off; await runOptimize(true); },
  afsrsreset() { S.fsrs = { ...S.fsrs, w: null, off: true }; save(); toast('Volviste a la fórmula de fábrica'); render(); },
  asusp() { if (!A.cid) return; S.susp[A.cid] = true; save(); toast('Tarjeta suspendida. La reactivás desde Explorar.'); A = { did: A.did }; render(); },
  amic() {
    if (A.listening) { A.l?.stop(); return; }  // tocar de nuevo termina antes
    if (!A.cid) return;
    hush();
    const cid = A.cid; A.listening = true; A.l = listen(null, true); render();
    A.l.promise.then(res => {
      if (A.cid !== cid) return;
      A.l = null;
      if (!res.text) { A.listening = false; render(); return toast(micMsg(res)); }
      const e = entryOf(cid.slice(0, -2)), target = words(e.en.replace(/^to /, '').replace('...', '')).join(' ');
      A.listening = false; A.heard = res.text; A.heardOk = (' ' + words(res.text).join(' ') + ' ').includes(' ' + target + ' ');
      A.shown = true; render();
    });
  },
  aback() { history.length > 1 ? history.back() : (location.hash = 'cards'); },
  async adeck() {
    if (!colOk) return toast('Este navegador no permite guardar mazos');
    const name = prompt('Nombre del mazo nuevo (usá :: para crear un submazo):');
    if (!name?.trim()) return;
    try { await colOp({ op: 'addDeck', name }); toast('Mazo creado'); render(); } catch (e) { toast(e.message); }
  },
  async adeldeck(d) {
    if (!confirm(`¿Borrar el mazo “${deckName(d.did)}” y todas sus tarjetas? No se puede deshacer.`)) return;
    try {
      const gone = COL.cards.filter(c => c[2] === d.did).map(([nid, ord]) => `n:${nid}:${ord}`);
      await colOp({ op: 'deleteDeck', did: d.did });
      gone.forEach(forget); delete S.deckOpts[d.did]; save();
      toast('Mazo borrado'); location.hash = 'cards';
    } catch (e) { toast(e.message); }
  },
  ahideaussie() { S.settings.aussie = false; save(); location.hash = 'cards'; },
  aexport: d => exportDeck(d.did),
  acloze() {
    const ta = document.querySelector('textarea[data-fld="0"]'); if (!ta) return;
    const n = Math.max(0, ...[...ta.value.matchAll(/\{\{c(\d+)::/g)].map(m => +m[1])) + 1;
    const [s, e] = [ta.selectionStart, ta.selectionEnd], sel = ta.value.slice(s, e) || '...';
    ta.value = ta.value.slice(0, s) + `{{c${n}::${sel}}}` + ta.value.slice(e); ta.focus();
  },
  async adelnote(d) {
    if (!confirm('¿Borrar esta nota y todas sus tarjetas?')) return;
    try {
      const gone = COL.cards.filter(c => c[0] === d.nid).map(([nid, ord]) => `n:${nid}:${ord}`);
      await colOp({ op: 'deleteNotes', nids: [d.nid] }); gone.forEach(forget); save();
      toast('Nota borrada'); ankiActions.aback();
    } catch (e) { toast(e.message); }
  },
  adelmine(d) {
    if (!confirm('¿Borrar esta tarjeta?')) return;
    S.custom = S.custom.filter(e => e.id !== d.id); forget(d.id + '>r'); forget(d.id + '>p'); save();
    toast('Tarjeta borrada'); ankiActions.aback();
  },
  atogsusp(d) { if (S.susp[d.cid]) delete S.susp[d.cid]; else S.susp[d.cid] = true; save(); render(); },
  absusp(d) { for (const c of search(A.q || '')) { if (+d.v) S.susp[c.cid] = true; else delete S.susp[c.cid]; } save(); render(); },
  abforget() {
    const res = search(A.q || '');
    if (!confirm(`¿Olvidar el progreso de ${res.length} tarjetas? Vuelven a ser nuevas.`)) return;
    res.forEach(c => forget(c.cid)); save(); render();
  },
  async ainstall(d) {
    try { await installPack(PACKS.find(x => x.id === d.id)); render(); } catch (e) { toast(e.message); }
  },
};

document.addEventListener('submit', async e => {
  const f = e.target.dataset.form;
  if (!['deckopts', 'addmine', 'addnote', 'editmine', 'editnote', 'ankiweb'].includes(f)) return;
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    if (f === 'deckopts') {
      const did = routeArg(), o = (S.deckOpts[did] ??= {});
      for (const k of ['newPerDay', 'revPerDay']) o[k] = Math.max(0, +fd.get(k) || 0);
      for (const k of ['steps', 'relearn']) { const v = String(fd.get(k) || '').trim(); o[k] = v && parseSteps(v).length ? v : OPT_DEFAULT[k]; }
      if (fd.get('order')) o.order = fd.get('order');
      if (did === 'gday') S.settings.newPerDay = o.newPerDay;
      if (fd.get('name') && fd.get('name') !== deckName(did)) await colOp({ op: 'renameDeck', did, name: fd.get('name') });
      save(); toast('Opciones guardadas'); render();
    } else if (f === 'addmine') {
      S.lastAddDeck = 'mine';
      toast(addCustom(fd.get('en'), fd.get('es'), 'manual', String(fd.get('ex') || '').trim()) ? 'Tarjeta agregada' : 'Esa palabra ya está en el mazo');
      e.target.reset(); e.target.en.focus();
    } else if (f === 'addnote') {
      const m = COL.models[A.add.mid], flds = m.fields.map((_, i) => String(fd.get('f' + i) || '').trim().replace(/\n/g, '<br>'));
      if (!flds[0]) return toast('El primer campo no puede estar vacío');
      if (m.kind === 'cloze' && !/\{\{c\d+::/.test(flds[0])) return toast('Marcá al menos un hueco: {{c1::palabra}}');
      await colOp({ op: 'addNotes', did: A.add.did, mid: A.add.mid, notes: [{ flds, tags: String(fd.get('tags') || '').split(/\s+/).filter(Boolean) }] });
      S.lastAddDeck = A.add.did; save();
      toast('Tarjeta agregada'); e.target.reset(); e.target.querySelector('textarea')?.focus();
    } else if (f === 'editmine') {
      const ent = S.custom.find(x => x.id === e.target.dataset.id);
      Object.assign(ent, Object.fromEntries(['en', 'es', 'ex', 'exEs'].map(k => [k, String(fd.get(k) || '').trim()])));
      save(); toast('Guardado'); ankiActions.aback();
    } else if (f === 'editnote') {
      const nid = e.target.dataset.nid, n = COL.notes[nid], m = COL.models[n.mid];
      await colOp({ op: 'editNote', nid, flds: m.fields.map((_, i) => String(fd.get('f' + i) || '').replace(/\r?\n/g, '<br>')),
        tags: String(fd.get('tags') || '').split(/\s+/).filter(Boolean) });
      toast('Guardado'); ankiActions.aback();
    } else if (f === 'ankiweb') {
      const q = String(fd.get('q') || '').trim();
      window.open('https://ankiweb.net/shared/decks?search=' + encodeURIComponent(q), '_blank', 'noopener');
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'adddeck') { A.add.did = t.value; render(); }
  if (t.id === 'addmodel') { A.add.mid = t.value; render(); }
  if (t.dataset.flag) { const v = +t.value; if (v) S.flags[t.dataset.flag] = v; else delete S.flags[t.dataset.flag]; save(); render(); }
  if (t.id === 'impfile' && t.files[0]) {
    const file = t.files[0];
    A.busy = true; A.result = ''; render();
    try {
      let d;
      if (colMode === 'browser') {  // se lee el archivo acá mismo, sin servidor
        d = await importFile(file, !!$('#imprev')?.checked, COL);
        setCol(COL); await saveBrowserCol(COL);
      } else {
        const r = await fetch(`/api/import?name=${encodeURIComponent(file.name)}&reverse=${$('#imprev')?.checked ? 1 : 0}`, { method: 'POST', body: file });
        d = await r.json();
        if (!r.ok || d.error) throw new Error(d.error || 'No se pudo importar');
      }
      await loadCollection();
      A.result = `Listo: ${d.notes} notas y ${d.cards} tarjetas${d.media ? `, ${d.media} archivos de imagen o audio` : ''} en ${d.decks.map(esc).join(', ')}.`;
    } catch (err) { A.result = esc(err.message || 'No me pude conectar con el servidor de la app.'); }
    A.busy = false; render();
  }
});

let bqTimer;
document.addEventListener('input', e => {
  if (e.target.id === 'kq') {
    A.kq = e.target.value; clearTimeout(bqTimer);
    bqTimer = setTimeout(() => { render(); const q = $('#kq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250);
    return;
  }
  if (e.target.id !== 'bq') return;
  A.q = e.target.value;
  clearTimeout(bqTimer);
  bqTimer = setTimeout(() => { render(); const q = $('#bq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250);
});

window.addEventListener('hashchange', () => { const keep = location.hash.startsWith('#study') && A.did === routeArg() ? { did: A.did, ahead: A.ahead } : {}; A = keep; });

export const ankiViews = { known: knownView, preview: previewView, cards: decksView, study: studyView, deckopts: deckOptsView, add: addView, edit: editView, browse: browseView, import: importView, shop: shopView };
