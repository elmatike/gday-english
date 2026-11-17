// Arte de la sala: el muñequito (skin), los accesorios y las herramientas para dibujar en isométrico.
// Reglas de estilo (pixel-art-sprites): luz desde arriba a la izquierda, contorno de 1 pixel en todo (un tono oscuro
// del color de al lado, no negro puro), paletas cortas y animaciones de pocos cuadros. Nada se suaviza.

/* ---------- colores ---------- */
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
export const shade = (h, f) => hex(rgb(h).map(v => v * f));
const RAMPS = new Map();
// cada color tiene 4 tonos: luz (con un toque cálido), base, sombra (con un toque violeta) y contorno
export function ramp(base) {
  let r = RAMPS.get(base);
  if (!r) RAMPS.set(base, r = { l: mix(base, '#fff4d8', .32), b: base, d: mix(shade(base, .72), '#40285e', .22), o: mix(shade(base, .38), '#1a0f26', .5) });
  return r;
}
export const OUTLINE = '#1a1222';

/* ---------- opciones del skin ---------- */
export const OPT = {
  skin: ['#ffe0c7', '#f2bf98', '#d99a6c', '#b0744a', '#7d4b2e', '#55321f'],
  hair: ['#2a1b14', '#5a3820', '#8f5527', '#c98a3c', '#efd58e', '#e8e4dc', '#c0402e', '#3c5ad6', '#e46aa8', '#2fb36d'],
  eyes: ['#3b2a1e', '#3d6fd8', '#2f9e5b', '#8a5a2b', '#7b4fd6'],
  shirt: ['#e84a5f', '#ff9f43', '#feca57', '#1dd1a1', '#2e86de', '#8b5cf6', '#f368e0', '#f4f1ea', '#3d3d4e', '#10ac84', '#6b8e23', '#d35400'],
  pants: ['#2f3542', '#1e3799', '#6d4c41', '#576574', '#b33939', '#218c74', '#c8a165', '#8e44ad'],
  shoes: ['#2b2233', '#f2f2f2', '#e84a5f', '#2e86de', '#feca57', '#7a4b2a'],
};
export const STYLES = ['Corto', 'Largo', 'Afro', 'Gorra', 'Rodete', 'Colita', 'Puntas', 'Pelado'];
export const TOPS = ['Remera', 'Buzo', 'Musculosa', 'Rayada'];
export const BOTTOMS = ['Pantalón', 'Short', 'Pollera'];
export const LOOK_MAX = { skin: 6, hair: 10, style: 8, eyes: 5, top: 4, shirt: 12, bottom: 3, pants: 8, shoes: 6 };
export const DEF_LOOK = { skin: 1, hair: 1, style: 0, eyes: 0, top: 0, shirt: 5, bottom: 0, pants: 1, shoes: 0 };
export function normLook(l = {}) {
  const o = {};
  for (const k in LOOK_MAX) { const v = +l[k]; o[k] = Number.isInteger(v) && v >= 0 && v < LOOK_MAX[k] ? v : DEF_LOOK[k]; }
  o.acc = l.acc && typeof l.acc === 'object' ? { ...l.acc } : {};
  o.fx = typeof l.fx === 'string' ? l.fx : '';
  o.emote = typeof l.emote === 'string' ? l.emote : '';
  return o;
}

