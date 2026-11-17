// Ver y aprender: reproductor con subtítulos interactivos (YouTube o video propio).
import { DECK, AUSSIE } from './data.js';
import { S, save, log, toast, esc, listen, micMsg, canHear, compare, SR, addCustom, render, sessBanner, studyTick, totalHours } from './app.js';
import { masteredWords } from './anki.js';
import { coverage, coverageMsg, MIN_HOURS } from './vocab.js';

const $ = s => document.querySelector(s);
const TIME = /^(\d{1,2}(?::\d{2}){1,2})$/;
const TIME_INLINE = /^(\d{1,2}(?::\d{2}){1,2})\s+(.+)$/;
let W = null;      // video abierto
let pending = {};  // archivo de video elegido en el formulario

/* ---------- subtítulos ---------- */
const toSec = t => t.trim().replace(',', '.').split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
const cleanLine = s => s.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/[\u200b-\u200d\ufeff]/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Acepta .srt, .vtt o la transcripción copiada de YouTube ("0:01" y el texto debajo).
export function parseSubs(raw = '') {
  raw = raw.replace(/\r/g, '').replace(/^﻿/, '');
  const cues = [];
  if (raw.includes('-->')) {
    const blocks = [];
    for (const line of raw.split('\n')) {
      if (line.includes('-->')) {
        const prev = blocks.at(-1);
        if (prev && /^\d+$/.test(prev.body.at(-1)?.trim())) prev.body.pop();  // número de línea del .srt
        const [a, b] = line.split('-->');
        blocks.push({ start: toSec(a), end: toSec(b.trim().split(/\s+/)[0]), body: [] });
      } else if (line.trim() && blocks.length) blocks.at(-1).body.push(line);
    }
    let prevRaw = '';
    for (const { start, end, body } of blocks) {
      const full = cleanLine(body.join(' '));
      if (!full || full === prevRaw) continue;  // bloques repetidos
      // subtítulos automáticos de YouTube: cada bloque repite lo anterior y agrega lo nuevo
      const text = prevRaw && full.startsWith(prevRaw + ' ') ? full.slice(prevRaw.length).trim() : full;
      prevRaw = full;
      if (text) cues.push({ start, end, text });
    }
  } else {
    let cur = null;
    for (const l of raw.split('\n').map(x => x.trim()).filter(Boolean)) {
      let m;
      if ((m = l.match(TIME))) { cur = { start: toSec(m[1]), text: '' }; cues.push(cur); }
      else if ((m = l.match(TIME_INLINE))) { cur = { start: toSec(m[1]), text: m[2] }; cues.push(cur); }
      else if (cur) cur.text += ' ' + l;
    }
    cues.forEach((c, i) => { c.text = cleanLine(c.text); c.end = cues[i + 1]?.start ?? c.start + 4; });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues.filter((c, i) => c.text && c.text !== cues[i - 1]?.text)
    .map(c => ({ ...c, end: Math.max(c.end, c.start + 0.5) }));
}

// Para cada línea en inglés, junta las líneas en español que se superponen en el tiempo.
const align = (en, es) => en.map(c => es
  .filter(e => Math.min(c.end, e.end) - Math.max(c.start, e.start) > Math.min(0.3, (c.end - c.start) / 3))
  .map(e => e.text).join(' '));

/* ---------- diccionario (el mismo mazo de la app) ---------- */
const norm = s => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\.\.\.|[?!.,"]/g, '').replace(/^to /, '').trim();
let base;
function dict() {
  base ??= new Map([...DECK, ...AUSSIE].reverse().map(e => [norm(e.en), e]));
  return k => S.custom.find(e => norm(e.en) === k) || base.get(k);
}
const tok = w => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, '');
const stems = w => [...new Set([w, w.replace(/^(ran|run)$/, 'run'), w.replace(/^(got|gets|getting)$/, 'get'), w.replace(/^(went|goes|going|gone)$/, 'go'), w.replace(/^(made|makes|making)$/, 'make'), w.replace(/^(took|taken|takes|taking)$/, 'take'), w.replace(/^(came|comes|coming)$/, 'come'), w.replace(/^(gave|given|gives|giving)$/, 'give'), w.replace(/^(found)$/, 'find'), w.replace(/^(put|puts|putting)$/, 'put'),w.replace(/'s$/, ''), w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''),
  w.replace(/ied$/, 'y'), w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/(.)\1ed$/, '$1'),
  w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/(.)\1ing$/, '$1')])].filter(x => x.length > 1);

// Busca primero frases de 4 a 2 palabras que incluyan la tocada, después la palabra sola.
export function lookup(words, i) {
  const get = dict(), t = words.map(tok);
  for (let len = 4; len >= 2; len--)
    for (let s = Math.max(0, i - len + 1); s <= i && s + len <= t.length; s++) {
      // la primera palabra puede venir conjugada: "looking forward to" → "look forward to"
      const rest = t.slice(s + 1, s + len).join(' ');
      for (const first of stems(t[s] || '')) {
        const e = get(first + ' ' + rest);
        if (e) return { e, from: s, to: s + len - 1 };
      }
    }
  for (const k of stems(t[i])) { const e = get(k); if (e) return { e, from: i, to: i }; }
  return { e: null, from: i, to: i };
}

/* ---------- reproductor ---------- */
const fsIcon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
function fakeFs(el) {
  const on = !el.classList.contains('fake-fs');
  el.classList.toggle('fake-fs', on); document.body.classList.toggle('noscroll', on);
  fitFs();
  onFs();
}
// En iPhone, después de girar la página puede quedar corrida o con zoom: el reproductor se ubica
// exactamente sobre la parte de la pantalla que se ve (visualViewport), no sobre la página.
function fitFs() {
  const el = $('#pwrap'); if (!el) return;
  const st = el.style, rotated = matchMedia('(orientation: portrait) and (max-width: 700px)').matches;
  if (!el.classList.contains('fake-fs') || rotated) { st.left = st.top = st.width = st.height = ''; return; }
  const vv = window.visualViewport;
  st.left = (vv ? vv.offsetLeft : 0) + 'px'; st.top = (vv ? vv.offsetTop : 0) + 'px';
  st.width = (vv ? vv.width : innerWidth) + 'px'; st.height = (vv ? vv.height : innerHeight) + 'px';
}
window.visualViewport?.addEventListener('resize', fitFs);
window.visualViewport?.addEventListener('scroll', fitFs);
addEventListener('resize', () => setTimeout(fitFs, 50));
const onFs = () => {
  const el = $('#pwrap'); if (!el) return;
  el.classList.toggle('is-fs', !!(document.fullscreenElement || document.webkitFullscreenElement) || el.classList.contains('fake-fs'));
};
// Celular: al girarlo de costado, el video ocupa toda la pantalla solo; al enderezarlo, vuelve.
const phoneLandscape = () => navigator.maxTouchPoints > 0 && matchMedia('(orientation: landscape) and (max-height: 540px)').matches;
// Safari en iPhone no deja que una página oculte sus barras: solo desde el ícono de inicio se ve de verdad completo
const IOS_SAFARI = (/iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)))
  && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
