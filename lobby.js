// Sala: cuartos en pixel art donde la gente camina, se sienta, toca cosas y chatea en inglés.
// El arte está en lobby-art.js (muñequito, accesorios, herramientas) y lobby-rooms.js (cuartos y muebles).
// El servidor (gday_auth.py, sección "sala") guarda quién está, dónde está parado y los mensajes de los últimos minutos.
import { S, save, toast, esc, addCustom, totalHours } from './app.js';
import { DECK } from './data.js';
import { N, W, H, OX, OY, G, drawAvatar, normLook, DEF_LOOK, LOOK_MAX, OPT, STYLES, TOPS, BOTTOMS, ACC, ACC_BY, SLOTS, sprite } from './lobby-art.js';
import { ROOMS, FX, puff, drawFX, cat, drawCat, crab, drawCrab, bigWave } from './lobby-rooms.js';
import { music } from './lobby-music.js';
import { openBarista } from './lobby-barista.js';

const $ = s => document.querySelector(s);
const NICK_RE = /^[\w áéíóúñüÁÉÍÓÚÑÜ.\-']{2,20}$/;
const POLL = 1500, SPEED = 2.6;

/* ---------- temas y frases ---------- */
const TOPICS = [
  ['What did you do last weekend?', '¿Qué hiciste el fin de semana pasado?'],
  ['What is your favourite food? Can you cook it?', '¿Cuál es tu comida favorita? ¿La sabés cocinar?'],
  ['Where would you like to travel and why?', '¿A dónde te gustaría viajar y por qué?'],
  ['Tell us about a film or series you love.', 'Contá de una peli o serie que te encante.'],
  ['What do you do for work or study?', '¿De qué trabajás o qué estudiás?'],
  ['Morning person or night owl?', '¿Sos de mañana o de noche?'],
  ['What is the weather like where you live?', '¿Cómo está el clima donde vivís?'],
  ['What music are you listening to these days?', '¿Qué música estás escuchando?'],
  ['Why are you learning English?', '¿Por qué estás aprendiendo inglés?'],
  ['Describe your perfect day.', 'Describí tu día perfecto.'],
  ['Cats or dogs? Do you have a pet?', '¿Gatos o perros? ¿Tenés mascota?'],
  ['What is a word in English that you find funny?', '¿Qué palabra en inglés te da gracia?'],
  ['If you could live in another country, which one?', 'Si pudieras vivir en otro país, ¿cuál?'],
  ['What is the best advice you have ever received?', '¿Cuál es el mejor consejo que te dieron?'],
  ['What are you looking forward to this month?', '¿Qué estás esperando con ganas este mes?'],
  ['Have you ever tried Vegemite? Would you?', '¿Probaste alguna vez Vegemite? ¿Lo probarías?'],
];
const QUICK = ["G'day! How's it going?", 'Where are you from?', 'Nice to meet you!', 'Sorry, can you say that again?', 'How do you say … in English?', 'What do you mean?'];
const topic = () => TOPICS[Math.floor(Date.now() / 240e3) % TOPICS.length];

/* ---------- estado ---------- */
const cfg = () => {
  const c = (S.settings.lobby ??= { nick: S.settings.rankNick || '', look: { ...DEF_LOOK }, room: 'cafe', muted: [] });
  c.look = { ...normLook(c.look), fx: undefined, emote: undefined }; delete c.look.fx; delete c.look.emote;
  c.muted ||= []; c.owned ||= [];
  return c;
};
const guest = (() => { try { let g = sessionStorage.getItem('gday-guest'); if (!g) sessionStorage.setItem('gday-guest', g = Math.random().toString(36).slice(2, 12).padEnd(10, '0')); return g; } catch { return 'tab' + Date.now().toString(36); } })();
const L = { on: false, edit: false, err: '', me: null, last: 0, users: new Map(), log: [], outbox: [], busy: false, first: true, counts: {}, timer: 0, raf: 0, sel: null, tr: new Map(),
  cam: { x: 0, y: 0, s: 2, vw: W, vh: H }, hover: null, tip: null, word: null };
const ST = { lamp: true, occ: new Set(), boardTaken: false, ball: { x: 9.5, y: 10.5, vx: 0, vy: 0, z: 0, vz: 0, rot: 0 }, crabScared: 0 };
let self = null;
const room = () => ROOMS[cfg().room] || ROOMS.cafe;
if (location.hostname === 'localhost') window.__lobby = { L, ST, me: () => self };  // para probar en tu compu

function newAvatar(id, nick, look, x, y) {
  return { id, nick, look: normLook(look), x, y, fx: x, fy: y, tx: x, ty: y, path: [], dir: { back: false, right: false }, walk: 0, says: [], el: null, blinkAt: performance.now() + Math.random() * 3000, phase: Math.random() * 4 };
}

/* ---------- caminar ---------- */
function findPath(R, sx, sy, tx, ty) {
  const ok = (i, j) => i >= 0 && j >= 0 && i < N && j < N && !R.blocked.has(i + ',' + j);
  // a una silla, al sillón o a una toalla se llega, pero no se la cruza caminando
  const free = (i, j) => ok(i, j) && (!R.seatAt.has(i + ',' + j) || (i === tx && j === ty) || (i === sx && j === sy));
  if (!ok(tx, ty)) return null;
  const key = (i, j) => i * N + j, prev = new Map([[key(sx, sy), null]]), q = [[sx, sy]];
  while (q.length) {
    const [i, j] = q.shift();
    if (i === tx && j === ty) break;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!free(ni, nj) || prev.has(key(ni, nj))) continue;
      if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
      prev.set(key(ni, nj), [i, j]); q.push([ni, nj]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const path = []; let c = [tx, ty];
  while (c && !(c[0] === sx && c[1] === sy)) { path.unshift(c); c = prev.get(key(...c)); }
  return path;
}
function walkTo(a, tx, ty) {
  const p = findPath(room(), Math.round(a.fx), Math.round(a.fy), tx, ty);
  a.tx = tx; a.ty = ty;
  if (p) a.path = p; else { a.fx = tx; a.fy = ty; a.path = []; }
  if (a === self && p?.length) { self.emote = ''; self.pending = null; }
}
const faceOf = (di, dj, d) => {
  const sx = di - dj, sy = di + dj;
  return { back: sy < 0 ? true : sy > 0 ? false : d.back, right: sx > 0 ? true : sx < 0 ? false : d.right };
};
function step(a, dt, t) {
  if (!a.path.length) { a.walk = 0; return; }
  const [ni, nj] = a.path[0], dx = ni - a.fx, dy = nj - a.fy, d = Math.hypot(dx, dy), sp = SPEED * dt;
  a.dir = faceOf(Math.sign(Math.round(dx * 10)), Math.sign(Math.round(dy * 10)), a.dir);
  const before = a.walk;
  if (d <= sp) { a.fx = ni; a.fy = nj; a.path.shift(); } else { a.fx += dx / d * sp; a.fy += dy / d * sp; }
  a.walk += Math.min(d, sp);
  // huellas en la arena y salpicaduras en la orilla
  const R = room();
  if (R.water && Math.floor(before * 2.2) !== Math.floor(a.walk * 2.2)) {
    const [x, y] = G(a.fx + .5, a.fy + .5), side = Math.floor(a.walk * 2.2) % 2 ? -2 : 2;
    if (a.fy < 2.9) puff(x, y - 1, 'splash', 3);
    else (ST.prints ||= []).push({ x: Math.round(x + side), y: Math.round(y), t });
  }
  if (!a.path.length && a === self) arrived(t);
}

/* ---------- tocar cosas ---------- */
function face(a, di, dj) { a.dir = faceOf(di, dj, a.dir); }
function setFx(fx) { self.held = fx; self.heldUntil = Date.now() + 120e3; }
function headOf(a) { const [x, y] = G(a.fx + .5, a.fy + .5); return [x, y - 26]; }

function act(it, t) {
  const A = it.act, R = room(), [hx, hy] = headOf(self);
  if (A.face) face(self, ...A.face);
  switch (A.type) {
    case 'coffee': {
      // "Make a coffee": se entra a la máquina en primera persona; al terminar, te quedás con tu café en la mano
      const st = $('.lstage'); if (!st) break;
      openBarista(st, {
        onDone(made) { if (made && self) { setFx('coffee'); const [x, y] = headOf(self); puff(x - 4, y + 8, 'steam', 4); sendSoon(); } },
        addWords(list) { let n = 0; for (const [en, es] of list) if (addCustom(en, es, 'barista')) n++; return n; },
      });
      break;
    }
    case 'book': {
      setFx('book');
      const pool = DECK.filter(e => e.lvl === (S.settings.level || 1)), w = pool[Math.floor(Math.random() * pool.length)] || DECK[0];
      L.word = { en: w.en, es: w.es, ex: w.ex, at: Date.now() }; renderTip(); break;
    }
    case 'lamp': ST.lamp = !ST.lamp; break;
    case 'door': goRoom(A.to); return;
    case 'rustle': it.rustle = t; { const [x, y] = G(it.i + .5, it.j + .5); puff(x, y - 18, 'leaf', 4); } break;
    case 'coconut': {
      it.shake = t; const [x, y] = G(9.5, 3.5);
      FX.push({ x: x + 4, y: y - 54, vx: -8, vy: 0, g: 160, life: 0, max: .9, col: '#6b3e1f', kind: 'coco', shape: null });
      setTimeout(() => puff(hx, hy, 'spark', 5), 650); break;
    }
    case 'drink': it.open = t; setFx('drink'); break;
    case 'board': ST.boardTaken = true; setFx('board'); break;
    case 'castle': it.wave = t; { const [x, y] = G(7.5, 9.5); puff(x, y - 18, 'spark', 6); } break;
  }
 
  sendSoon();
}
function arrived(t) {
  const R = room(), k = Math.round(self.fx) + ',' + Math.round(self.fy), seat = R.seatAt.get(k);
  if (seat) { const [x, y] = G(self.fx + .5, self.fy + .5); puff(x, y - 2, 'dust', 4); }
  const p = self.pending; self.pending = null;
  if (p?.kind === 'item') act(p.it, t);
  if (p?.kind === 'kick') kick();
  if (p?.kind === 'surf') {
    // remar hacia adentro: queda parado en la tabla sobre el agua
    self.emote = 'surf'; self.surfDir = self.fx < N / 2 ? 1 : -1; self.fy = 1; self.ty = 1; self.heldUntil = Date.now() + 600e3;
    const [x, y] = G(self.fx + .5, self.fy + .5); puff(x, y, 'splash', 14); sendSoon();
  }
  if (p?.kind === 'splash') { const [x, y] = G(self.fx + .5, self.fy - .3); puff(x, y, 'splash', 12); face(self, 0, -1); }
  if (self.fx < 2.9 && R.water) { const [x, y] = G(self.fx + .5, self.fy + .5); puff(x, y - 1, 'splash', 6); }
}
function kick() {
  const B = ST.ball, dx = B.x - (self.fx + .5), dy = B.y - (self.fy + .5), d = Math.hypot(dx, dy) || 1;
  B.vx = dx / d * 4.5; B.vy = dy / d * 4.5; B.vz = 40;
}
function goRoom(k) {
  if (!ROOMS[k]) return;
  const ov = $('.lstage'); ov?.classList.add('fade');
  setTimeout(() => { stop(); cfg().room = k; save(); ST.boardTaken = false; paint(); }, 280);
}
// ¿qué hay debajo del dedo? (lo de más adelante primero)
const size = it => (it.box[2] - it.box[0]) * (it.box[3] - it.box[1]) * it.hit[4];
function pick(x, y) {
  const R = room();
  const users = [...L.users.values()].filter(a => a.box && x >= a.box.x && x < a.box.x + 14 && y >= a.box.y && y < a.box.y + a.box.h).sort((p, q) => (q.fx + q.fy) - (p.fx + p.fy));
  if (users[0]) return { kind: 'user', a: users[0] };
  if (R === ROOMS.cafe && cat.s) { const [cx, cy] = G(cat.s.fx + .5, cat.s.fy + .5); if (Math.abs(x - cx) < 7 && y > cy - 9 && y < cy + 2) return { kind: 'cat', label: 'Pet the cat' }; }
  if (R === ROOMS.beach) {
    const P = crab(performance.now()), [cx, cy] = G(P.fx + .5, P.fy + .5); if (Math.abs(x - cx) < 6 && y > cy - 7 && y < cy + 2) return { kind: 'crab', label: 'Poke the crab' };
    const B = ST.ball, [bx, by] = G(B.x, B.y); if (Math.abs(x - bx) < 6 && y > by - 12 - B.z && y < by + 1) return { kind: 'ball', label: 'Kick the ball' };
  }
  const items = R.items.filter(it => {
    if (!it.act || it.act.type === 'shade') return false;
    const [i, j, a, b, h] = it.hit, [x1] = G(i, j + b), [x2] = G(i + a, j), [, y1] = G(i, j), [, y2] = G(i + a, j + b);
    return x >= x1 && x <= x2 && y >= y1 - h && y <= y2;
  }).sort((p, q) => size(p) - size(q) || q.key - p.key);  // lo más chico y específico primero (una silla antes que su mesa)
  if (items[0]) return { kind: 'item', it: items[0], label: items[0].act.label };
  if (R.water) { const [i, j] = toTile(x, y); if (j <= 1 && i >= 0 && i < N && j >= -1) return { kind: 'water', i, label: self?.held === 'board' ? 'Go surfing' : 'Go into the water' }; }
  return null;
}
const toTile = (x, y) => { const u = (x - OX) / 12, v = (y - OY) / 6; return [Math.floor((u + v) / 2), Math.floor((v - u) / 2)]; };
function nearestFree(R, ti, tj) {
  let best = null, bd = 1e9;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (R.blocked.has(i + ',' + j)) continue;
    const d = Math.hypot(i - ti, j - tj) + Math.hypot(i - self.fx, j - self.fy) * .05;
    if (d < bd) { bd = d; best = [i, j]; }
  }
  return best;
}
function freeSeat(R, seats) {
  const taken = new Set([...L.users.values()].filter(a => !a.path.length).map(a => Math.round(a.fx) + ',' + Math.round(a.fy)));
  const opts = seats.filter(([i, j]) => !taken.has(i + ',' + j)).sort((p, q) => Math.hypot(p[0] - self.fx, p[1] - self.fy) - Math.hypot(q[0] - self.fx, q[1] - self.fy));
  return opts[0];
}

/* ---------- servidor ---------- */
const lookOut = () => ({ ...cfg().look, fx: self?.held && Date.now() < self.heldUntil ? self.held : '', emote: self?.emote || '' });
let soonT = 0;
function sendSoon() { clearTimeout(soonT); soonT = setTimeout(poll, 120); }
async function poll() {
  if (L.busy || !L.on) return;
  L.busy = true;
  const c = cfg(), body = { nick: c.nick, look: lookOut(), room: c.room, x: self.tx, y: self.ty, since: L.last, guest };
  if (L.outbox.length) body.say = L.outbox.shift();
  try {
    const r = await fetch('/api/auth?a=lobby', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'db');
    apply(d); L.err = '';
  } catch (e) {
    if (body.say) L.outbox.unshift(body.say);
    const was = L.err; L.err = e.message === 'Failed to fetch' ? 'offline' : e.message;
    if (['nologin', 'nolobby', 'apodo', 'noconfig'].includes(L.err)) { stop(); if (L.err === 'apodo') L.edit = true; paint(); }
    else if (was !== L.err) status();
  } finally { L.busy = false; }
}
function apply(d) {
  L.me = d.me; L.counts = d.counts || {};
  const seen = new Set();
  for (const u of d.users || []) {
    if (u.id === d.me) continue;
    seen.add(u.id);
    let a = L.users.get(u.id);
    if (!a) { a = newAvatar(u.id, u.nick, u.look, u.x, u.y); L.users.set(u.id, a); }
    a.nick = u.nick; a.look = normLook(u.look);
    if (a.look.emote === 'surf' && u.y <= 1) { if (a.fy > 1.6) { a.fx = u.x; a.fy = 1; a.path = []; } a.tx = u.x; a.ty = u.y; }
    else if (u.x !== a.tx || u.y !== a.ty) walkTo(a, u.x, u.y);
  }
  for (const [id, a] of L.users) if (!seen.has(id)) { a.el?.remove(); L.users.delete(id); }
  const muted = new Set(cfg().muted);
  for (const m of d.msgs || []) {
    if (m.from === d.me || muted.has(m.from)) continue;
    L.log.push({ id: 'm' + m.id, from: m.from, nick: m.nick, text: m.text });
    if (!L.first) { const a = L.users.get(m.from); if (a) { a.says.push({ text: m.text, t: performance.now() }); a.talkUntil = performance.now() + 1200; } }
  }
  L.last = d.last || L.last; L.first = false;
  if (L.log.length > 80) L.log.splice(0, L.log.length - 80);
  status(); renderLog();
}
function leave() {
  if (!L.me) return;
  try { fetch('/api/auth?a=lobbyleave', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guest, nick: cfg().nick }) }); } catch {}
  L.me = null;
}
function start() {
  if (L.on) return;
  L.on = true; L.first = true; L.last = 0; L.log = []; L.err = ''; L.hover = null; FX.length = 0; ST.prints = [];
  for (const a of L.users.values()) a.el?.remove();
  L.users.clear();
  const [sx, sy] = room().spawn, c = cfg();
  self = newAvatar('me', c.nick, c.look, sx, sy);
  poll(); L.timer = setInterval(() => { if (document.visibilityState === 'visible') poll(); }, POLL);
}
function stop() { L.on = false; clearInterval(L.timer); cancelAnimationFrame(L.raf); L.raf = 0; leave(); }
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#lobby')) { stop(); music.stop(); } if (!location.hash.startsWith('#lobby') && !location.hash.startsWith('#closet')) cancelAnimationFrame(ed.raf); });
window.addEventListener('pagehide', leave);

