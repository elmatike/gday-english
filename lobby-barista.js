// "Make a coffee": minijuego en primera persona en la máquina de café del café.
// Pasos de un barista de verdad: moler, compactar, trabar el portafiltro, sacar el espresso, vaporizar la leche y latte art.
// Cada paso enseña una palabra de barista en inglés; al final se pueden sumar a tus tarjetas.
// Todo es pixel art dibujado con código en un lienzo de 320 x 224 que se agranda sin suavizar (aumento entero).
import { ramp, mix, blob } from './lobby-art.js';

const W = 320, H = 224;
const VOCAB = [
  ['to grind', 'moler'], ['dose', 'dosis (de café)'], ['portafilter', 'portafiltro'], ['to tamp', 'compactar el café'],
  ['group head', 'grupo (de la cafetera)'], ['to pull a shot', 'sacar un espresso'], ['crema', 'crema del espresso'],
  ['steam wand', 'vaporizador'], ['microfoam', 'microespuma'], ['milk pitcher', 'jarra de leche'], ['to pour', 'verter'], ['latte art', 'dibujo en el café'],
];
const STEPS = {
  grind: { en: 'Grind the beans', es: 'Molé los granos: mantené apretado hasta llegar a 18 g.', word: ['to grind', 'moler'], btn: 'Hold to grind', hold: true },
  tamp: { en: 'Tamp the coffee', es: 'Compactá el café: tocá cuando la aguja esté en la zona verde.', word: ['to tamp', 'compactar'], btn: 'Tamp!' },
  lock: { en: 'Lock the portafilter in', es: 'Trabá el portafiltro en el grupo de la máquina.', word: ['group head', 'grupo de la cafetera'], btn: 'Lock it in' },
  shot: { en: 'Pull the shot', es: 'Sacá el espresso: paralo entre 25 y 30 segundos.', word: ['to pull a shot', 'sacar un espresso'], btn: 'Start the shot' },
  steam: { en: 'Steam the milk', es: 'Vaporizá la leche: soltá entre 55 y 65 °C.', word: ['microfoam', 'microespuma'], btn: 'Hold to steam', hold: true },
  pour: { en: 'Pour some latte art', es: 'Elegí un dibujo y serví la leche.', word: ['latte art', 'dibujo en el café'] },
};
const ORDER = ['grind', 'tamp', 'lock', 'shot', 'steam', 'pour'];

/* ---------- sonidos ---------- */
let ac = null, loop = null;
function sfxInit() { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch {} }
function noiseSrc(type, freq, q, vol) {
  if (!ac) return null;
  const len = ac.sampleRate, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, ac.currentTime, .03);
  s.connect(f).connect(g).connect(ac.destination); s.start();
  return { stop() { g.gain.setTargetAtTime(0, ac.currentTime, .05); setTimeout(() => s.stop(), 300); } };
}
function hum(freq, vol) {
  if (!ac) return null;
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
  const g = ac.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, ac.currentTime, .05);
  o.connect(f).connect(g).connect(ac.destination); o.start();
  return { stop() { g.gain.setTargetAtTime(0, ac.currentTime, .08); setTimeout(() => o.stop(), 400); } };
}
function thud(freq = 90, vol = .4) {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
  o.frequency.setValueAtTime(freq * 2, t); o.frequency.exponentialRampToValueAtTime(freq, t + .08);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + .2);
}
function ding() {
  if (!ac) return;
  [880, 1320].forEach((f, k) => { const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + k * .09; o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(.15, t); g.gain.exponentialRampToValueAtTime(.001, t + .5); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + .5); });
}
const loopStop = () => { loop?.stop(); loop = null; };

