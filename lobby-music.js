// Música de la sala: un tema original que se toca en vivo con el audio del navegador (no hace falta bajar nada).
// Es una canción de verdad, de 28 compases que se repiten:
//   A  (8)  el tema: bajo caminante, piano eléctrico, batería con swing y la melodía principal
//   A' (8)  el tema otra vez, con una segunda voz que armoniza la melodía
//   B  (8)  el puente: otros acordes, un arpegio de vibráfono (café) o marimba (playa) y una contramelodía lenta
//   Break (4) se vacía: queda el colchón, el bajo largo y un filtro que se cierra y se vuelve a abrir
// El sonido: un sinte principal que "ondula" (vibrato lento + cinta vieja), piano eléctrico hecho con FM,
// reverb de sala, y una batería con golpes humanizados. El café es más lento, oscuro y con escobillas y crujido de vinilo;
// la playa es más rápida, brillante, con shaker y marimba.

const mtof = m => 440 * 2 ** ((m - 69) / 12);
const C = (root, v) => ({ root, v });
// acordes por compás (nota del bajo y voces)
const A = [C(45, [60, 64, 67, 71]), C(41, [57, 60, 64, 67]), C(38, [53, 57, 60, 64]), C(40, [56, 59, 62, 65]),
  C(45, [60, 64, 67, 71]), C(41, [57, 60, 64, 71]), C(47, [57, 62, 65, 69]), C(40, [56, 59, 62, 64])];
const B = [C(38, [53, 57, 60, 64]), C(43, [53, 59, 64, 69]), C(36, [55, 59, 62, 64]), C(41, [57, 60, 64, 69]),
  C(47, [57, 62, 65, 69]), C(40, [56, 59, 62, 65]), C(45, [60, 64, 67, 71]), C(40, [57, 59, 62, 64])];
const BRK = [A[0], A[1], A[0], A[7]];
// la melodía principal: [compás, semicorchea, nota, duración en semicorcheas]
const HOOK = [
  [0, 6, 76, 2], [0, 8, 79, 2], [0, 10, 81, 4], [0, 14, 79, 2],
  [1, 0, 76, 6], [1, 8, 72, 2], [1, 10, 74, 2], [1, 12, 76, 4],
  [2, 2, 77, 2], [2, 4, 76, 2], [2, 6, 74, 2], [2, 8, 72, 6], [2, 14, 69, 2],
  [3, 0, 71, 4], [3, 4, 68, 2], [3, 6, 71, 2], [3, 8, 74, 7],
  [4, 6, 76, 2], [4, 8, 79, 2], [4, 10, 84, 4], [4, 14, 81, 2],
  [5, 0, 83, 4], [5, 4, 81, 2], [5, 6, 79, 2], [5, 8, 76, 7],
  [6, 0, 74, 2], [6, 2, 77, 2], [6, 4, 81, 4], [6, 8, 79, 2], [6, 10, 77, 2], [6, 12, 76, 4],
  [7, 0, 74, 2], [7, 2, 72, 2], [7, 4, 71, 2], [7, 6, 68, 4], [7, 10, 71, 2], [7, 12, 69, 4],
];
// contramelodía lenta del puente
const COUNTER = [[2, 0, 76, 8], [2, 8, 74, 8], [3, 0, 72, 12], [6, 0, 76, 8], [6, 8, 79, 8], [7, 0, 76, 14]];
const LOOP = 28;
const section = bar => { const b = bar % LOOP; return b < 8 ? ['A', b] : b < 16 ? ['A2', b - 8] : b < 24 ? ['B', b - 16] : ['BRK', b - 24]; };
const chordAt = bar => { const [s, k] = section(bar); return s === 'B' ? B[k] : s === 'BRK' ? BRK[k] : A[k]; };

const ROOMS = {
  cafe: { bpm: 86, bright: 1800, arp: 'vibes', perc: 'brush', crackle: true, swing: .24, lead: 'square' },
  beach: { bpm: 100, bright: 3200, arp: 'marimba', perc: 'shaker', crackle: false, swing: .18, lead: 'sawtooth' },
};