/* ---------- dibujar ---------- */
const statics = {};
function staticLayer(R) {
  if (statics[R.short]) return statics[R.short];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  R.bg(c); R.walls?.(c); R.floor(c);
  return statics[R.short] = cv;
}
const scene = document.createElement('canvas'); scene.width = W; scene.height = H;

// cómo se dibuja cada persona en este momento
function poseOf(a, t, R) {
  const k = Math.round(a.fx) + ',' + Math.round(a.fy), seat = !a.path.length && R.seatAt.get(k);
  const em = a === self ? a.emote : a.look.emote, talk = (a.talkUntil || 0) > t && Math.floor(t / 110) % 2;
  if (t > a.blinkAt + 140) a.blinkAt = t + 2500 + Math.random() * 3000;
  const o = { back: a.dir.back, right: a.dir.right, talk, blink: t > a.blinkAt, sip: Math.floor(t / 1000 + a.phase) % 5 === 0 };
  if (a.path.length) return { ...o, pose: 'walk', frame: Math.floor(a.walk * 2.8) % 4 };
  const breathe = Math.floor(t / 360 + a.phase) % 4;
  if (seat) return { ...o, pose: 'sit', seatH: seat.h, back: false, right: seat.dir === 'i', frame: breathe };
  if (em === 'sit') return { ...o, pose: 'sit', seatH: 0, frame: breathe };
  if (em === 'surf') return { ...o, pose: 'surf', frame: Math.floor(t / 420 + a.phase) % 2 };
  if (em === 'dance') return { ...o, pose: 'dance', frame: Math.floor(t / 260) % 2 };
  if (em === 'wave') return { ...o, pose: 'wave', frame: Math.floor(t / 200) % 2 };
  return { ...o, pose: 'stand', frame: Math.floor(t / 320 + a.phase) % 4 };
}

