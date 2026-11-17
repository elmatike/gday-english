// Colección de mazos guardada en el navegador (IndexedDB). Se usa cuando no hay servidor local,
// por ejemplo en la versión publicada. Es la misma lógica que collection.py, en JavaScript.

const DB = 'gday-browser', ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const BASE_CSS = '.card { font-family: arial; font-size: 22px; text-align: center; color: black; background-color: white; }\n.cloze { font-weight: bold; color: blue; }';
const STOCK = {
  basic: { name: 'Básica', kind: 'normal', fields: ['Frente', 'Reverso'], css: BASE_CSS,
    tmpls: [{ name: 'Tarjeta 1', q: '{{Frente}}', a: '{{FrontSide}}<hr id=answer>{{Reverso}}' }] },
  basicrev: { name: 'Básica (e invertida)', kind: 'normal', fields: ['Frente', 'Reverso'], css: BASE_CSS,
    tmpls: [{ name: 'Tarjeta 1', q: '{{Frente}}', a: '{{FrontSide}}<hr id=answer>{{Reverso}}' },
      { name: 'Tarjeta 2', q: '{{Reverso}}', a: '{{FrontSide}}<hr id=answer>{{Frente}}' }] },
  cloze: { name: 'Huecos (cloze)', kind: 'cloze', fields: ['Texto', 'Extra'], css: BASE_CSS,
    tmpls: [{ name: 'Cloze', q: '{{cloze:Texto}}', a: '{{cloze:Texto}}<br>{{Extra}}' }] },
};

/* ---------- IndexedDB ---------- */
let dbP;
const openDb = () => dbP ??= new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('media'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function tx(store, mode, fn) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode), q = fn(t.objectStore(store));
    t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
export const kvGet = k => tx('kv', 'readonly', s => s.get(k));
export const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));

export async function loadBrowserCol() {
  const col = (await kvGet('collection')) || { decks: {}, models: {}, notes: {}, cards: [] };
  for (const [k, m] of Object.entries(STOCK)) col.models[k] ??= m;
  return col;
}
// cada guardado marca la hora: así la sincronización con Google Drive sabe qué copia es la más nueva
export const saveBrowserCol = (col, keepTime) => { if (!keepTime) col.savedAt = Date.now(); return kvSet('collection', col).then(r => (keepTime || onColSaved?.(), r)); };
let onColSaved = null;
export const watchColSaves = fn => { onColSaved = fn; };

/* ---------- operaciones (iguales a las del servidor) ---------- */
const uid = p => p + Date.now().toString(16) + Math.random().toString(16).slice(2, 6);
const clozeNums = flds => [...new Set(flds.flatMap(f => [...String(f || '').matchAll(/\{\{c(\d+)::/g)].map(m => +m[1])))].sort((a, b) => a - b);
const cardOrds = (m, flds) => m.kind === 'cloze' ? (clozeNums(flds).length ? clozeNums(flds) : [1]).map(n => n - 1) : m.tmpls.map((_, i) => i);

export function applyOp(col, op) {
  for (const [k, m] of Object.entries(STOCK)) col.models[k] ??= m;  // tipos de nota básicos siempre disponibles
  const res = {};
  if (op.op === 'addDeck') {
    const did = uid('d'); col.decks[did] = { name: op.name.trim() || 'Mazo nuevo', src: op.src || 'manual', created: Date.now() / 1000 }; res.did = did;
  } else if (op.op === 'renameDeck') col.decks[op.did].name = op.name.trim();
  else if (op.op === 'deleteDeck') {
    delete col.decks[op.did];
    col.cards = col.cards.filter(c => c[2] !== op.did);
    const alive = new Set(col.cards.map(c => c[0]));
    for (const k of Object.keys(col.notes)) if (!alive.has(k)) delete col.notes[k];
  } else if (op.op === 'addNotes') {
    let did = op.did;
    if (!did) { did = uid('d'); col.decks[did] = { name: op.deckName || 'Mazo nuevo', src: op.src || 'manual', created: Date.now() / 1000 }; }
    const m = col.models[op.mid];
    for (const note of op.notes) {
      const nid = uid('n'), flds = [...note.flds, ...Array(m.fields.length).fill('')].slice(0, m.fields.length);
      col.notes[nid] = { mid: op.mid, flds, tags: note.tags || [] };
      for (const o of cardOrds(m, flds)) col.cards.push([nid, o, did]);
    }
    Object.assign(res, { did, added: op.notes.length });
  } else if (op.op === 'editNote') {
    const n = col.notes[op.nid]; n.flds = op.flds; n.tags = op.tags ?? n.tags;
    const m = col.models[n.mid];
    if (m.kind === 'cloze') {
      const did = col.cards.find(c => c[0] === op.nid)?.[2], want = new Set(cardOrds(m, n.flds));
      const have = new Set(col.cards.filter(c => c[0] === op.nid).map(c => c[1]));
      col.cards = col.cards.filter(c => c[0] !== op.nid || want.has(c[1]));
      for (const o of [...want].filter(o => !have.has(o)).sort()) col.cards.push([op.nid, o, did]);
    }
  } else if (op.op === 'deleteNotes') {
    const gone = new Set(op.nids);
    for (const k of gone) delete col.notes[k];
    col.cards = col.cards.filter(c => !gone.has(c[0]));
  } else if (op.op === 'moveCards') {
    const moving = new Set(op.cards.map(c => c[0] + '|' + c[1]));
    for (const c of col.cards) if (moving.has(c[0] + '|' + c[1])) c[2] = op.did;
  } else throw new Error('Operación desconocida');
  return res;
}

/* ---------- importar archivos de Anki y de texto ---------- */
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.append(s); });
let libsP;
const libs = () => libsP ??= (async () => {
  await Promise.all([loadScript('vendor/fflate.min.js'), loadScript('vendor/fzstd.min.js'), loadScript('vendor/sql-wasm.js')]);
  const SQL = await window.initSqlJs({ locateFile: f => 'vendor/' + f });
  return { unzip: window.fflate.unzipSync, zstd: window.fzstd.decompress, SQL };
})();

