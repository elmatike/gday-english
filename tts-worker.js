// G'day · voz natural (Kokoro) dentro del navegador de cada usuario.
// Corre en un hilo aparte para no trabar la página. El modelo (~90 MB, versión comprimida "q8") se baja una sola vez
// de Hugging Face y queda guardado en el navegador (Cache Storage); las próximas veces arranca sin descargar nada.
// No hay servidor de voz ni costo por uso: todo se genera en la compu o el celu de quien escucha.
// La biblioteca se importa adentro de load() (no arriba de todo): así, si no se puede bajar, el error llega
// a la página como un mensaje claro y no como un worker que se cae sin explicación.

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts = null, loading = null;

// ¿El modelo ya está guardado en el navegador? Así la página dice "cargando" y no "descargando".
async function isCached() {
  try {
    if (!self.caches) return false;
    const keys = await (await caches.open('transformers-cache')).keys();
    return keys.some(r => r.url.includes('Kokoro-82M') && r.url.endsWith('.onnx'));
  } catch { return false; }
}

// qué tipo de falla fue, para que la página muestre el mensaje que corresponde
function kind(e) {
  const s = String(e?.message || e || '');
  if (/memory|allocat|RangeError|out of bounds|Aborted\(/i.test(s)) return 'mem';
  if (self.navigator?.onLine === false || /fetch|network|load|import|status|CORS/i.test(s)) return 'net';
  return 'other';
}

function load(voice = 'bf_emma') {
  loading ??= (async () => {
    if (typeof WebAssembly !== 'object') throw Object.assign(new Error('no wasm'), { kind: 'unsupported' });
    const files = {};
    postMessage({ type: 'cached', cached: await isCached() });
    const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
    tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8', device: 'wasm',
      progress_callback: p => {
        if (p.status !== 'progress' || !p.total) return;
        files[p.file] = [p.loaded, p.total];
        const all = Object.values(files), loaded = all.reduce((a, f) => a + f[0], 0), total = all.reduce((a, f) => a + f[1], 0);
        postMessage({ type: 'progress', loaded, total });
      },
    });
    // la primera frase siempre tarda más (el motor "entra en calor"): se hace acá, con la voz elegida, antes de avisar que está lista
    await tts.generate('Hi.', { voice });
    postMessage({ type: 'ready' });
  })().catch(e => { loading = null; postMessage({ type: 'error', kind: e?.kind || kind(e), error: String(e?.message || e) }); throw e; });
  return loading;
}

// Dos filas: "now" (lo que hay que decir ya) va siempre antes que "later" (lo que se prepara de antemano).
// "cancel" descarta lo que estaba en "now" y todavía no empezó (por ejemplo, pasaste de tarjeta).
const now = [], later = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  try {
    await load();
    while (now.length || later.length) {
      const m = now.shift() || later.shift();
      try {
        const audio = await tts.generate(m.text, { voice: m.voice, speed: m.speed });
        postMessage({ type: 'audio', id: m.id, blob: audio.toBlob() });
      } catch (err) { postMessage({ type: 'audio', id: m.id, error: String(err?.message || err) }); }
    }
  } catch {
    for (const x of [...now.splice(0), ...later.splice(0)]) postMessage({ type: 'audio', id: x.id, skipped: true });
  } finally { busy = false; }
}
onmessage = e => {
  const m = e.data;
  if (m.type === 'load') load(m.voice).catch(() => {});
  if (m.type === 'ping') postMessage({ type: 'pong' });
  if (m.type === 'cancel') for (const x of now.splice(0)) postMessage({ type: 'audio', id: x.id, skipped: true });
  // algo que se estaba preparando de antemano ahora hace falta ya: pasa a la fila "now" (al final, para respetar el orden de las partes)
  if (m.type === 'promote') { const i = later.findIndex(x => x.id === m.id); if (i >= 0) now.push(...later.splice(i, 1)); }
  if (m.type === 'gen') {
    (m.prio === 'now' ? now : later).push(m);
    if (later.length > 12) { const x = later.shift(); postMessage({ type: 'audio', id: x.id, skipped: true }); }
    pump();
  }
};