/* ---------- dibujo ---------- */
let c = null;
const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
// rectángulo con luz arriba a la izquierda, sombra abajo a la derecha y contorno de su propio color
function RB(x, y, w, h, col) {
  const r = ramp(col);
  R(x - 1, y - 1, w + 2, h + 2, r.o); R(x, y, w, h, col);
  R(x, y, w, 1, r.l); R(x, y, 1, h, r.l); R(x + w - 1, y, 1, h, r.d); R(x, y + h - 1, w, 1, r.d);
}
function disc(cx, cy, rr, col, ry = rr) { blob(c, cx, cy, rr, col, ry); }
const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
let sceneOk = false;
// posiciones: portafiltro en el molinillo y en la máquina, taza, manómetro
const PF0 = [48, 150], PF1 = [198, 138], CUP = [198, 147], GAUGE = [198, 110];
function drawStatic() {
  const keep = c; c = scene.getContext('2d');
  // pared con rayas (arriba queda lugar para las instrucciones) y estante con tazas
  for (let x = 0; x < W; x += 8) R(x, 0, 8, 170, (x / 8) % 2 ? '#e7d6b5' : '#dfcca8');
  R(0, 150, W, 20, '#8a5c38'); R(0, 150, W, 2, '#a7744a');
  RB(4, 56, 312, 4, '#7a5234');
  [[96, '#f4f1ea'], [110, '#e84a5f'], [124, '#f4f1ea'], [232, '#2e86de'], [246, '#f4f1ea'], [260, '#feca57'], [288, '#f4f1ea'], [302, '#1dd1a1']].forEach(([x, col]) => { RB(x, 46, 9, 9, col); R(x + 9, 48, 2, 4, ramp(col).d); });
  // mesada de mármol y frente de madera
  R(0, 168, W, 11, '#efe6d8'); R(0, 168, W, 1, '#fffaf0'); R(0, 178, W, 1, '#bfb19c');
  for (let x = 0; x < W; x += 7) R(x + (x % 14 ? 3 : 0), 172, 4, 1, '#ddd1bf');
  for (let x = 0; x < W; x += 20) { RB(x + 1, 181, 18, 43, '#7a4b2a'); R(x + 9, 188, 2, 30, '#6a3f22'); }
  // molinillo
  RB(18, 104, 58, 64, '#3d3d4e'); R(20, 106, 5, 60, '#5a5a6e'); R(70, 106, 4, 60, '#2b2b38');
  RB(22, 162, 50, 6, '#2b2b38');
  RB(38, 136, 22, 7, '#2b2b38');
  RB(24, 62, 46, 40, '#c9e3ef'); R(26, 64, 5, 36, '#e8f6fc');
  RB(40, 100, 14, 6, '#3d3d4e');
  RB(64, 116, 8, 8, '#e84a5f');
  // máquina de espresso (cerca: ocupa casi todo el ancho)
  RB(96, 76, 204, 90, '#c8d0d8');
  for (let y = 80; y < 162; y += 6) R(98, y, 200, 1, '#d8dee4');
  R(98, 78, 7, 86, '#eef2f5'); R(290, 78, 8, 86, '#9aa6b2');
  RB(92, 66, 212, 10, '#8a96a3');
  [[104, '#f4f1ea'], [118, '#f4f1ea'], [270, '#f4f1ea'], [284, '#e84a5f']].forEach(([x, col]) => RB(x, 56, 11, 9, col));
  RB(176, 82, 44, 12, '#e84a5f'); R(182, 86, 32, 4, '#ff7383');
  [[118, 112], [136, 112], [252, 112], [270, 112]].forEach(([x, y]) => { RB(x, y, 10, 7, '#3d3d4e'); R(x + 2, y + 2, 6, 1, '#1dd1a1'); });
  disc(GAUGE[0], GAUGE[1], 11, '#3d3d4e'); disc(GAUGE[0], GAUGE[1], 9, '#f4f1ea');
  for (let k = 0; k < 11; k++) { const a = Math.PI * (.8 + k * .14); R(GAUGE[0] + Math.cos(a) * 8, GAUGE[1] + Math.sin(a) * 8, 1, 1, k > 7 ? '#e84a5f' : '#3d3d4e'); }
  RB(176, 124, 44, 10, '#8a96a3'); RB(186, 134, 24, 4, '#5a6470');
  RB(118, 160, 160, 6, '#5a6470'); for (let x = 122; x < 274; x += 4) R(x, 162, 2, 2, '#2b2b38');
  // vaporizador
  RB(276, 104, 10, 10, '#3d3d4e');
  for (let y = 114; y < 150; y++) R(283 + (y - 114) * .15, y, 3, 1, y % 3 ? '#c8d0d8' : '#eef2f5');
  c = keep; sceneOk = true;
}

