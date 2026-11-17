// Los cuartos de la sala: piso, paredes, muebles y lo que pasa al tocarlos.
import { N, W, H, WALL, G, box, cube, blob, tile, isoLine, vline, ramp, mix, shade, hash } from './lobby-art.js';

/* ---------- partículas (vapor, salpicaduras, hojas, corazones) ---------- */
export const FX = [];
export function puff(x, y, kind, n = 1) {
  for (let k = 0; k < n; k++) {
    const r = Math.random(), s = Math.random();
    const P = { x, y, vx: 0, vy: 0, g: 0, life: 0, max: 1, col: '#fff', kind };
    if (kind === 'steam') Object.assign(P, { x: x + (r - .5) * 2, vx: (s - .5) * 3, vy: -6 - r * 4, max: 1.6, col: 'rgba(255,255,255,.55)' });
    if (kind === 'splash') Object.assign(P, { vx: (r - .5) * 30, vy: -25 - s * 25, g: 90, max: .7, col: s > .5 ? '#e8f8ff' : '#7fd3f7' });
    if (kind === 'dust') Object.assign(P, { x: x + (r - .5) * 10, vx: (r - .5) * 14, vy: -4 - s * 4, max: .6, col: 'rgba(230,215,190,.8)' });
    if (kind === 'leaf') Object.assign(P, { x: x + (r - .5) * 10, vx: (r - .5) * 16, vy: -14 - s * 10, g: 30, max: 1.2, col: s > .5 ? '#2fa651' : '#6fd38a' });
    if (kind === 'heart') Object.assign(P, { x: x + (r - .5) * 6, vy: -12, max: 1.4, col: '#ff5d8f', shape: 'heart' });
    if (kind === 'note') Object.assign(P, { x: x + (r - .5) * 8, vx: (r - .5) * 6, vy: -14, max: 1.3, col: ['#feca57', '#1dd1a1', '#f368e0'][k % 3], shape: 'note' });
    if (kind === 'spark') Object.assign(P, { x: x + (r - .5) * 14, y: y + (s - .5) * 8, vy: -6, max: .9, col: '#fff7b0' });
    if (kind === 'zzz') Object.assign(P, { vx: 4, vy: -6, max: 2, col: '#c4b5fd', shape: 'z' });
    if (kind === 'mote') Object.assign(P, { vx: (r - .5) * 2, vy: (s - .5) * 2, max: 4, col: 'rgba(255,240,190,.7)' });
    FX.push(P);
  }
}
export function drawFX(c, dt) {
  for (let k = FX.length - 1; k >= 0; k--) {
    const P = FX[k];
    P.life += dt; if (P.life > P.max) { FX.splice(k, 1); continue; }
    P.vy += P.g * dt; P.x += P.vx * dt; P.y += P.vy * dt;
    const x = Math.round(P.x), y = Math.round(P.y);
    c.fillStyle = P.col;
    if (P.shape === 'heart') { c.fillRect(x - 2, y, 2, 1); c.fillRect(x + 1, y, 2, 1); c.fillRect(x - 2, y + 1, 5, 1); c.fillRect(x - 1, y + 2, 3, 1); c.fillRect(x, y + 3, 1, 1); }
    else if (P.shape === 'note') { c.fillRect(x, y - 3, 1, 4); c.fillRect(x + 1, y - 3, 2, 1); c.fillRect(x - 1, y, 2, 2); }
    else if (P.shape === 'z') { c.fillRect(x, y, 3, 1); c.fillRect(x + 1, y + 1, 1, 1); c.fillRect(x, y + 2, 3, 1); }
    else c.fillRect(x, y, 1, 1);
  }
  if (FX.length > 400) FX.splice(0, FX.length - 400);
}

/* ---------- muebles reutilizables ---------- */
const sway = (t, ph, amp = 1) => Math.round(Math.sin(t / 900 + ph) * amp);
function plant(i, j, kind = 0) {
  return { i, j, block: true, h: 26, box: [i + .2, j + .2, i + .8, j + .8], act: { type: 'rustle', label: 'Touch the plant' }, draw(c, t) {
    const [x, y] = G(i + .5, j + .5), r = this.rustle && t - this.rustle < 700 ? Math.round(Math.sin((t - this.rustle) / 40) * 2) : 0;
    cube(c, i + .25, j + .25, 0, .5, .5, 7, '#b5651d'); box(c, i + .2, j + .2, 7, .6, .6, 2, '#d98a3d', '#b5651d', '#8a4a18');
    const s = sway(t, i + j) + r;
    if (kind) { // planta alta (monstera)
      [[-6, -14], [5, -16], [-2, -22], [3, -26], [-5, -24]].forEach(([dx, dy], k) => { blob(c, x + dx + s, y + dy, 4, k % 2 ? '#1e7d3a' : '#27964a', 3); blob(c, x + dx + s - 1, y + dy - 1, 2, '#5cc47a', 1); });
      c.fillStyle = '#1b5e30'; c.fillRect(x, y - 20, 1, 11);
    } else {
      blob(c, x + s, y - 17, 7, '#1e7d3a', 6); blob(c, x - 3 + s, y - 20, 4, '#27964a'); blob(c, x + 3 + s, y - 15, 4, '#27964a'); blob(c, x - 2 + s, y - 22, 2, '#6fd38a', 1); blob(c, x + 2 + s, y - 17, 1, '#6fd38a', 1);
    }
  } };
}
function chair(i, j, dir, col = '#8d5a3b') {
  return { i, j, h: 18, box: [i + .2, j + .2, i + .82, j + .82], seats: [[i, j, dir, 9]], act: { type: 'sit', label: 'Sit down' }, draw(c) {
    const leg = shade(col, .6);
    [[.25, .25], [.7, .25], [.25, .7], [.7, .7]].forEach(([a, b]) => cube(c, i + a, j + b, 0, .07, .07, 7, leg, null));
    cube(c, i + .2, j + .2, 7, .62, .62, 2, col);
    if (dir === 'i') { cube(c, i + .17, j + .2, 9, .1, .62, 11, col); box(c, i + .15, j + .3, 13, .02, .42, 2, ramp(col).d, ramp(col).d, ramp(col).d, null); }
    else { cube(c, i + .2, j + .17, 9, .62, .1, 11, col); box(c, i + .3, j + .15, 13, .42, .02, 2, ramp(col).d, ramp(col).d, ramp(col).d, null); }
  } };
}
function table(i, j, col, chairs) {
  return { i, j, block: true, h: 14, box: [i + .08, j + .08, i + .92, j + .92], act: { type: 'sit', label: 'Sit at the table', seatsFrom: chairs }, steam: hash(i, j) * 3000, draw(c, t) {
    cube(c, i + .44, j + .44, 0, .12, .12, 10, '#4a3020', null);
    box(c, i + .3, j + .3, 0, .4, .4, 1, '#3b2618', '#3b2618', '#3b2618', null);
    cube(c, i + .08, j + .08, 10, .84, .84, 3, col);
    const [x, y] = G(i + .45, j + .55);
    c.fillStyle = '#f4f1ea'; c.fillRect(x - 1, y - 17, 4, 3); c.fillStyle = '#c9c2b4'; c.fillRect(x + 2, y - 17, 1, 3); c.fillRect(x + 3, y - 16, 1, 1);
    c.fillStyle = '#5a3820'; c.fillRect(x - 1, y - 17, 3, 1);
    if (t - this.steam > 2400) { this.steam = t; puff(x + 1, y - 19, 'steam'); }
  } };
}