const tipSeen = () => { try { return localStorage.getItem('gday-fstip') === '1'; } catch { return false; } };
function fsTip(el) {
  if (!IOS_SAFARI || tipSeen() || el.querySelector('.fstip')) return;
  el.insertAdjacentHTML('beforeend', `<div class="fstip"><p><b>Para verlo sin las barras de Safari:</b> tocá Compartir
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
    → <b>Agregar a inicio</b>, y abrí G'day desde ese ícono.</p><button class="btn ghost sm" data-a="wfstip">Entendido</button></div>`);
}
// en pantalla completa, los botones de arriba se esconden solos para dejarle todo el alto al video
let idleT;
function wake() {
  const el = $('#pwrap'); if (!el?.classList.contains('is-fs')) return;
  el.classList.remove('idle'); clearTimeout(idleT);
  idleT = setTimeout(() => el.classList.add('idle'), 3000);
}
document.addEventListener('touchstart', e => { if (e.target.closest?.('#pwrap')) wake(); }, { passive: true });
document.addEventListener('mousemove', e => { if (e.target.closest?.('#pwrap')) wake(); });

function autoFs() {
  const el = $('#pwrap'); if (!el || !W) return;
  const on = el.classList.contains('fake-fs') || document.fullscreenElement || document.webkitFullscreenElement;
  if (!phoneLandscape()) delete el.dataset.off;  // al enderezarlo se olvida que lo cerraste a mano
  if (phoneLandscape() && !on && !el.dataset.off) { el.dataset.auto = '1'; fakeFs(el); scrollTo(0, 0); wake(); fsTip(el); }
  else if (!phoneLandscape() && el.dataset.auto) { delete el.dataset.auto; if (el.classList.contains('fake-fs')) fakeFs(el); }
}
matchMedia('(orientation: landscape)').addEventListener?.('change', () => setTimeout(autoFs, 250));
addEventListener('orientationchange', () => setTimeout(autoFs, 400));
addEventListener('resize', () => setTimeout(autoFs, 250));
setInterval(() => { if (W && navigator.maxTouchPoints > 0) autoFs(); }, 1000);  // por si el navegador no avisa del giro
document.addEventListener('fullscreenchange', onFs);
document.addEventListener('webkitfullscreenchange', onFs);
document.addEventListener('keydown', e => {
  const el = $('#pwrap');
  if (e.key === 'Escape' && el?.classList.contains('fake-fs')) fakeFs(el);
});

let hlsReady;
const loadHls = () => hlsReady ??= new Promise(res => {
  const s = document.createElement('script'); s.src = 'vendor/hls.min.js'; s.onload = s.onerror = res; document.head.append(s);
});

let ytReady;
const loadYT = () => ytReady ??= new Promise(res => {
  window.onYouTubeIframeAPIReady = res;
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s);
});
export const ytId = u => (u.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/) || u.trim().match(/^([\w-]{11})$/) || [])[1] || null;

async function mountPlayer() {
  const cur = W;
  if (cur.file || cur.src) {
    const v = $('#vid');
    if (cur.hls) await loadHls();
    if (W !== cur) return;
    // streaming en partes: se usa hls.js; si el navegador no lo admite (iPhone), su reproductor propio
    if (cur.hls && window.Hls?.isSupported()) {
      cur.hlsPlayer = new Hls({ startPosition: cur.at > 5 ? cur.at : -1 });
      cur.hlsPlayer.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && W === cur) toast('El sitio no deja reproducir este video desde la app.'); });
      cur.hlsPlayer.loadSource(cur.src);
      cur.hlsPlayer.attachMedia(v);
    } else v.src = cur.url || cur.src;
    if (cur.at > 5) v.addEventListener('loadedmetadata', () => { v.currentTime = cur.at; }, { once: true });
    v.onerror = () => { if (W === cur) toast('El sitio no deja reproducir este video desde la app.'); };
    cur.p = { time: () => v.currentTime, seek: t => (v.currentTime = t), play: () => v.play(), pause: () => v.pause(),
      playing: () => !v.paused && !v.ended, rate: r => (v.playbackRate = r), destroy: () => v.pause() };
  } else {
    await loadYT();
    if (W !== cur) return;
    const yt = await new Promise(res => {
      const p = new YT.Player('ytp', { videoId: cur.yt,
        playerVars: { playsinline: 1, rel: 0, cc_load_policy: 0, iv_load_policy: 3, fs: 0, start: Math.floor(cur.at || 0) },
        events: { onReady: () => res(p) } });
    });
    if (W !== cur) return yt.destroy();
    // apaga los subtítulos propios de YouTube para que no se encimen con los de la app
    const ccOff = () => { try { yt.unloadModule('captions'); yt.unloadModule('cc'); } catch {} };
    ccOff(); yt.addEventListener('onStateChange', e => { if (e.data === 1) ccOff(); });
    cur.p = { time: () => yt.getCurrentTime?.() || 0, seek: t => yt.seekTo(t, true), play: () => yt.playVideo(), pause: () => yt.pauseVideo(),
      playing: () => yt.getPlayerState?.() === 1, rate: r => yt.setPlaybackRate(r), destroy: () => yt.destroy() };
    const title = yt.getVideoData?.().title, saved = S.videos.find(v => v.yt === cur.yt);
    if (title && saved) { saved.title = title; cur.title = title; save(); const h = $('#wtitle'); if (h) h.textContent = title; }
  }
  const startRate = S.settings.watch.slow ? 0.75 : +(S.settings.watch.rate || 1);
  if (startRate !== 1) cur.p.rate(startRate);
  rate = startRate;
}