let ctx = null, out = null, verb = null, warble = null, warbleDepth = null, tone = null, noise = null, timer = 0, step = 0, nextT = 0, room = 'cafe', lastLead = 0;
const hum = () => (Math.random() - .5) * .008;  // un poquito de imprecisión humana

function impulse(secs, decay) {
  const len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay; }
  return b;
}
function setup(c) {
  ctx = c || new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .2;
  tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 9000;
  out = ctx.createGain(); out.gain.value = 0;
  out.connect(tone).connect(comp).connect(ctx.destination);
  // reverb de sala (se le manda un poco de cada instrumento)
  const conv = ctx.createConvolver(); conv.buffer = impulse(2.4, 2.6);
  const vf = ctx.createBiquadFilter(); vf.type = 'lowpass'; vf.frequency.value = 4500;
  verb = ctx.createGain(); verb.gain.value = .9;
  verb.connect(conv).connect(vf).connect(out);
  // la ondulación de cinta: un LFO lento que mueve la afinación de los sintes
  const lfo = ctx.createOscillator(); lfo.frequency.value = .21;
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = .53;
  warble = ctx.createGain(); warble.gain.value = 1;
  warbleDepth = ctx.createGain(); warbleDepth.gain.value = 8;
  const l2 = ctx.createGain(); l2.gain.value = 3;
  lfo.connect(warbleDepth).connect(warble); lfo2.connect(l2).connect(warble); lfo.start(); lfo2.start();
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function amp(t, a, peak, dec, sus, len, rel) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(sus, t + a, dec / 3); g.gain.setValueAtTime(sus || .0001, t + len);
  g.gain.setTargetAtTime(0, t + len, rel / 3);
  return g;
}
function send(node, dry = 1, wet = .25) {
  const d = ctx.createGain(); d.gain.value = dry; node.connect(d).connect(out);
  if (wet) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w).connect(verb); }
  return node;
}
function osc(type, f, t, end, dest, detune = 0, wob = true) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune;
  if (wob) warble.connect(o.detune);
  o.connect(dest); o.start(t); o.stop(end + .1);
  return o;
}
function hiss(t, v, len, type, freq, q = 1, dest) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = amp(t, .001, v, len, 0, len, .02);
  s.connect(f).connect(g); (dest ? g.connect(dest) : send(g, 1, .08));
  s.start(t, Math.random() * .8, len + .1);
}