let lastT = 0;
function frame(t) {
  L.raf = requestAnimationFrame(frame);
  const cv = $('#lcv');
  if (!cv || !self) return;
  const dt = Math.min(.1, (t - lastT) / 1000 || 0); lastT = t;
  const R = room(), c = scene.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(staticLayer(R), 0, 0);
  if (self.held && Date.now() > self.heldUntil) { self.held = ''; if (R === ROOMS.beach) ST.boardTaken = false; }
  if (self.emote === 'wave' && t - (self.emoteAt || 0) > 2600) self.emote = '';
  R.live?.(c, t, ST);
  // huellas
  ST.prints = (ST.prints || []).filter(p => t - p.t < 7000);
  for (const p of ST.prints) { c.fillStyle = t - p.t < 4000 ? '#d4b370' : '#dfc183'; c.fillRect(p.x, p.y, 2, 1); }
  // baldosa debajo del dedo y destino
  const hv = L.hover;
  if (hv && !hv.obj) { const [i, j] = toTile(hv.x, hv.y); if (i >= 0 && j >= 0 && i < N && j < N && !R.blocked.has(i + ',' + j)) outlineTile(c, i, j, 'rgba(255,255,255,.55)'); }
  if (self.path.length) outlineTile(c, self.tx, self.ty, Math.floor(t / 250) % 2 ? '#ffffff' : '#c4b5fd');

  const avs = [self, ...L.users.values()];
  avs.forEach(a => { step(a, dt, t); if ((a === self ? a.emote : a.look.emote) === 'surf' && !a.path.length) ride(a, dt, t); });
  ST.occ = new Set(avs.filter(a => !a.path.length).map(a => Math.round(a.fx) + ',' + Math.round(a.fy)));
  const av = (x, y, r = .2) => [x + .5 - r, y + .5 - r, x + .5 + r, y + .5 + r];
  for (const it of R.items) if (it.flat) it.draw(c, t, ST);  // toallas y alfombras: siempre abajo de todo
  const objs = [...R.items.filter(it => !it.flat).map(it => ({ k: it.key, b: it.box, it })), ...avs.map(a => ({ k: a.fx + a.fy + .01, b: av(a.fx, a.fy), a, av: true }))];
  if (R === ROOMS.cafe) {
    const C = cat(t, R, findPath);
    if (C.path.length) { const [ni, nj] = C.path[0], dx = ni - C.fx, dy = nj - C.fy, d = Math.hypot(dx, dy), sp = 1.4 * dt; if (Math.abs(dx - dy) > .01) C.dir = dx - dy > 0 ? 1 : -1; if (d <= sp) { C.fx = ni; C.fy = nj; C.path.shift(); } else { C.fx += dx / d * sp; C.fy += dy / d * sp; } }
    objs.push({ k: C.fx + C.fy + .02, b: av(C.fx, C.fy, .25), av: true, draw: () => drawCat(c, C, t) });
  }
  if (R === ROOMS.beach) {
    const P = crab(t); objs.push({ k: P.fx + P.fy, b: av(P.fx, P.fy, .15), av: true, draw: () => drawCrab(c, P, t, t - ST.crabScared < 1500) });
    const B = ST.ball;
    B.x += B.vx * dt; B.y += B.vy * dt; B.vx *= .97; B.vy *= .97; B.vz -= 160 * dt; B.z = Math.max(0, B.z + B.vz * dt); if (B.z === 0) B.vz = Math.abs(B.vz) > 12 ? -B.vz * .45 : 0;
    if (B.x < .4 || B.x > N - .4) { B.vx *= -1; B.x = Math.max(.4, Math.min(N - .4, B.x)); }
    if (B.y < 2.6 || B.y > N - .4) { B.vy *= -1; B.y = Math.max(2.6, Math.min(N - .4, B.y)); }
    for (const it of R.items) if (it.block && Math.abs(B.x - (it.i + .5)) < .6 && Math.abs(B.y - (it.j + .5)) < .6) { B.vx *= -1; B.vy *= -1; B.x += B.vx * dt * 2; B.y += B.vy * dt * 2; }
    B.rot += Math.hypot(B.vx, B.vy) * dt * 3;
    objs.push({ k: B.x + B.y - 1, b: [B.x - .15, B.y - .15, B.x + .15, B.y + .15], av: true, draw: () => drawBall(c, B) });
  }
  for (const o of depthSort(objs)) {
    if (o.it) { o.it.draw(c, t, ST); continue; }
    if (o.draw) { o.draw(); continue; }
    const a = o.a, [x, y] = G(a.fx + .5, a.fy + .5), P = poseOf(a, t, R);
    const look = a === self ? lookOut() : a.look;
    if (P.pose === 'surf') { const up = Math.round(a.lift || 0); drawBoard(c, x, y - up, a.surfDir || 1, t); a.box = drawAvatar(c, look, x, y - 2 - up, a.onWave ? { ...P, frame: 1 } : P); }
    else a.box = drawAvatar(c, look, x, y, P);
  }
  // coco que cae
  for (const P of FX) if (P.kind === 'coco') { c.fillStyle = P.col; c.fillRect(Math.round(P.x) - 1, Math.round(P.y) - 1, 3, 3); }
  drawFX(c, dt);
  R.after?.(c, t, ST);
  if (Math.random() < .004 && avs.some(a => (a === self ? a.emote : a.look.emote) === 'dance')) { const d = avs.find(a => (a === self ? a.emote : a.look.emote) === 'dance'); const [x, y] = headOf(d); puff(x, y, 'note'); }

  // cámara: sigue a tu muñequito, con escala entera
  const K = L.cam, [mx, my] = G(self.fx + .5, self.fy + .5);
  const tx = Math.max(0, Math.min(W - K.vw, mx - K.vw / 2)), ty = Math.max(0, Math.min(H - K.vh, my - K.vh * .62));
  K.x += (tx - K.x) * Math.min(1, dt * 4); K.y += (ty - K.y) * Math.min(1, dt * 4);
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = R.bgCol; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(scene, Math.round(K.x), Math.round(K.y), K.vw, K.vh, 0, 0, K.vw, K.vh);
  overlay(cv, avs, t);
}
// Qué se dibuja primero: lo que está más atrás en el piso. Se compara la caja que ocupa cada cosa:
// si una termina antes de que empiece la otra (en i o en j), va atrás. Si se pisan (alguien sentado en una silla),
// la persona va adelante. Con eso se arma el orden (como mucho unas 40 cosas: se puede hacer en cada cuadro).
function behind(A, B) {
  const a = A.b, b = B.b, E = .02;
  const aB = a[2] <= b[0] + E || a[3] <= b[1] + E, bB = b[2] <= a[0] + E || b[3] <= a[1] + E;
  if (aB && !bB) return true;
  if (bB && !aB) return false;
  if (!aB && !bB && A.av !== B.av) return !A.av;
  return null;
}
function depthSort(list) {
  const n = list.length, after = list.map(() => []), need = new Array(n).fill(0);
  for (let x = 0; x < n; x++) for (let y = x + 1; y < n; y++) {
    const r = behind(list[x], list[y]);
    if (r === true) { after[x].push(y); need[y]++; } else if (r === false) { after[y].push(x); need[x]++; }
  }
  const out = [], done = new Array(n).fill(false);
  while (out.length < n) {
    let pickI = -1;
    for (let x = 0; x < n; x++) if (!done[x] && need[x] === 0 && (pickI < 0 || list[x].k < list[pickI].k)) pickI = x;
    if (pickI < 0) for (let x = 0; x < n; x++) if (!done[x] && (pickI < 0 || list[x].k < list[pickI].k)) pickI = x;  // por si hay un círculo
    done[pickI] = true; out.push(list[pickI]);
    for (const y of after[pickI]) need[y]--;
  }
  return out;
}
// surfear: la tabla va y viene a lo largo de la ola, sube y baja con el agua y deja espuma atrás
function ride(a, dt, t) {
  a.surfDir ||= 1;
  // ¿viene la ola grande? si la cresta pasa por donde está, la agarra: lo levanta, lo lleva hacia la orilla y acelera
  const Wv = bigWave(), base = .75 + Math.sin(t / 650 + a.phase) * .22;
  const onWave = Wv && !Wv.breaking && Wv.j > a.fy - .5 && Wv.j < 1.3;
  if (onWave && !a.onWave && a === self) { const [x, y] = G(a.fx + .5, a.fy + .5); puff(x, y - 4, 'splash', 10); }
  a.onWave = onWave;
  a.fx += a.surfDir * (onWave ? 2.6 : 1.25) * dt;
  if (a.fx > N - 1.2) a.surfDir = -1; else if (a.fx < .2) a.surfDir = 1;
  if (onWave) { a.fy = Math.max(a.fy, Wv.j - .08); a.lift = Wv.h; }
  else { a.fy += (base - a.fy) * Math.min(1, dt * 1.5); a.lift = Math.max(0, (a.lift || 0) - dt * 14); }
  if (onWave && Math.random() < dt * 30) { const [x, y] = G(a.fx + .5 - a.surfDir * .4, a.fy + .5); puff(x, y - a.lift, 'splash', 2); }
  a.dir = faceOf(a.surfDir, 0, a.dir);
  if (a === self) { a.tx = Math.max(0, Math.min(N - 1, Math.round(a.fx))); a.ty = 1; }
  if (Math.random() < dt * 9) { const [x, y] = G(a.fx + .5 - a.surfDir * .45, a.fy + .5); puff(x, y, 'splash', 1); }
}
// la tabla acostada sobre el agua, apuntando hacia donde va
function drawBoard(c, x, y, d, t) {
  const X = Math.round(x), Y = Math.round(y) + (Math.floor(t / 420) % 2);
  c.fillStyle = 'rgba(255,255,255,.55)';
  for (let k = 9; k < 15; k++) if ((k + Math.floor(t / 120)) % 3) c.fillRect(X - d * 2 * k, Y - d * k + 1, 2, 1);  // estela
  for (let k = -7; k <= 7; k++) {
    const w = Math.abs(k) > 5 ? 1 : 2, px = X + k * 2, py = Y + k;
    c.fillStyle = '#8a3f0f'; c.fillRect(px - 1, py - w - 1, 3, w * 2 + 2);
  }
  for (let k = -7; k <= 7; k++) {
    const w = Math.abs(k) > 5 ? 1 : 2, px = X + k * 2, py = Y + k;
    c.fillStyle = Math.abs(k) < 1 ? '#ffffff' : '#ff9f43'; c.fillRect(px, py - w, 2, w * 2);
    c.fillStyle = '#ffd3a1'; c.fillRect(px, py - w, 2, 1);
  }
}
function outlineTile(c, i, j, col) {
  isoLine(c, i, j, i + 1, j, col); isoLine(c, i, j, i, j + 1, col); isoLine(c, i + 1, j, i + 1, j + 1, col); isoLine(c, i, j + 1, i + 1, j + 1, col);
}
function isoLine(c, i0, j0, i1, j1, col) {
  const [x0, y0] = G(i0, j0), [x1, y1] = G(i1, j1), n = Math.abs(x1 - x0);
  c.fillStyle = col;
  for (let k = 0; k <= n; k += 2) c.fillRect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1);
}
function drawBall(c, B) {
  const [x, y] = G(B.x, B.y), X = Math.round(x), Y = Math.round(y);
  c.fillStyle = 'rgba(20,10,30,.2)'; c.fillRect(X - 3, Y, 7, 1);
  const cy = Y - 4 - Math.round(B.z), cols = ['#e84a5f', '#ffffff', '#2e86de', '#ffffff', '#feca57', '#ffffff'];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (dx * dx + dy * dy > 11) continue;
    const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI + B.rot) / (Math.PI / 3))) % 6;
    c.fillStyle = dx * dx + dy * dy > 8 ? '#3d2a40' : cols[seg];
    c.fillRect(X + dx, cy + dy, 1, 1);
  }
  c.fillStyle = '#ffffff'; c.fillRect(X - 2, cy - 2, 1, 1);
}