/* ---------- estado ---------- */
let S = null;
export function openBarista(stage, { onDone, addWords, scale = 2 } = {}) {
  if (S) return;
  sfxInit();
  const el = document.createElement('div'); el.className = 'lbarista';
  el.innerHTML = `<canvas width="${W}" height="${H}"></canvas>
    <div class="bhead"><small></small><b></b><span></span><i class="bword"></i></div>
    <div class="bread"></div>
    <div class="bctl"><button class="bclose" aria-label="Salir">✕</button><div class="bbtns"></div></div>
    <div class="bdone" hidden></div>`;
  stage.append(el);
  const cv = el.querySelector('canvas');
  const fit = () => { const s = Math.max(1, Math.floor(Math.min(stage.clientWidth / W, stage.clientHeight / H))) || scale; cv.style.width = W * s + 'px'; cv.style.height = H * s + 'px'; };
  fit();
  S = { el, cv, fit, step: 0, t: 0, scores: {}, holding: false, idle: 0, grams: 0, tamp: { v: 0, done: 0, pressAt: 0 }, lockAt: 0,
    shot: { on: false, s: 0, done: false }, steam: { temp: 6, foam: 0, done: false }, pour: { kind: null, r: 0, blobs: [], leaves: [], phase: 'choose', marker: 0, finishAt: 0 },
    parts: [], onDone, addWords, raf: 0, last: performance.now(), msg: '', msgAt: 0, made: false };
  addEventListener('resize', fit);
  el.querySelector('.bclose').onclick = () => close(false);
  el.addEventListener('keydown', e => e.stopPropagation());
  setStep(0);
  S.raf = requestAnimationFrame(frame);
}
function close(made) {
  if (!S) return;
  loopStop(); cancelAnimationFrame(S.raf); removeEventListener('resize', S.fit);
  const { onDone, el } = S; S = null; el.remove();
  onDone?.(made);
}
function say(msg) { S.msg = msg; S.msgAt = performance.now(); const r = S.el.querySelector('.bread'); r.textContent = msg; r.classList.remove('bpop'); void r.offsetWidth; r.classList.add('bpop'); }
function setStep(i) {
  S.step = i; S.t = 0; S.idle = 0; S.holding = false; loopStop();
  const k = ORDER[i], st = STEPS[k], h = S.el.querySelector('.bhead');
  h.querySelector('small').textContent = `Step ${i + 1} of ${ORDER.length}`;
  h.querySelector('b').textContent = st.en; h.querySelector('span').textContent = st.es;
  h.querySelector('.bword').textContent = `📖 ${st.word[0]} = ${st.word[1]}`;
  buttons();
}
function buttons() {
  const k = ORDER[S.step], st = STEPS[k], box = S.el.querySelector('.bbtns'), P = S.pour;
  let list = [];
  if (k === 'pour') {
    if (P.phase === 'choose') list = [['heart', 'Heart ♥'], ['tulip', 'Tulip'], ['rosetta', 'Rosetta']];
    else if (P.phase === 'pull') list = [['pull', 'Pull through!']];
    else if (P.kind === 'rosetta') list = [['wiggle', `Wiggle! (${P.leaves.length}/6)`]];
    else list = [['pourHold', 'Hold to pour']];
  } else if (k === 'shot') list = [[S.shot.on ? 'stop' : 'start', S.shot.on ? 'Stop the shot!' : st.btn]];
  else list = [[st.hold ? 'hold' : 'tap', st.btn]];
  box.innerHTML = list.map(([a, t]) => `<button class="bbtn" data-b="${a}">${t}</button>`).join('');
  box.querySelectorAll('.bbtn').forEach(b => {
    const a = b.dataset.b;
    if (a === 'hold' || a === 'pourHold') {
      const down = e => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); press(true); };
      const up = () => press(false);
      b.onpointerdown = down; b.onpointerup = up; b.onpointercancel = up; b.onlostpointercapture = up;
    } else b.onclick = () => tap(a);
  });
}