/* ---------- instrumentos ---------- */
function bass(t, m, dur, v = 1) {
  const g = amp(t, .006, .5 * v, dur * .5, .28 * v, dur * .85, .08);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
  f.frequency.setValueAtTime(900, t); f.frequency.setTargetAtTime(320, t, .08);
  f.connect(g); send(g, 1, .03);
  osc('sine', mtof(m), t, t + dur, f, 0, false);
  osc('sawtooth', mtof(m), t, t + dur, f, -4, false);
}
function ep(t, notes, dur, vel) {  // piano eléctrico (FM): ataque de campanita que se apaga y cuerpo cálido
  const g = amp(t, .004, vel, .9, vel * .25, dur, .25);
  const trem = ctx.createGain(); trem.gain.value = 1;
  const tl = ctx.createOscillator(); tl.frequency.value = 4.6; const td = ctx.createGain(); td.gain.value = .18;
  tl.connect(td).connect(trem.gain); tl.start(t); tl.stop(t + dur + 1);
  g.connect(trem); send(trem, 1, .35);
  for (const n of notes) {
    const f0 = mtof(n), car = osc('sine', f0, t, t + dur + .8, g);
    const mod = ctx.createOscillator(); mod.frequency.value = f0;
    const mg = ctx.createGain(); mg.gain.setValueAtTime(f0 * 2.4, t); mg.gain.setTargetAtTime(f0 * .25, t, .18);
    mod.connect(mg).connect(car.frequency); mod.start(t); mod.stop(t + dur + .8);
  }
}
function pad(t, notes, dur, bright, v = .02) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright * .45; f.Q.value = .5;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .8); g.gain.setValueAtTime(v, t + dur - .5); g.gain.linearRampToValueAtTime(0, t + dur);
  f.connect(g); send(g, 1, .5);
  for (const n of notes) { osc('sawtooth', mtof(n), t, t + dur, f, -9); osc('sawtooth', mtof(n), t, t + dur, f, 9); }
}
function lead(t, m, dur, R, v = .075) {  // el sinte que ondula: dos osciladores, glissando desde la nota anterior y vibrato que entra tarde
  const g = amp(t, .03, v, .4, v * .7, dur * .92, .2);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = R.bright * .9; f.Q.value = 2;
  g.connect(f); send(f, 1, .4);
  const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
  const vd = ctx.createGain(); vd.gain.setValueAtTime(0, t); vd.gain.linearRampToValueAtTime(18, t + Math.min(.45, dur * .6));
  vib.connect(vd); vib.start(t); vib.stop(t + dur + .4);
  for (const [type, det] of [[R.lead, -6], ['triangle', 6]]) {
    const o = osc(type, mtof(m), t, t + dur + .3, g, det);
    vd.connect(o.detune);
    if (lastLead) { o.frequency.setValueAtTime(lastLead, t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + .06); }
  }
  lastLead = mtof(m);
}
function mallet(t, m, v, kind) {  // vibráfono (café) o marimba (playa)
  const f0 = mtof(m), dec = kind === 'vibes' ? 1.1 : .35;
  const g = amp(t, .002, v, dec, 0, dec, .05); send(g, 1, kind === 'vibes' ? .45 : .25);
  osc('sine', f0, t, t + dec + .2, g, 0, kind === 'vibes');
  const g2 = amp(t, .001, v * (kind === 'vibes' ? .25 : .45), .06, 0, .08, .02); send(g2, 1, .1);
  osc('sine', f0 * (kind === 'vibes' ? 4 : 3.9), t, t + .2, g2, 0, false);
}
function kick(t, v) {
  const g = amp(t, .002, .7 * v, .25, 0, .25, .03); send(g, 1, 0);
  const o = ctx.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(44, t + .12);
  o.connect(g); o.start(t); o.stop(t + .4);
  hiss(t, .12 * v, .006, 'highpass', 3000);
}
function snare(t, v, R) {
  if (R.perc === 'brush') { hiss(t, .09 * v, .22, 'bandpass', 2600, .6); hiss(t - .06, .03 * v, .12, 'bandpass', 3500, .5); return; }
  const g = amp(t, .001, .18 * v, .08, 0, .1, .02); send(g, 1, .2);
  osc('triangle', 185, t, t + .15, g, 0, false);
  hiss(t, .2 * v, .16, 'bandpass', 1900, .8);
}