/* ---------- accesorios (los de la tienda) y cosas que se agarran en la sala ---------- */
// rows en la grilla del cuerpo (14 de ancho; fila 0 = arriba de la cabeza, 18 = el piso). back: false = no se ve de espaldas.
// Los de la mano se dibujan pegados a la mano: grip es el pixel que se agarra.
const str = n => Array(n).fill('k');
export const ACC = [
  { id: 'akubra', slot: 'head', name: 'Sombrero australiano', price: 60, dy: -3, c: { a: '#9a6a3a', A: '#6e4824', k: '#3d2614' },
    rows: ['....aaaaaa....', '...aaaaaaaA...', '...kkkkkkkk...', 'aaaaaaaaaaaaA.', '.AAAAAAAAAAAA.'] },
  { id: 'beanie', slot: 'head', name: 'Gorro de lana', price: 30, dy: -3, c: { w: '#ffffff', r: '#e84a5f', R: '#b83246' },
    rows: ['.....ww.......', '...rrrrrrR....', '..rrrrrrrrRR..', '..RRRRRRRRRR..'] },
  { id: 'party', slot: 'head', name: 'Gorrito de fiesta', price: 40, dy: -7, c: { p: '#8b5cf6', y: '#feca57' },
    rows: ['.....yy.......', '.....pp.......', '....pyp.......', '....pppp......', '...pyppyp.....', '...pppppp.....'] },
  { id: 'flowers', slot: 'head', name: 'Corona de flores', price: 35, dy: 0, c: { g: '#1dd1a1', f: '#f368e0', y: '#feca57' },
    rows: ['..gfgygfgyfg..'] },
  { id: 'phones', slot: 'head', name: 'Auriculares', price: 80, dy: -1, c: { k: '#3d3d4e', r: '#e84a5f' },
    rows: ['...kkkkkkk....', '..k.......k...', '..........k...', '..........rr..', '..........rrr.', '..........rrr.', '..........rr..'] },
  { id: 'crown', slot: 'head', name: 'Corona', price: 250, dy: -4, c: { y: '#ffd23f', Y: '#d9a400', r: '#e84a5f' },
    rows: ['...y..yy..y...', '...yryyyyrY...', '...yyyyyyyY...'] },
  { id: 'glasses', slot: 'face', name: 'Anteojos', price: 25, dy: 3, back: false, c: { k: '#3d3d4e' },
    rows: ['...kkkkkk.....', '...k.kk.k.....', '...k.kk.k.....', '...kkkkkk.....'] },
  { id: 'shades', slot: 'face', name: 'Anteojos de sol', price: 45, dy: 4, back: false, c: { k: '#14101c', w: '#7fd0ff' },
    rows: ['..kkkkkkkk....', '...kwkkwk.....'] },
  { id: 'stache', slot: 'face', name: 'Bigote', price: 20, dy: 6, back: false, rows: ['...hhhhh......', '...h...h......'] },
  { id: 'scarf', slot: 'body', name: 'Bufanda', price: 45, dy: 9, c: { r: '#e84a5f', R: '#b83246' },
    rows: ['...rrrrrrR....', '...RRRRRRRR...', '........rr....', '........rR....', '........RR....'] },
  { id: 'chain', slot: 'body', name: 'Cadena de oro', price: 70, dy: 10, back: false, c: { y: '#ffd23f' },
    rows: ['....y....y....', '.....y..y.....', '......yy......'] },
  { id: 'backpack', slot: 'body', name: 'Mochila', price: 55, dy: 10, c: { b: '#1dd1a1', B: '#10ac84' },
    rows: ['....b....b....', '....b....b....', '....b....b....'],
    backRows: ['...bbbbbbbB...', '...bBBBBBBB...', '...bbbbbbbB...', '...bbbbbbbB...', '...BBBBBBBB...'] },
  { id: 'coffee', slot: 'hand', name: 'Café para llevar', price: 15, grip: [1, 2], c: { k: '#3d2614', w: '#f4f1ea', b: '#a8693a' },
    rows: ['kk', 'ww', 'bb', 'ww'] },
  { id: 'boomerang', slot: 'hand', name: 'Bumerán', price: 35, grip: [1, 1], c: { b: '#c98b55', B: '#8d5a3b' },
    rows: ['b...', 'bb..', '.bB.', '..BB'] },
  { id: 'balloon', slot: 'hand', name: 'Globo', price: 50, grip: [2, 19], c: { r: '#e84a5f', w: '#ffb3bd', k: '#5a4a5a' },
    rows: ['.rr.', 'rwrr', 'rrrr', 'rrrr', '.rr.', '..k.', ...str(14).map(() => '..k.')] },
];
// lo que agarrás tocando cosas en la sala (se ve en tu mano un rato)
export const HELD = {
  coffee: ACC.find(a => a.id === 'coffee'),
  drink: { grip: [0, 2], c: { g: '#2fb36d', G: '#1e7d4a', s: '#d6dde3' }, rows: ['ss', 'gg', 'gG', 'gG'] },
  board: { grip: [1, 9], c: { o: '#ff9f43', O: '#e17f1f', w: '#ffffff' }, rows: ['.o.', 'ooO', 'ooO', 'owO', 'ooO', 'ooO', 'owO', 'ooO', 'ooO', 'ooO', 'ooO', 'owO', 'ooO', '.O.'] },
  book: { c: { r: '#c0392b', R: '#922b21', w: '#f4f1ea' }, rows: ['rrrrr', 'rwwwR', 'rwwwR', 'RRRRR'] },
};
export const SLOTS = [['head', 'Cabeza'], ['face', 'Cara'], ['body', 'Cuerpo'], ['hand', 'En la mano']];
export const ACC_BY = Object.fromEntries(ACC.map(a => [a.id, a]));

