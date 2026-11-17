import { DECK, AUSSIE, SHADOW, PROMPTS } from './data.js';
import { W6, validW, step as fsrsStep, interval as fsrsInterval } from './fsrs.js';
// Frases de Tatoeba para "Lectura en voz alta" (tatoeba.py). Se cargan aparte para no frenar el arranque.
let TATOEBA = [];
import('./tatoeba-data.js').then(m => { TATOEBA = m.default.map(([lvl, en, es, tid]) => ({ id: 't' + tid, lvl, en, es, tid })); }).catch(() => {});
const readPool = () => TATOEBA.length ? [...SHADOW, ...TATOEBA] : SHADOW;
import { watchView, watchActions } from './watch.js';
import { lobbyView, closetView, lobbyActions } from './lobby.js';
import { practiceViews, practiceActions, remindSettings } from './practice.js';
import { ankiViews, ankiActions, loadCollection, counts, ext, colForCloud, colFromCloud, fsrsBox } from './anki.js';
import { kvGet, kvSet, watchColSaves } from './browser-col.js';
import { cloud, cloudInit, cloudSaved, cloudLogin, cloudLogout, cloudSyncNow } from './cloud.js';
import { speak, prefetch, hush, talking, lastTalk as lastTalkAt, kokoro, kokoroInit, kokoroStart, kokoroStop, KVOICES, enVoices, pickVoice as pickSysVoice } from './voice.js';

/* ---------- utilidades y estado ---------- */
const DAY = 864e5, KEY = 'gday-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// El día de estudio cambia a las 4 de la mañana (como en Anki): lo que hacés a la 1 de la madrugada cuenta para el día
// anterior, y una tarjeta que respondés a las 23:50 vuelve al día siguiente a las 4, no a los 10 minutos.
const ROLL = 4 * 3600e3;
const nowDay = () => new Date(Date.now() - ROLL);
const dayKey = (d = nowDay()) => d.toLocaleDateString('sv');
// día de estudio de un momento dado (ms)
const studyDay = ts => new Date(ts - ROLL).toLocaleDateString('sv');
const dayNo = ts => Math.round(Date.parse(studyDay(ts)) / 864e5);
// las 4 de la mañana de dentro de `days` días de estudio
const dayAt = (days, now = Date.now()) => { const d = new Date(now - ROLL); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); d.setHours(4); return d.getTime(); };
const LEVELS = ['Básico', 'Intermedio', 'Avanzado'];
const STEPS = ['study', 'shadow', 'watch'];  // sesión diaria: tarjetas, lectura en voz alta e inmersión
const KINDS = ['cards', 'read', 'imm'];
const CARDS = ['cards', 'known', 'study', 'deckopts', 'add', 'edit', 'browse', 'import', 'shop', 'preview'];
const COUNTED = ['study', 'shadow', 'speak', 'review', 'roleplay', 'sounds', 'dictation', 'journal'];  // los videos cuentan solo mientras se reproducen
const KIND_OF = { study: 'cards', shadow: 'read', review: 'read' };
const PRACTICE = ['practice', 'shadow', 'speak', 'review', 'roleplay', 'sounds', 'dictation', 'journal'];
const STEP_SECS = 300;  // en una sesión extra (con el plan del día ya cumplido), 5 minutos por paso

const defaults = () => ({
  settings: { level: 1, newPerDay: 10, goal: 60, progressive: true, autoNew: true, planSet: false, planStart: '', aussie: false, voice: '', record: true, watch: { auto: false, slow: false, es: true }, remind: { on: false, time: '20:00', last: '' },
    ui: { theme: 'dark', accent: 'violet', scale: 100 }, cards: { autoAudio: true, showExample: true, voiceAnswer: true, keyHints: true } },
  cards: {}, custom: [], log: {}, shadow: {}, speak: [], videos: [], boost: [], roles: {}, sounds: {}, journal: [], dictation: { n: 0, sum: 0 },
  susp: {}, bury: {}, flags: {}, deckOpts: {}, dlog: {}, shop: {}, seen: {},
});
function load() {
  const d = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY)) || {};
    return seedSeen({ ...d, ...s, settings: { ...d.settings, ...s.settings } });
  } catch { return d; }
}
let S = load();

// Ejercicios sin repetir: cada tipo recuerda qué te mostró y cuándo (S.seen[tipo][id] = fecha).
// Siempre elige algo que no viste; recién cuando viste todo vuelve al que viste hace más tiempo.
// Las tarjetas no pasan por acá: esas se repiten a propósito (FSRS).
function pickFresh(kind, pool, { random = false, avoid } = {}) {
  if (!pool.length) return null;
  const seen = S.seen?.[kind] || {};
  const fresh = pool.filter(p => !seen[p.id]);
  if (fresh.length) return random ? fresh[Math.floor(Math.random() * fresh.length)] : fresh[0];
  const rest = pool.length > 1 ? pool.filter(p => p.id !== avoid) : pool;
  return rest.reduce((a, b) => (seen[a.id] || 0) <= (seen[b.id] || 0) ? a : b);
}
function markSeen(kind, id) { ((S.seen ??= {})[kind] ??= {})[id] = Date.now(); save(); }
// lo que ya habías hecho antes de que existiera S.seen también cuenta como visto
function seedSeen(s) {
  if (s.seen?.v) return s;
  const seen = s.seen = { ...(s.seen || {}), v: 1 }, mark = (k, id) => { (seen[k] ??= {})[id] ??= 1; };
  for (const [id, x] of Object.entries(s.shadow || {})) if (x?.n || x?.r) mark('phrase', id);
  for (const x of s.speak || []) if (x?.pid) mark('speak', x.pid);
  for (const x of s.journal || []) if (x?.q) mark('journal', x.q);
  for (const [id, x] of Object.entries(s.roles || {})) if (x?.n) mark('role', id);
  return s;
}

// Copia en un archivo de la compu (gday-english/data/progress.json) a través del servidor.
// El navegador guarda al instante; el archivo se actualiza un segundo después.
const loadedAt = S.savedAt || 0;
let syncTimer, synced = false, sync = { ok: null, at: 0 };
async function pushServer() {
  if (!synced) return;
  try {
    const r = await fetch('/api/progress', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S) });
    sync = { ok: r.ok, at: Date.now() };
  } catch { sync = { ok: false, at: Date.now() }; }
}
// Almacenamiento persistente: el navegador no borra los datos de G'day por su cuenta cuando le falta espacio.
// Chrome lo concede solo (más fácil si G'day está instalada como app o en favoritos); Firefox pregunta.
let persisted = null;  // true, false o null (el navegador no lo permite)
async function askPersist() {
  if (!navigator.storage?.persist) return;
  try { persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch { persisted = false; }
}
function save() {
  S.savedAt = Date.now();
  if (persisted === false && !save.asked) { save.asked = true; askPersist(); }  // reintenta una vez por visita
  localStorage.setItem(KEY, JSON.stringify(S));
  clearTimeout(syncTimer); syncTimer = setTimeout(() => { pushServer(); writeFile(); }, 1000);
  cloudSaved('progress');
}

// Copia del progreso en un archivo que elegís (Chrome y Edge de computadora). Reemplaza al servidor en la versión publicada.
const canPickFile = 'showSaveFilePicker' in window;
let fileHandle = null, fileOk = false;
async function initFile() {
  if (!canPickFile) return;
  try { fileHandle = await kvGet('progressFile'); fileOk = !!fileHandle && await fileHandle.queryPermission({ mode: 'readwrite' }) === 'granted'; } catch { fileHandle = null; }
}
async function writeFile() {
  if (!fileOk || !fileHandle) return;
  try { const w = await fileHandle.createWritable(); await w.write(JSON.stringify(S)); await w.close(); }
  catch { fileOk = false; }
}
async function syncFromServer() {
  try {
    const r = await fetch('/api/progress', { cache: 'no-store' });
    if (!r.ok) throw 0;
    const d = await r.json();
    synced = true; sync = { ok: true, at: Date.now() };
    if (d.savedAt && d.savedAt > loadedAt) {
      // el archivo es más nuevo (navegador borrado u otro navegador): se recupera de ahí
      localStorage.setItem(KEY, JSON.stringify(d)); S = load(); ui = {}; render();
      if (loadedAt) toast('Progreso actualizado desde tu compu'); else toast('Progreso recuperado desde tu compu');
    } else if (!d.savedAt || (S.savedAt || 0) > d.savedAt) pushServer();
  } catch { sync = { ok: false, at: Date.now() }; }
  if (route() === 'settings') render();
}
const log = () => (S.log[dayKey()] ??= { sec: 0, new: 0, rev: 0, shadow: 0, speak: 0, extra: 0 });

/* ---------- plan diario: el método de 3 pasos ---------- */
// 1. Tarjetas (vocabulario): hasta 20 min. 2. Lectura en voz alta: hasta 35 min. 3. Inmersión (videos): hasta 2 horas.
// Plan progresivo: la primera semana 5 + 5 + 10 minutos para todos y cada semana 5 minutos más en cada paso,
// hasta llegar al tiempo que eligió cada uno (o al máximo de cada paso). Meta del método: 250 horas.
const METHOD = { cards: [5, 20], read: [5, 35], imm: [10, 120] };
const GOAL_HOURS = 250;

/* ---------- puntaje: palabras que sabés ---------- */
// Una palabra cuenta como sabida si la marcaste "Ya la sé" o si FSRS calcula que la recordás por 3 semanas o más
// (estabilidad >= 21 días). Las dos tarjetas de una misma palabra (inglés→español y al revés) cuentan una vez.
// Todo se calcula en el navegador con los datos que ya hay: no suma pedidos al servidor.
const LEVEL_AT = [0, 600, 1300];  // palabras para Básico, Intermedio y Avanzado
const wordOf = cid => cid.startsWith('n:') ? 'n:' + cid.split(':')[1] : cid.replace(/>[rp]$/, '');
function levelInfo() {
  const known = new Set(), learning = new Set();
  for (const [cid, v] of Object.entries(S.susp)) if (v === 'known') known.add(wordOf(cid));
  for (const [cid, c] of Object.entries(S.cards)) {
    if (S.susp[cid] && S.susp[cid] !== 'known') continue;
    const w = wordOf(cid);
    if (c.step == null && c.s >= 21) known.add(w); else learning.add(w);
  }
  for (const w of known) learning.delete(w);
  const n = known.size, lvl = LEVEL_AT.filter(x => n >= x).length;
  const from = LEVEL_AT[lvl - 1], to = LEVEL_AT[lvl];
  return { known: n, learning: learning.size, lvl, name: LEVELS[lvl - 1], next: to ? LEVELS[lvl] : null, toNext: to ? to - n : 0,
    pct: to ? (n - from) / (to - from) : 1 };
}
// Sube el nivel de toda la web (frases, consignas, velocidad de la voz, orden de las tarjetas) cuando cruzás un umbral.
// Solo sube, y solo al cruzar un umbral nuevo: si elegís otro nivel a mano en Ajustes, se respeta hasta el próximo.
function checkLevel() {
  if (S.settings.autoLevel === false) return null;
  const { lvl } = levelInfo();
  if (lvl <= (S.lvlSeen || 1)) return null;
  S.lvlSeen = lvl;
  if (lvl > S.settings.level) { S.settings.level = lvl; delete S.dayPlan; save(); toast(`¡Subiste a ${LEVELS[lvl - 1]}! La web se ajusta a tu nivel.`); return lvl; }
  save(); return null;
}
const methodAt = week => Object.fromEntries(Object.entries(METHOD).map(([k, [a, max]]) => [k, Math.min(a + 5 * week, max)]));
const sumOf = b => b.cards + b.read + b.imm;
// si los pasos suman más que tu tiempo, se le saca de a 1 minuto al paso más largo hasta que entre
function fitTo(base, total) {
  const p = { ...base };
  while (sumOf(p) > total) { const k = ['imm', 'read', 'cards'].reduce((a, b) => p[b] > p[a] ? b : a); if (p[k] <= 1) break; p[k]--; }
  return p;
}
const MAX_PLAN = sumOf(methodAt(99));  // 20 + 35 + 120
function planFor(day = dayKey()) {
  const s = S.settings, goal = Math.max(5, +s.goal || 60), prog = s.progressive !== false;
  const start = s.planStart || day;
  const week = Math.max(0, Math.floor((new Date(day) - new Date(start)) / DAY / 7));
  const want = Math.min(goal, MAX_PLAN);
  // semana en la que el plan llega a tu tiempo: desde ahí ya no crece más
  let reach = 0;
  while (sumOf(methodAt(reach)) < want && reach < 60) reach++;
  const w = prog ? Math.min(week, reach) : reach;
  const p = fitTo(methodAt(w), want);
  return { ...p, total: sumOf(p), week: week + 1, reachWeek: reach + 1, goal };
}
const daySec = (L, k) => L?.[k + 'Sec'] || 0;
const totalHours = () => Object.values(S.log).reduce((a, L) => a + (L.sec || 0), 0) / 3600;
// un segundo de estudio: suma al día, al paso que corresponde y a la sesión guiada
function studyTick(kind) {
  const L = log(); L.sec++;
  if (kind) L[kind + 'Sec'] = (L[kind + 'Sec'] || 0) + 1;
  if (L.sec % 5 === 0) save();
  if (session && kind && KINDS[session.i] === kind) {
    session.t++;
    const b = $('#sess'); if (b) b.textContent = sessLabel();
    if (kind === 'imm' && stepDone() && !session.immDone) { session.immDone = true; render(); }
  }
}

let ui = {}, session = null;
const route = () => (location.hash.slice(1) || 'home').split('/')[0];
const routeArg = () => decodeURIComponent(location.hash.slice(1).split('/').slice(1).join('/'));
const go = r => { if (route() === r) { ui = {}; render(); } else location.hash = r; };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2400);
}