/* ---------- partitura ---------- */
function schedule(t0, i, R, sd) {
  const s = i % 16, bar = Math.floor(i / 16), [sec, k] = section(bar), ch = chordAt(bar), next = chordAt(bar + 1);
  const t = t0 + (s % 2 ? sd * R.swing : 0) + hum(), brk = sec === 'BRK';
  // el filtro general se cierra en el break y se abre de nuevo al volver al tema
  if (s === 0 && sec === 'BRK' && k === 0) { tone.frequency.setTargetAtTime(700, t0, 1.2); warbleDepth.gain.setTargetAtTime(22, t0, 1); }
  if (s === 8 && sec === 'BRK' && k === 3) tone.frequency.setTargetAtTime(9000, t0, .6);
  if (s === 0 && sec === 'A' && k === 0) warbleDepth.gain.setTargetAtTime(8, t0, 1);
  // colchón (siempre)
  if (s === 0) pad(t0, ch.v, sd * 16, R.bright, brk ? .034 : .02);
  // bajo: caminante en el tema y el puente, notas largas en el break
  if (brk) { if (s === 0) bass(t, ch.root, sd * 14, .9); }
  else {
    const walk = { 0: ch.root, 3: ch.root + 12, 6: ch.root + 7, 8: ch.root, 10: ch.root + 10, 14: next.root + (next.root > ch.root ? -1 : 1) };
    if (walk[s] != null) bass(t, walk[s], sd * (s === 0 ? 2.6 : 1.6), s === 0 ? 1 : .8);
  }
  // piano eléctrico en los contratiempos
  if (!brk && (s === 2 || s === 7 || (s === 11 && k % 2))) ep(t, ch.v, sd * (s === 7 ? 3.5 : 1.8), s === 7 ? .05 : .06);
  if (brk && s === 0) ep(t, ch.v, sd * 12, .045);
  // batería
  if (!brk) {
    if (s === 0 || s === 10 || (s === 7 && k === 7)) kick(t, 1);
    if (s === 4 || s === 12) snare(t, 1, R);
    if (s === 15 && k % 4 === 3) snare(t, .35, R);  // golpecito fantasma
    if (s % 2 === 0) hiss(t, (s % 4 ? .028 : .045) * (.8 + Math.random() * .4), .03, 'highpass', 7500);
    if (s === 14 && k % 2) hiss(t, .045, .2, 'highpass', 6000);
    if (R.perc === 'shaker' && s % 2) hiss(t, .022 + (s % 4 === 3 ? .012 : 0), .05, 'bandpass', 6500, 1.5);
  } else if (s % 4 === 0) kick(t, .45);
  // vinilo (café): crujidos sueltos
  if (R.crackle && Math.random() < .35) hiss(t0 + Math.random() * sd, .015 + Math.random() * .02, .003, 'highpass', 2500);
  // melodía principal en A y A' (en A' con una segunda voz una tercera abajo)
  if (sec === 'A' || sec === 'A2') {
    for (const [b, st, m, len] of HOOK) if (b === k && st === s) {
      lead(t, m, sd * len, R);
      if (sec === 'A2' && k >= 4) { const third = ch.v.map(n => n + 12).filter(n => n < m).pop() ?? m - 4; lead(t + .01, third, sd * len, R, .045); lastLead = mtof(m); }
    }
    if (s === 0 && k === 0) lastLead = 0;
  }
  // puente: arpegio de mallets y contramelodía lenta
  if (sec === 'B') {
    const arp = [...ch.v, ...ch.v.map(n => n + 12)], idx = [0, 2, 4, 6, 7, 5, 3, 1][Math.floor(s / 2) % 8];
    if (s % 2 === 0) mallet(t, arp[idx] + 12, s % 4 ? .05 : .07, R.arp);
    for (const [b, st, m, len] of COUNTER) if (b === k && st === s) lead(t, m, sd * len, R, .06);
  }
}
function tick() {
  if (!ctx) return;
  const R = ROOMS[room] || ROOMS.cafe, sd = 60 / R.bpm / 4;
  while (nextT < ctx.currentTime + .15) { schedule(nextT, step, R, sd); nextT += sd; step++; }
}