/* ---------- el muñequito ---------- */
// Se arma pixel por pixel en una grilla y al final se le agrega el contorno solo (sel-out): cada pixel vacío que toca
// uno pintado toma el tono de contorno de ese color. Así todo tiene el mismo grosor de línea.
const LAP = ['..qaaaaAAAAA..', '.qaasssSSSAAA.', '.aassxffbSSAA.'];
const LAP_BACK = ['..qaaaaAAAAA..', '.qa.......AA..'];
const SW = 24, SH = 36, AX = 5, AY = 12;  // la casilla (0,0) del cuerpo cae en (AX, AY) del lienzo; el piso es la fila 18
const HEAD = ['....ssssss....', '...zsssssss...', '..zzssssssss..', '..zssssssssS..', '..zssssssssSS.',
  '..zssssssssSS.', '..zssssssssS..', '...sssssssS...', '....sssSSS....'];
const HAIR = [
  { dy: -1, rows: ['....yyhhhh....', '...yhhhhhhhh..', '..yhhhhhhhhHH.', '..hhhhhhhhhHH.', '..hh.h..hhHHH.', '..h.......HH..', '..........H...'] },
  { dy: -1, rows: ['....yyhhhh....', '...yhhhhhhhh..', '..yhhhhhhhhHH.', '..hhhhhhhhhHH.', '..hh.h..hhHHH.', '..h.......HHH.', '..h.......HHH.', '..h.......HHH.'],
    back: { dy: 2, rows: ['.hhhhhhhhhHHH.', '.hhhhhhhhhHHH.', '.hhhhhhhhhHHH.', '.hhhhhhhhhHHH.', '.hhhhhhhhhHHH.', '.hhhhhhhhHHHH.', '.hhhhhhhHHHH..', '.hhhhhhHHHHH..', '..hhhhhHHHH...', '...hhhhHHH....'] } },
  { dy: -3, rows: ['....yhhhhh....', '..yyhhhhhhhh..', '.yhhhhhhhhhhH.', '.hhhhhhhhhhhHH', '.hhhhhhhhhhhHH', '.hhhhhhhhhhHHH', '.hhh.hh.hhhHHH', '.hh.......HHHH', '.hh.......HHH.', '..h.......HH..'] },
  { dy: -2, cap: true, rows: ['....tttttt....', '...ltttttttT..', '..lttttttttTT.', 'TTTTTttttTTT..', '..hh......HH..', '..h.......HH..'] },
  { dy: -4, rows: ['.....yhhh.....', '....yhhhhH....', '.....HHHH.....', '....yyhhhh....', '...yhhhhhhhh..', '..yhhhhhhhhHH.', '..hhhhhhhhhHH.', '..hh.h..hhHHH.', '..h.......HH..'] },
  { dy: -1, rows: ['....yyhhhh....', '...yhhhhhhhh..', '..yhhhhhhhhHH.', '..hhhhhhhhhHH.', '..hh.h..hhHHH.', '..h.......HH..', '..........H...'],
    back: { dy: 2, rows: ['...........hH.', '...........hHH', '............HH', '............HH', '...........HH.', '...........H..'] } },
  { dy: -3, rows: ['...y.h.h.h....', '..yhhhhhhhh...', '..hhhhhhhhhH..', '.yhhhhhhhhhHH.', '..hhhhhhhhhHH.', '..hhh.hh.hhHH.', '..h.......HH..'] },
  { dy: 0, rows: ['....zz........'] },
];
const TORSO = [
  ['....lttttT....', '....lttttT....', '....lttttT....', '....ltttTT....'],
  ['...llttttTT...', '....lttttT....', '....lTTTTT....', '....ltttTT....'],
  ['....z.tt.S....', '....lttttT....', '....lttttT....', '....ltttTT....'],
  ['....lttttT....', '....wwwwwW....', '....lttttT....', '....wwwwWW....'],
];

