// G'day · voz: Kokoro (voz natural, en el navegador) si está activada y lista; si no, la mejor voz del sistema.
// Kokoro corre en tts-worker.js. Cada frase generada se guarda en memoria, así la segunda vez suena al instante.
// Las frases largas se generan por partes: la primera suena apenas está lista y las demás se preparan mientras tanto.

export const KVOICES = [
  ['bf_emma', 'Emma · británica'], ['bf_isabella', 'Isabella · británica'], ['bm_george', 'George · británico'],
  ['bm_lewis', 'Lewis · británico'], ['af_heart', 'Heart · estadounidense'], ['am_michael', 'Michael · estadounidense'],
];
export const kokoro = { state: 'off', loaded: 0, total: 0, error: '', cached: false };  // off · loading · ready · error

const UA = navigator.userAgent;
const IOS = /iPhone|iPad|iPod/i.test(UA) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
const MOBILE = IOS || /Android/i.test(UA);
// cuánto se espera a la voz natural antes de usar la del sistema (generar una frase en el celular tarda más)
const FIRST_WAIT = MOBILE ? 12000 : 9000;
const LOAD_WAIT = MOBILE ? 15000 : 8000;  // si ya está descargada y se está cargando
const BOOT = 'gday-kokoro-boot', OK = 'gday-kokoro-ok';
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} return null; };

const MSG = {
  unsupported: 'Este navegador no puede usar la voz natural (le falta WebAssembly o los "workers"; en iPhone pasa con el Modo Aislamiento). Habla la voz del sistema.',
  net: 'No se pudo descargar la voz natural. Revisá tu conexión y tocá Reintentar. Mientras tanto habla la voz del sistema.',
  mem: 'Este equipo se quedó sin memoria para la voz natural. Cerrá otras pestañas o apps y tocá Reintentar. Mientras tanto habla la voz del sistema.',
  crash: 'La última vez la voz natural no terminó de cargar (suele pasar en celulares con poca memoria). Mientras tanto habla la voz del sistema. Tocá Reintentar para probar de nuevo.',
  other: 'La voz natural falló al cargar. Tocá Reintentar. Mientras tanto habla la voz del sistema.',
};

let worker = null, nextId = 0, onChange = () => {}, retries = 0, heard = 0, readyWait = [];
const waiting = new Map(), cache = new Map(), inflight = new Map();  // inflight: clave -> { p: promesa, id }
const synth = window.speechSynthesis;

export function kokoroInit(changed) { onChange = changed || onChange; }

function unsupported() {
  if (typeof Worker === 'undefined' || typeof WebAssembly !== 'object') return MSG.unsupported;
  return '';
}
function failPending() { for (const w of waiting.values()) w({}); waiting.clear(); inflight.clear(); }
function wakeWaiters() { const w = readyWait; readyWait = []; w.forEach(f => f()); }
function setError(kind) {
  kokoro.state = 'error'; kokoro.error = MSG[kind] || MSG.other;
  ls(BOOT, null); wakeWaiters(); onChange();
}
// apaga el worker (si quedó colgado o lo cerró el sistema) y lo vuelve a arrancar
function restart(kind) {
  worker?.terminate(); worker = null; failPending();
  if (retries >= (kind === 'mem' ? 1 : 2)) return setError(kind);
  retries++;
  kokoro.state = 'loading'; onChange();
  setTimeout(() => { if (!worker && kokoro.state === 'loading') spawn(); }, kind === 'net' ? 3000 : 500);
}