/* ---------- café ---------- */
const WOOD = ['#b97a4a', '#b3744a', '#bf8152', '#ae7044'];
const inRug = (i, j) => i >= 4 && i <= 7 && j >= 5 && j <= 8;
const cafe = {
  name: 'The Flat White Café', short: 'Café', spawn: [1, 9], bgCol: '#160f22',
  bg(c) { c.fillStyle = '#160f22'; c.fillRect(0, 0, W, H); },
  floor(c) {
    box(c, 0, 0, -6, N, N, 6, '#000', '#6b4228', '#4f2f1c', null);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      if (inRug(i, j)) {
        const edge = i === 4 || i === 7 || j === 5 || j === 8;
        tile(c, i, j, edge ? '#6c2f86' : (i + j) % 2 ? '#8e4bab' : '#9a57b8');
        if (edge) { isoLine(c, i, j + .5, i + 1, j + .5, '#e0b04c'); isoLine(c, i + .5, j, i + .5, j + 1, '#e0b04c'); }
        else { const [x, y] = G(i + .5, j + .5); c.fillStyle = '#c9a0dc'; c.fillRect(x - 1, y - 1, 2, 2); }
      } else {
        tile(c, i, j, WOOD[Math.floor(hash(i, j) * 4)]);
        // tablas: líneas a lo largo de i, con las uniones salteadas
        for (const k of [0, 1 / 3, 2 / 3]) isoLine(c, i, j + k, i + 1, j + k, k ? '#9f6338' : '#8d5530');
        const s = (hash(j, i, 7) * .6 + .2);
        isoLine(c, i + s, j, i + s, j + .33, '#8d5530');
        const [hx, hy] = G(i + .3, j + .5); c.fillStyle = '#cb8f5e'; c.fillRect(hx, hy, 3, 1);
      }
    }
    // luz de la ventana sobre el piso
    for (let i = 6; i <= 9; i++) for (let j = 1; j <= 3; j++) {
      const [x0, y0] = G(i, j);
      c.fillStyle = 'rgba(255,236,180,.10)';
      for (let r = 0; r < 12; r++) { const hf = r < 6 ? (r + 1) * 2 : (12 - r) * 2; for (let x = x0 - hf; x < x0 + hf; x++) if ((x + r) % 2 === 0) c.fillRect(x, y0 + r, 1, 1); }
    }
  },
  walls(c) {
    const stripeL = x => Math.floor((x - 16) / 8) % 2 ? '#ead9b8' : '#e2cfab';
    const stripeR = x => Math.floor((x - 160) / 8) % 2 ? '#dcc59d' : '#d3bb92';
    box(c, -.3, 0, 0, .3, N, WALL, '#6b4a2f', '#6b4a2f', stripeL);
    box(c, -.3, -.3, 0, N + .3, .3, WALL, '#6b4a2f', stripeR, stripeR);
    // zócalo de madera (frisos) en las dos paredes
    box(c, -.06, 0, 0, .06, N, 16, '#7a5234', '#7a5234', '#8d6240');
    box(c, 0, -.06, 0, N, .06, 16, '#7a5234', '#7a5234', '#7a5234');
    for (let j = .5; j < N; j += 1) box(c, -.03, j, 3, .03, .5, 10, '#9a6c47', '#9a6c47', '#9a6c47', null);
    for (let i = .5; i < N; i += 1) box(c, i, -.03, 3, .5, .03, 10, '#8d6240', '#8d6240', '#8d6240', null);
    // ventana con marco y cruz
    box(c, 5.85, -.06, 18, 3.3, .06, 30, '#7a5234', '#7a5234', '#7a5234');
    box(c, 6, -.04, 20, 3, .05, 26, x => ['#bfe9ff', '#a8e0ff', '#8fd3ff'][Math.floor((x / 3)) % 3], x => ['#bfe9ff', '#a8e0ff', '#8fd3ff'][Math.floor((x / 3)) % 3], '#8fd3ff', null);
    box(c, 7.45, -.035, 20, .1, .05, 26, '#7a5234', '#7a5234', '#7a5234', null);
    box(c, 6, -.035, 32, 3, .05, 2, '#7a5234', '#7a5234', '#7a5234', null);
    box(c, 5.8, -.12, 16, 3.4, .12, 2, '#e9dcc8', '#e9dcc8', '#cfc0aa');  // alféizar
    // pizarrón con el menú arriba de la barra
    box(c, 1.1, -.06, 26, 3.6, .06, 20, '#7a5234', '#7a5234', '#7a5234');
    box(c, 1.25, -.04, 28, 3.3, .05, 16, '#2d3a33', '#2d3a33', '#2d3a33', null);
    [[1.5, 40, 1.4], [1.5, 36, 1], [1.5, 32, 1.2], [3, 40, .9], [3, 36, 1.1], [3, 32, .7]].forEach(([i, z, w]) => {
      for (let k = 0; k < w * 12; k += 2) { const [x, y] = G(i + k / 12, -.03); c.fillStyle = k % 6 ? '#e8efe9' : '#feca57'; c.fillRect(Math.round(x), Math.round(y - z), 1, 1); }
    });
    // cuadro (Ópera de Sídney, en pixeles) en la pared izquierda
    box(c, -.06, 2.4, 22, .06, 2.2, 22, '#c98a3c', '#c98a3c', '#c98a3c');
    box(c, -.04, 2.6, 24, .05, 1.8, 18, '#ff9f43', '#ff9f43', x => x % 4 < 2 ? '#ffb86b' : '#ff9f43', null);
    box(c, -.035, 2.6, 24, .05, 1.8, 5, '#2e86de', '#2e86de', '#2e86de', null);
    [[3.0, 4], [3.35, 7], [3.7, 5]].forEach(([j, hh]) => { for (let k = 0; k < hh; k++) { const [x, y] = G(-.03, j + k * .02); c.fillStyle = '#ffffff'; c.fillRect(Math.round(x) - k, Math.round(y - 29 - k), k + 1, 1); } });
    // puerta
    box(c, -.06, 8.9, 0, .06, 1.8, 36, '#5a3a22', '#5a3a22', '#5a3a22');
    box(c, -.04, 9.05, 0, .05, 1.5, 33, '#8a5c38', '#8a5c38', x => x % 6 < 1 ? '#7a4f30' : '#8a5c38', null);
    box(c, -.035, 9.2, 18, .05, .5, 10, '#bfe9ff', '#bfe9ff', '#bfe9ff', null);
    const [kx, ky] = G(-.03, 10.3); c.fillStyle = '#ffd23f'; c.fillRect(Math.round(kx), Math.round(ky - 16), 2, 2);
    // felpudo
    tile(c, 0, 9, '#4a6b3a'); tile(c, 0, 10, '#4a6b3a');
  },
  live(c, t, st) {
    // reloj de verdad en la pared izquierda
    const [cx0, cy0] = G(-.03, 6.6), cx = Math.round(cx0), cy = Math.round(cy0 - 40);
    blob(c, cx, cy, 5, '#5a3a22', 6); blob(c, cx, cy, 4, '#f4f1ea', 5);
    const d = new Date(), hA = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, mA = d.getMinutes() / 60 * Math.PI * 2;
    c.fillStyle = '#1a1222';
    for (let k = 0; k <= 4; k++) c.fillRect(Math.round(cx + Math.sin(mA) * k * .9), Math.round(cy - Math.cos(mA) * k), 1, 1);
    for (let k = 0; k <= 2; k++) c.fillRect(Math.round(cx + Math.sin(hA) * k * .9), Math.round(cy - Math.cos(hA) * k), 1, 1);
    // guirnalda de luces arriba de las paredes
    const bulbs = ['#ff6b6b', '#feca57', '#48dbfb', '#1dd1a1', '#f368e0'];
    for (let k = 0; k < 22; k++) {
      const left = k < 11, u = (left ? k : k - 11) + .5;
      const [x, y] = left ? G(0, u) : G(u, 0), sag = Math.sin((u % 1.5) / 1.5 * Math.PI) * 3;
      const on = Math.sin(t / 400 + k * 1.7) > -.3;
      c.fillStyle = '#3d2a20'; c.fillRect(Math.round(x), Math.round(y - WALL + 4 + sag - 1), 1, 1);
      c.fillStyle = on ? bulbs[k % 5] : shade(bulbs[k % 5], .45);
      c.fillRect(Math.round(x), Math.round(y - WALL + 4 + sag), 2, 2);
      if (on) { c.fillStyle = 'rgba(255,240,200,.25)'; c.fillRect(Math.round(x) - 1, Math.round(y - WALL + 3 + sag), 4, 4); }
    }
    // polvo flotando en la luz de la ventana
    if (Math.random() < .03) { const [x, y] = G(6.5 + Math.random() * 3, 1.5 + Math.random() * 2); puff(x, y - 10 - Math.random() * 20, 'mote'); }
  },
  after(c, t, st) {
    if (!st.lamp) { c.fillStyle = 'rgba(10,6,25,.28)'; c.fillRect(0, 0, W, H); }
  },
  items: [
    { i: 1, j: 0, a: 4, h: 32, box: [1, .05, 5, .95], block: [[1, 0], [2, 0], [3, 0], [4, 0]], act: { type: 'coffee', at: [2, 1], face: [0, -1], label: 'Make a coffee' }, steam: 0, draw(c, t) {
      cube(c, 1, .05, 0, 4, .9, 17, '#7a4b2a');
      for (let k = 1; k < 8; k++) vline(c, 1 + k * .5, .95, 2, 15, '#5f3820');
      box(c, 1, .05, 17, 4, .9, 2, '#efe6d8', '#cfc2ae', '#bfb19c');
      cube(c, 1.25, .15, 19, .9, .6, 12, '#c8d0d8'); cube(c, 1.25, .15, 31, .9, .6, 2, '#8a96a3');
      const [mx, my] = G(1.7, .75); c.fillStyle = '#1a1222'; c.fillRect(mx - 3, my - 25, 2, 3); c.fillRect(mx + 1, my - 25, 2, 3);
      c.fillStyle = '#ff6b6b'; c.fillRect(mx - 1, my - 29, 1, 1); c.fillStyle = '#1dd1a1'; c.fillRect(mx + 1, my - 29, 1, 1);
      cube(c, 2.6, .3, 19, .3, .3, 4, '#f4f1ea'); cube(c, 3, .3, 19, .3, .3, 4, '#f4f1ea'); cube(c, 2.8, .25, 23, .3, .3, 4, '#f4f1ea');
      cube(c, 3.6, .25, 19, .6, .5, 6, '#3d3d4e'); box(c, 3.65, .3, 25, .5, .3, 3, '#1dd1a1', '#10ac84', '#10ac84');
      box(c, 4.4, .3, 19, .35, .35, 7, 'rgba(200,230,255,.5)', 'rgba(170,210,240,.6)', 'rgba(150,190,220,.6)');
      if (t - this.steam > 1800) { this.steam = t; const [sx, sy] = G(1.5, .3); puff(sx, sy - 33, 'steam', 2); }
    } },
    { i: 9, j: 0, a: 2, h: 42, box: [9, .05, 11, .65], block: [[9, 0], [10, 0]], act: { type: 'book', at: [9, 1], face: [0, -1], label: 'Grab a book' }, draw(c) {
      cube(c, 9, .05, 0, 2, .6, 42, '#6b4a2f');
      box(c, 9.06, .62, 2, 1.88, .02, 38, '#3b2618', '#3b2618', '#3b2618', null);
      const cols = ['#e84a5f', '#2e86de', '#feca57', '#1dd1a1', '#8b5cf6', '#ff9f43', '#f4f1ea', '#10ac84'];
      [3, 15, 27].forEach((z, s) => {
        let i = 9.1;
        while (i < 10.85) {
          const hh = 8 + Math.floor(hash(i * 100, s) * 3), w = hash(s, i * 100) > .8 ? 3 : 2, col = cols[Math.floor(hash(i * 50, z) * 8)];
          for (let k = 0; k < w; k++) vline(c, i + k / 12, .63, z, z + hh, k ? col : ramp(col).l);
          i += (w + (hash(z, i * 30) > .85 ? 2 : 0)) / 12;
        }
        box(c, 9.05, .1, z - 2, 1.9, .55, 2, '#8d6240', '#7a5234', '#5f3e26', null);
      });
    } },
    { i: 0, j: 4, b: 3, h: 20, box: [.05, 4, .95, 7], seats: [[0, 4, 'i', 8], [0, 5, 'i', 8], [0, 6, 'i', 8]], act: { type: 'sit', label: 'Sit on the sofa' }, draw(c, t, st) {
      cube(c, .1, 4, 0, .85, 3, 5, '#a93226');
      cube(c, .05, 4, 5, .32, 3, 13, '#b8382c');
      for (let k = 0; k < 3; k++) {
        const sunk = st.occ.has('0,' + (4 + k)) ? 1 : 0;
        cube(c, .35, 4.06 + k * .96, 5, .6, .9, 3 - sunk, '#d0453a');
      }
      cube(c, .1, 4, 5, .85, .26, 8, '#a93226'); cube(c, .1, 6.74, 5, .85, .26, 8, '#a93226');
      cube(c, .35, 6.3, 8, .25, .4, 6, '#feca57');
    } },
    { i: 0, j: 1, h: 40, box: [.2, 1.2, .8, 1.8], block: true, act: { type: 'lamp', at: [1, 1], face: [-1, 0], label: 'Turn the lamp on/off' }, draw(c, t, st) {
      cube(c, .25, 1.25, 0, .5, .5, 2, '#3d3d4e');
      cube(c, .45, 1.45, 2, .1, .1, 28, '#5a5a6e', null);
      const on = st.lamp, col = on ? '#ffe9a8' : '#b9ab8a';
      box(c, .2, 1.2, 30, .6, .6, 3, ramp(col).l, col, ramp(col).d);
      box(c, .27, 1.27, 33, .46, .46, 3, ramp(col).l, col, ramp(col).d);
      box(c, .33, 1.33, 36, .34, .34, 2, ramp(col).l, col, ramp(col).d);
      if (on) {
        const [x, y] = G(.5, 1.5);
        c.fillStyle = 'rgba(255,230,160,.10)';
        for (let yy = -16; yy <= 16; yy++) for (let xx = -26; xx <= 26; xx++) if ((xx + yy) % 2 === 0 && (xx * xx) / 676 + (yy * yy) / 256 < 1) c.fillRect(x + xx, y - 6 + yy, 1, 1);
      }
    } },
    table(5, 6, '#c98b55', [[4, 6], [5, 5]]), chair(4, 6, 'i'), chair(5, 5, 'j'),
    table(8, 3, '#b07a4c', [[7, 3], [8, 2]]), chair(7, 3, 'i', '#5d6d7e'), chair(8, 2, 'j', '#5d6d7e'),
    table(9, 8, '#c98b55', [[8, 8], [9, 7]]), chair(8, 8, 'i', '#2e86de'), chair(9, 7, 'j', '#2e86de'),
    plant(11, 0, 1), plant(0, 11), plant(11, 5),
    { i: 0, j: 9, b: 2, h: 36, hot: true, act: { type: 'door', at: [0, 9], face: [-1, 0], to: 'beach', label: 'Go to the beach' }, draw() {} },
  ],
};