function open(src) {
  const cues = parseSubs(src.en);
  if (!cues.length && !src.yt) return toast('No encontré subtítulos válidos. Revisá el formato.');
  close();
  W = { ...src, cues, es: align(cues, parseSubs(src.es || '')), cur: -2, stopped: -1, url: src.file ? URL.createObjectURL(src.file) : null };
  render();
  mountPlayer();
  setTimeout(autoFs, 100);  // si ya está de costado al abrir el video
  translateVideo(W);
}

function close() {
  if (!W) return;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  document.body.classList.remove('noscroll');
  const saved = (W.yt && S.videos.find(v => v.yt === W.yt)) || (W.link && S.videos.find(v => v.link === W.link));
  if (saved) { saved.at = W.at || 0; save(); }
  try { W.p?.destroy(); W.hlsPlayer?.destroy(); } catch {}
  if (W.url) URL.revokeObjectURL(W.url);
  W = null;
}

function jump(i) {
  const c = W?.cues[i];
  if (!c || !W.p) return;
  W.stopped = -1; W.p.seek(c.start); W.p.play();
}

// traducción automática de cada frase con el traductor incorporado de Chrome (gratis, sin internet)
const trCache = new Map();
let translatorP = null;
async function translateLine(text) {
  if (!('Translator' in self)) throw new Error('unsupported');
  translatorP ??= Translator.availability({ sourceLanguage: 'en', targetLanguage: 'es' }).then(av => {
    if (av === 'unavailable') throw new Error('unsupported');
    return Translator.create({ sourceLanguage: 'en', targetLanguage: 'es',
      monitor(m) { m.addEventListener('downloadprogress', e => toast(`Descargando el traductor de Chrome: ${Math.round(e.loaded * 100)}%`)); } });
  });
  try { return await (await translatorP).translate(text); } catch (e) { translatorP = null; throw e; }
}
const hasSpanish = () => W?.es?.some(Boolean);

// Si el video no trae subtítulos en español, el servidor los traduce (Groq) de a tandas, empezando
// por donde estás mirando. Se guardan con el video para no traducirlo dos veces.
const trServer = { ok: null };
const savedOf = v => (v.yt && S.videos.find(x => x.yt === v.yt)) || (v.link && S.videos.find(x => x.link === v.link));
async function translateVideo(cur) {
  if (!cur.cues.length || cur.es.some(Boolean) || trServer.ok === false) return;
  const saved = savedOf(cur), n = cur.cues.length;
  if (saved?.esTr?.length === n) { cur.es = saved.esTr.slice(); refreshEs(cur); return; }
  const out = Array(n).fill(''), size = 40;
  let first = cur.cues.findIndex(c => c.end > (cur.at || 0)); if (first < 0) first = 0;
  first = Math.floor(first / size) * size;
  const order = [];
  for (let i = first; i < n; i += size) order.push(i);
  for (let i = 0; i < first; i += size) order.push(i);
  for (const from of order) {
    if (W !== cur) return;
    const lines = cur.cues.slice(from, from + size).map(c => c.text);
    let d = null, r = null;
    for (let tries = 0; tries < 2 && !d; tries++) {
      try {
        r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }) });
        d = r.ok ? await r.json() : null;
      } catch { r = null; }
      if (!d && r?.status === 501) { trServer.ok = false; if (W === cur) render(); return; }  // sin clave: queda el traductor de Chrome
      if (!d) await new Promise(res => setTimeout(res, 1500));
    }
    if (!d?.es) { if (W === cur) toast('No se pudo traducir una parte de los subtítulos.'); return; }
    trServer.ok = true;
    d.es.forEach((t, k) => { out[from + k] = t; cur.es[from + k] = t; });
    refreshEs(cur);
  }
  if (saved && out.every(Boolean)) { saved.esTr = out; save(); }
}
// Subtítulos en español: visibles, difuminados (se ven al tocarlos) u ocultos. Se elige en Ajustes o con el botón "Español".
const ES_MODES = ['show', 'blur', 'hide'], ES_LABEL = { show: 'Español', blur: 'Español borroso', hide: 'Sin español' };
export const esMode = () => ES_MODES.includes(S.settings.watch.esMode) ? S.settings.watch.esMode : S.settings.watch.es === false ? 'blur' : 'show';
function applyEs() {
  const m = esMode(), es = $('#sub-es');
  es?.classList.toggle('blur', m === 'blur');
  es?.classList.toggle('esoff', m === 'hide');
  document.querySelectorAll('[data-k="es"]').forEach(b => { b.classList.toggle('on', m === 'show'); if (b.classList.contains('chip')) b.textContent = ES_LABEL[m]; });
}
function refreshEs(cur) {
  if (W !== cur) return;
  const es = $('#sub-es');
  if (es && W.cues[W.cur] && !es.textContent) es.textContent = W.es[W.cur] || '';
  if (W.pop && !W.pop.es) W.pop.es = W.es[W.cur] || '';
}
function fillTranslation(c, el) {
  if (!S.settings.watch.autoTr || hasSpanish() || !c || esMode() === 'hide') return;
  if (trCache.has(c.text)) { el.textContent = trCache.get(c.text); return; }
  const cur = W.cur;
  translateLine(c.text).then(t => { trCache.set(c.text, t); if (W && W.cur === cur) { el.textContent = t; } }).catch(() => {});
}

function showLine() {
  const c = W.cues[W.cur], en = $('#sub-en'), es = $('#sub-es');
  if (!en) return;
  if (W.pop?.hover && W.pop.cue !== W.cur) watchActions.wpopclose(null, false);
  en.innerHTML = c ? c.text.split(/\s+/).map((w, i) => `<span class="w" data-a="wword" data-i="${i}">${esc(w)}</span>`).join(' ') : '<span class="muted">…</span>';
  es.textContent = c ? W.es[W.cur] || '' : '';
  if (c && !es.textContent) fillTranslation(c, es);
  en.parentElement.classList.toggle('none', !c);
  applyEs();
  $('#wfb').innerHTML = '';
  document.querySelectorAll('#wlist li.on').forEach(li => li.classList.remove('on'));
  const li = $(`#wlist li[data-i="${W.cur}"]`), list = $('#wlist');
  if (li) { li.classList.add('on'); list.scrollTop = li.offsetTop - list.clientHeight / 3; }
}