function newBuf() { return { c: new Array(SW * SH).fill(null), o: new Array(SW * SH).fill(null) }; }
function put(B, x, y, p) {
  if (!p) return;
  x = Math.round(x) + AX; y = Math.round(y) + AY;
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  B.c[y * SW + x] = p[0]; B.o[y * SW + x] = p[1];
}
function stamp(B, rows, dx, dy, M) {
  rows.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') put(B, dx + i, dy + r, M[row[i]]); });
}
const mat = (base, ch) => { const r = ramp(base); return { [ch[0]]: [r.l, r.o], [ch[1]]: [r.b, r.o], [ch[2]]: [r.d, r.o] }; };
const accMap = (a, M) => {
  const m = { h: M.h };
  for (const [k, v] of Object.entries(a.c || {})) m[k] = [v, ramp(v).o];
  return m;
};

function finish(B) {
  const img = new ImageData(SW, SH), d = img.data;
  let top = SH;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    let col = B.c[i];
    if (!col) {
      // contorno: el tono de contorno del vecino pintado (abajo y a la derecha primero: así queda más grueso del lado de la sombra)
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < SW && ny < SH && B.c[ny * SW + nx]) { col = B.o[ny * SW + nx]; break; }
      }
    }
    if (!col) continue;
    const [r, g, b] = rgb(col);
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
    top = Math.min(top, y);
  }
  const cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
  cv.getContext('2d').putImageData(img, 0, 0);
  cv.top = top;
  return cv;
}