// cuando un globito se va de arriba de la cabeza, el mensaje queda 30 segundos arriba a la izquierda
function toFeed(nick, text, mine) {
  const el = $('#lfeed'); if (!el) return;
  const p = document.createElement('p'); if (mine) p.className = 'mine';
  p.innerHTML = `<b>${esc(nick)}</b> ${esc(text)}`;
  el.append(p);
  while (el.children.length > 6) el.firstChild.remove();
  setTimeout(() => p.remove(), 30e3);
}
// nombres y globitos (en HTML arriba del lienzo, para que se lean bien)
function overlay(cv, avs, t) {
  const ov = $('#lover'); if (!ov) return;
  const K = L.cam, s = K.s, ox = cv.offsetLeft, oy = cv.offsetTop;
  for (const a of avs) {
    if (!a.el || !a.el.isConnected) {
      a.el = document.createElement('div'); a.el.className = 'lav' + (a === self ? ' me' : '');
      a.el.innerHTML = '<div class="lbubs"></div><span class="lname"></span>'; ov.append(a.el);
    }
    const gone = a.says.filter(m => t - m.t >= 9000);
    if (gone.length) gone.forEach(m => toFeed(a.nick, m.text, a === self));
    a.says = a.says.filter(m => t - m.t < 9000);
    if (a.says.length > 3) { a.says.slice(0, -3).forEach(m => toFeed(a.nick, m.text, a === self)); a.says = a.says.slice(-3); }
    const name = a.el.lastChild, bubs = a.el.firstChild, sig = a.says.map(m => m.t).join();
    if (name.textContent !== a.nick) name.textContent = a.nick;
    if (bubs.dataset.sig !== sig) { bubs.dataset.sig = sig; bubs.innerHTML = a.says.map(m => `<p>${esc(m.text)}</p>`).join(''); }
    if (a.box) { a.el.style.left = (ox + (a.box.cx - K.x) * s).toFixed(0) + 'px'; a.el.style.top = (oy + (a.box.y - K.y) * s).toFixed(0) + 'px'; }
  }
  const hl = $('#lhover');
  if (hl) {
    const o = L.hover?.obj;
    hl.hidden = !o?.label;
    if (o?.label) { hl.textContent = o.label; hl.style.left = (ox + (L.hover.x - K.x) * s) + 'px'; hl.style.top = (oy + (L.hover.y - K.y) * s - 34) + 'px'; }
  }
}