let ticks = 0;
setInterval(() => {
  if (!W?.p) return;
  const t = W.p.time(), playing = W.p.playing(), auto = S.settings.watch.auto;
  let idx = -1;
  for (let i = 0; i < W.cues.length && W.cues[i].start <= t + 0.05; i++) idx = i;
  if (idx !== W.cur) {
    // pausa automática si la frase terminó y empezó la siguiente sin hueco
    if (auto && playing && W.cur >= 0 && W.stopped !== W.cur && idx === W.cur + 1) { W.stopped = W.cur; W.p.pause(); return; }
    W.cur = idx; showLine();
  }
  const c = W.cues[idx];
  if (auto && playing && c && t >= c.end - 0.25 && W.stopped !== idx) { W.stopped = idx; W.p.pause(); }
  const b = $('#wplaybtn'); if (b) b.textContent = playing ? 'Pausa' : 'Play';
  if (playing && document.visibilityState === 'visible' && ++ticks % 5 === 0) studyTick('imm');  // inmersión: un segundo de video
  W.at = t;
}, 200);

const DICT_NAMES = { wordreference: 'WordReference', cambridge: 'Cambridge', spanishdict: 'SpanishDict', linguee: 'Linguee', google: 'Google Traductor', urban: 'Urban Dictionary' };
function dictUrl(w) {
  w = encodeURIComponent(w);
  return ({ cambridge: `https://dictionary.cambridge.org/dictionary/english-spanish/${w}`, spanishdict: `https://www.spanishdict.com/translate/${w}`,
    linguee: `https://www.linguee.com/english-spanish/search?query=${w}`, google: `https://translate.google.com/?sl=en&tl=es&text=${w}`,
    urban: `https://www.urbandictionary.com/define.php?term=${w}` })[S.settings.watch.dict] || `https://www.wordreference.com/enes/${w}`;
}
// el cuadro aparece arriba de la palabra (abajo si no entra), igual que en la extensión
function placePop() {
  const pop = $('#wpop'), w = W?.pop && $(`#sub-en .w[data-i="${W.pop.i}"]`);
  // el cuadro completo (⋯) en el celu es grande: ese queda abajo de la pantalla; el chico va siempre junto a la palabra
  if (!pop || pop.hidden || !w || (!HOVER && W.pop.full)) return;
  // el cuadro vive dentro del video (#pwrap), así que las medidas van relativas a él
  const box = $('#pwrap').getBoundingClientRect(), r = w.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
  const a = { left: r.left - box.left, top: r.top - box.top, bottom: r.bottom - box.top, width: r.width };
  const x = Math.min(box.width - pw - 10, Math.max(10, a.left + a.width / 2 - pw / 2));
  let y = a.top - ph - 10;
  if (y < 10) y = Math.min(box.height - ph - 10, a.bottom + 10);
  Object.assign(pop.style, { position: 'absolute', left: x + 'px', top: y + 'px', bottom: 'auto', transform: 'none' });
}
// how: 'click' (tocaste la palabra) o 'hover' (pasaste el mouse). Tocar siempre pausa; pasar el mouse pausa
// si está activado en Ajustes ("Pausar el video al pasar el mouse por una palabra", activado por defecto).
function showPop(i, full = S.settings.watch.fullPop, how = 'click') {
  const c = W.cues[W.cur];
  if (!c) return;
  const hover = how === 'hover';
  if (!hover || S.settings.watch.pauseHover !== false) {
    if (!W.popPaused && W.p?.playing()) W.popPaused = true;  // si estaba andando, al cerrar el cuadro sigue solo
    W.p?.pause();
  }
  const words = c.text.split(/\s+/), { e, from, to } = lookup(words, i);
  const phrase = words.slice(from, to + 1).join(' ').replace(/^[^\w']+|[^\w']+$/g, '');
  W.pop = { e, phrase, line: c.text, es: W.es[W.cur] || '', i, full, tr: e ? e.es : '', hover, cue: W.cur };
  document.querySelectorAll('#sub-en .w').forEach((s, k) => s.classList.toggle('sel', k >= from && k <= to));
  const known = e && (S.cards[e.id + '>r'] || e.id.startsWith('c-'));
  const pop = $('#wpop');
  pop.hidden = false;
  // capa invisible sobre el video: tocarlo cierra el cuadro (el reproductor de YouTube no avisa de sus toques)
  // Capa transparente sobre el video mientras el cuadro está abierto. El video de YouTube es otra página: sin esta capa,
  // esta página no se entera cuando el mouse entra al video ni cuando lo tocás. Con la capa, pasar el mouse por el video
  // cierra el cuadro y tocarlo lo cierra y sigue el video.
  if (!$('#pwrap .tapcatch')) $('#pwrap .player')?.insertAdjacentHTML('afterend', '<div class="tapcatch"></div>');
  pop.classList.toggle('mini', !full);
  // cuadro chico (por defecto): una sola traducción y "Ya la sé"; el botón ⋯ abre el cuadro completo
  if (!full) {
    pop.innerHTML = `<span class="mtr" id="wmini">${e ? esc(e.es.split(/[,;]/)[0]) : '…'}</span>
      <button class="btn ghost" data-a="wknown">Ya la sé</button><button class="link more" data-a="wmore" title="Ver más">⋯</button>`;
    if (!e) lookupDict(words, i);
    placePop();
    return;
  }
  pop.innerHTML = `<div class="top"><b class="pw">${esc(e ? e.en : phrase)}</b><button class="link" data-a="wpopclose">Cerrar</button></div>
    ${e ? `<div class="answer">${esc(e.es)}</div>${e.ex ? `<p class="exes">${esc(e.ex)} · ${esc(e.exEs)}</p>` : ''}`
        : `<div id="wdict"><p class="muted">Buscando en el diccionario…</p></div><input id="wtr" placeholder="Traducción para tu tarjeta" autocomplete="off">`}
    <div class="row"><button class="btn ghost" data-a="say" data-t="${esc(e ? e.en : phrase)}">Escuchar</button>
      <a class="btn ghost" href="${dictUrl(phrase.toLowerCase())}" target="_blank" rel="noopener">${DICT_NAMES[S.settings.watch.dict] || 'WordReference'}</a></div>
    ${!e ? `<button class="btn primary" data-a="wadd">Agregar a tarjetas</button>`
      : known ? `<p class="muted">Ya está en tus tarjetas.</p>`
      : S.boost.includes(e.id) ? `<p class="muted">Ya está en la fila para estudiar.</p>`
      : `<button class="btn primary" data-a="wboost">Estudiarla en las próximas tarjetas</button>`}`;
  placePop();
  if (!e) lookupDict(words, i);
}

