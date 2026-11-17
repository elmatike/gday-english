// Historial de respuestas de las tarjetas: una fila por respuesta [fecha ms, id de tarjeta, nota 1-4, ms que tardaste].
// Notas: 1 = Difícil (otra vez), 3 = Medio (bien), 4 = Ya la sé. Sirve para ajustar FSRS a cada persona (fsrs.js) y
// para estadísticas. Se guarda en la base de datos del navegador (IndexedDB: en localStorage no entraría con los años)
// y, si iniciaste sesión, en un archivo aparte de tu carpeta privada de Google Drive (cloud.js).
import { kvGet, kvSet } from './browser-col.js';
import { cloudSaved } from './cloud.js';

let rows = [], loaded = false, saveT = 0;
const ready = (async () => { try { rows = (await kvGet('revlog')) || []; } catch { rows = []; } loaded = true; })();
export const revlogReady = () => ready;
export const revlogAll = () => rows;

function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { if (loaded) kvSet('revlog', rows).catch(() => {}); cloudSaved('revlog'); }, 1500);
}
export function revlogAdd(cid, g, ms) {
  const r = [Date.now(), cid, g, Math.round(Math.min(ms || 0, 6e5))];
  rows.push(r); persist();
  return r;
}
// para "Deshacer": borra esa fila
export function revlogRemove(r) {
  const i = rows.lastIndexOf(r);
  if (i >= 0) { rows.splice(i, 1); persist(); }
}
// junta con la copia de otro dispositivo (o de Drive) sin repetir filas; devuelve true si había algo nuevo acá
export async function revlogMerge(other) {
  await ready;
  if (!Array.isArray(other) || !other.length) return false;
  const key = r => r[0] + '|' + r[1], have = new Set(rows.map(key));
  const add = other.filter(r => Array.isArray(r) && r.length >= 3 && !have.has(key(r)));
  if (!add.length) return false;
  rows = [...rows, ...add].sort((a, b) => a[0] - b[0]);
  kvSet('revlog', rows).catch(() => {});
  return true;
}