/* ---------- interfaz ---------- */
function layout() {
  const cv = $('#lcv'), st = $('.lstage'); if (!cv || !st) return;
  const full = document.fullscreenElement === st, w = st.clientWidth, h = st.clientHeight;
  // en pantalla completa: el mayor aumento entero que entra a lo ancho y a lo alto
  const s = full ? Math.max(1, Math.floor(Math.min(w / W, h / H))) : w >= 640 ? Math.floor(w / W) : 2;
  const vw = Math.min(W, Math.floor(w / s)), vh = full ? Math.min(H, Math.floor(h / s)) : s === 2 && w < 640 ? Math.min(H, Math.round(vw * .9)) : H;
  Object.assign(L.cam, { s, vw, vh });
  cv.width = vw; cv.height = vh; cv.style.width = vw * s + 'px'; cv.style.height = vh * s + 'px';
}
addEventListener('resize', () => { layout(); });
document.addEventListener('fullscreenchange', () => {
  layout();
  const b = $('[data-a=lobbyfull]'); if (b) b.textContent = document.fullscreenElement ? '✕ Salir de pantalla completa' : '⛶ Pantalla completa';
  if (document.fullscreenElement) $('#lsay2')?.focus();
});

function status() {
  const el = $('#lstatus'); if (!el) return;
  const n = L.users.size + 1;
  el.textContent = L.err === 'offline' ? 'Sin conexión…' : L.err ? 'Reconectando…' : `${n} ${n === 1 ? 'persona' : 'personas'} acá`;
  document.querySelectorAll('[data-room]').forEach(b => { const k = b.dataset.room, cnt = L.counts[k]; b.querySelector('i').textContent = cnt ? ` · ${cnt}` : ''; b.classList.toggle('on', k === cfg().room); });
  document.querySelectorAll('[data-emote]').forEach(b => b.classList.toggle('on', self?.emote === b.dataset.emote));
  if (L.sel) popup();
}
function renderLog() {
  const el = $('#llog'); if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
  el.innerHTML = L.log.length ? L.log.map(m => {
    const tr = L.tr.get(m.text);
    return `<div class="lmsg ${m.from === 'me' ? 'mine' : ''}" data-lm="${m.id}"><b>${esc(m.nick)}</b> ${esc(m.text)}
      ${tr ? `<div class="ltr">${tr === '…' ? 'Traduciendo…' : esc(tr)}${tr !== '…' ? ` <button class="link" data-addcard="${m.id}">+ Tarjeta</button>` : ''}</div>` : ''}</div>`;
  }).join('') : '<p class="muted center">Todavía nadie dijo nada. ¡Rompé el hielo!</p>';
  if (atBottom) el.scrollTop = el.scrollHeight;
}
function renderTip() {
  const el = $('#ltip'); if (!el) return;
  const w = L.word && Date.now() - L.word.at < 30e3 ? L.word : null;
  el.hidden = !w;
  el.innerHTML = (w ? `<div class="lword"><small>📖 Palabra del libro</small><b>${esc(w.en)}</b><span>${esc(w.es)}</span>${w.ex ? `<i>${esc(w.ex)}</i>` : ''}</div>` : '');
}
setInterval(() => { if ($('#ltip') && !$('#ltip').hidden) renderTip(); }, 5000);
function popup() {
  const el = $('#lpop'); if (!el) return;
  const a = L.users.get(L.sel);
  if (!a) { el.hidden = true; L.sel = null; return; }
  const muted = cfg().muted.includes(a.id);
  el.hidden = false;
  el.innerHTML = `<b>${esc(a.nick)}</b><div class="row"><button class="btn ghost sm" data-lwave="${a.id}">Saludar</button>
    <button class="btn ghost sm" data-lmute="${a.id}">${muted ? 'Dejar de silenciar' : 'Silenciar'}</button></div>`;
}
function sayIt(text) {
  text = text.replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!text || !L.on) return;
  if (L.outbox.length > 2) return toast('Más despacio 🙂');
  L.outbox.push(text);
  L.log.push({ id: 'l' + Date.now(), from: 'me', nick: cfg().nick, text });
  self.says.push({ text, t: performance.now() }); self.talkUntil = performance.now() + 1200;
  renderLog(); sendSoon();
}
function scenePoint(e) {
  const cv = $('#lcv'), r = cv.getBoundingClientRect(), K = L.cam;
  return [(e.clientX - r.left) / K.s + Math.round(K.x), (e.clientY - r.top) / K.s + Math.round(K.y)];
}
function canvasClick(e) {
  const [x, y] = scenePoint(e), R = room(), t = performance.now(), o = pick(x, y);
  L.sel = null; popup();
  if (o?.kind === 'user') { L.sel = o.a.id; popup(); return; }
  if (o?.kind === 'cat') { const [cx, cy] = G(cat.s.fx + .5, cat.s.fy + .5); puff(cx, cy - 8, 'heart', 3); const n = nearestFree(R, Math.round(cat.s.fx), Math.round(cat.s.fy)); if (n) walkTo(self, ...n); return; }
  if (o?.kind === 'crab') { ST.crabScared = t; return; }
  if (o?.kind === 'ball') { const B = ST.ball, n = nearestFree(R, Math.floor(B.x), Math.floor(B.y)); if (Math.hypot(B.x - self.fx - .5, B.y - self.fy - .5) < 1.6) kick(); else if (n) { walkTo(self, ...n); self.pending = { kind: 'kick' }; } return; }
  if (o?.kind === 'water') {
    const i = Math.max(0, Math.min(N - 1, o.i));
    if (self.emote === 'surf') { self.surfDir = i > self.fx ? 1 : -1; return; }  // surfeando: tocar el agua cambia de dirección
    walkTo(self, i, 2); self.pending = { kind: self.held === 'board' ? 'surf' : 'splash' }; return;
  }
  if (o?.kind === 'item') {
    const it = o.it, A = it.act;
    const seats = it.seats || (it.seats2 && it.seats2.map(([i, j]) => [i, j]));
    if (A.type === 'sit' && seats) { const s = freeSeat(R, seats); if (s) walkTo(self, s[0], s[1]); else toast('Está todo ocupado'); return; }
    if (A.type === 'rustle' || A.type === 'shade') { act(it, t); return; }
    const at = A.at || nearestFree(R, it.i, it.j);
    const here = Math.round(self.fx) === at[0] && Math.round(self.fy) === at[1] && !self.path.length;
    if (here) act(it, t); else { walkTo(self, at[0], at[1]); self.pending = { kind: 'item', it }; }
    return;
  }
  const [i, j] = toTile(x, y);
  if (i < 0 || j < 0 || i >= N || j >= N) return;
  walkTo(self, i, j);
}
function canvasMove(e) {
  const [x, y] = scenePoint(e), o = pick(x, y);
  L.hover = { x, y, obj: o && o.kind !== 'user' ? o : o?.kind === 'user' ? { label: '' } : null };
  $('#lcv').style.cursor = o ? 'pointer' : 'default';
}