/* ---------- playa ---------- */
const sandCol = (i, j) => j === 2 ? (hash(i, j) > .5 ? '#d8b878' : '#d2b272') : ['#f0d699', '#ecd093', '#f3dba2'][Math.floor(hash(i, j) * 3)];
const beach = {
  name: 'Bondi Beach', short: 'Playa', spawn: [2, 10], bgCol: '#2a8fc9',
  water: j => j <= 1,
  bg(c) {
    ['#5ec8f2', '#6ccdf3', '#7bd3f5', '#8bd9f6', '#9cdff7', '#aee5f8'].forEach((col, k) => { c.fillStyle = col; c.fillRect(0, k * 8, W, 8); });
    c.fillStyle = '#a7d8ee'; c.fillRect(0, 46, W, 2);
    c.fillStyle = '#2a8fc9'; c.fillRect(0, 48, W, H - 48);
    c.fillStyle = '#3aa3dc'; for (let y = 52; y < H; y += 5) for (let x = (y * 7) % 23; x < W; x += 23) c.fillRect(x, y, 5, 1);
    // cerros lejanos
    c.fillStyle = '#4f9a7a'; for (let x = 0; x < 90; x++) { const h = Math.round(6 + Math.sin(x / 14) * 3 + Math.sin(x / 5) * 1); c.fillRect(x, 48 - h, 1, h); }
  },
  floor(c) {
    box(c, 0, 2, -6, N, N - 2, 6, '#000', '#c9a965', '#b8975a', null);
    for (let i = 0; i < N; i++) for (let j = 2; j < N; j++) {
      tile(c, i, j, sandCol(i, j));
      for (let k = 0; k < 4; k++) {
        const [x, y] = G(i + .15 + hash(i, j, k) * .7, j + .15 + hash(j, i, k + 9) * .7);
        c.fillStyle = k % 2 ? '#e0c07c' : '#fbe8b8'; c.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      if (j > 3 && hash(i, j, 99) < .05) { const [x, y] = G(i + .5, j + .5); c.fillStyle = '#ffb3bd'; c.fillRect(x, y, 2, 1); c.fillStyle = '#f4f1ea'; c.fillRect(x, y - 1, 1, 1); }
    }
  },
  live(c, t, st) {
    // sol, nubes y gaviota
    const pulse = Math.sin(t / 700) > 0 ? 1 : 0;
    blob(c, 262, 22, 12 + pulse, 'rgba(255,240,150,.35)'); blob(c, 262, 22, 9, '#ffd23f'); blob(c, 261, 21, 6, '#fff07a');
    [[60, 18, .004], [140, 10, .006], [215, 30, .005]].forEach(([x0, y, v], k) => {
      const x = ((x0 + t * v) % (W + 60)) - 30;
      blob(c, x, y, 10, '#ffffff', 3); blob(c, x + 7, y - 3, 7, '#ffffff', 3); blob(c, x - 2, y + 2, 9, '#e8f6fc', 1);
    });
    const gp = (t / 16000) % 1, gx = Math.round(-20 + gp * (W + 40)), gy = Math.round(30 + Math.sin(gp * 9) * 6), up = Math.floor(t / 180) % 2;
    c.fillStyle = '#f4f1ea'; c.fillRect(gx - 1, gy, 3, 1);
    c.fillStyle = '#3d3d4e'; if (up) { c.fillRect(gx - 4, gy - 2, 3, 1); c.fillRect(gx + 2, gy - 2, 3, 1); c.fillRect(gx - 2, gy - 1, 1, 1); c.fillRect(gx + 2, gy - 1, 1, 1); } else { c.fillRect(gx - 4, gy + 1, 3, 1); c.fillRect(gx + 2, gy + 1, 3, 1); }
    // agua con olas y espuma
    for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) {
      const w = Math.sin(t / 650 + i * .8 + j * 1.7);
      tile(c, i, j, j === 0 ? (w > .4 ? '#3fb2e6' : '#2f9fd6') : (w > .4 ? '#5cc6ee' : w > -.4 ? '#4ab9ea' : '#3fb2e6'));
      if (Math.sin(t / 300 + i * 2.3 + j * 5) > .93) { const [x, y] = G(i + .5, j + .5); c.fillStyle = '#ffffff'; c.fillRect(x - 1, y, 3, 1); c.fillRect(x, y - 1, 1, 3); }
    }
    const foam = Math.sin(t / 900) * .18;
    for (let i = 0; i < N; i++) {
      isoLine(c, i, 2 + foam, i + 1, 2 + foam, '#f2fbff');
      if ((i + Math.floor(t / 500)) % 3 === 0) isoLine(c, i + .2, 1.85 + foam, i + .7, 1.85 + foam, '#bfe9ff');
    }
    if (foam > .1) for (let i = 0; i < N; i++) { const [x, y] = G(i + .5, 2.1); c.fillStyle = 'rgba(80,170,220,.35)'; c.fillRect(x - 6, y, 12, 2); }
    drawBigWave(c, t);
  },
  items: [
    { i: 9, j: 3, h: 60, box: [9.3, 3.3, 9.7, 3.7], hitBox: [9.2, 3.2, .6, .6, 62], block: true, act: { type: 'coconut', at: [9, 4], face: [0, -1], label: 'Shake the palm tree' }, draw(c, t) {
      const r = this.shake && t - this.shake < 600 ? Math.round(Math.sin((t - this.shake) / 30) * 2) : 0;
      let x0, y0;
      for (let k = 0; k < 9; k++) {
        const bend = Math.round(Math.sin(k / 8 * 1.3) * 7), [x, y] = G(9.5, 3.5);
        const px = x + bend + (k > 5 ? r : 0), py = y - k * 6;
        c.fillStyle = k % 2 ? '#8d6236' : '#a0703f'; c.fillRect(px - 2, py - 6, 5, 6);
        c.fillStyle = '#c08a52'; c.fillRect(px - 2, py - 6, 1, 6); c.fillStyle = '#6b4424'; c.fillRect(px + 2, py - 6, 1, 6); c.fillRect(px - 2, py - 6, 5, 1);
        x0 = px; y0 = py - 6;
      }
      const s = sway(t, 1, 2) + r;
      [[-1, 1], [1, 1], [-1, -1], [1, -1], [0, -1]].forEach(([dx, dy], k) => {
        for (let n = 0; n < 14; n++) {
          const fx = x0 + dx * n * 1.1 + (dy < 0 ? 0 : 0) + s * (n / 14), fy = y0 + (n * n) / 22 * (dy > 0 ? 1.2 : .7) - (dy < 0 ? 4 - n * .3 : 0);
          c.fillStyle = n % 3 ? '#1f8a3e' : '#2fb055'; c.fillRect(Math.round(fx), Math.round(fy), 2, 2);
          c.fillStyle = '#156b2e'; c.fillRect(Math.round(fx), Math.round(fy) + 2, 2, 1);
        }
      });
      blob(c, x0 - 1, y0 + 2, 2, '#6b3e1f'); blob(c, x0 + 3, y0 + 3, 2, '#5a3218');
    } },
    { i: 2, j: 6, h: 36, box: [2.4, 6.4, 2.6, 6.6], block: true, act: { type: 'shade', label: 'Beach umbrella' }, draw(c) {
      cube(c, 2.46, 6.46, 0, .08, .08, 32, '#ecf0f1', null);
      // copa de la sombrilla: una cúpula con gajos rojos y blancos y el borde festoneado
      const [cx, cy] = G(2.5, 6.5), top = cy - 44;
      for (let y = 0; y <= 10; y++) {
        const w = Math.round(22 * Math.sqrt(1 - ((10 - y) / 11) ** 2));
        for (let x = -w; x <= w; x++) {
          const sec = Math.floor((Math.atan2(y + 3, x) / Math.PI) * 8) % 2;
          const lit = x < -w / 3 ? 1 : x > w / 3 ? -1 : 0;
          let col = sec ? '#e84a5f' : '#f4f1ea';
          if (lit > 0) col = sec ? '#ff7383' : '#ffffff'; if (lit < 0 || y > 8) col = sec ? '#b8323f' : '#cfc8bb';
          c.fillStyle = (x === -w || x === w || y === 0) ? (sec ? '#7a1f2d' : '#8a8478') : col;
          c.fillRect(cx + x, top + y, 1, 1);
        }
      }
      for (let x = -21; x <= 21; x += 4) { c.fillStyle = Math.floor((x + 21) / 4) % 2 ? '#e84a5f' : '#f4f1ea'; c.fillRect(cx + x, top + 11, 3, 1); c.fillStyle = '#7a1f2d'; c.fillRect(cx + x + 1, top + 12, 1, 1); }
      c.fillStyle = '#ecf0f1'; c.fillRect(cx, top - 3, 1, 3); c.fillStyle = '#8a8478'; c.fillRect(cx - 1, top - 4, 3, 1);
    } },
    { i: 3, j: 6, b: 2, h: 3, flat: true, seats: [[3, 6, 'i', 1], [3, 7, 'i', 1]], act: { type: 'sit', label: 'Lie on the towel' }, draw(c) {
      box(c, 3.05, 6.05, 0, .9, 1.9, 1, x => Math.floor(x / 3) % 2 ? '#2e86de' : '#f4f1ea', '#1e5f9e', '#2470b8');
    } },
    { i: 1, j: 8, b: 2, h: 3, flat: true, seats: [[1, 8, 'i', 1], [1, 9, 'i', 1]], act: { type: 'sit', label: 'Lie on the towel' }, draw(c) {
      box(c, 1.05, 8.05, 0, .9, 1.9, 1, x => Math.floor(x / 3) % 2 ? '#feca57' : '#e84a5f', '#c99a2e', '#e0b040');
    } },
    { i: 11, j: 7, h: 40, box: [11.2, 7.1, 11.6, 7.9], block: true, act: { type: 'board', at: [10, 7], face: [1, 0], label: 'Grab the surfboard' }, draw(c, t, st) {
      if (st.boardTaken) return;
      const [x, y] = G(11.5, 7.5);
      for (let r = 0; r < 38; r++) { const w = r < 3 ? 1 + r : r > 34 ? 38 - r : 4; c.fillStyle = r === 0 ? '#8a3f0f' : '#ff9f43'; c.fillRect(x - w, y - 38 + r, w * 2, 1); c.fillStyle = '#ffd3a1'; c.fillRect(x - w, y - 38 + r, 1, 1); c.fillStyle = '#c25e14'; c.fillRect(x + w - 1, y - 38 + r, 1, 1); }
      c.fillStyle = '#ffffff'; c.fillRect(x, y - 34, 1, 30);
    } },
    { i: 7, j: 9, h: 20, box: [7.08, 9.08, 7.92, 9.92], block: true, act: { type: 'castle', at: [7, 8], face: [0, 1], label: 'Look at the sandcastle' }, draw(c, t) {
      const sand = '#d9b56a';
      cube(c, 7.08, 9.08, 0, .84, .84, 6, sand);
      [[7.1, 9.1, 9], [7.62, 9.1, 7], [7.1, 9.62, 7], [7.62, 9.62, 9]].forEach(([i, j, h]) => { cube(c, i, j, 6, .28, .28, h, sand); cube(c, i, j, 6 + h, .1, .1, 2, sand, null); cube(c, i + .18, j + .18, 6 + h, .1, .1, 2, sand, null); });
      cube(c, 7.36, 9.36, 6, .28, .28, 12, sand);
      const [x, y] = G(7.5, 9.5), fl = this.wave && t - this.wave < 1500 ? Math.floor(t / 80) % 2 : Math.floor(t / 400) % 2;
      c.fillStyle = '#5a3a22'; c.fillRect(x, y - 30, 1, 8);
      c.fillStyle = '#e84a5f'; c.fillRect(x + 1, y - 30 + fl, 4, 2); c.fillRect(x + 5, y - 29 + fl, 1, 1);
    } },
    { i: 5, j: 3, h: 14, box: [5.1, 3.15, 5.9, 3.85], block: true, act: { type: 'drink', at: [5, 4], face: [0, -1], label: 'Grab a drink from the esky' }, draw(c, t) {
      const open = this.open && t - this.open < 900;
      cube(c, 5.15, 3.2, 0, .7, .6, 8, '#2e86de');
      box(c, 5.15, 3.75, 2, .7, .03, 2, '#f4f1ea', '#f4f1ea', '#f4f1ea', null);
      if (open) box(c, 5.1, 3.15, 8, .8, .1, 7, '#ffffff', '#cfd8dc', '#e0e6e8');
      else box(c, 5.1, 3.15, 8, .8, .7, 3, '#ffffff', '#cfd8dc', '#e0e6e8');
      const [x, y] = G(5.5, 3.5); c.fillStyle = '#3d3d4e'; c.fillRect(x - 3, y - (open ? 18 : 13), 6, 1);
    } },
    chair(6, 6, 'j', '#1dd1a1'), chair(7, 6, 'j', '#feca57'),
    { i: 0, j: 11, h: 26, box: [.1, 11.4, .9, 11.6], block: true, act: { type: 'door', at: [1, 11], face: [-1, 0], to: 'cafe', label: 'Back to the café' }, draw(c) {
      cube(c, .45, 11.45, 0, .1, .1, 24, '#8d6236', null);
      box(c, .1, 11.4, 16, .8, .1, 7, '#c08a52', '#a0703f', '#8d6236');
      const [x, y] = G(.5, 11.45); c.fillStyle = '#3d2614';
      for (const [dx, dy] of [[-6, -19], [-4, -19], [-2, -19], [0, -19], [-5, -20], [-5, -18]]) c.fillRect(x + dx, y + dy, 1, 1);
      c.fillRect(x + 2, y - 20, 1, 3); c.fillRect(x + 4, y - 20, 2, 1); c.fillRect(x + 4, y - 18, 2, 1);
    } },
  ],
};