/* ---------- acciones ---------- */
function press(on) {
  if (!S || S.holding === on) return;
  S.holding = on; S.idle = 0;
  const k = ORDER[S.step];
  loopStop();
  if (on && k === 'grind') loop = noiseSrc('bandpass', 900, 2, .18);
  if (on && k === 'steam') loop = noiseSrc('highpass', 3500, .7, .12);
  if (on && k === 'pour') loop = noiseSrc('lowpass', 500, .5, .06);
  if (!on && k === 'pour') pourRelease();
}
function tap(a) {
  if (!S) return;
  const k = ORDER[S.step], P = S.pour;
  if (k === 'tamp' && !S.tamp.done) {
    const v = S.tamp.v; S.tamp.done = 1; S.tamp.pressAt = performance.now(); thud(70, .5);
    const sc = Math.max(0, 100 - Math.abs(v - 15) * 12); S.scores.tamp = sc;
    say(sc > 85 ? `Perfect tamp: ${v.toFixed(0)} kg!` : v < 15 ? `A bit soft (${v.toFixed(0)} kg)` : `Too hard (${v.toFixed(0)} kg)`);
    setTimeout(() => S && setStep(2), 1300);
  }
  if (k === 'lock' && !S.lockAt) { S.lockAt = performance.now(); setTimeout(() => { thud(140, .35); }, 600); S.scores.lock = 100; say('Click! Locked in.'); setTimeout(() => S && setStep(3), 1300); }
  if (k === 'shot' && a === 'start' && !S.shot.on && !S.shot.done) { S.shot.on = true; loop = hum(55, .1); buttons(); }
  else if (k === 'shot' && a === 'stop' && S.shot.on) {
    S.shot.on = false; S.shot.done = true; loopStop(); thud(200, .15);
    const s = S.shot.s, sc = s >= 25 && s <= 30 ? 100 : Math.max(0, 100 - (s < 25 ? 25 - s : s - 30) * 12);
    S.scores.shot = sc;
    say(sc === 100 ? `Beautiful crema: ${s.toFixed(0)} s` : s < 25 ? `Under-extracted (${s.toFixed(0)} s): sour!` : `Over-extracted (${s.toFixed(0)} s): bitter!`);
    setTimeout(() => S && setStep(4), 1500);
  }
  if (k === 'pour') {
    if (['heart', 'tulip', 'rosetta'].includes(a)) { P.kind = a; P.phase = 'pour'; P.r = 0; buttons(); say(a === 'rosetta' ? 'Tap “Wiggle” when the marker is in the middle!' : 'Hold to pour, release at the right size.'); }
    if (a === 'wiggle' && P.leaves.length < 6) {
      const off = P.marker; P.leaves.push(off); thud(300, .08);
      say(Math.abs(off) < .25 ? 'Nice wiggle!' : 'Wobbly…');
      if (P.leaves.length === 6) { P.phase = 'pull'; }
      buttons();
    }
    if (a === 'pull' && P.phase === 'pull') {
      P.phase = 'done'; P.finishAt = performance.now(); ding();
      const sc = P.kind === 'rosetta' ? Math.max(0, 100 - P.leaves.reduce((t, o) => t + Math.abs(o), 0) / 6 * 140)
        : P.blobs.reduce((t, b) => t + b.score, 0) / P.blobs.length;
      S.scores.pour = Math.round(sc);
      setTimeout(() => S && finish(), 1300);
      S.el.querySelector('.bbtns').innerHTML = '';
    }
  }
}
const TARGETS = { heart: [[18, 24]], tulip: [[19, 25], [13, 18], [8, 12]] };
function pourRelease() {
  const P = S.pour, T = TARGETS[P.kind], tg = T[P.blobs.length];
  if (!tg || P.r < 2) return;
  const r = P.r, mid = (tg[0] + tg[1]) / 2, sc = r >= tg[0] && r <= tg[1] ? 100 : Math.max(0, 100 - Math.abs(r - mid) * 9);
  P.blobs.push({ r, score: sc });
  say(sc === 100 ? 'Perfect size!' : r < tg[0] ? 'A little small' : 'A little big');
  P.r = 0;
  if (P.blobs.length === T.length) P.phase = 'pull';
  buttons();
}
function finish() {
  const sc = S.scores, keys = ['grind', 'tamp', 'shot', 'steam', 'pour'];
  const total = Math.round(keys.reduce((t, k) => t + (sc[k] || 0), 0) / keys.length);
  const stars = total >= 85 ? 3 : total >= 65 ? 2 : 1;
  S.made = true;
  const d = S.el.querySelector('.bdone'); d.hidden = false;
  S.el.querySelector('.bctl').hidden = true; S.el.querySelector('.bhead').hidden = true; S.el.querySelector('.bread').hidden = true;
  const name = { heart: 'heart', tulip: 'tulip', rosetta: 'rosetta' }[S.pour.kind];
  d.innerHTML = `<div class="bcard"><small>Your flat white with a ${name}</small>
    <b class="bstars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</b>
    <h3>${stars === 3 ? 'Master barista!' : stars === 2 ? 'Nice brew!' : 'Keep practising!'} <span>${total}/100</span></h3>
    <ul class="bscore">${[['grind', 'Grind'], ['tamp', 'Tamp'], ['shot', 'Shot'], ['steam', 'Milk'], ['pour', 'Latte art']].map(([k, n]) => `<li><span>${n}</span><i style="--w:${Math.round(sc[k] || 0)}%"></i></li>`).join('')}</ul>
    <details><summary>Barista words you used (${VOCAB.length})</summary><ul class="bvocab">${VOCAB.map(([en, es]) => `<li><b>${en}</b> ${es}</li>`).join('')}</ul></details>
    <div class="brow"><button class="bbtn ghost" data-x="words">+ Add words to my cards</button><button class="bbtn ghost" data-x="again">Make another</button><button class="bbtn" data-x="back">Drink it ☕</button></div></div>`;
  d.querySelector('[data-x=words]').onclick = e => { const n = S.addWords?.(VOCAB) || 0; e.target.textContent = n ? `✓ ${n} words added` : '✓ Already in your cards'; e.target.disabled = true; };
  d.querySelector('[data-x=again]').onclick = () => { const st = S.el.parentElement, o = { onDone: S.onDone, addWords: S.addWords }; S.onDone = null; close(false); openBarista(st, o); };
  d.querySelector('[data-x=back]').onclick = () => close(true);
}