// pose: stand | walk | sit | dance | wave · frame: cuadro de la animación
function build(look, o) {
  const B = newBuf(), back = o.back, L = look;
  const M = {
    ...mat(OPT.skin[L.skin], 'zsS'), ...mat(OPT.hair[L.hair], 'yhH'), ...mat(OPT.shirt[L.shirt], 'ltT'),
    ...mat(OPT.pants[L.pants], 'qpP'), ...mat(OPT.shoes[L.shoes], 'xbB'), ...mat('#f4f1ea', 'vwW'),
    E: [OPT.eyes[L.eyes], OUTLINE], e: [mix(OPT.eyes[L.eyes], '#120a1a', .55), OUTLINE],
    m: [mix(ramp(OPT.skin[L.skin]).d, '#8a2a3a', .45), OUTLINE], M: ['#4a1a2a', OUTLINE], r: [mix(OPT.skin[L.skin], '#ff7a8a', .35), OUTLINE],
  };
  // --- pose: cuánto sube el cuerpo, dónde caen los pies y los brazos
  let off = 0, headDy = 0, nearX = 5, farX = 9, nearLift = 0, farLift = 0, armN = [0, 0], armF = [0, 0], up = '', seat = null;
  const f = o.frame | 0;
  if (o.pose === 'walk') {
    // 4 cuadros: contacto, paso, contacto, paso (en los "paso" el cuerpo sube 1 pixel)
    [nearX, farX, nearLift, farLift, off, armN, armF] = [
      [3, 10, 0, 0, 0, [1, 0], [-1, 0]], [5, 8, 0, 1, -1, [0, 0], [0, 0]],
      [8, 5, 0, 0, 0, [-1, 0], [1, 0]], [6, 9, 1, 0, -1, [0, 0], [0, 0]]][f % 4];
  } else if (o.pose === 'sit') {
    // sentado: el cuerpo no cambia de tamaño; baja 3 filas (la cola queda en el piso del dibujo) y al dibujarlo se sube a la altura del asiento
    seat = o.seatH ?? 9; off = 3; headDy = f % 4 === 2 ? 1 : 0;  // también respira sentado
  } else if (o.pose === 'surf') {
    // parado en la tabla: piernas abiertas, rodillas flojas y un brazo afuera para el equilibrio (se mece un poco)
    nearX = 3; farX = 11; off = f % 2 ? 1 : 0; up = 'near'; armN = [f % 2 ? -1 : 0, 0];
  } else if (o.pose === 'dance') {
    off = f % 2 ? -1 : 0; up = f % 2 ? 'near' : 'far'; if (f % 2) { nearX = 3; farLift = 1; } else { farX = 11; nearLift = 1; }
  } else {
    headDy = f % 4 === 2 ? 1 : 0;  // respiración: la cabeza baja 1 pixel un rato
    if (o.pose === 'wave') { up = 'near'; armN = [f % 2 ? -1 : 0, 0]; }
  }
  const fx = L.fx, reading = fx === 'book' && o.pose !== 'walk', sipping = (fx === 'coffee' || fx === 'drink') && o.pose !== 'walk' && o.sip;
  const hy = off + headDy;  // dónde va la cabeza
  const hair = HAIR[L.style] || HAIR[0];

  const head = () => {
    stamp(B, HEAD, 0, hy, M);
    if (back) {
      if (L.style !== 7) HEAD.forEach((row, r) => { if (r < 8) for (let i = 0; i < row.length; i++) if (row[i] !== '.') put(B, i, hy + r, M[{ s: 'h', z: 'y', S: 'H' }[row[i]]]); });
    } else {
      if (o.blink) { put(B, 4, hy + 5, M.e); put(B, 7, hy + 5, M.e); }
      else { put(B, 4, hy + 4, M.E); put(B, 7, hy + 4, M.E); put(B, 4, hy + 5, M.e); put(B, 7, hy + 5, M.e); }
      put(B, 3, hy + 6, M.r); put(B, 8, hy + 6, M.r);
      if (o.talk) { put(B, 5, hy + 7, M.M); put(B, 6, hy + 7, M.M); } else put(B, 5, hy + 7, M.m);
    }
    stamp(B, hair.rows, 0, hy + hair.dy, hair.cap ? { ...M, ...mat(OPT.shirt[L.shirt], 'ltT') } : M);
  };
  const neck = () => { put(B, 6, off + 9, M.s); put(B, 7, off + 9, M.S); };
  const torso = () => {
    if (L.top === 1) stamp(B, ['....lttttT....'], 0, off + 9, M);  // capucha
    stamp(B, TORSO[L.top] || TORSO[0], 0, off + 10, M);
    if (L.top === 1 && !back) { put(B, 5, off + 11, M.w); put(B, 7, off + 11, M.w); }
    stamp(B, ['....qppPPP....'], 0, off + 14, M);
  };
  const sleeve = r => L.top === 2 ? false : L.top === 1 ? r < 3 : r < 2;
  const arm = (near) => {
    const [dx, dy] = near ? armN : armF;
    if (up === (near ? 'near' : 'far')) {
      // brazo levantado (saludar, bailar)
      const x = near ? 1 + dx : 11;
      for (let r = 0; r < 4; r++) { const ch = r < 2 ? (near ? 'z' : 'S') : (sleeve(3 - r) ? (near ? 'l' : 'T') : (near ? 's' : 'S')); put(B, x, off + 6 + r, M[ch]); if (near) put(B, x + 1, off + 6 + r, M[ch === 'z' ? 's' : ch === 'l' ? 't' : ch]); }
      return near ? [x, off + 6] : null;
    }
    if (near && (reading || sipping)) {
      // brazo doblado: hacia la boca (tomar) o adelante (leer)
      put(B, 3, off + 10, M[sleeve(0) ? 'l' : 'z']); put(B, 3, off + 11, M[sleeve(1) ? 'l' : 'z']);
      if (sipping) { put(B, 4, off + 9, M.s); put(B, 3, off + 9, M.z); return [3, off + 8]; }
      put(B, 3, off + 12, M.z); put(B, 4, off + 12, M.s); return [3, off + 12];
    }
    if (near) {
      for (let r = 0; r < 4; r++) { const sl = sleeve(r); put(B, 2 + dx, off + 10 + r + dy, M[sl ? 'l' : 'z']); put(B, 3 + dx, off + 10 + r + dy, M[sl ? 't' : 's']); }
      return [2 + dx, off + 13 + dy];
    }
    for (let r = 0; r < 4; r++) put(B, 10 + dx, off + 10 + r + dy, M[sleeve(r) ? 'T' : 'S']);
    return null;
  };
  const legs = () => {
    const hip = 15 + off;
    stamp(B, ['....qppPPP....'], 0, hip, M);
    if (seat != null) {
      // sentado: muslos hacia adelante y pantorrillas hasta el piso
      const pc = r => (L.bottom === 0 || (L.bottom === 1 && r === 0)) ? ['p', 'P'] : ['z', 'S'];
      const [a, b] = pc(0);
      if (seat <= 2) {
        // en el piso o en la toalla: de espaldas solo asoman las rodillas a los costados (de frente se dibuja después del torso)
        if (back) stamp(B, LAP_BACK, 0, hip - 1, lapMap());
      } else {
        // en una silla: muslos hacia adelante, rodillas dobladas y pantorrillas colgando (2 a 4 pixeles según la altura)
        const shin = Math.max(2, Math.min(4, seat - 5));
        for (let x = 1; x <= 4; x++) put(B, x, hip, M[a === 'p' ? (x < 3 ? 'q' : 'p') : 'z']);
        for (let x = 5; x <= 8; x++) put(B, x, hip - 1, M[b]);
        for (let r = 1; r <= shin; r++) {
          const [c1, c2] = pc(r);
          put(B, 1, hip + r, M[c1]); put(B, 2, hip + r, M[c1]);
          put(B, 4, hip + r - 1, M[c2]); put(B, 5, hip + r - 1, M[c2]);
        }
        put(B, 0, hip + shin + 1, M.x); put(B, 1, hip + shin + 1, M.b); put(B, 2, hip + shin + 1, M.b);
        put(B, 3, hip + shin, M.B); put(B, 4, hip + shin, M.B); put(B, 5, hip + shin, M.B);
      }
      return;
    }
    const leg = (hx, fx2, lift, light) => {
      const foot = 18 - lift;
      for (let r = hip + 1; r < foot; r++) {
        const t = (r - hip) / (foot - hip), x = Math.round(hx + (fx2 - hx) * t);
        const pants = L.bottom === 0 || (L.bottom === 1 && r <= hip + 1);
        const ch = pants ? (light ? 'p' : 'P') : (light ? 's' : 'S');
        put(B, x - 1, r, M[pants && light ? 'q' : ch]); put(B, x, r, M[ch]);
      }
      const fx3 = Math.round(fx2);
      put(B, fx3 - 2, foot, M[light ? 'x' : 'B']); put(B, fx3 - 1, foot, M[light ? 'b' : 'B']); put(B, fx3, foot, M[light ? 'b' : 'B']);
    };
    leg(9, farX, farLift, false);
    leg(5, nearX, nearLift, true);
    if (L.bottom === 2) stamp(B, ['...qpppPPPP...', '..qppppPPPPP..'], 0, hip, M);
  };
  // sentado en el piso con las piernas cruzadas: muslos hacia los costados, rodillas afuera, pies cruzados en el medio
  const lapMap = () => {
    const shin = L.bottom === 0 ? ['p', 'P'] : ['s', 'S'];
    return { q: M.q, a: M.p, A: M.P, s: M[shin[0]], S: M[shin[1]], x: M.x, f: M.b, b: M.B };
  };
  const lap = () => stamp(B, LAP, 0, 17, lapMap());
  const accs = (slots) => {
    for (const slot of slots) {
      const a = ACC_BY[L.acc?.[slot]];
      if (!a || slot === 'hand' || (back && a.back === false)) continue;
      const rows = back && a.backRows ? a.backRows : a.rows;
      stamp(B, rows, 0, (slot === 'body' ? off : hy) + a.dy, accMap(a, M));
    }
  };
  const held = (hand) => {
    if (!hand || o.pose === 'surf') return;  // surfeando, la tabla está debajo de los pies
    const it = (fx && fx !== 'book' && HELD[fx]) || ACC_BY[L.acc?.hand];
    if (!it || !it.grip) return;
    stamp(B, it.rows, hand[0] - it.grip[0], hand[1] - it.grip[1], accMap(it, M));
  };

  if (back) {
    held(arm(true)); arm(false);
    legs(); torso(); accs(['body']); neck(); head(); if (hair.back) stamp(B, hair.back.rows, 0, hy + hair.back.dy, M); accs(['head']);
  } else {
    if (hair.back) stamp(B, hair.back.rows, 0, hy + hair.back.dy, M);
    arm(false); legs(); torso(); if (seat != null && seat <= 2) lap(); accs(['body']); neck(); head(); accs(['face', 'head']);
    const hand = arm(true); held(hand);
    if (reading) stamp(B, HELD.book.rows, 2, off + 9, accMap(HELD.book, M));
  }
  return finish(B);
}