// Para escuchar una muestra sin abrir la sala: devuelve un WAV con los primeros segundos del tema
export async function renderPreview(secs = 30, r = 'cafe', fromBar = 0) {
  const keep = { ctx, out, verb, warble, warbleDepth, tone, noise, room, lastLead };
  const off = new OfflineAudioContext(2, 44100 * secs, 44100);
  setup(off); out.gain.value = .6; room = r;
  const R = ROOMS[r], sd = 60 / R.bpm / 4;
  for (let i = fromBar * 16, t = .05; t < secs - .5; i++, t += sd) schedule(t, i, R, sd);
  const buf = await off.startRendering();
  ({ ctx, out, verb, warble, warbleDepth, tone, noise, room, lastLead } = keep);
  const n = buf.length, ch = [buf.getChannelData(0), buf.getChannelData(1)], view = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, str) => [...str].forEach((c2, k) => view.setUint8(o + k, c2.charCodeAt(0)));
  w(0, 'RIFF'); view.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, 44100, true); view.setUint32(28, 44100 * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true); w(36, 'data'); view.setUint32(40, n * 4, true);
  let peak = 0;
  for (let i = 0; i < n; i++) for (let c2 = 0; c2 < 2; c2++) { const v = Math.max(-1, Math.min(1, ch[c2][i])); peak = Math.max(peak, Math.abs(v)); view.setInt16(44 + (i * 2 + c2) * 2, v * 32767, true); }
  return { wav: new Blob([view], { type: 'audio/wav' }), peak };
}

// Canciones grabadas con ElevenLabs (music/generate.sh). Si un archivo no carga, suena el tema hecho con código de arriba.
const FILES = { cafe: 'music/cafe.mp3', beach: 'music/beach.mp3' };
const bufs = {};
let fout = null, track = null, want = 0, vol0 = .5;
async function loadBuf(r) {
  if (r in bufs) return bufs[r];
  return bufs[r] = (async () => {
    try { const res = await fetch(FILES[r]); if (!res.ok) throw 0; return await ctx.decodeAudioData(await res.arrayBuffer()); }
    catch { return false; }
  })();
}
function synthOn() { if (!timer) { step = 0; nextT = ctx.currentTime + .1; timer = setInterval(tick, 40); } out.gain.setTargetAtTime(vol0 * .45, ctx.currentTime, .6); }
function synthOff() { out.gain.setTargetAtTime(0, ctx.currentTime, .3); clearInterval(timer); timer = 0; }
function fadeOutTrack(t) {
  if (!t) return;
  t.g.gain.cancelScheduledValues(ctx.currentTime);
  t.g.gain.setTargetAtTime(0, ctx.currentTime, .5);
  setTimeout(() => { try { t.src.stop(); } catch {} }, 2500);
}
async function play(r) {
  const my = ++want;
  const b = FILES[r] ? await loadBuf(r) : false;
  if (my !== want) return;  // mientras cargaba, se cambió de cuarto o se apagó
  if (!b) { fadeOutTrack(track); track = null; synthOn(); return; }
  synthOff();
  if (track?.room === r) return;
  // entra la canción nueva y la anterior se va apagando (fundido cruzado)
  const src = ctx.createBufferSource(); src.buffer = b; src.loop = true;
  const g = ctx.createGain(); g.gain.value = 0; src.connect(g).connect(fout);
  src.start(); g.gain.setTargetAtTime(1, ctx.currentTime, .8);
  fadeOutTrack(track); track = { src, g, room: r };
}

export const music = {
  get on() { return !!ctx && ctx.state === 'running' && (!!track || !!timer); },
  start(r, vol = .5) {
    room = r || room; vol0 = vol;
    if (!ctx) { setup(); fout = ctx.createGain(); fout.gain.value = 0; fout.connect(ctx.destination); }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      // sin un clic de por medio, el navegador no deja sonar: arranca en el próximo toque
      const go = () => { ctx.resume(); removeEventListener('pointerdown', go); };
      addEventListener('pointerdown', go);
    }
    fout.gain.cancelScheduledValues(ctx.currentTime);
    fout.gain.setTargetAtTime(vol * .9, ctx.currentTime, .5);
    play(room);
  },
  setRoom(r) { if (r !== room) { room = r; if (fout && fout.gain.value > 0) play(r); } },
  stop() {
    if (!ctx) return;
    want++;
    synthOff();
    fout.gain.cancelScheduledValues(ctx.currentTime);
    fout.gain.setTargetAtTime(0, ctx.currentTime, .3);
    fadeOutTrack(track); track = null;
  },
};
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (timer || track) ctx.resume(); });
