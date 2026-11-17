// Red primero; si no hay conexión, usa la copia guardada.
// Las imágenes y audios de los mazos importados en el navegador se sirven desde IndexedDB.
const CACHE = 'gday-v69';
// Las bibliotecas de la voz natural (kokoro-js, transformers, onnxruntime) se guardan aparte para que funcione sin internet.
const LIBS = 'kokoro-libs';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'deck-l1.js', 'deck-l2.js', 'deck-l3.js', 'deck-l1b.js', 'deck-l2b.js', 'deck-l3b.js',
  'deck-extra.js', 'watch.js', 'lobby.js', 'lobby-art.js', 'lobby-rooms.js', 'lobby-music.js', 'lobby-barista.js', 'practice.js', 'practice-data.js', 'anki.js', 'fsrs.js', 'revlog.js', 'voice.js', 'tts-worker.js', 'browser-col.js', 'cloud.js', 'shop-data.js', 'tatoeba-data.js', 'vocab.js', 'prompts-extra.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  // solo borra versiones viejas de G'day: la voz natural (transformers-cache, ~90 MB) se queda
  caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gday-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

function mediaFromBrowser(name) {
  return new Promise(res => {
    const r = indexedDB.open('gday-browser', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('media'); };
    r.onerror = () => res(null);
    r.onsuccess = () => {
      try {
        const q = r.result.transaction('media', 'readonly').objectStore('media').get(name);
        q.onsuccess = () => res(q.result || null); q.onerror = () => res(null);
      } catch { res(null); }
    };
  });
}
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', webm: 'audio/webm', mp4: 'video/mp4' };

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  // bibliotecas de la voz natural: las versiones fijas se sirven guardadas (no cambian); las demás, red primero
  if (u.hostname === 'cdn.jsdelivr.net' && /kokoro-js|@huggingface\/transformers|onnxruntime|phonemizer/.test(u.pathname)) {
    const fixed = /@\d/.test(u.pathname);
    const net = () => fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(LIBS).then(c => c.put(e.request, copy)); }
      return res;
    });
    e.respondWith(fixed
      ? caches.match(e.request, { cacheName: LIBS }).then(hit => hit || net())
      : net().catch(() => caches.match(e.request, { cacheName: LIBS })));
    return;
  }
  // el modelo de voz (Hugging Face) lo guarda la biblioteca en transformers-cache: no se duplica acá
  if (u.origin !== location.origin) return;
  const path = u.pathname;
  if (path.startsWith('/api/media/')) {
    const name = decodeURIComponent(path.slice('/api/media/'.length));
    e.respondWith(mediaFromBrowser(name).then(blob => blob
      ? new Response(blob, { headers: { 'Content-Type': TYPES[name.split('.').pop().toLowerCase()] || 'application/octet-stream' } })
      : fetch(e.request)));
    return;
  }
  if (path.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