const CACHE = new Map();
export function sprite(look, o) {
  const key = [look.skin, look.hair, look.style, look.eyes, look.top, look.shirt, look.bottom, look.pants, look.shoes,
    look.acc?.head, look.acc?.face, look.acc?.body, look.acc?.hand, look.fx, o.back ? 1 : 0, o.pose, o.frame | 0, o.seatH, o.blink ? 1 : 0, o.talk ? 1 : 0, o.sip ? 1 : 0].join('|');
  let cv = CACHE.get(key);
  if (!cv) { if (CACHE.size > 600) CACHE.clear(); CACHE.set(key, cv = build(look, o)); }
  return cv;
}
// dibuja el muñequito con los pies en (x, y). Devuelve la caja que ocupa (para tocarlo y poner el nombre arriba)
export function drawAvatar(ctx, look, x, y, o = {}) {
  const cv = sprite(look, o), X = Math.round(x), sit = o.pose === 'sit', lift = sit ? (o.seatH ?? 9) : 0, Y = Math.round(y);
  if (!sit || lift <= 2) {
    ctx.fillStyle = 'rgba(20,10,30,.22)';
    ctx.fillRect(X - 5, Y - 1, 10, 1); ctx.fillRect(X - 6, Y, 12, 1); ctx.fillRect(X - 4, Y + 1, 8, 1);
  }
  const by = Y - lift - (AY + 18), bx = o.right ? X - (SW - AX - 7) : X - (AX + 7);
  if (o.right) { ctx.save(); ctx.translate(bx + SW, by); ctx.scale(-1, 1); ctx.drawImage(cv, 0, 0); ctx.restore(); }
  else ctx.drawImage(cv, bx, by);
  return { cx: X, x: X - 7, y: by + cv.top, w: 14, h: Y - (by + cv.top) };
}