function bind() {
  const cv = $('#lcv');
  if (cv) { cv.onclick = canvasClick; cv.onmousemove = canvasMove; cv.onmouseleave = () => { L.hover = null; }; }
  layout();
  // el ancho del cuarto cambia cuando la página termina de acomodarse: se vuelve a medir
  const st = $('.lstage'); if (st && 'ResizeObserver' in window) { (bind.ro ||= new ResizeObserver(() => layout())).disconnect(); bind.ro.observe(st); }
  const f = $('#lform');
  if (f) f.onsubmit = e => { e.preventDefault(); const i = $('#lsay'); sayIt(i.value); i.value = ''; i.focus(); };
  const f2 = $('#lform2');
  if (f2) f2.onsubmit = e => { e.preventDefault(); const i = $('#lsay2'); sayIt(i.value); i.value = ''; i.focus(); };
  const log = $('#llog');
  if (log) log.onclick = async e => {
    const add = e.target.closest('[data-addcard]');
    if (add) {
      const m = L.log.find(x => x.id === add.dataset.addcard), es = m && L.tr.get(m.text);
      if (m && es) toast(addCustom(m.text, es, 'lobby') ? 'Frase agregada a tus tarjetas' : 'Esa frase ya está en tus tarjetas');
      return;
    }
    const el = e.target.closest('[data-lm]'); if (!el) return;
    const m = L.log.find(x => x.id === el.dataset.lm); if (!m || L.tr.has(m.text)) return;
    L.tr.set(m.text, '…'); renderLog();
    try {
      const r = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: [m.text] }) });
      const d = await r.json(); if (!d.es?.[0]) throw 0;
      L.tr.set(m.text, d.es[0]);
    } catch { L.tr.delete(m.text); toast('No se pudo traducir'); }
    renderLog();
  };
  renderLog(); renderTip(); status();
  if (!L.raf) L.raf = requestAnimationFrame(frame);
}