function streak() {
  const d = nowDay();
  const met = () => (S.log[dayKey(d)]?.sec || 0) >= planFor(dayKey(d)).total * 60;
  if (!met()) d.setDate(d.getDate() - 1);
  let n = 0;
  while (met()) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- FSRS-6 (fsrs.js) ---------- */
// Los números de la fórmula: los tuyos si ya se calcularon con tu historial (S.fsrs.w, ver anki.js), si no los de fábrica.
const fsrsW = () => validW(S.fsrs?.w) ? S.fsrs.w : W6;
// g: 1 otra vez, 2 difícil, 3 bien, 4 fácil. Los días se cuentan por día de estudio (0 = el mismo día).
// Las tarjetas guardadas con la versión anterior (FSRS-4.5) siguen sirviendo: s y d significan lo mismo.
function schedule(c, g, now) {
  if (c && !(c.s > 0 && c.d > 0)) c = null;
  const w = fsrsW(), st = fsrsStep(w, c ? { s: c.s, d: c.d } : null, g, c ? Math.max(0, dayNo(now) - dayNo(c.last)) : 0);
  const days = Math.max(1, Math.round(fsrsInterval(w, st.s)));
  return { s: st.s, d: st.d, last: now, due: g === 1 ? now : dayAt(days, now), days: g === 1 ? 0 : days,
    reps: (c?.reps || 0) + 1, lapses: (c?.lapses || 0) + (c && g === 1 ? 1 : 0), ok: c?.ok || g >= 3 };
}
const fmtDays = n => n === 0 ? 'ahora' : n < 30 ? n + ' d' : n < 365 ? Math.round(n / 30) + ' m' : (n / 365).toFixed(1) + ' a';

/* ---------- mazo ---------- */
const entryMap = () => new Map([...DECK, ...AUSSIE, ...S.custom].map(e => [e.id, e]));
function addCustom(en, es, src, ex = '', exEs = '') {
  en = en.trim(); es = es.trim();
  if (!en || !es) return false;
  const all = [...DECK, ...AUSSIE, ...S.custom];
  if (all.some(e => e.en.toLowerCase() === en.toLowerCase())) return false;
  S.custom.push({ id: 'c-' + Date.now().toString(36) + S.custom.length, en, es, ex, exEs, lvl: 0, src });
  save();
  return true;
}

/* ---------- voz ---------- */
// La voz vive en voice.js: Kokoro (voz natural en el navegador) si la activaste en Ajustes, o la mejor voz del sistema.
const synth = window.speechSynthesis;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const pickVoice = () => pickSysVoice(S.settings.voice);
const voiceOpts = rate => ({ rate: rate || [0.85, 0.95, 1][S.settings.level - 1], kvoice: S.settings.kvoice || 'bf_emma', sysVoice: S.settings.voice });
const say = (text, rate) => speak(text, voiceOpts(rate));
const sayNext = (text, rate) => prefetch(text, voiceOpts(rate));
if (synth) synth.onvoiceschanged = () => { if (route() === 'settings') render(); };
const kRender = { at: 0, t: 0 };
// redibuja Ajustes como mucho cada 400 ms, pero sin perder el último cambio (por ejemplo "ya está descargada")
kokoroInit(() => {
  if (route() !== 'settings') return;
  clearTimeout(kRender.t);
  const wait = 400 - (Date.now() - kRender.at || 0);
  kRender.t = setTimeout(() => { kRender.at = Date.now(); if (route() === 'settings') render(); }, Math.max(0, wait));
});
if (S.settings.kokoro) setTimeout(() => kokoroStart({ auto: true }), 300);  // arranca enseguida: si ya está descargada, la primera frase la espera

// En celulares, grabar audio y reconocer voz a la vez se pelean por el micrófono: el reconocimiento queda sordo.
const IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
const MOBILE = IOS || /Android/i.test(navigator.userAgent);
const ANDROID = /Android/i.test(navigator.userAgent);  // su modo continuo repite frases: se reinicia a mano
const SR_ERR = { 'not-allowed': 'mic', 'service-not-allowed': 'mic', 'audio-capture': 'mic', network: 'network' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Una sola instancia de reconocimiento para toda la página. En iPhone, crear una nueva cada vez
// o arrancar antes de que la anterior suelte el micrófono hace que la segunda vez no escuche nada.
let srInst = null, srRunning = false, srCur = null, srWait = [], srMisses = 0;
function srGet() {
  if (srInst) return srInst;
  const r = srInst = new SR();
  r.onresult = e => { if (r === srInst) srCur?.onresult(e); };
  r.onerror = e => { if (r === srInst) srCur?.onerror(e); };
  r.onend = () => {
    if (r !== srInst) return;
    srRunning = false;
    srWait.splice(0).forEach(f => f());
    srCur?.onend();
  };
  return r;
}
function srStart() {
  const r = srGet();
  r.lang = 'en-AU'; r.interimResults = true; r.maxAlternatives = 1;
  r.continuous = !(ANDROID || IOS);  // en celulares se reinicia a mano después de cada frase
  r.start();
  srRunning = true;
}
// espera a que la sesión anterior termine; si se trabó, la descarta y se usa una instancia nueva
function srIdle(ms) {
  if (!srRunning) return Promise.resolve();
  return new Promise(res => {
    const t = setTimeout(() => { try { srInst?.abort(); } catch {} srInst = null; srRunning = false; res(); }, ms);
    srWait.push(() => { clearTimeout(t); res(); });
  });
}

// ---------- voz a texto en el servidor ----------
// Safari en iOS 27 tiene un error: el reconocimiento de voz solo funciona la primera vez por pestaña
// (bugs.webkit.org 326069). En iPhone, y en navegadores sin reconocimiento, se graba el audio y se
// transcribe en /api/transcribe. Se activa solo si el servidor tiene una clave configurada.
const STT = { ok: false };
const useServerSTT = () => STT.ok && (IOS || !SR);
const canHear = () => !!SR || STT.ok;
fetch('/api/transcribe', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
  .then(d => { STT.ok = !!d?.ok; if (STT.ok && ['settings', 'shadow', 'speak', 'review'].includes(route())) render(); }).catch(() => {});
const HALLUCINATION = /^(thank you\.?|thanks for watching!?|you\.?|bye\.?|\.+)$/i;  // lo que Whisper "oye" en el silencio
let audioCtx = null;

// Igual que listen(), pero grabando y transcribiendo. Detecta el silencio para terminar solo (once).
// Devuelve { stop, promise } y la promesa da { text, error, audio }.
function listenServer(onLive, once) {
  let done, ended = false, stopping = false, stream, mr, chunks = [], an, src, buf, timer, speech = false, lastVoice = 0, t0 = Date.now();
  const promise = new Promise(r => (done = r));
  const status = t => { const el = $('#live'); if (el) el.textContent = t; };
  const end = res => { if (ended) return; ended = true; clearInterval(timer); done(res); };
  const release = () => { stream?.getTracks().forEach(t => t.stop()); try { src?.disconnect(); } catch {} };
  const go = async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { return end({ text: '', error: 'mic', audio: null }); }
    if (stopping) { release(); return end({ text: '', error: null, audio: null }); }
    try { mr = new MediaRecorder(stream); } catch { release(); return end({ text: '', error: 'mic', audio: null }); }
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.start();
    try {  // medidor de volumen para saber cuándo hablás y cuándo te callás
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state !== 'running') await audioCtx.resume();
      src = audioCtx.createMediaStreamSource(stream); an = audioCtx.createAnalyser(); an.fftSize = 1024;
      src.connect(an); buf = new Float32Array(an.fftSize);
    } catch { an = null; }
    t0 = Date.now(); status('Escuchando…');
    let floor = 0, n = 0;
    timer = setInterval(() => {
      const now = Date.now(), el = now - t0;
      if (an) {
        an.getFloatTimeDomainData(buf);
        let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (el < 400) { floor = (floor * n + rms) / ++n; return; }  // ruido de fondo de los primeros instantes
        if (rms > Math.max(0.012, floor * 2.5)) { if (!speech) status('Escuchando… (te oigo)'); speech = true; lastVoice = now; }
        if (once && speech && now - lastVoice > 1300) stop();
        if (once && !speech && el > 8000) stop();
      } else if (once && el > 6000) stop();
      if (el > (once ? 30000 : 180000)) stop();
    }, 100);
  };
  const stop = async () => {
    if (stopping) return promise;
    stopping = true; clearInterval(timer);
    if (!mr) return promise;  // todavía arrancando: go() termina solo
    const blob = await new Promise(res => {
      mr.onstop = () => res(chunks.length ? new Blob(chunks, { type: mr.mimeType || 'audio/mp4' }) : null);
      try { mr.stop(); } catch { res(null); }
    });
    release();
    if (!blob) { end({ text: '', error: null, audio: null }); return promise; }
    if (an && !speech) { end({ text: '', error: null, audio: blob }); return promise; }  // no habló: no se manda nada
    status('Pasando tu voz a texto…');
    try {
      const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/mp4' }, body: blob });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { if (d.error === 'nostt') STT.ok = false; end({ text: '', error: r.status === 503 ? 'busy' : 'stt', audio: blob }); }
      else {
        const text = HALLUCINATION.test((d.text || '').trim()) ? '' : (d.text || '').trim();
        if (text) onLive?.(text);
        end({ text, error: null, audio: blob });
      }
    } catch { end({ text: '', error: 'network', audio: blob }); }
    return promise;
  };
  go();
  return { stop, promise };
}

// Reconocimiento de voz.
// once: termina solo después de 1,6 s de silencio tras hablar, o si en 10 s no se escuchó nada.
// Sin once: escucha hasta que se llame a stop(). stop() se puede llamar en cualquier momento.
function listen(onLive, once) {
  if (useServerSTT()) return listenServer(onLive, once);
  let finalT = '', interim = '', active = true, ended = false, done, error = null, silence, quiet, cap, restarts = [];
  const promise = new Promise(r => (done = r));
  const text = () => (finalT + ' ' + interim).replace(/\s+/g, ' ').trim();
  const finish = () => {
    if (ended) return;
    ended = true; active = false;
    [silence, quiet, cap].forEach(clearTimeout);
    if (srCur === sess) { srCur = null; if (srRunning) try { srInst.abort(); } catch {} }
    const t = text();
    if (SR && !t && !error) { srMisses++; if (IOS && srMisses >= 2) { try { srInst?.abort(); } catch {} srInst = null; srRunning = false; } }
    else if (t) srMisses = 0;
    done({ text: t, error: t ? null : error });
  };
  const stop = () => {
    if (ended) return promise;
    active = false;
    [silence, quiet, cap].forEach(clearTimeout);
    if (srCur !== sess || !srRunning) { finish(); return promise; }
    try { srInst.stop(); } catch { finish(); }
    setTimeout(finish, 1500);  // por si el navegador nunca avisa que terminó
    return promise;
  };
  const sess = {
    onresult(e) {
      let fin = '', int = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += ' ' + r[0].transcript; else int += r[0].transcript;
      }
      finalT += fin; interim = int;
      onLive?.(text());
      if (once && text()) { clearTimeout(quiet); clearTimeout(silence); silence = setTimeout(stop, 1600); }
    },
    onerror(e) { if (SR_ERR[e.error]) { error = SR_ERR[e.error]; active = false; } },
    onend() {
      if (!active) return finish();
      // el navegador cortó solo (silencio, fin de frase o límite de tiempo): se sigue escuchando
      finalT += ' ' + interim; interim = '';
      const now = Date.now(); restarts = restarts.filter(t => now - t < 3000); restarts.push(now);
      if (restarts.length > 6) { error = error || 'mic'; return finish(); }  // se corta enseguida una y otra vez
      setTimeout(() => {
        if (!active || ended) return finish();
        try { srStart(); } catch { finish(); }
      }, IOS ? 250 : 0);
    },
  };
  if (!SR) return { stop: () => { error = 'nosr'; finish(); return promise; }, promise };
  const begin = () => {
    if (ended) return;
    if (!active) return finish();
    srCur = sess;
    try { srStart(); } catch { error = 'mic'; finish(); }
  };
  sess.stop = stop;
  // en iPhone, la voz de la app deja el audio en modo "reproducir" un momento después de cortarla
  const talkingNow = talking() || (IOS && Date.now() - lastTalkAt < 3000);
  if (!srRunning && !srCur && !talkingNow) begin();  // lo normal: arranca en el mismo toque (Safari lo prefiere)
  else {
    // la voz de la app todavía suena o la ronda anterior no soltó el micrófono: se espera un momento
    hush();
    srCur?.stop();  // si quedó otra ronda abierta (por ejemplo, al cambiar de pantalla), se cierra
    Promise.all([srIdle(1500), sleep(talkingNow && IOS ? 400 : 0)]).then(begin);
  }
  if (once) { quiet = setTimeout(() => { if (!text()) stop(); }, 10000); cap = setTimeout(stop, 30000); }
  return { stop, promise };
}