// La ola grande: cada 20 segundos entra una desde el fondo, crece, rompe en la orilla y se vuelve espuma.
// Depende solo de la hora, así que todos la ven al mismo tiempo.
export function bigWave(now = Date.now()) {
  const T = 20000, D = 6500, ph = now % T;
  if (ph > D) return null;
  const p = ph / D, j = -1.4 + 4.2 * p;
  const h = j < 1.3 ? Math.min(8, (j + 1.4) * 3.2) : Math.max(0, 8 - (j - 1.3) * 7);
  return { p, j, h, breaking: j > 1.3 };
}
function drawBigWave(c, t) {
  const Wv = bigWave(); if (!Wv) return;
  const { j, h, breaking } = Wv, top = Math.round(h);
  // la cara de la ola: de abajo (oscuro) hacia arriba (claro), con la cresta blanca
  isoLine(c, -1, j + .12, N + 1, j + .12, '#2386c0');
  // la espalda de la ola (más clara) y la cara, más gruesas para que se lea bien desde lejos
  for (const dj of [-.22, -.11]) for (let z = 0; z < top; z++) isoLine(c, -1, j + dj, N + 1, j + dj, z > top - 3 ? '#8fd8f6' : '#5cc6ee', z);
  for (let z = 0; z <= top; z++) isoLine(c, -1, j, N + 1, j, z >= top - 1 ? '#ffffff' : z >= top - 3 ? '#bfe9ff' : z > top / 2 ? '#4ab9ea' : '#2f9fd6', z);
  for (let z = 0; z <= top; z++) isoLine(c, -1, j + .06, N + 1, j + .06, z >= top - 1 ? '#e8f8ff' : '#2386c0', z);
  // espuma que salta de la cresta
  for (let k = 0; k < 10; k++) {
    if (Math.random() < .5) continue;
    const [x, y] = G(Math.random() * N, j); c.fillStyle = '#ffffff'; c.fillRect(Math.round(x), Math.round(y - top - 1 - Math.random() * 3), 1, 1);
  }
  // al romper, la espuma corre sobre la arena mojada
  if (breaking) {
    const reach = Math.min(2.9, j + .3);
    for (let i = 0; i < N; i++) for (let q = 0; q < 6; q++) {
      const jj = 1.6 + Math.random() * (reach - 1.6), [x, y] = G(i + Math.random(), jj);
      c.fillStyle = Math.random() < .6 ? '#ffffff' : '#bfe9ff'; c.fillRect(Math.round(x), Math.round(y), 2, 1);
    }
    if (Math.random() < .3) { const [x, y] = G(Math.random() * N, j); puff(x, y - 2, 'splash', 2); }
  }
}