/* ---------- editor del skin ---------- */
const ed = { tab: 'face', dir: 0, walk: false, raf: 0 };
const DIRS = [{ back: false, right: false }, { back: false, right: true }, { back: true, right: true }, { back: true, right: false }];
function edLoop(t) {
  ed.raf = requestAnimationFrame(edLoop);
  const cv = $('#lprev'); if (!cv) return;
  const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
  c.fillStyle = '#2a2040'; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#342a4e'; for (let y = 30; y < cv.height; y += 1) for (let x = (y % 2); x < cv.width; x += 2) if (y > 33) c.fillRect(x, y, 1, 1);
  const look = { ...cfg().look, emote: '' }, d = DIRS[ed.dir];
  drawAvatar(c, look, 24, 36, ed.walk ? { ...d, pose: 'walk', frame: Math.floor(t / 140) % 4 } : ed.dance ? { ...d, pose: 'dance', frame: Math.floor(t / 260) % 2 } : { ...d, pose: 'stand', frame: Math.floor(t / 320) % 4, blink: t % 3200 < 140 });
}
function thumbs() {
  document.querySelectorAll('canvas[data-thumb]').forEach(cv => {
    const [k, v] = cv.dataset.thumb.split(':'), look = { ...cfg().look, [k]: +v };
    const c = cv.getContext('2d'); c.clearRect(0, 0, cv.width, cv.height);
    drawAvatar(c, look, 12, k === 'style' ? 30 : 31, { pose: 'stand' });
  });
}
const sw = (k, list) => `<div class="swatches">${list.map((col, i) => `<button class="sw ${cfg().look[k] === i ? 'on' : ''}" style="--c:${col}" data-a="lk" data-k="${k}" data-v="${i}" aria-label="${i + 1}"></button>`).join('')}</div>`;
const th = (k, names) => `<div class="thumbs">${names.map((n, i) => `<button class="thumb ${cfg().look[k] === i ? 'on' : ''}" data-a="lk" data-k="${k}" data-v="${i}"><canvas data-thumb="${k}:${i}" width="24" height="${k === 'style' ? 22 : 34}"></canvas><span>${n}</span></button>`).join('')}</div>`;
function editorView(head) {
  const c = cfg(), T = ed.tab;
  const tabs = [['face', 'Cara y pelo'], ['clothes', 'Ropa'], ['acc', 'Accesorios']];
  let body = '';
  if (T === 'face') body = `<h4>Piel</h4>${sw('skin', OPT.skin)}<h4>Ojos</h4>${sw('eyes', OPT.eyes)}<h4>Peinado</h4>${th('style', STYLES)}<h4>Color de pelo</h4>${sw('hair', OPT.hair)}`;
  if (T === 'clothes') body = `<h4>Arriba</h4>${th('top', TOPS)}${sw('shirt', OPT.shirt)}<h4>Abajo</h4>${th('bottom', BOTTOMS)}${sw('pants', OPT.pants)}<h4>Zapatillas</h4>${sw('shoes', OPT.shoes)}`;
  if (T === 'acc') {
    const mine = ACC.filter(a => c.owned.includes(a.id));
    body = mine.length ? `<div class="accgrid small">${mine.map(a => `<button class="accitem ${c.look.acc[a.slot] === a.id ? 'on' : ''}" data-a="accwear" data-id="${a.id}" data-back="edit"><canvas class="accprev" width="24" height="36" data-acc="${a.id}"></canvas><b>${esc(a.name)}</b></button>`).join('')}</div>`
      : '<p class="muted">Todavía no tenés accesorios. Ganás monedas estudiando y los comprás en la tienda.</p>';
    body += `<a class="btn ghost" href="#closet">Ir a la tienda · 🪙 ${coins()}</a>`;
  }
  return head + `<div class="card skined">
    <div class="skinprev"><canvas id="lprev" width="48" height="44"></canvas>
      <div class="row"><button class="btn ghost sm" data-a="edrot" data-d="-1" aria-label="Girar">⟲</button><button class="btn ghost sm ${ed.walk ? 'on' : ''}" data-a="edwalk">Caminar</button><button class="btn ghost sm ${ed.dance ? 'on' : ''}" data-a="eddance">Bailar</button><button class="btn ghost sm" data-a="edrot" data-d="1" aria-label="Girar">⟳</button></div>
      <input id="lnick" class="search" maxlength="20" placeholder="Tu apodo" value="${esc(c.nick || '')}" autocomplete="off">
      <button class="btn ghost sm" data-a="edrand">🎲 Al azar</button></div>
    <div class="skinopts"><div class="row lrooms">${tabs.map(([k, n]) => `<button class="btn ghost sm ${k === T ? 'on' : ''}" data-a="edtab" data-t="${k}">${n}</button>`).join('')}</div>${body}</div>
    <button class="btn primary big" data-a="lobbyenter">${c.ready ? 'Guardar y volver a la sala' : 'Entrar a la sala'}</button>
    ${L.err === 'apodo' ? '<p class="muted">Ese apodo no sirve: usá de 2 a 20 letras o números.</p>' : ''}
  </div>`;
}
function keepNick() { const n = $('#lnick')?.value; if (n != null) cfg().nick = n.trim(); }

function paint(where = location.hash.startsWith('#closet') ? '#closet' : '#lobby') {
  if (!location.hash.startsWith(where)) return;
  const v = where === '#closet' ? closetView : lobbyView;
  const sy = scrollY; $('#app').innerHTML = v(); v.after(); scrollTo(0, sy);
}