// arranca la descarga (la primera vez) o la carga desde el navegador (las siguientes).
// auto: arranque solo al abrir la página. En el celular no se intenta si las dos últimas cargas se cortaron (falta de memoria).
export function kokoroStart({ auto = false } = {}) {
  if (worker || kokoro.state === 'loading') return;
  const no = unsupported();
  if (no) { kokoro.state = 'error'; kokoro.error = no; onChange(); return; }
  if (auto && MOBILE && +(ls(BOOT) || 0) >= 2) { kokoro.state = 'error'; kokoro.error = MSG.crash; onChange(); return; }
  retries = 0;
  kokoro.state = 'loading'; kokoro.error = ''; onChange();
  if (ls(OK)) kokoro.cached = true;
  // ¿ya está descargada? se mira acá mismo, así la página sabe enseguida si conviene esperarla
  try {
    caches?.open('transformers-cache').then(c => c.keys())
      .then(ks => { kokoro.cached = ks.some(r => r.url.includes('Kokoro-82M') && r.url.endsWith('.onnx')); onChange(); }).catch(() => {});
  } catch {}
  spawn();
}
function spawn() {
  ls(BOOT, String(+(ls(BOOT) || 0) + 1));  // si la página se cierra de golpe a mitad de carga, queda anotado
  try { worker = new Worker(new URL('./tts-worker.js', import.meta.url), { type: 'module' }); }
  catch { worker = null; return setError('unsupported'); }
  const me = worker;
  me.onmessage = e => {
    if (me !== worker) return;
    const m = e.data; heard = Date.now();
    if (m.type === 'cached') { kokoro.cached = kokoro.cached || m.cached; onChange(); }
    if (m.type === 'progress') { kokoro.loaded = m.loaded; kokoro.total = m.total; onChange(); }
    if (m.type === 'ready') { kokoro.state = 'ready'; retries = 0; ls(BOOT, null); ls(OK, '1'); wakeWaiters(); onChange(); }
    if (m.type === 'error') {
      // sin conexión: se espera a que vuelva y se reintenta solo
      if (m.kind === 'net' && navigator.onLine === false) {
        worker?.terminate(); worker = null; failPending(); setError('net');
        addEventListener('online', () => { if (kokoro.state === 'error') kokoroStart(); }, { once: true });
        return;
      }
      restart(m.kind);
    }
    if (m.type === 'audio') { const w = waiting.get(m.id); waiting.delete(m.id); w?.(m); }
  };
  // el worker se cayó: no pudo bajar sus bibliotecas, el navegador no soporta workers de módulo, o se quedó sin memoria
  me.onerror = ev => { ev?.preventDefault?.(); if (me === worker) restart(navigator.onLine === false ? 'net' : 'other'); };
  me.postMessage({ type: 'load', voice: lastVoice });
}
export function kokoroStop() {
  worker?.terminate(); worker = null; failPending(); retries = 0; ls(BOOT, null);
  Object.assign(kokoro, { state: 'off', loaded: 0, total: 0, error: '', cached: false }); wakeWaiters(); onChange();
}
// espera a que termine de cargar (como mucho ms milisegundos)
function whenReady(ms) {
  if (kokoro.state !== 'loading') return Promise.resolve();
  return new Promise(r => { readyWait.push(r); setTimeout(r, ms); });
}
// ¿el worker sigue vivo? (en el celular, el sistema puede cerrarlo cuando la página queda en segundo plano)
let pinging = false;
function check() {
  if (!worker || kokoro.state !== 'ready' || pinging) return;
  pinging = true;
  const sent = Date.now();
  worker.postMessage({ type: 'ping' });
  setTimeout(() => { pinging = false; if (worker && kokoro.state === 'ready' && heard < sent) restart('other'); }, 20000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
addEventListener('pageshow', e => { if (e.persisted) check(); });

let lastVoice = 'bf_emma';
function generate(text, voice, speed, prio = 'now') {
  const key = `${voice}|${speed}|${text}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (!worker) return Promise.resolve(null);
  const f = inflight.get(key);
  if (f) { if (prio === 'now') worker.postMessage({ type: 'promote', id: f.id }); return f.p; }
  const id = ++nextId;
  const p = new Promise(res => {
    waiting.set(id, m => {
      if (!m.blob) return res(null);
      const url = URL.createObjectURL(m.blob);
      cache.set(key, url);
      if (cache.size > 300) { const [k, u] = cache.entries().next().value; cache.delete(k); URL.revokeObjectURL(u); }
      res(url);
    });
    worker.postMessage({ type: 'gen', id, text, voice, speed, prio });
  }).finally(() => inflight.delete(key));
  inflight.set(key, { p, id });
  return p;
}

// Parte el texto en frases (y las muy largas, en las comas) para que la primera parte suene antes.
function parts(text) {
  if (text.length <= 70) return [text];
  const out = [];
  let cur = '';
  // (sin "lookbehind" en las expresiones: Safari viejo no lo entiende y no cargaría el archivo)
  for (const piece of text.match(/[^.!?…;]+(?:[.!?…;]+["')\]]*|$)/g) || [text]) {
    const t = piece.trim(); if (!t) continue;
    cur = cur ? cur + ' ' + t : t;
    if (cur.length >= 20) { out.push(cur); cur = ''; }
  }
  if (cur) out.length ? (out[out.length - 1] += ' ' + cur) : out.push(cur);
  // una frase de más de 110 letras se corta en una coma
  return out.flatMap(s => {
    if (s.length <= 110) return [s];
    const r = []; let c = '';
    for (const w of s.match(/[^,]+(?:,|$)/g).map(x => x.trim()).filter(Boolean)) { if (c && (c + ' ' + w).length > 90 && c.length >= 25) { r.push(c); c = w; } else c = c ? c + ' ' + w : w; }
    if (c) r.push(c);
    return r;
  });
}

/* ---------- voz del sistema: la mejor disponible ---------- */
// Las voces "Natural", "Online", "Premium", "Enhanced" o de Google suenan mucho mejor que las básicas.
// Se evitan las voces de juguete de Apple (Bells, Bubbles, Zarvox…).
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
export const enVoices = () => (synth ? synth.getVoices().filter(v => /^en/i.test(v.lang)) : []);
const quality = v => (/natural|neural|online/i.test(v.name) ? 6 : 0) + (/premium/i.test(v.name) ? 5 : 0) + (/enhanced|mejorada/i.test(v.name) ? 4 : 0)
  + (/google/i.test(v.name) ? 3 : 0) + (/en[-_](AU|GB)/i.test(v.lang) ? 1 : /en[-_]US/i.test(v.lang) ? 0.5 : 0) - (NOVELTY.test(v.name) ? 20 : 0);
export function pickVoice(chosen) {
  const vs = enVoices();
  return vs.find(v => v.voiceURI === chosen) || [...vs].sort((a, b) => quality(b) - quality(a))[0];
}
export const goodSystemVoice = () => { const v = pickVoice(); return v && quality(v) >= 3; };

/* ---------- desbloqueo del audio en el celular ---------- */
// iPhone (y a veces Android) solo deja sonar audio que arranca con un toque. La voz natural tarda en generarse,
// así que cuando está lista el toque ya "pasó" y el navegador la bloquea. Solución: un único reproductor que se
// "despierta" con el primer toque (un sonido mudo); después ese mismo reproductor puede sonar sin toque.
let player = null, unlocked = false, endPlay = null;
function getPlayer() {
  if (!player) { player = new Audio(); player.setAttribute('playsinline', ''); player.preload = 'auto'; }
  return player;
}
function silence() {
  const n = 800, b = new Uint8Array(44 + n), d = new DataView(b.buffer), s = (o, t) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0));
  s(0, 'RIFF'); d.setUint32(4, 36 + n, true); s(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, 8000, true); d.setUint32(28, 8000, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true); s(36, 'data'); d.setUint32(40, n, true);
  b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
const UNLOCK = ['touchend', 'pointerup', 'click', 'keydown'];
function unlock() {
  if (unlocked) return;
  unlocked = true;
  UNLOCK.forEach(t => removeEventListener(t, unlock, true));
  const p = getPlayer();
  if (p.paused && !p.src) { p.src = silence(); p.play().catch(() => {}); }
  // la voz del sistema en iPhone también necesita que la primera frase sea con un toque
  if (synth && MOBILE && !synth.speaking) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch {} }
}
UNLOCK.forEach(t => addEventListener(t, unlock, { capture: true, passive: true }));

/* ---------- hablar y callar ---------- */
export let lastTalk = 0;
let pending = false;  // se está generando la voz natural de lo que hay que decir
export const talking = () => !!(pending || endPlay || synth?.speaking || synth?.pending);

let current = 0;
export function hush() {
  current++; pending = false;
  worker?.postMessage({ type: 'cancel' });
  synth?.cancel();
  if (player) player.pause();
  endPlay?.(false); endPlay = null;
}

function systemSay(text, rate, chosen) {
  if (!synth || !text) return;
  const u = new SpeechSynthesisUtterance(text), v = pickVoice(chosen);
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-GB';
  u.rate = rate;
  lastTalk = Date.now(); u.onend = u.onerror = () => { lastTalk = Date.now(); };
  synth.speak(u);
}
// suena una parte; devuelve true si terminó bien, false si el navegador no la dejó sonar
function play(url) {
  return new Promise(res => {
    const p = getPlayer();
    endPlay = ok => { endPlay = null; lastTalk = Date.now(); res(ok); };
    p.onended = () => endPlay?.(true);
    p.onerror = () => endPlay?.(false);
    p.src = url;
    lastTalk = Date.now();
    p.play().catch(() => endPlay?.(false));
  });
}

// rate: 0.8 a 1 (más lento para niveles bajos). Con Kokoro activado se espera a la voz natural: si ya está descargada
// y todavía carga, unos segundos; si la frase no estaba preparada, lo que tarde en generarse la primera parte.
// Solo si eso se pasa de largo (o falla) habla la voz del sistema, y la voz natural queda guardada para la próxima vez.
export async function speak(text, { rate = 1, kvoice = 'bf_emma', sysVoice = '' } = {}) {
  hush();
  const my = ++current;
  text = String(text || '').trim();
  if (!text) return;
  lastVoice = kvoice;
  pending = true;
  try {
    if (kokoro.state === 'loading' && kokoro.cached) await whenReady(LOAD_WAIT);
    if (my !== current) return;
    if (kokoro.state !== 'ready' || !worker) return systemSay(text, rate, sysVoice);
    const speed = Math.max(0.7, Math.min(1.2, rate)), ps = parts(text);
    const jobs = ps.map(p => generate(p, kvoice, speed));
    const first = await Promise.race([jobs[0], new Promise(r => setTimeout(() => r('slow'), FIRST_WAIT))]);
    if (my !== current) return;
    if (first === 'slow') check();  // ¿se colgó el worker?
    if (!first || first === 'slow') return systemSay(text, rate, sysVoice);
    pending = false;
    for (let i = 0; i < ps.length; i++) {
      const url = i ? await jobs[i] : first;
      if (my !== current) return;
      if (!url || !(await play(url))) {
        if (my !== current) return;
        return systemSay(ps.slice(i).join(' '), rate, sysVoice);  // lo que falta, con la voz del sistema
      }
      if (my !== current) return;
    }
  } finally { if (my === current) pending = false; }
}
// genera de antemano (por ejemplo, la tarjeta siguiente) para que suene al instante
export function prefetch(text, { rate = 1, kvoice = 'bf_emma' } = {}) {
  text = String(text || '').trim();
  if (kokoro.state !== 'ready' || !worker || !text) return;
  const speed = Math.max(0.7, Math.min(1.2, rate));
  for (const p of parts(text)) generate(p, kvoice, speed, 'later');
}