// Diccionario inglés-español completo (WikDict) a través del servidor.
const POS = { noun: 'sustantivo', verb: 'verbo', adjective: 'adjetivo', adverb: 'adverbio', pronoun: 'pronombre', preposition: 'preposición',
  conjunction: 'conjunción', interjection: 'interjección', phrase: 'frase', idiom: 'expresión', numeral: 'número', determiner: 'determinante' };
async function lookupDict(words, i) {
  const pop = W?.pop, t = words.map(tok), tok1 = t[i];
  const win = (a, b) => a >= 0 && b < t.length ? t.slice(a, b + 1).join(' ') : '';
  const squash = [tok1.replace(/(.)\1{2,}/g, '$1$1'), tok1.replace(/(.)\1{2,}/g, '$1')];  // "craaazy" -> "crazy"
  // primero expresiones con las palabras vecinas ("grocery store"), después la palabra sola y sus formas base
  const cands = [...new Set([win(i, i + 2), win(i - 1, i + 1), win(i, i + 1), win(i - 1, i), ...stems(tok1), ...squash.flatMap(stems)])]
    .filter(c => c && c.length > 1);
  let d = null;
  try { d = await (await fetch('/api/dict?w=' + encodeURIComponent(cands.join('|')))).json(); } catch {}
  if (!W || W.pop !== pop) return;
  if (!pop.full) {
    const m = $('#wmini');
    if (d?.senses?.length) { pop.phrase = d.word; pop.tr = d.senses[0].trans[0]; }
    if (m) m.textContent = pop.tr || 'Sin traducción';
    placePop();
    return;
  }
  const box = $('#wdict'), input = $('#wtr');
  if (!box) return;
  if (!d || d.error) { box.innerHTML = `<p class="muted">${d?.error ? esc(d.error) : 'El diccionario necesita el servidor de la app.'} Escribí la traducción vos.</p>`; return; }
  if (!d.senses?.length) { box.innerHTML = '<p class="muted">No está en el diccionario. Escribí la traducción vos.</p>'; return; }
  box.innerHTML = `${d.word !== tok1 ? `<p class="muted">${d.word.includes(' ') ? 'Expresión' : 'Forma base'}: <b>${esc(d.word)}</b></p>` : ''}
    <ul class="senses">${d.senses.map(x => `<li><small>${esc(POS[x.pos] || x.pos || '')}</small> ${esc(x.trans.join(', '))}</li>`).join('')}</ul>`;
  pop.phrase = d.word;
  const pw = $('#wpop .pw'); if (pw) pw.textContent = d.word;
  if (input && !input.value) input.value = d.senses[0].trans.slice(0, 2).join(', ');
  placePop();
}

