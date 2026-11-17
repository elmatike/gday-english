// G'day · puente entre la extensión y la página de G'day (web publicada o servidor local).
// La página pide las palabras guardadas en videos y las agrega a sus tarjetas; así no hace falta python3 server.py.
(() => {
  if (!document.querySelector('meta[name="gday-app"]')) return;
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(chrome.runtime.lastError ? null : r)); } catch { res(null); } });
  const version = chrome.runtime.getManifest().version;
  window.addEventListener('message', async e => {
    const d = e.data;
    if (e.source !== window || e.origin !== location.origin || !d || typeof d.__gdayExt !== 'string') return;
    if (d.__gdayExt === 'hello') window.postMessage({ __gdayExt: 'ready', version }, location.origin);
    if (d.__gdayExt === 'pull') {
      const r = await send({ type: 'pending' });
      if (r && !r.error) window.postMessage({ __gdayExt: 'words', deckName: r.deckName, items: r.items }, location.origin);
      // y el tiempo que miraste videos con subtítulos en inglés
      const w = await send({ type: 'watchPending' });
      if (w?.days && Object.keys(w.days).length) window.postMessage({ __gdayExt: 'watch', days: w.days }, location.origin);
    }
    if (d.__gdayExt === 'watchDone' && d.days && typeof d.days === 'object') await send({ type: 'watchDone', days: d.days });
    if (d.__gdayExt === 'done' && Array.isArray(d.keys)) await send({ type: 'synced', keys: d.keys.map(String) });
    // tu nivel y las palabras que ya tenés: los usa el botón "+ Palabras"
    if (d.__gdayExt === 'profile') await send({ type: 'profile', level: +d.level || 1, known: Array.isArray(d.known) ? d.known.map(String) : [],
      levels: d.levels && typeof d.levels === 'object' ? d.levels : {},
      mastered: Array.isArray(d.mastered) ? d.mastered.map(String) : [], hours: +d.hours || 0 });
  });
  // la extensión avisa que hay palabras nuevas: la página las pide enseguida
  chrome.runtime.onMessage.addListener(m => { if (m?.type === 'nudge') window.postMessage({ __gdayExt: 'nudge' }, location.origin); });
  window.postMessage({ __gdayExt: 'ready', version }, location.origin);
})();