// Graba el audio del micrófono. Devuelve { stop() → Blob o null }.
async function startRecorder() {
  if (!navigator.mediaDevices || !window.MediaRecorder) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream), chunks = [];
    mr.ondataavailable = e => e.data.size && chunks.push(e.data);
    mr.start();
    return {
      stop: () => new Promise(res => {
        mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(chunks.length ? new Blob(chunks, { type: mr.mimeType }) : null); };
        try { mr.stop(); } catch { stream.getTracks().forEach(t => t.stop()); res(null); }
      }),
    };
  } catch { return null; }
}

// Reconocimiento + grabación juntos, con un stop() que existe desde el primer momento.
// Llamar dentro del toque del usuario. prefer 'audio': en celulares graba en vez de reconocer.
// Devuelve { stop, promise } y la promesa da { text, error, audio (Blob o null) }.
function capture(onLive, { once = false, record = S.settings.record, prefer = 'text' } = {}) {
  if (useServerSTT()) {  // la misma grabación sirve para escucharte y para transcribir
    const l = listenServer(onLive, once);
    const promise = l.promise.then(res => ({ ...res, audio: record ? res.audio : null }));
    return { stop: () => { l.stop(); return promise; }, promise };
  }
  const both = !(MOBILE && SR);
  const useSR = SR && (both || prefer === 'text');
  const useRec = record && (both || prefer === 'audio' || !SR);
  let idleDone;  // sin reconocimiento: espera a stop()
  const idle = { promise: new Promise(r => (idleDone = r)), stop: () => { idleDone({ text: '', error: SR ? null : 'nosr' }); return idle.promise; } };
  const l = useSR ? listen(onLive, once) : idle;
  const recP = useRec ? startRecorder() : Promise.resolve(null);
  const promise = l.promise.then(async res => ({ ...res, audio: (await (await recP)?.stop()) || null }));
  return { stop: () => { l.stop(); return promise; }, promise };
}

// Mensaje para mostrar cuando no se entendió nada. Vacío si hay texto.
function micMsg(res) {
  if (res.text) return '';
  if (res.error === 'mic') return 'No pude usar el micrófono. Revisá que el navegador tenga permiso para usarlo.';
  if (res.error === 'network') return 'El reconocimiento de voz necesita internet. Revisá la conexión y probá de nuevo.';
  if (res.error === 'busy') return 'El servicio de voz está ocupado. Probá de nuevo en unos segundos.';
  if (res.error === 'stt') return 'No pude pasar tu voz a texto. Probá de nuevo.';
  if (IOS && srMisses >= 2 && !useServerSTT()) return 'En iPhone el reconocimiento de voz a veces se traba. Escribí la frase abajo o tocá el micrófono del teclado para dictarla.';
  return 'No te escuché. Hablá cerca del micrófono y probá de nuevo.';
}