const isZstd = b => b && ZSTD_MAGIC.every((x, i) => b[i] === x);
const td = new TextDecoder();
function varint(b, i) { let v = 0, s = 0, x; do { x = b[i++]; v += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80); return [v, i]; }
function pb(b) {  // decodificador mínimo de protobuf: { campo: [valores] }
  const out = {}; let i = 0;
  try {
    while (i < b.length) {
      let key, v; [key, i] = varint(b, i);
      const fn = Math.floor(key / 8), wt = key & 7;
      if (wt === 0) [v, i] = varint(b, i);
      else if (wt === 1) { v = b.subarray(i, i + 8); i += 8; }
      else if (wt === 2) { let len; [len, i] = varint(b, i); v = b.subarray(i, i + len); i += len; }
      else if (wt === 5) { v = b.subarray(i, i + 4); i += 4; }
      else break;
      (out[fn] ??= []).push(v);
    }
  } catch {}
  return out;
}
const pbStr = (p, fn) => p[fn]?.[0] instanceof Uint8Array ? td.decode(p[fn][0]) : '';
const rows = (db, sql) => { const r = db.exec(sql)[0]; return r ? r.values : []; };

function readDb(db) {
  const tables = new Set(rows(db, "select name from sqlite_master where type='table'").map(r => r[0]));
  const models = {}, decks = {};
  if (tables.has('notetypes')) {  // esquema nuevo (Anki 2.1.50+)
    for (const [id, name, cfg] of rows(db, 'select id, name, config from notetypes')) {
      const p = pb(cfg || new Uint8Array());
      models[id] = { name, kind: p[1]?.[0] === 1 ? 'cloze' : 'normal', css: pbStr(p, 3), fields: [], tmpls: [] };
    }
    for (const [ntid, , name] of rows(db, 'select ntid, ord, name from fields order by ntid, ord')) models[ntid]?.fields.push(name);
    for (const [ntid, , name, cfg] of rows(db, 'select ntid, ord, name, config from templates order by ntid, ord')) {
      const p = pb(cfg || new Uint8Array());
      models[ntid]?.tmpls.push({ name, q: pbStr(p, 1), a: pbStr(p, 2) });
    }
    for (const [id, name] of rows(db, 'select id, name from decks')) decks[id] = String(name).replaceAll('\x1f', '::');
  } else {  // esquema viejo: todo en la tabla col como JSON
    const [mJson, dJson] = rows(db, 'select models, decks from col')[0];
    for (const [id, m] of Object.entries(JSON.parse(mJson))) {
      models[id] = { name: m.name, kind: m.type === 1 ? 'cloze' : 'normal', css: m.css || '',
        fields: m.flds.sort((a, b) => a.ord - b.ord).map(f => f.name), tmpls: m.tmpls.sort((a, b) => a.ord - b.ord).map(t => ({ name: t.name, q: t.qfmt, a: t.afmt })) };
    }
    for (const [id, d] of Object.entries(JSON.parse(dJson))) decks[id] = d.name;
  }
  const notes = {};
  for (const [id, mid, flds, tags] of rows(db, 'select id, mid, flds, tags from notes')) notes[id] = { mid: String(mid), flds: String(flds).split('\x1f'), tags: String(tags).split(/\s+/).filter(Boolean) };
  const cards = rows(db, 'select nid, did, odid, ord from cards order by due, id').map(([nid, did, odid, ord]) => [String(nid), ord, String(odid || did)]);
  return { models, decks, notes, cards };
}