/* ---------- vistas ---------- */
const CATS = [
  ['Vlogs australianos', 'australian vlog day in the life'],
  ['Jerga australiana', 'australian slang explained'],
  ['Entrevistas en la calle', 'sydney street interviews'],
  ['Noticias ABC', 'ABC News Australia'],
  ['Bluey (fácil)', 'Bluey official full episode'],
  ['Conversaciones fáciles', 'easy english conversation australian'],
  ['Cocina', 'australian cooking recipe'],
  ['Viajes por Australia', 'travel australia vlog'],
];
let results = null, lastQ = '', busy = false;
const dur = s => s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${fmt(s % 3600).padStart(5, '0')}` : fmt(s);
const thumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function resultsHtml() {
  if (busy) return '<p class="muted">Buscando…</p>';
  if (!results) return '';
  if (results.error) return `<p class="tip">${esc(results.error)}</p>`;
  if (!results.length) return '<p class="muted">No encontré videos. Probá con otras palabras.</p>';
  return `<div class="results">${results.map(r => `<button class="vcard" data-a="wpick" data-id="${r.id}" data-t="${esc(r.title)}">
    <img src="${thumb(r.id)}" alt="" loading="lazy"><span class="vdur">${dur(r.duration)}</span>
    <b>${esc(r.title)}</b><span class="muted">${esc(r.channel || '')}</span></button>`).join('')}</div>`;
}

async function search(q) {
  q = q.trim(); if (!q) return;
  lastQ = q; busy = true; results = null;
  const box = $('#wresults'); if (box) box.innerHTML = resultsHtml();
  try {
    const r = await fetch('/api/search?q=' + encodeURIComponent(q));
    results = r.ok ? await r.json() : { error: r.status === 404 ? 'El buscador necesita el servidor de la app (python3 server.py).' : (await r.json()).error };
  } catch { results = { error: 'No me pude conectar con el servidor de la app.' }; }
  busy = false;
  const b2 = $('#wresults'); if (b2 && lastQ === q) b2.innerHTML = resultsHtml();
}

const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'video'; } };

// Videos de otros sitios: el servidor averigua la dirección del video y sus subtítulos.
async function openLink(link, en = '', es = '', at = 0) {
  toast('Abriendo el link…');
  try {
    const r = await fetch('/api/resolve?url=' + encodeURIComponent(link)), d = await r.json();
    if (!r.ok || d.error) return toast(d.error || 'No pude abrir ese link');
    const subsEn = en.trim() ? en : d.en, subsEs = es.trim() ? es : d.es;
    if (!parseSubs(subsEn).length) return toast('Ese video no trae subtítulos en inglés. Cargá un .srt junto con el link.');
    const prev = S.videos.find(v => v.link === link);
    const v = { link, title: d.title || hostOf(link), thumb: d.thumb || '', en: subsEn, es: subsEs, at: at || prev?.at || 0 };
    S.videos = [v, ...S.videos.filter(x => x.link !== link)].slice(0, 30);
    save();
    if (location.hash === '#watch') open({ ...v, src: d.src, hls: !!d.hls });
  } catch { toast('No me pude conectar con el servidor de la app.'); }
}

async function pick(id, title, retry) {
  const saved = S.videos.find(v => v.yt === id);
  // si la vez anterior no se pudieron bajar los subtítulos, se vuelve a intentar
  if (saved && !retry && parseSubs(saved.en).length) return open(saved);
  toast('Bajando subtítulos…');
  let d = {}, reason = '';
  try {
    const r = await fetch('/api/subs?id=' + id);
    d = await r.json().catch(() => ({}));
    if (!r.ok) reason = d.error || 'No pude bajar los subtítulos.';
    else if (!parseSubs(d.en).length) reason = 'Este video no trae subtítulos en inglés.';
  } catch { reason = 'No me pude conectar para bajar los subtítulos.'; }
  S.videos = [{ yt: id, title: d.title || saved?.title || title, en: reason ? '' : d.en, es: reason ? '' : d.es, at: saved?.at || 0 }, ...S.videos.filter(v => v.yt !== id)].slice(0, 30);
  save();
  if (location.hash === '#watch') open({ ...S.videos[0], noSubsReason: reason });
}

function libraryView() {
  return `<header class="top"><h2>Ver y aprender</h2></header>
    <div class="searchbar"><input id="ytq" placeholder="Buscar videos en YouTube…" value="${esc(lastQ)}" autocomplete="off">
      <button class="btn primary" data-a="wsearch">Buscar</button></div>
    <div class="chips">${CATS.map(([l, q]) => `<button class="chip" data-a="wcat" data-q="${esc(q)}">${l}</button>`).join('')}</div>
    <div id="wresults">${resultsHtml()}</div>
    ${S.videos.length ? `<h3>Seguir mirando</h3><div class="results">${S.videos.map((v, k) => `<div class="vcard">
      ${v.yt || v.thumb ? `<img src="${esc(v.yt ? thumb(v.yt) : v.thumb)}" alt="" loading="lazy" data-a="wopen" data-k="${k}">` : `<div class="vph" data-a="wopen" data-k="${k}">${esc(hostOf(v.link))}</div>`}${v.at > 5 ? `<span class="vdur">${fmt(v.at)}</span>` : ''}
      <b data-a="wopen" data-k="${k}">${esc(v.title)}</b><button class="link" data-a="wdel" data-k="${k}">Quitar</button></div>`).join('')}</div>` : ''}
    <details class="howto"><summary>Abrir un link o un video de tu compu</summary>
    <form data-form="watch" class="add">
      <input name="yt" placeholder="Link de YouTube, Vimeo, TED, Internet Archive o un .mp4" autocomplete="off">
      <label class="btn ghost">o elegí un video de tu compu<input type="file" name="vfile" accept="video/*" hidden></label>
      <span class="muted" id="fname"></span>
      <p class="muted">Con un link, los subtítulos se bajan solos si el sitio los tiene. Si no, o con un video propio, cargá su archivo .srt o .vtt.</p>
      <textarea name="en" rows="3" placeholder="Subtítulos en inglés (opcional con YouTube)"></textarea>
      <label class="btn ghost">Cargar subtítulos en inglés<input type="file" data-sub="en" accept=".srt,.vtt,.txt" hidden></label>
      <textarea name="es" rows="2" placeholder="Subtítulos en español (opcional)"></textarea>
      <label class="btn ghost">Cargar subtítulos en español<input type="file" data-sub="es" accept=".srt,.vtt,.txt" hidden></label>
      <button class="btn primary">Abrir</button>
    </form></details>`;
}

// Qué parte de las palabras del video ya sabés (vocab.js). Aparece después de MIN_HOURS horas de estudio.
function coverageHtml() {
  if (!W || W.covHide || W.cues.length < 20 || totalHours() < MIN_HOURS) return '';
  if (W.cov?.len !== W.cues.length) {
    let K = new Set(); try { K = masteredWords(); } catch {}  // si algo falla, el video igual se abre
    W.cov = { len: W.cues.length, ...coverage(W.cues.map(c => c.text), w => stems(w).some(x => K.has(x))) };
  }
  if (W.cov.n < 50) return '';
  const m = coverageMsg(W.cov.pct);
  return `<div class="cov ${m.kind}"><b>${m.p}%</b><span>${esc(m.text)}</span><button class="link" data-a="wcovclose" title="Ocultar">×</button></div>`;
}

function playerView() {
  const o = S.settings.watch;
  const chip = (k, label) => `<button class="chip ${o[k] ? 'on' : ''}" data-a="wtoggle" data-k="${k}">${label}</button>`;
  return `<div class="top"><button class="link" data-a="wclose">← Mis videos</button><span class="muted ell" id="wtitle">${esc(W.title || '')}</span></div>
    ${coverageHtml()}
    <div class="pwrap" id="pwrap" style="--subscale:${(S.settings.watch.size || 100) / 100}">
      <div class="player">${W.file || W.src ? '<video id="vid" playsinline controls controlslist="nofullscreen" disablepictureinpicture></video>' : '<div id="ytp"></div>'}</div>
      <div class="ov"><div class="ovbox"><div id="sub-en" class="sub-en"></div><div id="sub-es" class="sub-es" data-a="wreveal"></div></div></div>
      <div class="fsbar">
        <button data-a="wprev" title="Frase anterior">Anterior</button><button data-a="wrepeat" title="Repetir frase">Repetir</button>
        <button data-a="wnext" title="Frase siguiente">Siguiente</button><button data-a="wtoggle" data-k="es" title="Mostrar u ocultar español">Español</button>
        <button data-a="wfs" class="fsbtn" title="Pantalla completa">${fsIcon}</button>
      </div>
      <div id="wpop" class="pop" hidden></div>
    </div>
    <div id="wfb"></div>
    <div class="wctl"><button class="btn ghost" data-a="wprev">Anterior</button><button class="btn ghost" data-a="wrepeat">Repetir</button>
      <button class="btn primary" data-a="wplay" id="wplaybtn">Play</button><button class="btn ghost" data-a="wnext">Siguiente</button></div>
    <button class="btn ghost" data-a="wfs">${fsIcon}&nbsp; Pantalla completa</button>
    <div class="chips">${chip('auto', 'Pausa en cada frase')}${chip('slow', 'Lento')}<button class="chip ${esMode() === 'show' ? 'on' : ''}" data-a="wtoggle" data-k="es" title="Español: visible, difuminado u oculto">${ES_LABEL[esMode()]}</button>${hasSpanish() || trServer.ok !== false ? '' : `<button class="chip ${S.settings.watch.autoTr ? 'on' : ''}" data-a="wautotr" title="Traducir cada frase con el traductor de Chrome">Traducir al español</button>`}<button class="chip" data-a="wshadow">Decila vos</button></div>
    <p class="hint">Tocá cualquier palabra del subtítulo para traducirla y guardarla. Atajos: A anterior · S repetir · D siguiente · espacio pausa · [ ] velocidad · Q español · R pausa en cada frase · F pantalla completa</p>
    ${W.cues.length ? `<h3>Transcripción</h3>
    <ol id="wlist" class="wlist">${W.cues.map((c, i) => `<li data-a="wseek" data-i="${i}"><span>${fmt(c.start)}</span>${esc(c.text)}</li>`).join('')}</ol>`
    : `<div class="card left nosubs"><small>Faltan los subtítulos</small>
      <p>${esc(W.noSubsReason || 'Este video todavía no tiene subtítulos cargados.')}</p>
      ${W.yt ? '<button class="btn primary" data-a="wretry">Volver a intentar</button>' : ''}
      <p><b>Opción 1:</b> abrí el video en YouTube, tocá “Mostrar transcripción” debajo de la descripción, copiá el texto y pegalo acá.</p>
      <textarea id="wpastebox" rows="5" placeholder="Pegá acá la transcripción (o el contenido de un .srt)"></textarea>
      <div class="row"><button class="btn primary" data-a="wpaste">Usar estos subtítulos</button>
        <a class="btn ghost" href="https://www.youtube.com/watch?v=${esc(W.yt || '')}" target="_blank" rel="noopener">Abrir en YouTube</a></div>
      <p><b>Opción 2:</b> miralo directamente en youtube.com con la extensión G'day instalada: ahí los subtítulos se cargan solos.</p></div>`}
