// Prácticas extra: situaciones, sonidos, dictado, diario hablado, estadísticas y recordatorio.
import { DECK, SHADOW } from './data.js';
import { SCENES, SOUNDS, JOURNAL } from './practice-data.js';
import { S, save, log, toast, esc, say, hush, listen, capture, micMsg, canHear, compare, words, SR, addCustom, render, dayKey, streak, planFor, pickFresh, markSeen } from './app.js';

const $ = s => document.querySelector(s);
const LV = ['Básico', 'Intermedio', 'Avanzado'];
const bump = k => { const L = log(); L[k] = (L[k] || 0) + 1; };
let P = {};

/* ---------- grabación y audios guardados ---------- */
const idb = (mode, fn) => new Promise((res, rej) => {
  const r = indexedDB.open('gday', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('audio');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const tx = r.result.transaction('audio', mode), q = fn(tx.objectStore('audio'));
    tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error);
  };
});
// Los audios del diario se guardan en el navegador y, si el servidor está, también en data/audio.
const putAudio = async (k, b) => {
  await idb('readwrite', s => s.put(b, k)).catch(() => {});
  await fetch('/api/audio/' + k, { method: 'PUT', body: b }).catch(() => {});
};
const getAudio = async k => {
  const local = await idb('readonly', s => s.get(k)).catch(() => null);
  if (local) return local;
  const r = await fetch('/api/audio/' + k).catch(() => null);
  return r?.ok ? r.blob() : null;
};
const delAudio = async k => {
  await idb('readwrite', s => s.delete(k)).catch(() => {});
  await fetch('/api/audio/' + k, { method: 'DELETE' }).catch(() => {});
};
const playBlob = b => { if (b) new Audio(URL.createObjectURL(b)).play(); else toast('No hay audio guardado para esta entrada'); };

// Escucha una respuesta hablada y muestra el texto en vivo en #live.
function hear(onDone, once = true) {
  if (!canHear()) { toast('Tu navegador no reconoce voz. Usá Chrome o escribí la respuesta.'); return null; }
  const token = P.token = Math.random();
  const l = P.l = listen(t => { const el = $('#live'); if (el) el.textContent = t; }, once);
  l.promise.then(res => { if (P.token === token) { P.l = null; onDone(res); } });
  return l;
}

/* ---------- menú Practicar ---------- */
function practiceView() {
  const errs = SHADOW.filter(p => S.shadow[p.id]?.n && S.shadow[p.id].best < 0.85).length;
  const tile = (href, t, d) => `<a href="#${href}" class="tile"><b>${t}</b><span>${d}</span></a>`;
  return `<header class="top"><h2>Practicar</h2><span class="muted">${LV[S.settings.level - 1]}</span></header>
    <div class="tiles">
      ${tile('roleplay', 'Situaciones', 'Diálogos de la vida real: café, médico, alquiler, entrevista')}
      ${tile('shadow', 'Shadowing', 'Escuchá una frase y repetila igual')}
      ${tile('speak', 'Consignas', 'Hablá 30 a 90 segundos sobre un tema')}
      ${tile('sounds', 'Sonidos difíciles', 'Entrená el oído y la boca con pares como ship / sheep')}
      ${tile('dictation', 'Dictado', 'Escuchá y escribí, ideal para el acento australiano')}
      ${tile('journal', 'Diario hablado', `Un minuto por día · ${S.journal.length} grabaciones`)}
      ${tile('review', 'Repaso de errores', errs ? `${errs} frases para repasar` : 'Las frases que te costaron aparecen acá')}
    </div>`;
}