async function importApkg(bytes, col) {
  const { unzip, zstd, SQL } = await libs();
  let files;
  try { files = unzip(bytes); } catch { throw new Error('El archivo no parece un mazo de Anki.'); }
  const name = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find(n => files[n]);
  if (!name) throw new Error('El archivo no parece un mazo de Anki.');
  const raw = name.endsWith('b') ? zstd(files[name]) : files[name];
  const db = new SQL.Database(raw);
  let data;
  try { data = readDb(db); } finally { db.close(); }
  // archivos de imagen y audio
  const media = {};
  if (files.media) {
    try { Object.assign(media, JSON.parse(td.decode(files.media))); }
    catch {
      const entries = pb(isZstd(files.media) ? zstd(files.media) : files.media)[1] || [];
      entries.forEach((e, i) => { const p = pb(e); media[p[255] ? String(p[255][0]) : String(i)] = pbStr(p, 1); });
    }
  }
  const imp = uid('i'), rename = {};
  const mediaEntries = Object.entries(media).filter(([zipName, f]) => f && files[zipName]);
  await tx('media', 'readwrite', s => {
    for (const [zipName, fname] of mediaEntries) {
      const safe = `${imp}_${fname.replace(/[^\w.\-]/g, '_')}`, content = isZstd(files[zipName]) ? zstd(files[zipName]) : files[zipName];
      s.put(new Blob([content]), safe); rename[fname] = safe;
    }
  });
  const fix = t => !mediaEntries.length ? t : t
    .replace(/\[sound:([^\]]+)\]/g, (m, f) => `[sound:${rename[f] || f}]`)
    .replace(/(src\s*=\s*)(["']?)([^"'\s>]+)\2/g, (m, a, q, f) => `${a}${q}${rename[f] || f}${q}`);
  const used = new Set(data.cards.map(c => c[2]));
  for (const [mid, m] of Object.entries(data.models)) col.models[`${imp}-${mid}`] = m;
  for (const did of used) col.decks[`${imp}-${did}`] = { name: data.decks[did] || 'Mazo importado', src: 'apkg', created: Date.now() / 1000 };
  for (const [nid, n] of Object.entries(data.notes)) col.notes[`${imp}-${nid}`] = { mid: `${imp}-${n.mid}`, flds: n.flds.map(fix), tags: n.tags };
  for (const [nid, o, did] of data.cards) if (data.notes[nid]) col.cards.push([`${imp}-${nid}`, o, `${imp}-${did}`]);
  return { decks: [...used].map(d => data.decks[d] || 'Mazo importado').sort(), notes: Object.keys(data.notes).length, cards: data.cards.length, media: mediaEntries.length };
}

function importText(text, filename, reverse, col) {
  const meta = {}, body = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^#(\w[\w ]*):(.*)$/);
    if (m && !body.length) meta[m[1].trim().toLowerCase()] = m[2].trim();
    else if (line.trim()) body.push(line);
  }
  const sep = { tab: '\t', semicolon: ';', comma: ',', pipe: '|', space: ' ', colon: ':' }[(meta.separator || '').toLowerCase()]
    || meta.separator || (body[0]?.includes('\t') ? '\t' : body[0]?.includes(';') ? ';' : ',');
  const parseLine = line => {  // CSV con comillas
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"' && !cur) q = true; else if (ch === sep) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); return out.map(x => x.trim());
  };
  let rowsOut = body.map(parseLine).filter(r => r.length >= 2 && (r[0] || r[1])).map(r => {
    const tags = r.length > 2 && meta['tags column'] === '3' ? r[2].split(/\s+/).filter(Boolean) : [];
    return [[r[0], r.length <= 2 || tags.length ? r[1] : r.slice(1).filter(Boolean).join('<br>')], tags];
  });
  if (!rowsOut.length) throw new Error('No encontré tarjetas. Cada línea tiene que tener frente y reverso separados por tabulación, punto y coma o coma.');
  if ((meta.html || 'true').toLowerCase() === 'false' || !rowsOut.some(([fl]) => fl.some(f => f.includes('<'))))
    rowsOut = rowsOut.map(([fl, t]) => [fl.map(f => f.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')), t]);
  const deck = meta.deck || filename.replace(/\.[^.]+$/, ''), mid = reverse ? 'basicrev' : 'basic';
  const res = applyOp(col, { op: 'addNotes', deckName: deck, mid, src: 'csv', notes: rowsOut.map(([flds, tags]) => ({ flds, tags })) });
  return { decks: [deck], notes: res.added, cards: res.added * (reverse ? 2 : 1), media: 0 };
}

export async function importFile(file, reverse, col) {
  const low = file.name.toLowerCase();
  if (/\.(apkg|colpkg)$/.test(low)) return importApkg(new Uint8Array(await file.arrayBuffer()), col);
  if (/\.(csv|txt|tsv)$/.test(low)) return importText(await file.text(), file.name, reverse, col);
  throw new Error('Formato no compatible. Usá .apkg, .colpkg, .csv, .txt o .tsv.');
}