`;
}

// Con mouse (compu): pasar sobre una palabra abre su traducción y salir del subtítulo y del cuadro la cierra
// (el video sigue solo si el cuadro lo había pausado), igual que la extensión. En el celu se sigue tocando.
const HOVER = matchMedia('(hover: hover) and (pointer: fine)').matches;
let hoverT = 0, leaveT = 0;
const inside = el => !!el?.closest?.('#sub-en, #wpop');
if (HOVER) {
  document.addEventListener('mouseover', e => {
    const w = e.target.closest?.('#sub-en .w');
    if (w) { clearTimeout(hoverT); hoverT = setTimeout(() => { if (W && W.pop?.i !== +w.dataset.i) showPop(+w.dataset.i, undefined, 'hover'); }, 180); }
    if (inside(e.target)) clearTimeout(leaveT);
  });
  // se mira adónde fue el mouse (relatedTarget): al salir hacia el video cae en la capa transparente (.tapcatch)
  document.addEventListener('mouseout', e => {
    if (!inside(e.target) || inside(e.relatedTarget)) return;
    clearTimeout(hoverT); clearTimeout(leaveT);
    leaveT = setTimeout(() => { if (W?.pop && !$('#wpop input:focus')) watchActions.wpopclose(); }, 350);
  });
}

// Tocar en cualquier lugar fuera del cuadro de la palabra lo cierra. Se usa "pointerdown" (el momento en que el dedo
// o el mouse tocan) y no "click": en iPhone, Safari no avisa el clic si lo que tocás no es un botón o un link.
document.addEventListener('pointerdown', e => {
  const pop = $('#wpop');
  if (!pop || pop.hidden || e.target.closest?.('#wpop, #sub-en .w')) return;
  // tocar el video (la capa transparente que lo cubre) = seguir viendo
  if (e.target.closest?.('.tapcatch')) { e.preventDefault(); return watchActions.wpopclose({ play: 1 }); }
  // si tocaste otro botón (Repetir, Pausa…), ese botón decide qué hace el video
  watchActions.wpopclose(null, !e.target.closest?.('[data-a]'));
}, true);

export const watchView = () => sessBanner() + (W ? playerView() : libraryView());

/* ---------- acciones ---------- */
export const watchActions = {
  wpaste() {
    const txt = $('#wpastebox')?.value || '';
    if (!parseSubs(txt).length) return toast('No encontré subtítulos en ese texto. Copiá la transcripción completa, con los tiempos.');
    const v = S.videos.find(x => x.yt === W.yt);
    if (v) { v.en = txt; save(); }
    open({ ...(v || W), en: txt });
    toast('Subtítulos cargados');
  },
  wfs() {
    const el = $('#pwrap'); if (!el) return;
    if (el.classList.contains('fake-fs')) { if (phoneLandscape()) el.dataset.off = '1'; delete el.dataset.auto; return fakeFs(el); }
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    // iPhone no deja poner un recuadro en pantalla completa: se simula ocupando toda la pantalla
    if (!req) return fakeFs(el);
    req.call(el)?.catch?.(() => {});
    setTimeout(() => { if (!document.fullscreenElement && !document.webkitFullscreenElement && !el.classList.contains('fake-fs')) fakeFs(el); }, 500);
  },
  wsearch() { search($('#ytq')?.value || ''); },
  wcat(d) { const q = $('#ytq'); if (q) q.value = d.q; search(d.q); },
  wpick(d) { pick(d.id, d.t); },
  wopen(d) { const v = S.videos[+d.k]; v.link ? openLink(v.link, v.en, v.es, v.at) : v.yt ? pick(v.yt, v.title) : open(v); },
  wfstip() { try { localStorage.setItem('gday-fstip', '1'); } catch {} $('.fstip')?.remove(); },
  wretry() { if (W?.yt) pick(W.yt, W.title, true); },
  wdel(d) { S.videos.splice(+d.k, 1); save(); render(); },
  wclose() { close(); render(); },
  wplay() { if (W?.p) W.p.playing() ? W.p.pause() : W.p.play(); },
  wprev() {
    if (!W?.p) return;
    let i = W.cur;
    if (i >= 0 && W.p.time() - W.cues[i].start < 1.5) i--;
    jump(Math.max(0, i));
  },
  wrepeat() { if (W) jump(Math.max(0, W.cur)); },
  wnext() { if (W) jump(Math.min(W.cues.length - 1, W.cur + 1)); },
  wseek(d) { jump(+d.i); },
  async wautotr(e) {
    const on = !S.settings.watch.autoTr;
    if (!on) { S.settings.watch.autoTr = false; save(); render(); return; }
    toast('Activando el traductor de Chrome…');
    const ready = translateLine('hello');  // la primera vez lo descarga: necesita este clic
    const slow = setTimeout(() => toast('El traductor se sigue descargando. Se activa solo cuando termine.'), 8000);
    try {
      await ready;
      clearTimeout(slow);
      S.settings.watch.autoTr = true; save(); render(); toast('Traducción automática activada');
    } catch (err) {
      clearTimeout(slow);
      toast(err.message === 'unsupported' ? 'Tu Chrome no trae el traductor incorporado (necesitás Chrome 138 o más nuevo)' : 'No se pudo activar el traductor. Probá de nuevo.');
    }
  },
  wtoggle(d) {
    const o = S.settings.watch;
    // "Español" pasa por visible → difuminado → oculto
    if (d.k === 'es') { o.esMode = ES_MODES[(ES_MODES.indexOf(esMode()) + 1) % 3]; delete o.es; save(); applyEs(); toast(ES_LABEL[o.esMode] === 'Español' ? 'Español visible' : ES_LABEL[o.esMode]); return; }
    o[d.k] = !o[d.k]; save();
    if (d.k === 'slow') W?.p?.rate(o.slow ? 0.75 : 1);
    document.querySelectorAll('.chip[data-k]').forEach(b => b.classList.toggle('on', !!o[b.dataset.k]));
  },
  wreveal() { $('#sub-es')?.classList.remove('blur'); },
  wword(d) { showPop(+d.i); },
  // resume: al cerrar tocando el video o afuera, el video sigue si el cuadro lo había pausado
  wpopclose(d, resume = true) {
    const pop = $('#wpop'); if (pop) { pop.hidden = true; pop.removeAttribute('style'); pop.classList.remove('mini'); }
    if (W) {
      // tocar el video con el cuadro abierto = "seguir viendo"
      if ((resume && W.popPaused && S.settings.watch.resumeAfter !== false) || (d?.play && !W.p?.playing())) W.p?.play();
      W.popPaused = false; W.pop = null;
    }
    $('#pwrap .tapcatch')?.remove();
    document.querySelectorAll('#sub-en .sel').forEach(s => s.classList.remove('sel'));
  },
  wadd() {
    const tr = $('#wtr').value.trim();
    if (!tr) return toast('Escribí la traducción primero');
    toast(addCustom(W.pop.phrase, tr, 'video', W.pop.line, W.pop.es) ? 'Agregada a tus tarjetas' : 'Ya está en tu mazo');
    watchActions.wpopclose();
  },
  wcovclose() { if (W) { W.covHide = true; $('.cov')?.remove(); } },
  wmore() { if (W?.pop) showPop(W.pop.i, true, W.pop.hover ? 'hover' : 'click'); },
  // "Ya la sé": cuenta como palabra sabida y no aparece en las tarjetas
  wknown() {
    const p = W?.pop; if (!p) return;
    let id = p.e?.id;
    if (!id) {
      const low = p.phrase.toLowerCase();
      if (p.tr) addCustom(p.phrase, p.tr, 'video', p.line, p.es);
      id = S.custom.find(x => x.en.toLowerCase() === low)?.id;
    }
    if (id) { S.susp[id + '>r'] = 'known'; S.boost = S.boost.filter(x => x !== id); save(); }
    toast(`“${p.phrase}” marcada como sabida`);
    watchActions.wpopclose();
  },
  wboost() {
    S.boost.push(W.pop.e.id); save();
    toast('Aparece en tus próximas tarjetas nuevas');
    watchActions.wpopclose();
  },
  async wshadow() {
    const c = W?.cues[W.cur];
    if (!c) return toast('Esperá a que aparezca una frase');
    if (!canHear()) return toast('Tu navegador no reconoce voz. Probá en Chrome.');
    W.p?.pause();
    const cur = W.cur, fb = $('#wfb');
    fb.innerHTML = '<p class="live">Escuchando… decí la frase</p>';
    const res = await listen(null, true).promise;
    if (!W || W.cur !== cur) return;
    if (!res.text) { fb.innerHTML = `<p class="heard miss">${esc(micMsg(res))}</p>`; return; }
    const r = compare(c.text, res.text);
    fb.innerHTML = `<div class="score"><b>${Math.round(r.score * 100)}%</b><span>${r.shown.map((w, i) => `<span class="${r.hit[i] ? 'ok' : 'miss'}">${esc(w)}</span>`).join(' ')}</span></div>
      <p class="heard">Se entendió: “${esc(res.text || '…')}”</p>`;
    log().shadow++; save();
  },
};

document.addEventListener('submit', e => {
  if (e.target.dataset.form !== 'watch') return;
  e.preventDefault();
  const f = new FormData(e.target), link = (f.get('yt') || '').trim(), yt = ytId(link), file = pending.file;
  const en = f.get('en') || '', es = f.get('es') || '';
  if (link && !yt) { pending = {}; return openLink(link, en, es); }
  if (!yt && !file) return toast('Pegá un link o elegí un video');
  if (yt && !en.trim()) { pending = {}; return pick(yt, 'Video de YouTube'); }
  if (!en.trim()) return toast('Faltan los subtítulos en inglés');
  if (yt) {
    const prev = S.videos.find(v => v.yt === yt);
    S.videos = [{ yt, title: prev?.title || 'Video de YouTube', en, es, at: 0 }, ...S.videos.filter(v => v.yt !== yt)].slice(0, 30);
    save();
  }
  pending = {};
  open(yt ? S.videos[0] : { file, en, es, title: file.name });
});

document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'vfile' && t.files[0]) { pending.file = t.files[0]; $('#fname').textContent = t.files[0].name; }
  if (t.dataset.sub && t.files[0]) t.files[0].text().then(txt => {
    t.closest('form').elements[t.dataset.sub].value = txt;
    toast(`${parseSubs(txt).length} líneas cargadas`);
  });
});

document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'ytq') search(e.target.value); });

// atajos del reproductor (los mismos que la extensión)
let rate = 1;
document.addEventListener('keydown', e => {
  if (location.hash !== '#watch' || !W?.p || e.metaKey || e.ctrlKey || e.altKey) return;
  if (['input', 'textarea', 'select'].includes((e.target.tagName || '').toLowerCase())) return;
  const k = e.key.toLowerCase(), A = watchActions;
  const acts = {
    a: A.wprev, s: A.wrepeat, d: A.wnext, ' ': A.wplay, k: A.wplay,
    q: () => A.wtoggle({ k: 'es' }), r: () => A.wtoggle({ k: 'auto' }), f: A.wfs,
    '[': () => { rate = Math.max(.5, +(rate - .1).toFixed(2)); W.p.rate(rate); toast(`Velocidad ${rate}x`); },
    ']': () => { rate = Math.min(2, +(rate + .1).toFixed(2)); W.p.rate(rate); toast(`Velocidad ${rate}x`); },
    escape: () => { if (!$('#wpop')?.hidden) A.wpopclose(); },
  };
  if (acts[k]) { e.preventDefault(); acts[k](); }
});

window.addEventListener('hashchange', () => { if (location.hash !== '#watch') close(); });