/* ---------- situaciones ---------- */
const sceneStep = () => P.scene?.steps[P.i];
function advance() {
  while (sceneStep()?.[0] === 'them') {
    const t = sceneStep()[1];
    P.chat.push({ who: 'them', text: t }); P.i++;
    say(t);
  }
  if (!sceneStep()) finishScene();
}
function finishScene() {
  P.done = true;
  const turns = P.scene.steps.filter(s => s[0] === 'you').length, score = Math.round(P.ok / turns * 100);
  const r = (S.roles[P.scene.id] ??= { best: 0, n: 0 });
  r.n++; r.best = Math.max(r.best, score); P.score = score;
  P.added = P.missed.filter(st => addCustom(st[2][0], st[1], 'situacion')).length;
  bump('role'); save();
}
function sceneAnswer(text) {
  const st = sceneStep(); if (!st) return;
  const best = Math.max(...st[2].map(o => compare(o, text).score));
  P.listening = false;
  if (best >= 0.5) {
    if (P.tries || P.hint) P.missed.push(st); else P.ok++;
    P.chat.push({ who: 'you', text, ok: true, alt: st[2][0] });
    Object.assign(P, { i: P.i + 1, tries: 0, hint: false, fb: '' });
    advance();
  } else {
    P.tries++; if (P.tries >= 2) P.hint = true;
    P.fb = `Se entendió: “${text}”. Probá de nuevo.`;
  }
  render();
}

function roleplayView() {
  if (!P.scene) {
    const lvl = S.settings.level, done = id => S.seen?.role?.[id] ? 1 : 0;
    const list = [...SCENES].sort((a, b) => done(a.id) - done(b.id) || (a.lvl === lvl ? 0 : 1) - (b.lvl === lvl ? 0 : 1) || a.lvl - b.lvl);
    return `<header class="top"><h2>Situaciones</h2><a class="link" href="#practice">Volver</a></header>
      <p class="muted">La app dice su parte con voz y vos respondés hablando. Si te trabás, te da una pista.</p>
      <div class="tiles">${list.map(s => `<button class="tile left" data-a="rstart" data-id="${s.id}"><b>${esc(s.title)}</b>
        <span>${esc(s.es)} · ${LV[s.lvl - 1]}${S.roles[s.id] ? ` · mejor ${S.roles[s.id].best}%` : S.seen?.role?.[s.id] ? ' · ya la hiciste' : ''}</span></button>`).join('')}</div>`;
  }
  const st = sceneStep();
  const chat = P.chat.map(m => m.who === 'them'
    ? `<div class="bub them" data-a="say" data-t="${esc(m.text)}">${esc(m.text)}</div>`
    : `<div class="bub you ${m.skip ? 'skip' : ''}">${esc(m.text)}${m.ok && m.alt && compare(m.alt, m.text).score < 1 ? `<small>Más natural: ${esc(m.alt)}</small>` : ''}</div>`).join('');
  const turn = P.done ? `<div class="card"><small>Terminaste</small><div class="count">${P.score}%</div>
      <p class="muted">${P.ok} de ${P.scene.steps.filter(s => s[0] === 'you').length} respuestas sin ayuda.${P.added ? ` Agregué ${P.added} frases a tus tarjetas.` : ''}</p>
      <button class="btn primary" data-a="rstart" data-id="${P.scene.id}">Repetir</button><button class="btn ghost" data-a="rlist">Otra situación</button></div>`
    : `<div class="card goal"><small>Tu turno</small><div class="phrase">${esc(st[1])}</div>
      ${P.hint ? `<p class="exes">Por ejemplo: “${esc(st[2][0])}” <button class="link" data-a="say" data-t="${esc(st[2][0])}">Escuchar</button></p>` : ''}
      ${P.listening ? '<p class="live" id="live">Escuchando…</p>' : P.fb ? `<p class="heard miss">${esc(P.fb)}</p>` : ''}
      </div>
      <button class="btn primary big ${P.listening ? 'rec' : ''}" data-a="rmic">${P.listening ? 'Listo, ya respondí' : 'Responder hablando'}</button>
      <form data-form="role" class="searchbar"><input name="t" placeholder="o escribila / dictala con el micrófono del teclado" autocomplete="off" enterkeyhint="send"><button class="btn ghost">Enviar</button></form>
      <div class="row"><button class="btn ghost" data-a="rhint">Pista</button><button class="btn ghost" data-a="rskip">Saltar</button></div>`;
  return `<header class="top"><button class="link" data-a="rlist">← Situaciones</button><span class="muted">${esc(P.scene.title)}</span></header>
    <div class="chat">${chat}</div>${turn}`;
}