/* ---------- dibujo isométrico ---------- */
export const N = 12, W = 320, H = 224, OX = 160, OY = 72, WALL = 56;
export const G = (i, j) => [OX + (i - j) * 12, OY + (i + j) * 6];

// una caja: base en (i, j), mide a x b baldosas y h pixeles de alto, empieza z pixeles arriba del piso.
// Los colores pueden ser funciones de x (para rayas). edge 'auto' = contorno de un tono oscuro del mismo color.
export function box(ctx, i, j, z, a, b, h, top, left, right, edge = 'auto') {
  const [Ax, Ay] = G(i, j), [Bx] = G(i + a, j), [Cx, Cy] = G(i + a, j + b), [Dx] = G(i, j + b), zt = z + h;
  const x1 = Math.round(Dx), x2 = Math.round(Bx), xc = Math.round(Cx);
  const col = (f, x) => typeof f === 'function' ? f(x) : f;
  for (let x = x1; x < x2; x++) {
    const fx = x + .5;
    const up = fx < Ax ? Ay + (Ax - fx) / 2 : Ay + (fx - Ax) / 2;
    const lo = fx < Cx ? Cy - (Cx - fx) / 2 : Cy - (fx - Cx) / 2;
    const yt = Math.round(up - zt), ym = Math.round(lo - zt), yb = Math.round(lo - z);
    const side = fx < Cx ? left : right;
    if (ym > yt) { ctx.fillStyle = col(top, x); ctx.fillRect(x, yt, 1, ym - yt); }
    if (yb > ym) { ctx.fillStyle = col(side, x); ctx.fillRect(x, ym, 1, yb - ym); }
    if (edge) {
      const e = edge === 'auto';
      ctx.fillStyle = e ? ramp(col(top, x)).o : edge; ctx.fillRect(x, yt, 1, 1);
      ctx.fillStyle = e ? ramp(col(side, x)).o : edge; ctx.fillRect(x, yb - 1, 1, 1);
      if (x === x1 || x === x2 - 1) ctx.fillRect(x, yt, 1, yb - yt);
      else if (x === xc && h > 3) { ctx.fillStyle = e ? ramp(col(right, x)).d : edge; ctx.fillRect(x, ym, 1, yb - ym); }
    }
  }
}
// caja con luz desde arriba a la izquierda: arriba claro, cara izquierda en su color, cara derecha en sombra
export const cube = (ctx, i, j, z, a, b, h, c, edge) => box(ctx, i, j, z, a, b, h, ramp(c).l, c, ramp(c).d, edge);