/* ---------- cada cuadro ---------- */
function frame(now) {
  if (!S) return;
  S.raf = requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - S.last) / 1000); S.last = now; S.t += dt;
  if (!sceneOk) drawStatic();
  c = S.cv.getContext('2d'); c.imageSmoothingEnabled = false;
  const k = ORDER[S.step];
  update(k, dt, now);
  if (k === 'pour' || S.made) drawCupTop(now); else { c.drawImage(scene, 0, 0); drawDynamic(k, now); }
  // partículas
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i]; p.life += dt; if (p.life > p.max) { S.parts.splice(i, 1); continue; }
    p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    R(p.x, p.y, p.s || 1, p.s || 1, p.col);
  }
}
const part = (x, y, vx, vy, col, max = 1, g = 0, s = 1) => S.parts.push({ x, y, vx, vy, col, max, g, s, life: 0 });

function update(k, dt, now) {
  if (k === 'grind') {
    if (S.holding) { S.grams += 2.6 * dt; if (Math.random() < .8) part(46 + Math.random() * 5, 144, (Math.random() - .5) * 6, 30, Math.random() < .5 ? '#4a2c14' : '#6b3e1f', .4, 60); }
    else if (S.grams > 0) {
      S.idle += dt;
      // un toquecito no cuenta: hay que mantener apretado
      if (S.idle > .7 && S.scores.grind == null && S.grams < 3) { S.grams = 0; S.idle = 0; say('Hold the button down!'); }
      else if (S.idle > .7 && S.scores.grind == null) {
        const g = S.grams, sc = Math.max(0, 100 - Math.abs(g - 18) * 40); S.scores.grind = sc;
        say(sc > 85 ? `Perfect dose: ${g.toFixed(1)} g` : g < 18 ? `Not enough coffee (${g.toFixed(1)} g)` : `Too much coffee (${g.toFixed(1)} g)`);
        setTimeout(() => S && setStep(1), 1400);
      }
    }
  }
  if (k === 'tamp' && !S.tamp.done) S.tamp.v = 15 + Math.sin(S.t * 2.7) * 14;
  if (k === 'shot' && S.shot.on) { S.shot.s += dt * 3.2; if (S.shot.s > 48) tap('stop'); }
  if (k === 'steam') {
    const st = S.steam;
    if (S.holding) {
      st.temp += 13 * dt; if (st.temp < 38) st.foam = Math.min(1, st.foam + dt * .45);
      if (Math.random() < .6) part(282 + Math.random() * 8, 146, (Math.random() - .5) * 10, -18 - Math.random() * 10, 'rgba(255,255,255,.7)', .8);
      if (st.temp > 78) press(false);
    } else if (st.temp > 30 && !st.done) {
      S.idle += dt;
      if (S.idle > .8) {
        st.done = true; const tp = st.temp, sc = tp >= 55 && tp <= 65 ? 100 : Math.max(0, 100 - (tp < 55 ? 55 - tp : tp - 65) * 8);
        S.scores.steam = sc;
        say(sc === 100 ? `Silky microfoam at ${tp.toFixed(0)} °C` : tp < 55 ? `Milk is a bit cold (${tp.toFixed(0)} °C)` : `Too hot! Burnt milk (${tp.toFixed(0)} °C)`);
        setTimeout(() => S && setStep(5), 1500);
      }
    }
    const rd = S.el.querySelector('.bread');
    if (!st.done && st.temp > 7) rd.textContent = `${st.temp.toFixed(0)} °C`;
  }
  if (k === 'grind' && S.scores.grind == null && S.grams > 0) S.el.querySelector('.bread').textContent = `${S.grams.toFixed(1)} g`;
  if (k === 'shot' && S.shot.on) S.el.querySelector('.bread').textContent = `${S.shot.s.toFixed(0)} s`;
  if (k === 'pour') {
    const P = S.pour;
    if (S.holding && P.phase === 'pour' && P.kind !== 'rosetta') P.r = Math.min(34, P.r + 13 * dt);
    if (P.kind === 'rosetta' && P.phase === 'pour') P.marker = Math.sin(S.t * 3.4);
  }
}