// sin apóstrofos ni guiones: "G'day", "G-Day" y "gday" cuentan igual, y "don't" = "dont"
const clean = w => w.toLowerCase().replace(/[^a-z0-9]/g, '');
const words = t => t.split(/\s+/).map(clean).filter(Boolean);
function compare(target, said) {
  const shown = target.split(/\s+/), a = shown.map(clean), b = words(said);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const hit = Array(m).fill(false);
  for (let i = m, j = n; i && j;) {
    if (a[i - 1] === b[j - 1]) { hit[i - 1] = true; i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
  }
  return { shown, hit, score: m ? hit.filter(Boolean).length / m : 0 };
}

/* ---------- sesión guiada ---------- */
// cada paso dura lo que dice el plan del día (lo ya hecho hoy cuenta); en una sesión extra, 5 minutos por paso
const stepLeft = (i = session.i) => {
  if (session.extra) return (i === session.i ? STEP_SECS - session.t : STEP_SECS);
  const k = KINDS[i];
  return planFor()[k] * 60 - daySec(log(), k);
};
const stepDone = () => !!session && stepLeft() <= 0;
function startStep() {
  while (session && !session.extra && session.i < STEPS.length && stepLeft() <= 0) session.i++;  // pasos ya cumplidos hoy
  if (session.i >= STEPS.length) { session = null; return go('done'); }
  const r = STEPS[session.i];
  location.hash = r === 'study' ? 'study/all' : r;
  if (route() === r) { ui = {}; render(); }
}
function nextStep() { session.i++; session.t = 0; session.immDone = false; startStep(); }
const STEP_NAMES = ['Tarjetas', 'Lectura en voz alta', 'Inmersión'];
const sessLabel = () => {
  const left = Math.max(0, stepLeft());
  return left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '✓ cumplido';
};
const sessBanner = () => !session ? '' : `
  <div class="sess"><span>Paso ${session.i + 1}/3 · ${STEP_NAMES[session.i]}</span><b id="sess">${sessLabel()}</b>
  <button class="link" data-a="skip">${session.i === 2 ? 'Terminar' : 'Siguiente paso'}</button></div>
  ${session.i === 2 && stepDone() ? '<p class="tip center">¡Cumpliste el plan de hoy! Podés seguir mirando todo lo que quieras: cuanta más inmersión, mejor.</p>' : ''}`;

/* ---------- elegir los minutos por día ---------- */
const GOALS = [15, 20, 30, 45, 60, 90, 120];
const goalLabel = m => m < 60 ? `${m} minutos` : m === 60 ? '1 hora' : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} horas`;
// primera vez: antes del plan, la web pregunta tu nivel (después sube sola según las palabras que sabés)
function levelPicker() {
  const L = [['Básico', 'Sé poco o nada. Entiendo palabras sueltas y frases muy simples.'],
    ['Intermedio', 'Me defiendo: entiendo conversaciones lentas y puedo decir cosas simples.'],
    ['Avanzado', 'Entiendo casi todo en series con subtítulos en inglés y quiero pulirlo.']];
  return `<header class="top"><h1>G'day<span>.</span></h1></header>
    <div class="card left"><small>Tu nivel</small>
      <h2>¿Qué nivel de inglés tenés?</h2>
      <p class="muted">Con esto elegimos tus primeras palabras, las frases para leer en voz alta, las consignas para hablar y la velocidad de la voz.</p></div>
    <div class="lvlgrid">${L.map(([n, d], i) => `<button class="goalopt lvlopt" data-a="setlevel" data-l="${i + 1}"><b>${n}</b><span>${d}</span></button>`).join('')}</div>
    <p class="hint">Si no estás seguro, elegí Básico: la web sube de nivel sola a medida que aprendés. También lo podés cambiar en Ajustes.</p>`;
}
function planPicker() {
  const opt = m => `<button class="goalopt ${m === 90 ? 'rec' : ''}" data-a="setgoal" data-m="${m}"><b>${goalLabel(m)}</b>${m === 90 ? '<span>Recomendado</span>' : ''}</button>`;
  return `<header class="top"><h1>G'day<span>.</span></h1></header>
    <div class="card left"><small>Tu plan</small>
      <h2>¿Cuántos minutos por día le querés dedicar?</h2>
      <p>Cada día tiene 3 pasos:</p>
      <ol class="steps"><li><b>Tarjetas:</b> vocabulario nuevo y repasos (hasta 20 min).</li>
        <li><b>Lectura en voz alta:</b> leés la frase, la escuchás y la repetís (hasta 35 min).</li>
        <li><b>Inmersión:</b> videos en inglés con subtítulos en inglés (hasta 2 horas).</li></ol>
      <p class="muted">Todos empiezan suave, con 20 minutos (5 de tarjetas, 5 de lectura y 10 de videos), y cada semana se suman 5 minutos por paso hasta llegar a tu tiempo. La meta del método son ${GOAL_HOURS} horas: con 1 hora y media por día, unos 6 meses.</p></div>
    <div class="goalgrid">${GOALS.map(opt).join('')}</div>
    <p class="hint">Lo podés cambiar cuando quieras en Ajustes.</p>`;
}

/* ---------- ranking semanal ---------- */
// Los minutos de esta semana (lunes a domingo) se mandan al servidor solo si iniciaste sesión con Google y te anotaste.
// El servidor guarda tu apodo y tus minutos en Supabase con un código anónimo de tu cuenta (ver gday_auth.py).
const weekStart = () => { const d = nowDay(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };
function weekMinutes() {
  const d = weekStart(); let sec = 0;
  for (let i = 0; i < 7; i++) { sec += S.log[dayKey(d)]?.sec || 0; d.setDate(d.getDate() + 1); }
  return Math.floor(sec / 60);
}
const fmtMin = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
let rank = { at: 0, data: null, err: '', sentAt: 0, sent: -1 };
async function rankCall(a, body) {
  const r = await fetch('/api/auth?a=' + a, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  if (d.error) throw new Error(d.error);
  return d;
}
async function rankSend(force) {
  const nick = S.settings.rankNick, m = weekMinutes();
  if (!nick || !cloud.signedIn) return;
  if (!force && (m === rank.sent || Date.now() - rank.sentAt < 5 * 60e3)) return;  // como mucho cada 5 minutos
  rank.sentAt = Date.now();
  const w = weekStart(), week = `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`;
  try { rank.data = await rankCall('rankpost', { nick, week, minutes: m }); rank.sent = m; rank.at = Date.now(); rank.err = ''; }
  catch (e) { rank.err = e.message; if (e.message === 'apodo') { delete S.settings.rankNick; save(); } }
}
// Si no estás anotado (sin sesión o sin apodo), igual te mostramos a vos como "Yo" en tu puesto,
// pero solo en tu pantalla: el servidor recibe tus minutos para calcular el puesto y no guarda nada.
const rankPublic = () => !!(S.settings.rankNick && cloud.signedIn);
function rankView(d) {
  if (!d || rankPublic() || d.me) return { top: d.top, me: d.me };
  const m = weekMinutes(), yo = { nick: 'Yo', minutes: m, me: true, local: true };
  if (!m) return { top: d.top, me: null };
  const i = d.top.findIndex(x => x.minutes < m), at = i < 0 ? d.top.length : i;
  if (at < 10) { const top = [...d.top]; top.splice(at, 0, yo); return { top: top.slice(0, 10), me: null }; }
  return { top: d.top, me: { ...yo, pos: Math.max(d.localPos || 0, 11) } };
}
async function rankLoad() {
  try { if (rankPublic()) await rankSend(true); if (!rank.data || Date.now() - rank.at > 5000) { rank.data = await rankCall(rankPublic() ? 'rank' : 'rank&m=' + weekMinutes()); rank.at = Date.now(); } rank.err = ''; }
  catch (e) { rank.err = e.message; }
  if (route() === 'rank') render(); else renderSide();
}
// Panel a la derecha (solo en pantallas anchas de compu): el top 10 de la semana, siempre a la vista.
const sideMQ = matchMedia('(min-width: 1100px)');
function renderSide() {
  const el = $('#side');
  if (!el) return;
  const r = route(), show = sideMQ.matches && r !== 'rank' && !((r === 'watch' || r === 'lobby') && innerWidth < 1500);
  document.body.classList.toggle('hasside', show);
  if (!show) { el.innerHTML = ''; return; }
  if (!rank.loading && Date.now() - (rank.tried || 0) > 60e3) { rank.loading = true; rank.tried = Date.now(); rankLoad().finally(() => { rank.loading = false; }); }
  const d = rank.data, head = '<div class="sidehead"><b>Ranking semanal</b><a class="link" href="#rank">Ver</a></div>';
  if (rank.err === 'norank') { el.innerHTML = ''; document.body.classList.remove('hasside'); return; }
  if (!d) { el.innerHTML = head + `<p class="muted">${rank.err ? 'No se pudo cargar.' : 'Cargando…'}</p>`; return; }
  const v = rankView(d);
  const rows = v.top.length ? v.top.map((x, i) => `<li class="${x.me ? 'me' : ''}${x.local ? ' local' : ''}"><span class="rpos">${['🥇', '🥈', '🥉'][i] || i + 1}</span><b>${esc(x.nick)}</b><span class="rmin">${fmtMin(x.minutes)}</span></li>`).join('')
    : '<li class="muted">Nadie sumó minutos todavía esta semana.</li>';
  const me = (v.me && !v.top.some(x => x.me) ? `<p class="sideme">${v.me.local ? 'Yo' : 'Vos'}: puesto ${v.me.pos} · ${fmtMin(v.me.minutes)}</p>` : '')
    + (!rankPublic() ? `<p class="hint">Solo vos te ves como “Yo”.</p><a class="btn ghost sm" href="#rank">Aparecer públicamente</a>` : '');
  el.innerHTML = `${head}<ol class="ranklist side">${rows}</ol>${me}<p class="hint">Se reinicia cada lunes · vos llevás ${fmtMin(weekMinutes())}</p>`;
}
sideMQ.addEventListener?.('change', () => renderSide());
addEventListener('resize', () => { clearTimeout(renderSide.t); renderSide.t = setTimeout(renderSide, 200); });
setInterval(() => { if (document.visibilityState === 'visible') rankSend(); }, 60e3);

/* ---------- vistas ---------- */
const views = {
  rank() {
    // se actualiza al entrar a la pantalla y como mucho cada 30 segundos (el render que dispara la carga no la repite)
    if (!rank.loading && Date.now() - (rank.tried || 0) > 30e3) { rank.loading = true; rank.tried = Date.now(); rankLoad().finally(() => { rank.loading = false; }); }
    const d = rank.data, mine = weekMinutes();
    const head = `<header class="top"><h2>Ranking semanal</h2><a class="link" href="#home">Volver</a></header>
      <p class="muted">Los 10 que más minutos estudiaron esta semana (tarjetas, lectura en voz alta y videos). Se reinicia cada lunes.</p>`;
    if (rank.err === 'norank') return head + '<div class="empty"><b>El ranking todavía no está activado</b><p class="muted">Falta conectar la base de datos del ranking.</p></div>';
    if (!d && !rank.err) return head + '<p class="muted center">Cargando…</p>';
    if (!d) return head + '<div class="empty"><b>No se pudo cargar el ranking</b><p class="muted">Revisá tu conexión y volvé a intentar.</p></div>';
    const v = rankView(d);
    const rows = v.top.length ? v.top.map((r, i) => `<li class="${r.me ? 'me' : ''}${r.local ? ' local' : ''}"><span class="rpos">${['🥇', '🥈', '🥉'][i] || i + 1}</span><b>${esc(r.nick)}${r.me && !r.local ? ' (vos)' : ''}</b><span class="rmin">${fmtMin(r.minutes)}</span></li>`).join('')
      : '<li class="muted">Todavía nadie sumó minutos esta semana. ¡Podés ser el primero!</li>';
    const meRow = (v.me && !v.top.some(r => r.me) ? `<p class="tip">${v.me.local ? 'Yo' : 'Vos'}: puesto ${v.me.pos} · ${fmtMin(v.me.minutes)}</p>` : '')
      + (!rankPublic() && mine ? '<p class="hint center">“Yo” sos vos y solo lo ves vos. Para que los demás te vean, sumate abajo.</p>' : '');
    let foot;
    if (!cloud.signedIn) foot = `<div class="card left"><b>Aparecer públicamente</b><p class="muted">Para que los demás te vean tenés que iniciar sesión con Google (así cada persona aparece una sola vez). Tu mail no se muestra ni se guarda en el ranking.</p>
      <button class="btn primary" data-a="cloudlogin">Iniciar sesión con Google</button></div>`;
    else if (!S.settings.rankNick) foot = `<div class="card left"><b>Sumate al ranking</b><p class="muted">Elegí un apodo (2 a 20 letras). Es lo único que ven los demás, junto con tus minutos de la semana.</p>
      <input id="ranknick" class="search" maxlength="20" placeholder="Tu apodo" autocomplete="off"><button class="btn primary" data-a="rankjoin">Unirme al ranking</button>
      <p class="hint">Esta semana llevás ${fmtMin(mine)}.</p></div>`;
    else foot = `<p class="muted center">Participás como <b>${esc(S.settings.rankNick)}</b> · esta semana llevás ${fmtMin(mine)}</p>
      <button class="btn ghost" data-a="rankleave">Salir del ranking</button>`;
    return `${head}<ol class="ranklist">${rows}</ol>${meRow}${foot}`;
  },

  home() {
    if (!S.settings.planSet && !S.settings.levelSet) return levelPicker();
    if (!S.settings.planSet) return planPicker();
    const L = log(), P = planFor(), goal = P.total * 60, pct = Math.min(1, L.sec / goal);
    const k = counts('all'), C = 2 * Math.PI * 52;
    const week = [...Array(7)].map((_, i) => {
      const d = nowDay(); d.setDate(d.getDate() - (6 - i));
      const sec = S.log[dayKey(d)]?.sec || 0, g = planFor(dayKey(d)).total * 60;
      return `<div class="bar"><i style="height:${Math.max(4, Math.min(100, sec / g * 100))}%" class="${sec >= g ? 'full' : ''}"></i><span>${'DLMMJVS'[d.getDay()]}</span></div>`;
    }).join('');
    const step = (n, name, kk, desc) => {
      const done = daySec(L, kk), mins = P[kk], f = Math.min(1, done / (mins * 60));
      return `<div class="pstep ${f >= 1 ? 'ok' : ''}"><span class="pn">${f >= 1 ? '✓' : n}</span><div><b>${name}</b><small>${desc}</small>
        <div class="pbar"><i style="width:${f * 100}%"></i></div></div><span class="pm">${Math.floor(done / 60)}/${mins} min</span></div>`;
    };
    const hrs = totalHours();
    const prog = S.settings.progressive !== false;
    const weekTxt = !prog ? `Plan fijo de ${P.total} minutos por día.`
      : P.total >= P.goal ? `Semana ${P.week} · ya llegaste a tus ${P.goal} minutos por día.`
      : `Semana ${P.week} · cada semana suma 5 minutos por paso. Llegás a tus ${P.goal} minutos en la semana ${P.reachWeek}.`;
    return `
    <header class="top"><h1>G'day<span>.</span></h1><div class="pill">${streak()} ${streak() === 1 ? 'día' : 'días'} de racha</div></header>
    <section class="hero">
      <svg viewBox="0 0 120 120" class="ring"><circle cx="60" cy="60" r="52"/><circle cx="60" cy="60" r="52" class="fg"
        stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
      <div class="ringtxt"><b>${Math.floor(L.sec / 60)}</b><span>de ${P.total} min</span></div>
    </section>
    <button class="btn primary big" data-a="session">${L.sec >= goal ? 'Otra sesión' : L.sec > 30 ? 'Seguir con la sesión' : 'Sesión de hoy'}</button>
    <p class="hint">${L.sec >= goal ? 'Plan de hoy cumplido. Podés seguir todo lo que quieras: lo que sumes de inmersión siempre ayuda.' : weekTxt}</p>
    <div class="plan">
      ${step(1, 'Tarjetas', 'cards', `Vocabulario · ${k.rev + k.learn} para repasar · ${k.fresh} nuevas`)}
      ${step(2, 'Lectura en voz alta', 'read', 'Leé, escuchá y repetí')}
      ${step(3, 'Inmersión', 'imm', 'Videos en inglés con subtítulos en inglés')}
    </div>
    ${(I => `<a href="#known" class="goal250 lvlcard"><div class="top"><b>Tu nivel: ${I.name}</b><span>${I.known} ${I.known === 1 ? 'palabra' : 'palabras'}</span></div>
      <div class="pbar"><i style="width:${Math.min(100, I.pct * 100)}%"></i></div>
      <small>${I.next ? `Te faltan ${I.toNext} palabras para ${I.next}` : 'Nivel máximo: ya manejás el vocabulario de la app'} · ${I.learning} en camino${S.settings.autoLevel !== false && I.lvl !== S.settings.level ? ` · la web está en ${LEVELS[S.settings.level - 1]}` : ''}</small></a>`)(levelInfo())}
    <div class="goal250"><div class="top"><b>Camino a ${GOAL_HOURS} horas</b><span>${hrs < 10 ? hrs.toFixed(1).replace('.', ',') : Math.floor(hrs)} h</span></div>
      <div class="pbar"><i style="width:${Math.min(100, hrs / GOAL_HOURS * 100)}%"></i></div>
      <small>${hrs >= GOAL_HOURS ? '¡Llegaste! Ahora es momento de practicar hablar más.' : `A tu ritmo de ${P.goal} min por día, te faltan unos ${Math.ceil((GOAL_HOURS - hrs) * 60 / P.goal)} días.`}</small></div>
    <div class="tiles">
      <a href="#cards" class="tile"><b>Tarjetas</b><span>Tus mazos, importar y la tienda</span></a>
      <a href="#practice" class="tile"><b>Practicar</b><span>Situaciones, consignas para hablar, sonidos, dictado y diario</span></a>
      <a href="#watch" class="tile"><b>Ver videos</b><span>Subtítulos interactivos · ${S.videos.length} guardados</span></a>
      <a href="#lobby" class="tile"><b>Sala de chat</b><span>Un cuarto en pixel art para charlar en inglés con otras personas</span></a>
      <a href="#rank" class="tile"><b>Ranking semanal</b><span>Los 10 que más estudiaron esta semana · vos llevás ${fmtMin(weekMinutes())}</span></a>
    </div>
    <div class="top"><h3>Últimos 7 días</h3><a class="link" href="#stats">Ver estadísticas</a></div><div class="week">${week}</div>`;
  },

  shadow() {
    const review = route() === 'review';
    const all = review ? SHADOW : readPool();  // lectura y shadowing usan también las frases de Tatoeba (sin repetir entre los dos)
    const pool = review ? SHADOW.filter(p => S.shadow[p.id]?.n && S.shadow[p.id].best < 0.85) : all.filter(p => p.lvl === S.settings.level);
    if (!pool.length) return `<header class="top"><h2>Repaso de errores</h2><a class="link" href="#practice">Volver</a></header>
      <div class="empty"><b>Nada para repasar</b><p class="muted">Acá aparecen las frases de shadowing que te salieron por debajo del 85%.</p>
      <a class="btn primary" href="#shadow">Ir a shadowing</a></div>`;
    if (!ui.id) {
      const times = id => (S.shadow[id]?.n || 0) + (S.shadow[id]?.r || 0);
      const order = review ? (a, b) => S.shadow[a.id].best - S.shadow[b.id].best : (a, b) => times(a.id) - times(b.id);
      const best = review ? [...pool].filter(p => p.id !== ui.prev).sort(order)[0] || pool[0] : pickFresh('phrase', pool, { avoid: ui.prev });
      ui = { id: best.id, tries: 0 };
      if (!review) markSeen('phrase', best.id);
      if (!session) setTimeout(() => say(best.en), 200);  // en la sesión, primero se lee sin escuchar
    }
    const p = all.find(x => x.id === ui.id) || SHADOW.find(x => x.id === ui.id), r = ui.result;
    const text = r ? r.shown.map((w, i) => `<span class="${r.hit[i] ? 'ok' : 'miss'}">${esc(w)}</span>`).join(' ') : esc(p.en);
    let fb = '';
    if (ui.listening) fb = `<p class="live" id="live">${canHear() ? 'Escuchando… decí la frase. Termina solo cuando te callás.' : 'Grabando… tocá Detener al terminar.'}</p>`;
    else if (ui.error) fb = `<p class="heard miss">${esc(ui.error)}</p><form data-form="shadowtype" class="searchbar typein"><input name="t" placeholder="Escribila o dictala con el micrófono del teclado" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"><button class="btn ghost">Comprobar</button></form>`;
    else if (r) fb = `<div class="score"><b>${Math.round(r.score * 100)}%</b><span>${r.score >= 0.85 ? 'Muy bien, se entendió casi todo.' : r.score >= 0.6 ? 'Bien. Repetí las palabras en rojo.' : 'Escuchala lento y probá de nuevo.'}</span></div>
        <p class="heard">Se entendió: “${esc(ui.said || '…')}”</p>`;
    else if (ui.selfRate) fb = `<p class="muted">Tu navegador no reconoce voz. Compará vos mismo y marcá:</p>
        <div class="row"><button class="btn ghost" data-a="self" data-v="1">Me salió</button><button class="btn ghost" data-a="self" data-v="0">Me costó</button></div>`;
    // Lectura en voz alta (sesión diaria): sin grabar. Leés, escuchás, repetís y tocás Listo.
    if (session && !review) return `${sessBanner()}
      <header class="top"><h2>Lectura en voz alta</h2><span class="muted">${LEVELS[S.settings.level - 1]}</span></header>
      <div class="card"><small>1. Leela en voz alta · 2. Escuchala · 3. Repetila imitando</small>
        <div class="phrase">${esc(p.en)}</div><p class="exes">${esc(p.es)}</p>
        <div class="row"><button class="btn ghost" data-a="say" data-t="${esc(p.en)}">Escuchar</button>
        <button class="btn ghost" data-a="say" data-t="${esc(p.en)}" data-r="0.65">Lento</button></div>
        ${p.tid ? `<a class="credit" href="https://tatoeba.org/es/sentences/show/${p.tid}" target="_blank" rel="noopener">Frase de Tatoeba · CC BY 2.0 FR</a>` : ''}
      </div>
      <button class="btn primary big" data-a="readdone">Listo</button>
      <div class="row"><button class="btn ghost" data-a="tocard">+ Tarjeta</button></div>`;
    return `${sessBanner()}
      <header class="top"><h2>${review ? 'Repaso de errores' : session ? 'Lectura en voz alta' : 'Shadowing'}</h2><span class="muted">${review ? pool.length + ' frases' : LEVELS[S.settings.level - 1]}</span></header>
      <div class="card"><small>${session ? '1. Leela en voz alta como te salga · 2. Escuchala · 3. Repetila imitando' : 'Escuchá y repetí igual'}</small>
        <div class="phrase">${text}</div><p class="exes">${esc(p.es)}</p>
        <div class="row"><button class="btn ghost" data-a="say" data-t="${esc(p.en)}">Escuchar</button>
        <button class="btn ghost" data-a="say" data-t="${esc(p.en)}" data-r="0.65">Lento</button>
        ${ui.audio ? `<button class="btn ghost" data-a="play">Mi voz</button>` : ''}</div>
        ${fb}
      </div>
      <button class="btn primary big ${ui.listening ? 'rec' : ''}" data-a="shadowrec">${ui.listening ? 'Detener' : r || ui.selfRate ? 'Repetir otra vez' : 'Grabar mi voz'}</button>
      <div class="row"><button class="btn ghost" data-a="tocard">+ Tarjeta</button><button class="btn ghost" data-a="shadownext">Siguiente frase</button></div>`;
  },

  speak() {
    const pool = PROMPTS.filter(p => p.lvl === S.settings.level);
    if (!ui.id) {
      const best = pickFresh('speak', pool, { avoid: ui.prev });
      ui = { id: best.id, stage: 'intro', limit: [30, 60, 90][S.settings.level - 1] };
      markSeen('speak', best.id);
    }
    const p = PROMPTS.find(x => x.id === ui.id);
    const head = `${sessBanner()}<header class="top"><h2>Hablar</h2><span class="muted">${LEVELS[S.settings.level - 1]} · ${ui.limit} s</span></header>`;
    const helps = used => `<ul class="helps">${p.helps.map(([en, es], i) =>
      `<li data-a="say" data-t="${esc(en.replace('...', ''))}" class="${used ? (used[i] ? 'ok' : 'miss') : ''}"><b>${esc(en)}</b><span>${esc(es)}</span></li>`).join('')}</ul>`;
    if (ui.stage === 'intro') return `${head}
      <div class="card"><small>Consigna</small><div class="phrase">${esc(p.en)}</div><p class="exes">${esc(p.es)}</p>
        <button class="btn ghost" data-a="say" data-t="${esc(p.en)}">Escuchar</button></div>
      <h3>Frases que podés usar</h3>${helps()}
      <button class="btn primary big" data-a="speakstart">Empezar a hablar</button>
      <button class="btn ghost" data-a="speaknext">Otra consigna</button>`;
    if (ui.stage === 'rec') return `${head}
      <div class="card"><small>${esc(p.en)}</small><div class="count" id="count">${ui.limit}</div>
        <p class="live" id="live">${canHear() ? 'Hablá sin frenar. No importa equivocarse.' : 'Grabando…'}</p></div>
      ${helps()}
      <button class="btn primary big rec" data-a="speakstop">Terminar</button>`;
    const r = ui.result, prev = S.speak.slice(0, -1).filter(s => s.wpm), avg = prev.length ? Math.round(prev.reduce((a, s) => a + s.wpm, 0) / prev.length) : null;
    const tips = [];
    if (r.hasText) {
      if (r.words < 8) tips.push('Dijiste muy poco. Apoyate en las frases de ayuda y armá 2 o 3 oraciones.');
      else if (r.wpm < 70) tips.push('Vas despacio, y está bien. Repetí la misma consigna: la segunda vez sale más fluido.');
      else tips.push('Buen ritmo. Probá sumar una frase más larga con “because” o “but”.');
      if (r.used.some(u => !u)) tips.push('Las frases de ayuda que no usaste se agregaron a tus tarjetas.');
      if (avg) tips.push(`Tu promedio anterior era ${avg} palabras por minuto.`);
    }
    return `${head}
      <div class="card"><small>Tu resultado</small>
        ${r.hasText ? `<div class="stats"><div><b>${r.words}</b><span>palabras</span></div><div><b>${r.wpm}</b><span>por minuto</span></div><div><b>${r.unique}</b><span>distintas</span></div></div>
          <p class="heard">“${esc(r.text)}”</p>` : `<p class="${ui.error ? 'heard miss' : 'muted'}">${ui.error ? esc(ui.error) : 'No hay transcripción en este navegador. Escuchá tu grabación y comparala con la respuesta modelo.'}</p>`}
        ${ui.audio ? `<button class="btn ghost" data-a="play">Escuchar mi grabación</button>` : ''}
        ${tips.map(t => `<p class="tip">${t}</p>`).join('')}
      </div>
      <h3>Frases de ayuda</h3>${helps(r.hasText ? r.used : null)}
      <h3>Respuesta modelo</h3>
      <div class="card model" data-a="say" data-t="${esc(p.model)}"><p>${esc(p.model)}</p><small>Tocá para escucharla</small></div>
      <button class="btn primary big" data-a="${session ? 'skip' : 'speakretry'}">${session ? 'Terminar sesión' : 'Repetir esta consigna'}</button>
      ${session ? '' : `<button class="btn ghost" data-a="speaknext">Otra consigna</button>`}`;
  },

  done() {
    const L = log();
    return `<div class="empty"><b>Sesión completa</b>
      <p>${Math.floor(L.sec / 60)} min hoy · ${L.new + L.rev} tarjetas · ${L.shadow} frases leídas · ${Math.floor(daySec(L, 'imm') / 60)} min de videos</p>
      <p class="muted">Racha: ${streak()} ${streak() === 1 ? 'día' : 'días'}</p>
      <a class="btn primary" href="#home">Volver al inicio</a>
      <button class="btn ghost" data-a="session">Hacer otra sesión</button></div>`;
  },

  settings() {
    const s = S.settings, vs = enVoices(), cur = pickVoice();
    const hasAU = vs.some(v => /en[-_]AU/i.test(v.lang));
    return `<header class="top"><h2>Ajustes</h2></header>
      <label class="field check"><span>Nivel automático: sube solo según las palabras que sabés (${levelInfo().known} ahora)</span><input type="checkbox" data-set="autoLevel" ${s.autoLevel !== false ? 'checked' : ''}></label>
      <label class="field check"><span>Agregar mazos solos al subir de nivel</span><input type="checkbox" data-set="autoPacks" ${s.autoPacks !== false ? 'checked' : ''}></label>
      <label class="field"><span>Nivel</span><select data-set="level">${LEVELS.map((l, i) => `<option value="${i + 1}" ${s.level === i + 1 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Minutos por día</span><select data-set="goal">${[...new Set([...GOALS, +s.goal])].sort((a, b) => a - b).map(m => `<option value="${m}" ${+s.goal === m ? 'selected' : ''}>${goalLabel(m)}</option>`).join('')}</select></label>
      <label class="field check"><span>Plan progresivo: empezar suave y sumar 5 min por paso cada semana</span><input type="checkbox" data-set="progressive" ${s.progressive !== false ? 'checked' : ''}></label>
      <p class="muted">${(P => `Hoy: ${P.cards} min de tarjetas, ${P.read} de lectura en voz alta y ${P.imm} de inmersión.`)(planFor())}</p>
      <label class="field check"><span>Ajustar solas las tarjetas nuevas para no pasarte del tiempo de tarjetas</span><input type="checkbox" data-set="autoNew" ${s.autoNew !== false ? 'checked' : ''}></label>
      ${s.autoNew === false ? `<label class="field"><span>Tarjetas nuevas por día</span><input type="number" min="0" max="100" data-set="newPerDay" value="${s.newPerDay}"></label>` : ''}
      <label class="field check"><span>Mazo de expresiones australianas</span><input type="checkbox" data-set="aussie" ${s.aussie ? 'checked' : ''}></label>
      <label class="field check"><span>Grabar mi voz para escucharme</span><input type="checkbox" data-set="record" ${s.record ? 'checked' : ''}></label>
      ${MOBILE && SR && s.record && !useServerSTT() ? '<p class="muted">En el celular no se puede grabar y corregir la voz a la vez. En Shadowing y Consignas se corrige lo que decís; en el Diario hablado se graba tu voz.</p>' : ''}
      <h3>Voz</h3>
      <label class="field check"><span>Voz natural (Kokoro): mucho más clara y menos robótica. Se descarga una sola vez (unos 90 MB) y funciona sin internet</span><input type="checkbox" data-a="kokoro" ${s.kokoro ? 'checked' : ''}></label>
      ${s.kokoro ? (kokoro.state === 'ready' ? `<label class="field"><span>Voz natural</span><select data-set="kvoice">${KVOICES.map(([id, n]) => `<option value="${id}" ${(s.kvoice || 'bf_emma') === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`
        : kokoro.state === 'error' ? `<p class="tip">${esc(kokoro.error)}</p><button class="btn ghost sm" data-a="kokororetry">Reintentar</button>`
        : `<div class="kprog"><div class="pbar"><i style="width:${kokoro.total ? Math.round(kokoro.loaded / kokoro.total * 100) : 2}%"></i></div>
          <small>${kokoro.cached ? 'Cargando la voz natural (ya está descargada)…' : kokoro.total ? `Descargando la voz natural: ${Math.round(kokoro.loaded / 1e6)} de ${Math.round(kokoro.total / 1e6)} MB` : 'Preparando la voz natural…'} · mientras tanto habla la voz del sistema</small></div>`) : ''}
      ${s.kokoro && /iPhone|iPad|Android/i.test(navigator.userAgent) ? '<p class="muted">En celulares la voz natural puede tardar unos segundos en empezar a hablar la primera vez que dice cada frase.</p>' : ''}
      <label class="field"><span>${s.kokoro ? 'Voz del sistema (de respaldo)' : 'Voz del sistema'}</span><select data-set="voice"><option value="">Automática: la mejor disponible</option>${vs.map(v => `<option value="${esc(v.voiceURI)}" ${s.voice === v.voiceURI ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('')}</select></label>
      ${canHear() ? '' : `<p class="tip">Este navegador no reconoce voz. Para la corrección automática usá Chrome o Safari.</p>`}
      <button class="btn ghost" data-a="say" data-t="G'day mate, how are you going?">Probar voz</button>
      <h3>Apariencia</h3>
      <label class="field"><span>Tema</span><select data-set2="ui.theme">${[['dark', 'Oscuro'], ['light', 'Claro'], ['auto', 'Según el sistema']].map(([v, l]) => `<option value="${v}" ${(s.ui?.theme || 'dark') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Color principal</span><select data-set2="ui.accent">${[['violet', 'Violeta'], ['blue', 'Azul'], ['green', 'Verde'], ['teal', 'Turquesa'], ['pink', 'Rosa'], ['orange', 'Naranja']].map(([v, l]) => `<option value="${v}" ${(s.ui?.accent || 'violet') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Tamaño de todo (${s.ui?.scale || 100}%)</span><input type="range" min="80" max="140" step="5" data-set2="ui.scale" value="${s.ui?.scale || 100}"></label>
      <h3>Tarjetas</h3>
      <label class="field check"><span>Leer la palabra en voz alta al mostrarla</span><input type="checkbox" data-set2="cards.autoAudio" ${s.cards?.autoAudio !== false ? 'checked' : ''}></label>
      <label class="field check"><span>Mostrar la frase de ejemplo</span><input type="checkbox" data-set2="cards.showExample" ${s.cards?.showExample !== false ? 'checked' : ''}></label>
      <label class="field check"><span>Botón para responder hablando</span><input type="checkbox" data-set2="cards.voiceAnswer" ${s.cards?.voiceAnswer !== false ? 'checked' : ''}></label>
      <label class="field check"><span>Mostrar los atajos de teclado</span><input type="checkbox" data-set2="cards.keyHints" ${s.cards?.keyHints !== false ? 'checked' : ''}></label>
      ${fsrsBox()}
      <h3>Ver videos</h3>
      <label class="field"><span>Tamaño de los subtítulos (${s.watch?.size || 100}%)</span><input type="range" min="60" max="180" step="10" data-set2="watch.size" value="${s.watch?.size || 100}"></label>
      <label class="field"><span>Velocidad al abrir un video</span><select data-set2="watch.rate">${[[0.75, '0,75x'], [0.85, '0,85x'], [1, 'Normal'], [1.25, '1,25x']].map(([v, l]) => `<option value="${v}" ${(s.watch?.rate || 1) == v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Subtítulos en español</span><select data-set2="watch.esMode">${[['show', 'Visibles'], ['blur', 'Difuminados (se ven al tocarlos)'], ['hide', 'Ocultos']].map(([v, l]) => `<option value="${v}" ${(s.watch?.esMode || (s.watch?.es === false ? 'blur' : 'show')) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field check"><span>Pausar el video al pasar el mouse por una palabra</span><input type="checkbox" data-set2="watch.pauseHover" ${s.watch?.pauseHover !== false ? 'checked' : ''}></label>
      <label class="field check"><span>Seguir reproduciendo al cerrar la traducción</span><input type="checkbox" data-set2="watch.resumeAfter" ${s.watch?.resumeAfter !== false ? 'checked' : ''}></label>
      <label class="field check"><span>Cuadro completo al tocar una palabra (si no, solo la traducción y "Ya la sé")</span><input type="checkbox" data-set2="watch.fullPop" ${s.watch?.fullPop ? 'checked' : ''}></label>
      <label class="field"><span>Diccionario externo</span><select data-set2="watch.dict">${[['wordreference', 'WordReference'], ['cambridge', 'Cambridge'], ['spanishdict', 'SpanishDict'], ['linguee', 'Linguee'], ['google', 'Google Traductor'], ['urban', 'Urban Dictionary (jerga)']].map(([v, l]) => `<option value="${v}" ${(s.watch?.dict || 'wordreference') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      ${IOS && !navigator.standalone ? `<h3>Usar G'day como app en el iPhone</h3>
      <div class="card left"><p>Desde Safari, los videos nunca ocupan toda la pantalla: Safari no deja ocultar sus barras. Abierta desde el ícono de inicio, G'day se ve como una app, sin barras.</p>
        <ol class="steps"><li>Tocá el botón <b>Compartir</b> de Safari (el cuadrado con la flecha).</li>
          <li>Elegí <b>Agregar a inicio</b> y después <b>Agregar</b>.</li>
          <li>Abrí G'day desde ese ícono nuevo.</li></ol>
        <p>Importante: la app del ícono guarda su progreso aparte del de Safari. Antes, tocá <b>Exportar</b> (abajo, en Respaldo) y después <b>Importar</b> ese archivo dentro de la app.</p></div>` : ''}
      <h3>Extensión para Netflix, YouTube y más</h3>
      <div class="card left"><p>Subtítulos dobles e interactivos en Netflix, YouTube, Prime Video, Disney+, Max, Crunchyroll, TED y cualquier sitio con video. Las palabras que buscás pasan a tus tarjetas, en el mazo “Palabras de videos”.</p>
        <a class="btn primary" href="gday-extension.zip" download="gday-extension.zip">Descargar la extensión</a>
        <p><b>Para instalarla en Chrome:</b></p>
        <ol class="steps"><li>Descomprimí <b>gday-extension.zip</b> (doble clic). Queda una carpeta <b>gday-extension</b>; guardala donde no la borres.</li>
          <li>Abrí <b>chrome://extensions</b> y activá <b>Modo de desarrollador</b> (arriba a la derecha).</li>
          <li>Tocá <b>Cargar descomprimida</b> y elegí la carpeta <b>gday-extension</b>.</li></ol>
        <p class="muted">${ext.version ? `✓ Extensión instalada (versión ${esc(ext.version)}). Las palabras que guardás en videos aparecen acá solas cada vez que abrís G'day.${ext.version < '1.4' ? ' <b>Actualizala</b> (descargala de nuevo) para que el tiempo de tus videos también cuente.' : ' El tiempo que mirás videos con subtítulos en inglés también suma a tu inmersión.'}` : 'Las palabras que guardás en videos se agregan a tus tarjetas cada vez que abrís G\'day en este navegador. El tiempo que mirás videos con subtítulos en inglés también suma a tu inmersión.'}</p></div>
      ${remindSettings()}
      ${cloudSettings()}
      <h3>Respaldo</h3>
      ${persisted === true ? '<p class="muted">✓ Tu progreso está protegido: el navegador no lo va a borrar por su cuenta. Solo se pierde si borrás los datos del navegador a mano.</p>'
        : persisted === false ? `<p class="tip">El navegador todavía no protege tu progreso: si le falta espacio, podría borrarlo. Para que lo proteja, instalá G'day como app (en Chrome: menú ⋮ → Transmitir, guardar y compartir → Instalar) o agregala a favoritos, y volvé a probar.</p>
          <button class="btn ghost" data-a="persist">Proteger mi progreso</button>` : ''}
      <p class="${sync.ok ? 'muted' : 'tip'}">${sync.ok
        ? 'Tu progreso se guarda en este navegador y también en un archivo de tu compu (carpeta gday-english/data), con una copia por día de los últimos 30 días. Si borrás el navegador, se recupera solo.'
        : 'Tu progreso se guarda en este navegador.'}</p>
      ${sync.ok ? '' : canPickFile ? (fileOk
        ? `<p class="muted">✓ También se guarda solo en el archivo <b>${esc(fileHandle.name)}</b> de tu compu.</p><button class="btn ghost" data-a="filestop">Dejar de guardar en el archivo</button>`
        : fileHandle
          ? `<p class="tip">Chrome pide permiso de nuevo para seguir guardando en <b>${esc(fileHandle.name)}</b>.</p><button class="btn primary" data-a="filereconnect">Seguir guardando en ese archivo</button>`
          : `<button class="btn primary" data-a="filepick">Guardar el progreso en un archivo de mi compu</button><p class="muted">Se actualiza solo cada vez que estudiás. Si borrás el navegador, lo recuperás con Importar.</p>`)
        : '<p class="muted">Este navegador no permite guardar en un archivo automáticamente. Usá Exportar de vez en cuando.</p>'}
      <div class="row"><button class="btn ghost" data-a="export">Exportar</button><label class="btn ghost">Importar<input type="file" id="imp" accept="application/json" hidden></label></div>
      <p class="muted">Diccionario: WikDict, basado en Wiktionary (licencia CC BY-SA). · <a href="privacy.html">Privacidad</a></p>
      <button class="btn danger" data-a="reset">Borrar todo mi progreso</button>`;
  },
};

// Ajustes → Tu cuenta: iniciar sesión con Google para guardar el progreso en Drive
const ago = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
function cloudSettings() {
  if (cloud.configured === false) return '<h3>Tu cuenta</h3><p class="muted">El inicio de sesión con Google todavía no está configurado en este servidor.</p>';
  if (cloud.configured === null) return '';
  if (!cloud.signedIn) return `<h3>Tu cuenta</h3>
    <div class="card left"><p><b>Guardá tu progreso en tu cuenta de Google.</b> Se sincroniza solo: si cambiás de compu o de celular, o borrás el navegador, iniciás sesión y lo recuperás.</p>
      <button class="btn primary" data-a="cloudlogin">Iniciar sesión con Google</button>
      <p class="muted">Se guarda en una carpeta privada de tu Google Drive que solo usa G'day. G'day no puede ver tus otros archivos.</p>
      ${cloud.error === 'expired' ? '<p class="tip">Tu sesión se cerró (se quitó el permiso desde tu cuenta de Google). Iniciá sesión de nuevo.</p>' : ''}</div>`;
  const st = cloud.state === 'sync' ? 'Sincronizando…'
    : cloud.state === 'error' ? 'No se pudo conectar con Google Drive. Tu progreso queda en este navegador y se sube solo cuando vuelva la conexión.'
    : cloud.at ? `Sincronizado ${ago(cloud.at)}.` : '';
  return `<h3>Tu cuenta</h3>
    <div class="card left"><p>✓ Sesión iniciada como <b>${esc(cloud.email || 'tu cuenta de Google')}</b>. Tu progreso se guarda solo en tu Google Drive.</p>
      ${st ? `<p class="${cloud.state === 'error' ? 'tip' : 'muted'}">${st}</p>` : ''}
      ${colForCloud() ? '<p class="muted">Los mazos importados también se sincronizan, pero sin sus imágenes ni audios.</p>' : ''}
      <div class="row"><button class="btn ghost" data-a="cloudsync">Sincronizar ahora</button><button class="btn ghost" data-a="cloudlogout">Cerrar sesión</button></div></div>`;
}

const ACCENTS = {
  violet: ['#8b5cf6', '#c4b5fd', '#7c3aed', '#a855f7'], blue: ['#3b82f6', '#93c5fd', '#2563eb', '#60a5fa'],
  green: ['#10b981', '#6ee7b7', '#059669', '#34d399'], pink: ['#ec4899', '#f9a8d4', '#db2777', '#f472b6'],
  orange: ['#f97316', '#fdba74', '#ea580c', '#fb923c'], teal: ['#14b8a6', '#5eead4', '#0d9488', '#2dd4bf'],
};
function applyUI() {
  const u = { theme: 'dark', accent: 'violet', scale: 100, ...S.settings.ui }, el = document.documentElement, [a, a2, acc, acc2] = ACCENTS[u.accent] || ACCENTS.violet;
  el.dataset.theme = u.theme === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : u.theme;
  el.style.setProperty('--violet', a);
  el.style.setProperty('--violet2', el.dataset.theme === 'light' ? acc : a2);
  el.style.setProperty('--acc', acc); el.style.setProperty('--acc2', acc2);
  for (const id of ['app', 'nav']) { const n = document.getElementById(id); if (n) n.style.zoom = u.scale / 100; }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', el.dataset.theme === 'light' ? '#f6f3fc' : '#0a0710');
}

function render() {
  applyUI();
  const r = views[route()] ? route() : 'home';
  $('#app').innerHTML = views[r]();
  views[r].after?.();
  $('#app').classList.toggle('wide', r === 'watch' || r === 'lobby');
  renderSide();
  const tab = r === 'closet' ? 'lobby' : CARDS.includes(r) ? 'cards' : r === 'done' || r === 'stats' ? 'home' : PRACTICE.includes(r) ? 'practice' : r;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + tab));
}

/* ---------- acciones ---------- */
const audioURL = b => b ? URL.createObjectURL(b) : null;
function finishShadow(token, res) {
  if (ui.token !== token) return;
  const p = SHADOW.find(x => x.id === ui.id);
  ui.listening = false; ui.cap = null; ui.audio = audioURL(res.audio);
  if (res.error === 'nosr') ui.selfRate = true;
  else if (!res.text) ui.error = micMsg(res);  // no cuenta como intento
  else {
    ui.tries++;
    ui.said = res.text; ui.result = compare(p.en, res.text);
    const st = (S.shadow[p.id] ??= { n: 0, best: 0 });
    st.n++; st.best = Math.max(st.best, ui.result.score); log().shadow++;
    if (ui.result.score < 0.6 && ui.tries >= 2 && addCustom(p.en, p.es, 'shadow')) toast('Frase agregada a tus tarjetas');
    save();
  }
  render();
}

function finishSpeak(token, res) {
  if (ui.token !== token) return;
  const audio = audioURL(res.audio); ui.cap = null;
  const p = PROMPTS.find(x => x.id === ui.id), secs = Math.max(1, (Date.now() - ui.t0) / 1000);
  const w = words(res.text), flat = ' ' + w.join(' ') + ' ';
  const used = p.helps.map(([en]) => flat.includes(' ' + words(en.split('...')[0]).join(' ') + ' '));
  ui.audio = audio; ui.stage = 'done'; ui.error = res.error !== 'nosr' && !res.text ? micMsg(res) : '';
  ui.result = { hasText: w.length > 0, text: res.text, words: w.length, wpm: Math.round(w.length / secs * 60), unique: new Set(w).size, used };
  if (w.length) p.helps.forEach(([en, es], i) => { if (!used[i]) addCustom(en, es, 'speak'); });
  if (!ui.error) {
    S.speak.push({ date: dayKey(), pid: p.id, words: w.length, wpm: ui.result.wpm, sec: Math.round(secs) });
    log().speak++; save();
  }
  render();
}
const stopSpeak = () => {
  if (ui.stage !== 'rec' || ui.stopping || !ui.cap) return;
  ui.stopping = true; ui.cap.stop();
  const b = $('[data-a="speakstop"]'); if (b) { b.textContent = 'Terminando…'; b.classList.remove('rec'); }
};
const live = t => { const el = $('#live'); if (el) el.textContent = t; };

const actions = {
  session() {
    session = { i: 0, t: 0, extra: log().sec >= planFor().total * 60 };
    startStep();
  },
  setlevel(d) {
    Object.assign(S.settings, { level: Math.min(3, Math.max(1, +d.l || 1)), levelSet: true });
    delete S.dayPlan; save(); render(); scrollTo(0, 0);
  },
  setgoal(d) {
    Object.assign(S.settings, { goal: +d.m, planSet: true, planStart: S.settings.planStart || dayKey() });
    delete S.dayPlan; save(); render();
  },
  skip() { session ? nextStep() : go('home'); },
  say(d) { say(d.t, d.r ? +d.r : undefined); },
  play() { if (ui.audio) new Audio(ui.audio).play(); },
  shadowrec() {
    if (ui.listening) { ui.cap?.stop(); return; }
    hush();
    const token = ui.token = Math.random();
    Object.assign(ui, { listening: true, result: null, error: '', selfRate: false, audio: null });
    render();
    ui.cap = capture(live, { once: true });
    ui.cap.promise.then(res => finishShadow(token, res));
  },
  self(d) {
    const p = SHADOW.find(x => x.id === ui.id), st = (S.shadow[p.id] ??= { n: 0, best: 0 });
    st.n++; if (+d.v) st.best = 1; log().shadow++; save();
    actions.shadownext();
  },
  readdone() {
    const st = (S.shadow[ui.id] ??= { n: 0, best: 0 });
    st.r = (st.r || 0) + 1; log().shadow++; save();  // 'r' = veces leída (no cuenta para el repaso de errores)
    actions.shadownext();
  },
  shadownext() {
    hush();
    if (stepDone()) return nextStep();
    ui = { prev: ui.id }; render();
  },
  tocard() {
    const p = readPool().find(x => x.id === ui.id);
    toast(addCustom(p.en, p.es, 'shadow') ? 'Agregada a tus tarjetas' : 'Ya está en tu mazo');
  },
  speakstart() {
    hush();
    const token = ui.token = Math.random();
    ui.stage = 'rec'; ui.t0 = Date.now(); ui.stopping = false; render();
    ui.cap = capture(live);
    ui.cap.promise.then(res => finishSpeak(token, res));
  },
  speakstop: stopSpeak,
  speakretry() { ui = { id: ui.id, stage: 'intro', limit: ui.limit }; render(); },
  speaknext() { hush(); ui = { prev: ui.id }; render(); },
  export() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
    a.download = `gday-respaldo-${dayKey()}.json`; a.click();
  },
  async persist() {
    await askPersist();
    toast(persisted ? 'Listo: tu progreso está protegido' : 'El navegador todavía no lo permite');
    render();
  },
  async filepick() {
    try {
      fileHandle = await showSaveFilePicker({ suggestedName: 'gday-progreso.json', types: [{ description: "Progreso de G'day", accept: { 'application/json': ['.json'] } }] });
      await kvSet('progressFile', fileHandle); fileOk = true; await writeFile(); toast('Listo: el progreso se guarda en ese archivo'); render();
    } catch (e) { if (e?.name !== 'AbortError') toast('No se pudo usar ese archivo'); }
  },
  async filereconnect() {
    try { fileOk = await fileHandle.requestPermission({ mode: 'readwrite' }) === 'granted'; if (fileOk) { await writeFile(); toast('Guardando de nuevo en el archivo'); } } catch {}
    render();
  },
  async filestop() { fileHandle = null; fileOk = false; await kvSet('progressFile', null); render(); },
  reset() { if (confirm('¿Borrar todo tu progreso? No se puede deshacer.')) { S = defaults(); S.resetAt = Date.now(); save(); go('home'); } },
  cloudlogin() { cloudLogin(); },
  // al activarla se pide almacenamiento persistente: si no, el navegador puede borrar los 90 MB cuando le falta espacio
  kokoro() { S.settings.kokoro = !S.settings.kokoro; save(); if (S.settings.kokoro) { askPersist(); kokoroStart(); } else kokoroStop(); render(); },
  kokororetry() { kokoroStop(); kokoroStart(); render(); },
  async rankjoin() {
    const nick = ($('#ranknick')?.value || '').replace(/\s+/g, ' ').trim();
    if (!/^[\wáéíóúñüÁÉÍÓÚÑÜ .'-]{2,20}$/.test(nick)) return toast('El apodo tiene que tener de 2 a 20 letras o números');
    S.settings.rankNick = nick; save();
    await rankSend(true);
    if (rank.err) return toast(rank.err === 'nologin' ? 'Iniciá sesión con Google de nuevo' : 'No se pudo unir al ranking');
    toast('¡Listo! Ya estás en el ranking'); render();
  },
  async rankleave() {
    if (!confirm('¿Salir del ranking? Se borran tus minutos y tu apodo del ranking.')) return;
    try { await rankCall('rankleave', {}); } catch { return toast('No se pudo salir del ranking. Probá de nuevo.'); }
    delete S.settings.rankNick; save(); rank.data = null; toast('Saliste del ranking'); render();
  },
  async cloudlogout() {
    if (!confirm('¿Cerrar sesión? Tu progreso queda guardado en tu cuenta de Google y en este navegador.')) return;
    await cloudLogout(); toast('Sesión cerrada'); render();
  },
  async cloudsync() { await cloudSyncNow(); toast(cloud.state === 'ok' ? 'Progreso sincronizado' : 'No se pudo conectar con Google Drive'); render(); },
};

// respaldo cuando el reconocimiento falla: se escribe o se dicta con el teclado del celular
document.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'shadowtype') return;
  e.preventDefault();
  const t = String(new FormData(e.target).get('t') || '').trim();
  if (!t || ui.listening) return;
  finishShadow(ui.token = Math.random(), { text: t, error: null, audio: null });
});

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && actions[el.dataset.a]) actions[el.dataset.a](el.dataset);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'imp' && t.files[0]) {
    t.files[0].text().then(txt => {
      try {
        const d = JSON.parse(txt);
        if (!d.settings || !d.cards) throw 0;
        d.resetAt = Date.now();  // el respaldo reemplaza también al progreso de la nube
        localStorage.setItem(KEY, JSON.stringify(d)); S = load(); save(); toast('Respaldo importado'); render();
      } catch { toast('Ese archivo no es un respaldo válido'); }
    });
  }
  if (t.dataset.set2) {  // ajustes agrupados, por ejemplo "ui.theme"
    const [g, key] = t.dataset.set2.split('.'), raw = t.type === 'checkbox' ? t.checked : t.value;
    (S.settings[g] ??= {})[key] = t.type === 'range' || /^-?\d+(\.\d+)?$/.test(raw) ? +raw : raw;
    save(); return render();
  }
  const k = t.dataset.set;
  if (!k) return;
  S.settings[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' || k === 'level' || k === 'goal' ? Math.max(+t.min || 0, +t.value || 0) : t.value;
  if (k === 'goal' || k === 'autoNew') delete S.dayPlan;  // se recalculan las tarjetas nuevas de hoy
  save(); render();
});

window.addEventListener('hashchange', () => {
  if (route() === 'rank') rank.tried = 0;
  hush();
  if (ui.cap) { ui.token = null; ui.cap.stop(); }
  if (session && route() !== STEPS[session.i] && route() !== 'done') session = null;
  ui = {}; render(); scrollTo(0, 0);
});

setInterval(() => {
  if (document.visibilityState !== 'visible' || !COUNTED.includes(route())) return;
  studyTick(KIND_OF[route()]);  // los videos se cuentan aparte, solo mientras se reproducen (watch.js)
  if (route() === 'speak' && ui.stage === 'rec') {
    const left = ui.limit - Math.floor((Date.now() - ui.t0) / 1000), c = $('#count');
    if (c) c.textContent = Math.max(0, left);
    if (left <= 0) stopSpeak();
  }
}, 1000);

views.watch = watchView;
views.lobby = lobbyView;
views.closet = closetView;
views.review = views.shadow;
Object.assign(views, practiceViews);
Object.assign(views, ankiViews);
Object.assign(actions, watchActions, practiceActions, ankiActions, lobbyActions);
const getSession = () => session;
export { levelInfo, checkLevel, totalHours };
export { pickFresh, markSeen };
export { studyDay, dayNo, dayAt, fsrsW };
export { S, save, log, toast, esc, say, sayNext, hush, listen, capture, micMsg, canHear, compare, words, SR, addCustom, render, dayKey, streak,
  schedule, fmtDays, getSession, nextStep, sessBanner, STEP_SECS, routeArg, planFor, stepDone, studyTick };

render();
syncFromServer();
initFile().then(() => { if (route() === 'settings') render(); });
loadCollection().then(() => cloudInit({
  getProgress: () => S,
  setProgress(d, how) {
    localStorage.setItem(KEY, JSON.stringify(d)); S = load(); if (how === 'recovered') ui = {}; render();
    toast(how === 'recovered' ? 'Progreso recuperado de tu cuenta' : 'Progreso actualizado desde tu cuenta');
  },
  getCol: colForCloud,
  setCol: colFromCloud,
  changed: () => { if (route() === 'settings') render(); },
  toast,
}));
watchColSaves(() => cloudSaved('col'));
askPersist().then(() => { if (route() === 'settings') render(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