export function lobbyView() {
  const c = cfg();
  const head = `<header class="top"><h2>${L.edit || !c.ready ? 'Tu skin' : 'Sala'}</h2><span class="pill">Solo inglés · English only</span></header>`;
  if (L.err === 'nolobby') return head + `<div class="empty"><b>La sala todavía no está activada</b><p class="muted">Falta crear las tablas de la sala en la base de datos (supabase-lobby.sql).</p></div>`;
  if (L.err === 'nologin' || L.err === 'noconfig') return head + `<div class="card left"><b>Iniciá sesión para entrar</b>
    <p class="muted">Para chatear con otras personas tenés que iniciar sesión con Google (así cada persona entra una sola vez). Los demás solo ven tu apodo y tu skin.</p>
    <button class="btn primary" data-a="cloudlogin">Iniciar sesión con Google</button>
    <button class="btn ghost" data-a="lobbyretry">Ya inicié sesión</button></div>`;
  if (L.edit || !c.ready || !NICK_RE.test(c.nick || '')) return editorView(head);
  const [en, es] = topic(), R = room();
  return `<header class="top"><h2>${esc(R.name)}</h2><span class="pill" id="lstatus">Entrando…</span></header>
    <div class="row lrooms">${Object.entries(ROOMS).map(([k, r]) => `<button class="btn ghost sm" data-a="lobbyroom" data-room="${k}">${r.short}<i></i></button>`).join('')}
      <button class="btn ghost sm" data-a="lobbyedit">Skin</button><a class="btn ghost sm" href="#closet">Tienda</a>
      <button class="btn ghost sm ${c.music ? 'on' : ''}" data-a="lobbymusic">${c.music ? '🎵 Música: sí' : '🔇 Música: no'}</button>
      ${document.fullscreenEnabled ? '<button class="btn ghost sm lfullbtn" data-a="lobbyfull">⛶ Pantalla completa</button>' : ''}</div>
    <div class="lstage"><canvas id="lcv"></canvas><div id="lover"></div><div id="lhover" class="lhover" hidden></div><div id="lpop" class="lpop" hidden></div><div id="lfeed" class="lfeed"></div>
      <form id="lform2" class="lsay lfsbar"><input id="lsay2" maxlength="140" placeholder="Say something in English…" autocomplete="off"><button class="btn primary">Send</button></form></div>
    <div class="row lemotes"><button class="chip" data-a="emote" data-emote="wave">👋 Saludar</button><button class="chip" data-a="emote" data-emote="dance">💃 Bailar</button><button class="chip" data-a="emote" data-emote="sit">🧘 Sentarse</button></div>
    <div id="ltip" class="ltip" hidden></div>
    <div class="ltopic"><small>Tema para charlar</small><b>${esc(en)}</b><span>${esc(es)}</span></div>
    <form id="lform" class="lsay"><input id="lsay" maxlength="140" placeholder="Say something in English…" autocomplete="off" enterkeyhint="send"><button class="btn primary">Send</button></form>
    <div class="lquick">${QUICK.map(q => `<button class="chip" data-a="lobbyquick" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div id="llog" class="llog"></div>
    <p class="hint">Tocá el piso para caminar · tocá las cosas para usarlas (sillas, toallas, la barra, los libros…) · tocá un mensaje para traducirlo</p>`;
}
lobbyView.after = () => {
  const c = cfg();
  if (L.edit || !c.ready || !NICK_RE.test(c.nick || '') || ['nologin', 'nolobby', 'noconfig'].includes(L.err)) {
    stop(); thumbs(); paintItems(); cancelAnimationFrame(ed.raf); ed.raf = requestAnimationFrame(edLoop); return;
  }
  cancelAnimationFrame(ed.raf); start(); bind();
  if (c.music) music.start(c.room); else music.stop();
};

/* ---------- tienda de accesorios ---------- */
const earned = () => Math.floor(totalHours() * 60);
const spent = () => (cfg().owned || []).reduce((t, id) => t + (ACC_BY[id]?.price || 0), 0);
export const coins = () => Math.max(0, earned() - spent());
function paintItems() {
  document.querySelectorAll('canvas[data-acc]').forEach(cv => {
    const c = cv.getContext('2d'), look = { ...cfg().look, acc: { ...cfg().look.acc } }, a = ACC_BY[cv.dataset.acc];
    if (a) look.acc[a.slot] = a.id;
    c.clearRect(0, 0, cv.width, cv.height);
    drawAvatar(c, look, 12, cv.height - 3, { pose: 'stand', frame: 0 });
  });
}
export function closetView() {
  const c = cfg(), owned = new Set(c.owned), worn = c.look.acc, slot = closetView.slot || 'head';
  const items = ACC.filter(a => a.slot === slot);
  return `<header class="top"><h2>Tienda de accesorios</h2><span class="pill coins">🪙 ${coins()}</span></header>
    <p class="muted">Ganás <b>1 moneda por cada minuto que estudiás</b> en G'day (tarjetas, práctica, videos). Con las monedas comprás accesorios para tu skin y todos en la sala los ven.</p>
    <div class="closetme"><canvas class="accprev" width="24" height="40" data-acc=""></canvas><div><b>${esc(c.nick || 'Tu skin')}</b><span class="muted">${Object.values(worn).filter(Boolean).map(id => esc(ACC_BY[id]?.name || '')).join(' · ') || 'Sin accesorios'}</span></div></div>
    <div class="row lrooms">${SLOTS.map(([k, n]) => `<button class="btn ghost sm ${k === slot ? 'on' : ''}" data-a="closetslot" data-s="${k}">${n}</button>`).join('')}</div>
    <div class="accgrid">${items.map(a => {
      const has = owned.has(a.id), on = worn[a.slot] === a.id, can = coins() >= a.price;
      return `<div class="accitem ${on ? 'on' : ''}"><canvas class="accprev" width="24" height="40" data-acc="${a.id}"></canvas><b>${esc(a.name)}</b>
        ${has ? `<button class="btn ${on ? 'ghost' : 'primary'} sm" data-a="accwear" data-id="${a.id}">${on ? 'Sacarme' : 'Ponerme'}</button>`
          : `<button class="btn ${can ? 'primary' : 'ghost'} sm" data-a="accbuy" data-id="${a.id}" ${can ? '' : 'disabled'}>🪙 ${a.price}</button>`}</div>`;
    }).join('')}</div>
    <a class="btn primary big" href="#lobby">Volver a la sala</a>`;
}
closetView.after = paintItems;

export const lobbyActions = {
  lobbymusic() {
    const c = cfg(); c.music = !c.music; save();
    if (c.music) music.start(c.room); else music.stop();
    const b = $('[data-a=lobbymusic]'); if (b) { b.textContent = c.music ? '🎵 Música: sí' : '🔇 Música: no'; b.classList.toggle('on', c.music); }
  },
  lobbyfull() {
    const st = $('.lstage'); if (!st) return;
    if (document.fullscreenElement) document.exitFullscreen?.(); else st.requestFullscreen?.().catch(() => toast('Tu navegador no deja usar pantalla completa'));
  },
  closetslot({ s: k }) { closetView.slot = k; paint('#closet'); },
  accbuy({ id }) {
    const a = ACC_BY[id], c = cfg();
    if (!a || c.owned.includes(id)) return;
    if (coins() < a.price) return toast(`Te faltan ${a.price - coins()} monedas: ¡a estudiar!`);
    c.owned.push(id); c.look.acc[a.slot] = id; S.settings.lobby.look = c.look; save();
    toast(`¡Compraste: ${a.name}!`); paint('#closet');
  },
  accwear({ id, back }) {
    keepNick();
    const a = ACC_BY[id], c = cfg(); if (!a || !c.owned.includes(id)) return;
    if (c.look.acc[a.slot] === id) delete c.look.acc[a.slot]; else c.look.acc[a.slot] = id;
    S.settings.lobby.look = c.look; save(); paint(back ? '#lobby' : '#closet');
  },
  lk({ k, v }) {
    keepNick();
    const c = cfg(); if (!(k in LOOK_MAX)) return;
    c.look[k] = Math.max(0, Math.min(LOOK_MAX[k] - 1, +v)); S.settings.lobby.look = c.look;
    L.edit = true; save(); paint('#lobby');
  },
  edtab({ t }) { keepNick(); ed.tab = t; L.edit = true; paint('#lobby'); },
  edrot({ d }) { ed.dir = (ed.dir + (+d) + 4) % 4; },
  edwalk() { ed.walk = !ed.walk; ed.dance = false; keepNick(); L.edit = true; paint('#lobby'); },
  eddance() { ed.dance = !ed.dance; ed.walk = false; keepNick(); L.edit = true; paint('#lobby'); },
  edrand() {
    keepNick();
    const c = cfg(), r = k => Math.floor(Math.random() * LOOK_MAX[k]);
    for (const k of Object.keys(LOOK_MAX)) c.look[k] = r(k);
    S.settings.lobby.look = c.look; L.edit = true; save(); paint('#lobby');
  },
  lobbyenter() {
    const c = cfg(), nick = ($('#lnick')?.value || '').replace(/\s+/g, ' ').trim();
    if (!NICK_RE.test(nick)) return toast('Elegí un apodo de 2 a 20 letras');
    c.nick = nick; c.ready = true; L.edit = false; L.err = ''; S.settings.lobby.look = c.look; save();
    cancelAnimationFrame(ed.raf); paint('#lobby');
  },
  lobbyedit() { stop(); L.edit = true; paint('#lobby'); },
  lobbyretry() { L.err = ''; paint(); },
  lobbyroom({ room: k }) { if (ROOMS[k] && k !== cfg().room) goRoom(k); },
  lobbyquick({ t }) {
    const i = $('#lsay'); if (!i) return;
    if (t.includes('…')) { i.value = t; i.focus(); i.setSelectionRange(t.indexOf('…'), t.indexOf('…') + 1); } else sayIt(t);
  },
  emote({ emote: e }) {
    if (!self) return;
    if (self.emote === 'surf') return toast('Primero volvé a la arena: tocá la playa');
    self.path = []; self.tx = Math.round(self.fx); self.ty = Math.round(self.fy); self.fx = self.tx; self.fy = self.ty;
    self.emote = self.emote === e && e !== 'wave' ? '' : e; self.emoteAt = performance.now();
    status(); sendSoon();
  },
};
document.addEventListener('click', e => {
  const w = e.target.closest('[data-lwave]'), m = e.target.closest('[data-lmute]');
  if (w) { const a = L.users.get(w.dataset.lwave); if (a) { sayIt(`Hi ${a.nick}! 👋`); self.emote = 'wave'; self.emoteAt = performance.now(); face(self, Math.sign(a.fx - self.fx), Math.sign(a.fy - self.fy)); } L.sel = null; popup(); }
  if (m) {
    const id = m.dataset.lmute, c = cfg(), i = c.muted.indexOf(id);
    if (i >= 0) c.muted.splice(i, 1); else { c.muted.push(id); L.log = L.log.filter(x => x.from !== id); L.users.get(id) && (L.users.get(id).says = []); renderLog(); toast('No vas a ver más sus mensajes'); }
    save(); popup();
  }
});