// dónde está el portafiltro (en el molinillo, viajando, o trabado en la máquina)
function portafilterAt(k, now) {
  const at = S.lockAt ? Math.min(1, (now - S.lockAt) / 600) : ['shot', 'steam'].includes(k) ? 1 : 0;
  const e = at < .5 ? 2 * at * at : 1 - (-2 * at + 2) ** 2 / 2;
  return [PF0[0] + (PF1[0] - PF0[0]) * e, PF0[1] + (PF1[1] - PF0[1]) * e - Math.sin(e * Math.PI) * 14];
}
function drawDynamic(k, now) {
  // granos en la tolva del molinillo
  const beans = Math.max(12, 36 - S.grams * .7);
  for (let y = 100 - beans; y < 100; y += 3) for (let x = 27; x < 67; x += 4) { R(x + (y % 6 ? 2 : 0), y, 3, 2, (x + y) % 5 ? '#5a3218' : '#7a4a24'); R(x + (y % 6 ? 2 : 0), y, 1, 1, '#9a6a3a'); }
  if (S.holding && k === 'grind') R(66, 118, 4, 4, Math.floor(now / 80) % 2 ? '#feca57' : '#ff7383');
  // portafiltro con el café molido
  const [px, py] = portafilterAt(k, now);
  RB(px - 13, py, 26, 9, '#8a96a3'); R(px - 11, py + 2, 22, 3, '#5a6470');
  RB(px + 13, py + 3, 32, 5, '#2b2233'); R(px + 15, py + 4, 28, 1, '#4a3a55');
  const mound = Math.min(1.2, S.grams / 18);
  if (S.grams > 0 && k !== 'shot' && k !== 'steam' && !S.lockAt) {
    if (S.tamp.done) R(px - 11, py + 1, 22, 3, '#3d2412');
    else { R(px - 11, py + 2 - mound * 3, 22, 1 + mound * 3, '#5a3218'); R(px - 7, py + 1 - mound * 4, 14, mound * 2, '#6b3e1f'); }
  }
  if (k === 'tamp') {
    // el pisón baja al compactar
    const down = S.tamp.done ? Math.max(0, 1 - Math.abs((now - S.tamp.pressAt) / 300 - 1)) : 0;
    const ty = py - 34 + down * 26;
    RB(px - 10, ty + 20, 20, 7, '#c8d0d8'); R(px - 8, ty + 21, 16, 1, '#eef2f5'); RB(px - 4, ty, 8, 20, '#7a4b2a'); R(px - 3, ty + 1, 2, 18, '#9a6a3a');
    // medidor de presión
    RB(304, 70, 12, 96, '#2b2233');
    R(305, 70 + 96 - 17 * 96 / 30, 10, 4 * 96 / 30, '#1dd1a1');
    R(300, 70 + 96 - S.tamp.v * 96 / 30, 20, 2, '#e84a5f');
  }
  // taza en la bandeja y espresso
  const [cx, cy] = CUP;
  RB(cx - 11, cy, 22, 13, '#f4f1ea'); R(cx - 9, cy + 1, 3, 11, '#ffffff'); RB(cx + 11, cy + 3, 4, 6, '#e6ddd0');
  const fill = Math.min(1, S.shot.s / 30);
  if (fill > 0) { R(cx - 10, cy + 12 - fill * 10, 20, fill * 10, S.shot.s > 33 ? '#c99a62' : '#5a3418'); R(cx - 10, cy + 12 - fill * 10, 20, 1, '#c08a52'); }
  if (S.shot.on) {
    const col = S.shot.s > 30 ? '#d8a868' : S.shot.s > 8 ? '#8a5a2b' : '#3d2412';
    for (let y = 142; y < cy + 12 - fill * 10; y++) { R(cx - 4, y, 1, 1, col); R(cx + 3, y, 1, 1, col); }
  }
  // aguja del manómetro: sube a 9 bares durante el espresso
  const ang = S.shot.on ? -.35 : 2.4;
  for (let r = 0; r < 8; r++) R(GAUGE[0] + Math.cos(ang) * r, GAUGE[1] + Math.sin(ang) * r, 1, 1, '#e84a5f');
  // jarra de leche en el vaporizador
  if (k === 'steam') {
    const st = S.steam;
    RB(272, 140, 26, 34, '#c8d0d8'); R(274, 142, 4, 30, '#eef2f5'); RB(298, 146, 6, 10, '#9aa6b2');
    R(273, 141, 24, 2 + st.foam * 5, '#fbf7ef');
    // termómetro
    RB(308, 70, 8, 86, '#f4f1ea');
    R(309, 70 + 86 - 65 * 86 / 80, 6, 10 * 86 / 80, '#1dd1a1');
    const h = Math.min(86, st.temp * 86 / 80);
    R(310, 156 - h, 4, h, st.temp > 66 ? '#e84a5f' : '#ff9f43');
    disc(312, 160, 5, st.temp > 66 ? '#e84a5f' : '#ff9f43');
  }
}

