// FSRS-6: el algoritmo que calcula cuándo vuelve cada tarjeta (el mismo que usa Anki hoy).
// Cada tarjeta guarda s (estabilidad: días hasta que la recordás con 90% de probabilidad) y d (dificultad, de 1 a 10).
// Los 21 números de W6 son los de fábrica (promedio de muchísimos usuarios de Anki). Con tu historial de respuestas,
// optimize() los ajusta a cómo recordás vos. Este archivo no toca el estado de la app: solo hace cuentas.

export const W6 = [0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
  0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542];
// límites de cada número (los mismos que usa el optimizador de Anki), para que nunca dé algo sin sentido
const BOUNDS = [[0.001, 100], [0.001, 100], [0.001, 100], [0.001, 100], [1, 10], [0.001, 4], [0.001, 4], [0.001, 0.75],
  [0, 4.5], [0, 0.8], [0.001, 3.5], [0.001, 5], [0.001, 0.25], [0.001, 0.9], [0, 4], [0, 1], [1, 6], [0, 2], [0, 2], [0, 0.8], [0.1, 0.8]];
export const RETENTION = 0.9;

export const validW = w => Array.isArray(w) && w.length === 21 && w.every((x, i) => Number.isFinite(x) && x >= BOUNDS[i][0] && x <= BOUNDS[i][1]);
const factor = w => Math.pow(RETENTION, -1 / w[20]) - 1;
// probabilidad de recordar una tarjeta de estabilidad s después de t días
export const recall = (w, t, s) => Math.pow(1 + factor(w) * t / s, -w[20]);
// días hasta que la probabilidad de recordarla baja a RETENTION (con 0.9 da justo s)
export const interval = (w, s) => s / factor(w) * (Math.pow(RETENTION, -1 / w[20]) - 1);
const clampD = d => Math.min(10, Math.max(1, d));
const d0 = (w, g) => w[4] - Math.exp(w[5] * (g - 1)) + 1;

// Nuevo estado {s, d} después de responder g (1 otra vez, 2 difícil, 3 bien, 4 fácil) habiendo pasado `days` días
// (contados por día de estudio: 0 = el mismo día). st = null para la primera respuesta.
export function step(w, st, g, days) {
  if (!st) return { s: Math.max(0.01, w[g - 1]), d: clampD(d0(w, g)) };
  const { s, d } = st;
  let ns;
  if (days < 1) {  // repaso del mismo día (pasos de aprendizaje)
    let inc = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(s, -w[19]);
    if (g >= 3) inc = Math.max(1, inc);
    ns = s * inc;
  } else {
    const r = recall(w, days, s);
    if (g === 1) {
      ns = Math.min(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r)), s / Math.exp(w[17] * w[18]));
    } else {
      ns = s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * (g === 2 ? w[15] : 1) * (g === 4 ? w[16] : 1));
    }
  }
  const nd = clampD(w[7] * d0(w, 4) + (1 - w[7]) * (d + -w[6] * (g - 3) * (10 - d) / 9));
  return { s: Math.min(36500, Math.max(0.01, ns)), d: nd };
}

/* ---------- optimizador ---------- */
// rev: lista de respuestas [fecha ms, id de tarjeta, nota 1-4]. dayOf(ms) da el número de día de estudio.
// Devuelve, por tarjeta, la secuencia de {g, days}: la nota y los días que pasaron desde la respuesta anterior.
export function sequences(rev, dayOf) {
  const by = new Map();
  for (const [t, cid, g] of rev) if (g >= 1 && g <= 4) { if (!by.has(cid)) by.set(cid, []); by.get(cid).push([t, g]); }
  const out = [];
  for (const list of by.values()) {
    list.sort((a, b) => a[0] - b[0]);
    let prev = null;
    out.push(list.map(([t, g]) => { const dn = dayOf(t), days = prev == null ? 0 : dn - prev; prev = dn; return { g, days }; }));
  }
  return out;
}
// cuántas respuestas sirven para medir (las que llegan al menos un día después de la anterior)
export const usable = seqs => seqs.reduce((a, q) => a + q.filter((x, i) => i > 0 && x.days >= 1).length, 0);
// pérdida: qué tan mal predice w si te ibas a acordar (entropía cruzada promedio; más bajo es mejor)
export function loss(w, seqs) {
  let sum = 0, n = 0;
  for (const q of seqs) {
    let st = null;
    for (const { g, days } of q) {
      if (st && days >= 1) {
        const p = Math.min(1 - 1e-4, Math.max(1e-4, recall(w, days, st.s)));
        sum -= g > 1 ? Math.log(p) : Math.log(1 - p); n++;
      }
      st = step(w, st, g, days);
    }
  }
  return n ? sum / n : 0;
}
// Ajusta los 21 números con descenso de gradiente (Adam), en una escala de 0 a 1 por número y sin salirse de los límites.
// Con pocos datos se queda cerca de los de fábrica (la penalización pesa más cuanto menos respuestas hay).
// Es asíncrono: cede el control al navegador entre paso y paso para no trabar la pantalla.
export async function optimize(seqs, w0 = W6, { steps = 120, lr = 0.02, onStep } = {}) {
  const n = usable(seqs);
  const lo = BOUNDS.map(b => b[0]), span = BOUNDS.map(b => b[1] - b[0]);
  const toW = x => x.map((v, i) => lo[i] + Math.min(1, Math.max(0, v)) * span[i]);
  const x0 = w0.map((v, i) => (v - lo[i]) / span[i]);
  const lambda = 100 / Math.max(n, 1);
  const f = x => loss(toW(x), seqs) + lambda * x.reduce((a, v, i) => a + (v - x0[i]) ** 2, 0);
  let x = [...x0];
  const m = Array(21).fill(0), v = Array(21).fill(0), h = 1e-4;
  for (let k = 1; k <= steps; k++) {
    const grad = x.map((_, i) => { const a = [...x], b = [...x]; a[i] += h; b[i] -= h; return (f(a) - f(b)) / (2 * h); });
    x = x.map((xi, i) => {
      m[i] = 0.9 * m[i] + 0.1 * grad[i]; v[i] = 0.999 * v[i] + 0.001 * grad[i] ** 2;
      const mh = m[i] / (1 - 0.9 ** k), vh = v[i] / (1 - 0.999 ** k);
      return Math.min(1, Math.max(0, xi - lr * mh / (Math.sqrt(vh) + 1e-8)));
    });
    onStep?.(k / steps);
    if (k % 2 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const w = toW(x);
  return { w, n, before: loss(w0, seqs), after: loss(w, seqs) };
}