export function blob(ctx, cx, cy, r, col, ry = r) {
  ctx.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(r * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)));
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 || 1, 1);
  }
}
// baldosa (rombo de 24 x 12), opcionalmente con el borde de arriba a la izquierda más claro
export function tile(ctx, i, j, col, light) {
  const [x0, y0] = G(i, j);
  for (let r = 0; r < 12; r++) {
    const half = r < 6 ? (r + 1) * 2 : (12 - r) * 2;
    ctx.fillStyle = col; ctx.fillRect(x0 - half, y0 + r, half * 2, 1);
    if (light && r < 6) { ctx.fillStyle = light; ctx.fillRect(x0 - half, y0 + r, 2, 1); }
  }
}
// línea isométrica (2 pixeles al costado por cada 1 hacia abajo) entre dos puntos del piso
export function isoLine(ctx, i0, j0, i1, j1, col, z = 0) {
  const [x0, y0] = G(i0, j0), [x1, y1] = G(i1, j1), n = Math.round(Math.abs(x1 - x0));
  ctx.fillStyle = col;
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(x0 + (x1 - x0) * k / (n || 1)), Math.round(y0 + (y1 - y0) * k / (n || 1) - z), 1, 1);
}
// línea vertical parada en un punto del piso, de z0 a z1 pixeles de alto
export function vline(ctx, i, j, z0, z1, col) {
  const [x, y] = G(i, j);
  ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y - z1), 1, Math.round(z1 - z0));
}
export const hash = (a, b = 0, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