// vista de arriba de la taza: crema, leche y el dibujo
function drawCupTop(now) {
  const P = S.pour, cx = 160, cy = 118;
  for (let x = 0; x < W; x += 8) R(x, 0, 8, H, (x / 8) % 2 ? '#c99a6b' : '#c0905f');
  for (let y = 0; y < H; y += 7) R(0, y, W, 1, '#b5845a');
  disc(cx + 4, cy + 6, 84, 'rgba(40,20,10,.25)', 70);
  disc(cx, cy, 84, '#e6ddd0', 70); disc(cx, cy, 80, '#f4f1ea', 66);
  disc(cx, cy, 62, '#ffffff', 54); disc(cx, cy, 56, '#5a3418', 50);
  disc(cx, cy, 54, '#8a5a2b', 48);
  for (let k = 0; k < 140; k++) { const a = k * 2.399, rr = Math.sqrt(k / 140) * 50; R(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .9, 1, 1, k % 3 ? '#a06a36' : '#6b4424'); }
  // asa
  RB(cx + 82, cy - 8, 20, 16, '#f4f1ea'); R(cx + 86, cy - 4, 12, 8, '#c99a6b');
  const milk = '#fbf7ef', sh = '#e9dfcf';
  const art = (P.phase === 'done' || S.made) ? 1 : 0;
  if (P.kind === 'heart' || P.kind === 'tulip') {
    P.blobs.forEach((b, i) => {
      const y = cy + 14 - i * 22 * (P.kind === 'tulip' ? 1 : 0);
      if (P.kind === 'heart' && art) heart(cx, cy - 2, b.r, milk, sh);
      else { disc(cx, y - (P.kind === 'tulip' ? 0 : 0), b.r, sh, b.r * .85); disc(cx, y - 1, b.r - 1, milk, b.r * .85 - 1); if (P.kind === 'tulip' && i > 0) disc(cx, y + b.r * .5, b.r * .7, '#8a5a2b', b.r * .35); }
    });
    if (P.phase === 'pour' && P.r > 0) { const y = cy + 14 - P.blobs.length * 22 * (P.kind === 'tulip' ? 1 : 0); disc(cx, y, P.r, sh, P.r * .85); disc(cx, y - 1, P.r - 1, milk, P.r * .85 - 1); }
    if (art && P.kind === 'tulip') for (let y = cy - 48; y < cy + 36; y++) R(cx, y, 1, 1, milk);
    // guía del tamaño justo
    const T = TARGETS[P.kind]?.[P.blobs.length];
    if (P.phase === 'pour' && T) { const y = cy + 14 - P.blobs.length * 22 * (P.kind === 'tulip' ? 1 : 0); ring(cx, y, T[0], 'rgba(29,209,161,.9)'); ring(cx, y, T[1], 'rgba(29,209,161,.9)'); }
  }
  if (P.kind === 'rosetta') {
    P.leaves.forEach((off, i) => {
      const y = cy + 30 - i * 12, w = 32 - i * 4, x = cx + off * 10;
      // cada hoja es una media luna de leche: un óvalo blanco con uno de crema encima, corrido hacia arriba
      disc(x, y, w, sh, 6); disc(x, y - 1, w - 1, milk, 5); disc(x, y - 4, w - 3, '#8a5a2b', 4);
    });
    if (art) for (let y = cy - 46; y < cy + 40; y++) R(cx, y, 1, 1, milk);
    if (P.phase === 'pour') {
      RB(70, 200, 180, 8, '#2b2233'); R(155, 201, 10, 6, '#1dd1a1');
      R(160 + P.marker * 86 - 2, 196, 4, 16, '#feca57');
    }
  }
  // chorro de leche mientras se sirve
  if (S.holding && P.phase === 'pour') { const y = cy + 14 - P.blobs.length * 22 * (P.kind === 'tulip' ? 1 : 0); for (let yy = 0; yy < y; yy++) R(cx - 1, yy, 3, 1, yy % 4 ? milk : sh); }
  if (P.phase === 'choose') { R(0, 0, W, H, 'rgba(26,18,34,.25)'); }
}
function ring(cx, cy, r, col) { for (let a = 0; a < 6.28; a += .05) R(cx + Math.cos(a) * r, cy + Math.sin(a) * r * .85, 1, 1, col); }
function heart(cx, cy, r, col, sh) {
  const s = r / 18;
  for (let y = -22; y <= 20; y++) for (let x = -26; x <= 26; x++) {
    const X = x / (20 * s), Y = -(y / (20 * s)) + .25, v = (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3;
    if (v < 0) R(cx + x, cy + y, 1, 1, v > -.04 ? sh : col);
  }
}
export const baristaOpen = () => !!S;