/* ---------- sonidos ---------- */
function newSound() {
  const pool = P.set.pairs.map(x => ({ id: P.set.id + ':' + x.join('/'), x }));
  const pick = pickFresh('sound', pool, { random: true, avoid: P.pair && P.set.id + ':' + P.pair.join('/') });
  markSeen('sound', pick.id);
  const pair = pick.x, ans = Math.random() < 0.5 ? 0 : 1;
  Object.assign(P, { pair, ans, picked: null, heard: null, listening: false });
  if (P.mode === 'ear') setTimeout(() => say(pair[ans], 0.8), 150);
}
function soundsView() {
  if (!P.set) return `<header class="top"><h2>Sonidos difíciles</h2><a class="link" href="#practice">Volver</a></header>
    <p class="muted">Pares de palabras que solo cambian en un sonido. Primero entrená el oído, después decilas vos.</p>
    <div class="tiles">${SOUNDS.map(s => { const r = S.sounds[s.id];
      return `<button class="tile left" data-a="sset" data-id="${s.id}"><b>${esc(s.name)}</b>
        <span>${s.pairs.slice(0, 3).map(p => p.join(' / ')).join(' · ')}${r?.n ? ` · ${Math.round(r.ok / r.n * 100)}% de aciertos` : ''}</span></button>`; }).join('')}</div>`;
  const [a, b] = P.pair, target = P.pair[P.ans];
  let body;
  if (P.mode === 'ear') {
    const res = P.picked == null ? '' : P.picked === P.ans ? '<p class="heard ok">¡Bien! Era esa.</p>' : `<p class="heard miss">Era “${esc(target)}”.</p>`;
    body = `<div class="card"><small>¿Qué palabra escuchaste?</small>
      <button class="btn ghost" data-a="say" data-t="${esc(target)}" data-r="0.8">Escuchar otra vez</button>
      <div class="row">${[a, b].map((w, i) => `<button class="btn ${P.picked == null ? 'primary' : i === P.ans ? 'okb' : P.picked === i ? 'badb' : 'ghost'}" data-a="spick" data-i="${i}">${esc(w)}</button>`).join('')}</div>
      ${res}${P.picked != null ? `<div class="row"><button class="btn ghost" data-a="say" data-t="${esc(a)}" data-r="0.8">${esc(a)}</button><button class="btn ghost" data-a="say" data-t="${esc(b)}" data-r="0.8">${esc(b)}</button></div>` : ''}</div>`;
  } else {
    const h = P.heard, hw = h == null ? [] : words(h);
    const res = h == null ? '' : hw.includes(target.toLowerCase()) ? '<p class="heard ok">¡Se entendió perfecto!</p>'
      : hw.includes(P.pair[1 - P.ans].toLowerCase()) ? `<p class="heard miss">Se entendió “${esc(P.pair[1 - P.ans])}”. Exagerá la diferencia.</p>`
      : `<p class="heard miss">Se entendió: “${esc(h || '…')}”</p>`;
    body = `<div class="card"><small>Decí esta palabra</small><div class="word">${esc(target)}</div>
      <p class="exes">No la confundas con “${esc(P.pair[1 - P.ans])}”</p>
      <div class="row"><button class="btn ghost" data-a="say" data-t="${esc(target)}" data-r="0.8">Escuchar</button>
      <button class="btn ghost" data-a="say" data-t="${esc(P.pair[1 - P.ans])}" data-r="0.8">Escuchar la otra</button></div>
      ${P.listening ? '<p class="live" id="live">Escuchando…</p>' : P.sfb ? `<p class="heard miss">${esc(P.sfb)}</p><form data-form="soundtype" class="searchbar typein"><input name="t" placeholder="Escribila o dictala con el micrófono del teclado" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"><button class="btn ghost">Comprobar</button></form>` : res}</div>
      <button class="btn primary big ${P.listening ? 'rec' : ''}" data-a="smic">${P.listening ? 'Listo' : 'Decirla'}</button>`;
  }
  return `<header class="top"><button class="link" data-a="slist">← Sonidos</button><span class="muted">${esc(P.set.name)}</span></header>
    <p class="tip">${esc(P.set.tip)}</p>
    <div class="chips"><button class="chip ${P.mode === 'ear' ? 'on' : ''}" data-a="smode" data-m="ear">Entrenar el oído</button>
      <button class="chip ${P.mode === 'say' ? 'on' : ''}" data-a="smode" data-m="say">Decirlas vos</button></div>
    ${body}<button class="btn ghost" data-a="snext">Siguiente</button>`;
}
function soundScore(ok) {
  const r = (S.sounds[P.set.id] ??= { n: 0, ok: 0 });
  r.n++; if (ok) r.ok++; bump('sounds'); save();
}

/* ---------- dictado ---------- */
function newDictation() {
  const lvl = S.settings.level, pool = DECK.filter(e => e.ex && e.lvl === lvl && e.ex.split(' ').length <= 12);
  P.item = pickFresh('dict', pool, { random: true, avoid: P.item?.id }); P.result = null; P.typed = '';
  markSeen('dict', P.item.id);
  setTimeout(() => say(P.item.ex), 200);
}
function dictationView() {
  if (!P.item) newDictation();
  const r = P.result;
  return `<header class="top"><h2>Dictado</h2><a class="link" href="#practice">Volver</a></header>
    <div class="card"><small>Escuchá y escribí la frase</small>
      <div class="row"><button class="btn ghost" data-a="say" data-t="${esc(P.item.ex)}">Escuchar</button>
      <button class="btn ghost" data-a="say" data-t="${esc(P.item.ex)}" data-r="0.6">Lento</button></div>
      ${r ? `<div class="score"><b>${Math.round(r.score * 100)}%</b><span>${r.shown.map((w, i) => `<span class="${r.hit[i] ? 'ok' : 'miss'}">${esc(w)}</span>`).join(' ')}</span></div>
        <p class="heard">Escribiste: “${esc(P.typed)}”</p><p class="exes">${esc(P.item.exEs)}</p>` : ''}
    </div>
    ${r ? '<button class="btn primary big" data-a="dnext">Siguiente frase</button>'
      : `<form data-form="dict" class="add"><input name="t" placeholder="Escribí lo que escuchaste" autocomplete="off" autocapitalize="off" spellcheck="false">
        <button class="btn primary big">Comprobar</button></form>`}
    <p class="muted">${S.dictation.n ? `${S.dictation.n} frases · promedio ${Math.round(S.dictation.sum / S.dictation.n * 100)}%` : 'Las palabras en rojo son las que faltaron o se escribieron distinto.'}</p>`;
}

/* ---------- diario hablado ---------- */
// una pregunta que no te tocó antes; la misma durante todo el día
const JPOOL = JOURNAL.map(q => ({ id: q[0], q }));
function newQ(avoid) { const p = pickFresh('journal', JPOOL, { avoid }); S.jday = { date: dayKey(), q: p.id }; markSeen('journal', p.id); }
function todayQ() {
  if (S.jday?.date !== dayKey() || !JOURNAL.some(q => q[0] === S.jday.q)) newQ();
  return JOURNAL.find(q => q[0] === S.jday.q);
}
function journalStart() {
  hush();
  P.jtoken = Math.random();
  Object.assign(P, { rec: true, stopping: false, t0: Date.now(), text: '' });
  render();
  // en el diario importa más el audio: en celulares graba aunque no haya transcripción
  P.cap = capture(t => { P.text = t; const el = $('#live'); if (el) el.textContent = t; }, { record: true, prefer: 'audio' });
}
async function journalStop() {
  if (!P.rec || P.stopping || !P.cap) return;
  P.stopping = true;
  const b = $('[data-a="jstop"]'); if (b) { b.textContent = 'Guardando…'; b.classList.remove('rec'); }
  const sec = Math.max(1, Math.round((Date.now() - P.t0) / 1000));
  const res = await P.cap.stop(), blob = res.audio;
  if (!blob && !res.text && !P.text) { Object.assign(P, { rec: false, stopping: false, cap: null }); toast(micMsg(res)); return render(); }
  const w = words(res.text || P.text || ''), q = todayQ();
  const e = { id: 'j' + Date.now().toString(36), date: dayKey(), q: q[0], text: res.text || P.text || '', sec,
    words: w.length, wpm: Math.round(w.length / sec * 60), unique: new Set(w).size, audio: !!blob };
  if (blob) await putAudio(e.id, blob).catch(() => { e.audio = false; });
  S.journal.push(e); bump('journal'); save();
  Object.assign(P, { rec: false, stopping: false, cap: null, last: e.id });
  render();
}
function journalView() {
  const q = todayQ(), list = [...S.journal].reverse();
  const stat = e => `${e.sec} s${e.words ? ` · ${e.words} palabras · ${e.wpm}/min` : ''}`;
  if (P.rec) return `<header class="top"><h2>Diario hablado</h2></header>
    <div class="card"><small>${esc(q[0])}</small><div class="count" id="jcount">0:00</div>
      <p class="live" id="live">${canHear() ? 'Hablá con tranquilidad. Hasta 2 minutos.' : 'Grabando…'}</p></div>
    <button class="btn primary big rec" data-a="jstop">Terminar y guardar</button>`;
  const first = S.journal[0], lastE = S.journal.at(-1);
  return `<header class="top"><h2>Diario hablado</h2><a class="link" href="#practice">Volver</a></header>
    <div class="card"><small>Pregunta de hoy</small><div class="phrase">${esc(q[0])}</div><p class="exes">${esc(q[1])}</p>
      <button class="btn ghost" data-a="jq">Otra pregunta</button></div>
    <button class="btn primary big" data-a="jstart">Grabar mi entrada</button>
    ${S.journal.length >= 2 ? `<h3>Tu progreso</h3><div class="cmp">
      <div><small>Primera · ${first.date}</small><b>${first.wpm || '–'}</b><span>palabras/min</span><button class="link" data-a="jplay" data-id="${first.id}">Escuchar</button></div>
      <div><small>Última · ${lastE.date}</small><b>${lastE.wpm || '–'}</b><span>palabras/min</span><button class="link" data-a="jplay" data-id="${lastE.id}">Escuchar</button></div></div>` : ''}
    ${list.length ? `<h3>Tus entradas</h3><ul class="list">${list.map(e => `<li class="${e.id === P.last ? 'new' : ''}"><div class="grow"><b>${e.date} · ${esc(e.q)}</b>
      <span>${stat(e)}</span>${e.text ? `<span class="jtext">“${esc(e.text)}”</span>` : ''}</div>
      <div class="col">${e.audio ? `<button class="link" data-a="jplay" data-id="${e.id}">Escuchar</button>` : ''}<button class="link" data-a="jdel" data-id="${e.id}">Borrar</button></div></li>`).join('')}</ul>`
      : '<p class="muted">Grabá un minuto por día. En unas semanas vas a poder comparar tu primera grabación con la última.</p>'}
    <p class="muted">Los audios quedan solo en este navegador y no entran en el respaldo exportado.</p>`;
}

/* ---------- estadísticas ---------- */
function statsView() {
  const goal = planFor().total * 60, days = Object.keys(S.log).sort();
  const active = days.filter(d => S.log[d].sec > 0);
  let best = 0, run = 0, prev = null;
  for (const d of days.filter(d => S.log[d].sec >= planFor(d).total * 60)) {
    run = prev && (new Date(d) - new Date(prev)) / 864e5 === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d;
  }
  const cards = Object.entries(S.cards), seen = cards.filter(([k]) => k.endsWith('>r') || k.startsWith('n:')).length;
  const mature = cards.filter(([, c]) => c.days >= 21).length;
  const reviews = days.reduce((a, d) => a + (S.log[d].new || 0) + (S.log[d].rev || 0), 0);
  const mins = days.reduce((a, d) => a + S.log[d].sec, 0) / 60;
  const shadows = Object.values(S.shadow), shAvg = shadows.length ? Math.round(shadows.reduce((a, s) => a + s.best, 0) / shadows.length * 100) : 0;
  const month = [...Array(30)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - 29 + i); return { d, sec: S.log[dayKey(d)]?.sec || 0 }; });
  const maxSec = Math.max(goal, ...month.map(m => m.sec));
  const speech = [...S.speak.filter(s => s.wpm).map(s => ({ date: s.date, wpm: s.wpm })), ...S.journal.filter(j => j.wpm).map(j => ({ date: j.date, wpm: j.wpm }))]
    .sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const maxW = Math.max(120, ...speech.map(s => s.wpm));
  const tile = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  return `<header class="top"><h2>Estadísticas</h2><a class="link" href="#home">Volver</a></header>
    <div class="stats4">${tile(streak(), 'días de racha')}${tile(best, 'mejor racha')}${tile(active.length, 'días practicados')}${tile(Math.round(mins), 'minutos en total')}</div>
    <h3>Minutos por día · últimos 30 días</h3>
    <div class="month">${month.map(m => `<i title="${dayKey(m.d)}: ${Math.round(m.sec / 60)} min" class="${m.sec >= goal ? 'full' : ''}" style="height:${Math.max(3, m.sec / maxSec * 100)}%"></i>`).join('')}
      <span class="goalline" style="bottom:${goal / maxSec * 100}%"></span></div>
    <h3>Vocabulario</h3>
    <div class="stats4">${tile(seen, 'palabras vistas')}${tile(mature, 'tarjetas firmes')}${tile(reviews, 'repasos')}${tile(S.custom.length, 'tarjetas tuyas')}</div>
    <h3>Velocidad al hablar</h3>
    ${speech.length ? `<div class="month tall">${speech.map(s => `<i class="full" title="${s.date}: ${s.wpm} palabras/min" style="height:${s.wpm / maxW * 100}%"><em>${s.wpm}</em></i>`).join('')}</div>
      <p class="muted">Palabras por minuto en tus consignas y entradas del diario. Una conversación natural ronda las 120 a 150.</p>`
      : '<p class="muted">Hacé consignas o entradas del diario para ver cómo crece tu velocidad.</p>'}
    <h3>Pronunciación</h3>
    <div class="stats4">${tile(shadows.length, 'frases de shadowing')}${tile(shAvg + '%', 'mejor promedio')}${tile(S.dictation.n ? Math.round(S.dictation.sum / S.dictation.n * 100) + '%' : '–', 'en dictado')}${tile(Object.keys(S.roles).length, 'situaciones')}</div>
    ${Object.keys(S.sounds).length ? `<ul class="list">${SOUNDS.filter(s => S.sounds[s.id]?.n).map(s => { const r = S.sounds[s.id];
      return `<li><div><b>${esc(s.name)}</b><span>${r.n} intentos</span></div><i>${Math.round(r.ok / r.n * 100)}%</i></li>`; }).join('')}</ul>` : ''}`;
}

/* ---------- recordatorio ---------- */
export function remindSettings() {
  const r = S.settings.remind;
  return `<h3>Recordatorio diario</h3>
    <label class="field"><span>Hora</span><input type="time" id="rtime" value="${r.time}"></label>
    <label class="field check"><span>Avisarme si todavía no practiqué</span><input type="checkbox" id="ron" ${r.on ? 'checked' : ''}></label>
    <button class="btn ghost" data-a="rics">Agregar recordatorio al calendario</button>
    <p class="muted">El aviso de la app solo llega si G'day está abierta, aunque sea en otra pestaña. El del calendario llega siempre, también en el celular.</p>`;
}
async function notify() {
  const body = `Te faltan ${Math.max(1, planFor().total - Math.floor((log().sec || 0) / 60))} minutos para tu objetivo de hoy.`;
  try { (await navigator.serviceWorker?.ready)?.showNotification("G'day · hora de practicar", { body, icon: 'icon.svg' }); }
  catch { new Notification("G'day · hora de practicar", { body }); }
}
setInterval(() => {
  const r = S?.settings?.remind;
  if (!r?.on || !('Notification' in window) || Notification.permission !== 'granted') return;
  const now = new Date(), hm = now.toTimeString().slice(0, 5);
  if (hm >= r.time && r.last !== dayKey() && (log().sec || 0) < planFor().total * 60) { r.last = dayKey(); save(); notify(); }
}, 30000);

/* ---------- acciones ---------- */
export const practiceViews = { practice: practiceView, roleplay: roleplayView, sounds: soundsView, dictation: dictationView, journal: journalView, stats: statsView };

export const practiceActions = {
  rstart(d) { markSeen('role', d.id); P = { scene: SCENES.find(s => s.id === d.id), i: 0, chat: [], ok: 0, missed: [], tries: 0 }; advance(); render(); },
  rlist() { hush(); P = {}; render(); },
  rmic() {
    if (P.listening) { P.l?.stop(); return; }  // tocar de nuevo termina antes
    hush();
    if (hear(res => {
      if (!res.text) { P.listening = false; P.fb = micMsg(res); return render(); }
      sceneAnswer(res.text);
    })) { P.listening = true; P.fb = ''; render(); }
  },
  rhint() { P.hint = true; render(); },
  rskip() {
    const st = sceneStep(); if (!st) return;
    P.missed.push(st); P.chat.push({ who: 'you', text: st[2][0], skip: true });
    Object.assign(P, { i: P.i + 1, tries: 0, hint: false, fb: '' });
    advance(); render();
  },
  sset(d) { P = { set: SOUNDS.find(s => s.id === d.id), mode: 'ear' }; newSound(); render(); },
  slist() { P = {}; render(); },
  smode(d) { P.mode = d.m; newSound(); render(); },
  snext() { newSound(); render(); },
  spick(d) { if (P.picked != null) return; P.picked = +d.i; soundScore(P.picked === P.ans); render(); },
  smic() {
    if (P.listening) { P.l?.stop(); return; }
    hush();
    if (hear(res => {
      P.listening = false;
      if (!res.text) { P.sfb = micMsg(res); return render(); }  // no cuenta como error
      P.heard = res.text; soundScore(words(res.text).includes(P.pair[P.ans].toLowerCase())); render();
    })) { P.listening = true; P.heard = null; P.sfb = ''; render(); }
  },
  dnext() { newDictation(); render(); },
  jq() { newQ(S.jday?.q); render(); },
  jstart: journalStart,
  jstop: journalStop,
  async jplay(d) { playBlob(await getAudio(d.id).catch(() => null)); },
  jdel(d) {
    if (!confirm('¿Borrar esta entrada del diario?')) return;
    S.journal = S.journal.filter(e => e.id !== d.id); delAudio(d.id).catch(() => {}); save(); render();
  },
  rics() {
    const [h, m] = S.settings.remind.time.split(':'), d = new Date(), pad = n => String(n).padStart(2, '0');
    const start = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${h}${m}00`;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', "PRODID:-//G'day//ES", 'BEGIN:VEVENT', 'UID:gday-diario@local', `DTSTAMP:${stamp}`,
      `DTSTART:${start}`, 'DURATION:PT5M', 'RRULE:FREQ=DAILY', "SUMMARY:G'day: 5 minutos de inglés",
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Hora de practicar inglés', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'gday-recordatorio.ics'; a.click();
    toast('Abrí el archivo para agregarlo a tu calendario');
  },
};

document.addEventListener('submit', e => {
  const f = e.target.dataset.form;
  if (f !== 'role' && f !== 'dict' && f !== 'soundtype') return;
  e.preventDefault();
  const t = new FormData(e.target).get('t').trim();
  if (!t) return;
  if (f === 'soundtype') { P.sfb = ''; P.heard = t; soundScore(words(t).includes(P.pair[P.ans].toLowerCase())); return render(); }
  if (f === 'role') return sceneAnswer(t);
  P.typed = t; P.result = compare(P.item.ex, t);
  const D = S.dictation; D.n++; D.sum += P.result.score; bump('dictation'); save(); render();
});

document.addEventListener('change', async e => {
  const t = e.target, r = S.settings.remind;
  if (t.id === 'rtime') { r.time = t.value || '20:00'; save(); }
  if (t.id === 'ron') {
    if (t.checked && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { t.checked = false; toast('El navegador no dio permiso para avisos'); }
    }
    if (t.checked && !('Notification' in window)) { t.checked = false; toast('Este navegador no permite avisos'); }
    r.on = t.checked; save();
  }
});

setInterval(() => {
  if (!P.rec) return;
  const s = Math.floor((Date.now() - P.t0) / 1000), c = $('#jcount');
  if (c) c.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  if (s >= 120) journalStop();
}, 500);

window.addEventListener('hashchange', () => {
  P.token = null;
  P.l?.stop();
  if (P.rec) { P.jtoken = null; P.cap?.stop(); }
  P = {};
});