export const ROOMS = { cafe, beach };
for (const R of Object.values(ROOMS)) {
  R.blocked = new Set(); R.seatAt = new Map();
  for (const it of R.items) {
    const tiles = Array.isArray(it.block) ? it.block : it.block ? [[it.i, it.j]] : [];
    tiles.forEach(([i, j]) => R.blocked.add(i + ',' + j));
    (it.seats || []).forEach(([i, j, dir, h]) => R.seatAt.set(i + ',' + j, { dir, h }));
    it.key = it.flat ? -100 : (it.i + (it.a || 1) - 1) + (it.j + (it.b || 1) - 1);
    it.hit = it.hitBox || [it.i, it.j, it.a || 1, it.b || 1, it.h || 14];
    it.box ||= [it.i, it.j, it.i + (it.a || 1), it.j + (it.b || 1)];
  }
  if (R.water) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (R.water(j)) R.blocked.add(i + ',' + j);
}
// para que las mesas sepan dónde están sus sillas
for (const it of cafe.items) if (it.act?.seatsFrom) it.seats2 = it.act.seatsFrom;

/* ---------- bichos: el gato del café y el cangrejo de la playa (todos ven lo mismo: se mueven según la hora) ---------- */
export function cat(t, R, findPath) {
  const C = cat.s ??= { fx: 6, fy: 9, path: [], slot: -1, dir: 1, walk: 0 };
  const slot = Math.floor(Date.now() / 9000);
  if (slot !== C.slot) {
    C.slot = slot;
    const free = []; for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) if (!R.blocked.has(i + ',' + j) && !R.seatAt.has(i + ',' + j)) free.push([i, j]);
    const nap = slot % 4 === 0 ? [5, 7] : free[Math.floor(hash(slot, 3) * free.length)];
    C.path = findPath(R, Math.round(C.fx), Math.round(C.fy), nap[0], nap[1]) || []; C.nap = slot % 4 === 0;
  }
  return C;
}
export function drawCat(c, C, t) {
  const [x, y] = G(C.fx + .5, C.fy + .5), X = Math.round(x), Y = Math.round(y), walking = C.path.length > 0, f = Math.floor(t / 160) % 2;
  const o = '#3d1f0a', b = '#f0a04b', d = '#c97a2b', l = '#ffd29a';
  c.fillStyle = 'rgba(20,10,30,.2)'; c.fillRect(X - 4, Y, 9, 1);
  const px = (dx, dy, col) => { c.fillStyle = col; c.fillRect(X + (C.dir > 0 ? dx : -dx), Y + dy, 1, 1); };
  if (!walking && C.nap) {
    for (let dx = -4; dx <= 4; dx++) for (let dy = -3; dy <= 0; dy++) if (Math.abs(dx) / 5 + Math.abs(dy + 1.5) / 2.2 < 1) px(dx, dy, dy === -3 ? l : (dx + dy) % 3 ? b : d);
    px(4, -3, o); px(3, -4, b); px(5, -4, b);
    if (Math.random() < .01) puff(X + 4, Y - 6, 'zzz');
    return;
  }
  const body = [[-3, -3], [-2, -3], [-1, -3], [0, -3], [1, -3], [-3, -2], [-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2]];
  body.forEach(([dx, dy]) => px(dx, dy, (dx + 7) % 3 ? b : d));
  [[2, -5], [3, -5], [2, -4], [3, -4], [4, -4], [2, -3], [3, -3], [4, -3]].forEach(([dx, dy]) => px(dx, dy, b));
  px(2, -6, b); px(4, -6, b); px(3, -4, o); px(4, -3, '#ff8fa3');
  const lp = walking ? f : 0;
  px(-3, -1, d); px(-3 + lp, 0, o); px(1, -1, d); px(1 - lp, 0, o);
  px(-4, -4, b); px(-5, -5 - (walking ? f : 0), b);
}
export function crab(t) {
  const p = (Math.sin(t / 4200) + 1) / 2;
  return { fx: 2 + p * 8, fy: 2.6 + Math.sin(t / 1300) * .25 };
}
export function drawCrab(c, P, t, scared) {
  const [x, y] = G(P.fx + .5, P.fy + .5), X = Math.round(x), Y = Math.round(y), f = Math.floor(t / (scared ? 60 : 140)) % 2;
  const r = '#e8504a', d = '#b8322e';
  c.fillStyle = 'rgba(20,10,30,.2)'; c.fillRect(X - 3, Y, 7, 1);
  c.fillStyle = r; c.fillRect(X - 2, Y - 3, 5, 2); c.fillStyle = d; c.fillRect(X - 2, Y - 1, 5, 1);
  c.fillStyle = '#1a1222'; c.fillRect(X - 1, Y - 5, 1, 1); c.fillRect(X + 1, Y - 5, 1, 1);
  c.fillStyle = r; c.fillRect(X - 1, Y - 4, 1, 1); c.fillRect(X + 1, Y - 4, 1, 1);
  c.fillRect(X - 4, Y - 4 - f, 2, 2); c.fillRect(X + 3, Y - 4 - (1 - f), 2, 2);
  c.fillStyle = d; for (let k = -2; k <= 2; k += 2) { c.fillRect(X + k - 1, Y + (f ? 0 : -1), 1, 1); }
}
export const sandColor = sandCol;
