// G'day · corre dentro de la página (mundo MAIN) desde el principio.
// Detecta los archivos de subtítulos que descarga el reproductor del sitio y se los pasa a content.js.
(() => {
  if (window.__gdayHook) return;
  window.__gdayHook = true;
  // dentro de la app G'day (o de un video incrustado en ella) la página ya tiene sus propios subtítulos
  const insideGday = (() => {
    const local = o => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o);
    if (document.querySelector('meta[name="gday-app"]') || local(location.origin) && location.port === '5190') return true;
    try { if ([...(location.ancestorOrigins || [])].some(local)) return true; } catch {}
    try { if (window.top !== window && window.top.document.querySelector('meta[name="gday-app"]')) return true; } catch {}
    return false;
  })();
  if (insideGday) return;

  const URL_HINT = /\.(vtt|srt|ass|ssa|ttml2?|dfxp)(\?|$)|timedtext|subtitle|caption|\/subs?\/|texttrack/i;
  const TYPE_SKIP = /video|audio|image|font|octet-stream|mpegurl|dash\+xml|javascript|css|html/i;
  const TYPE_TEXT = /vtt|ttml|subrip|xml|text\/plain|json/i;
  // YouTube manda el JSON con sangría y una cabecera de estilos larga: "events" puede aparecer después de los 2000 caracteres
  const looksLikeSubs = text => /^\uFEFF?WEBVTT|^\s*\d+\s*\r?\n\d\d:\d\d:\d\d[,.]\d+ -->|<tt[\s>][\s\S]*<p[\s>]|^\s*\[Script Info\]|"events"\s*:\s*\[\s*\{\s*"tStartMs"|<timedtext[\s>]/.test(text.slice(0, 2000))
    || /^\s*\{/.test(text) && (/"wireMagic"\s*:\s*"pb3"/.test(text.slice(0, 200)) || /"events"\s*:\s*\[\s*\{\s*"tStartMs"/.test(text.slice(0, 60000)));
  // si la dirección dice que es un subtítulo se lee aunque el sitio lo mande como archivo binario
  const candidate = (url, type) => (URL_HINT.test(url || '') && !/video|audio|image|font/i.test(type || ''))
    || (TYPE_TEXT.test(type || '') && !TYPE_SKIP.test(type || ''));
  let secondary = 'es';
  const ytDone = new Set();
  const captured = [];  // se guardan para reenviarlos si content.js arranca después
  const emit = (url, text) => { captured.push({ url, text }); if (captured.length > 40) captured.shift(); window.postMessage({ __gday: 'subs', url, text }, '*'); };

  function post(url, text) {
    try { url = new URL(url, location.href).href; } catch {}
    if (!text || text.length < 20 || text.length > 8e6 || !looksLikeSubs(text)) return;
    emit(String(url), text);
    // YouTube: pide la misma pista traducida para tener subtítulos dobles
    if (/\/api\/timedtext/.test(url) && !/[?&]tlang=/.test(url)) {
      const lang = (String(url).match(/[?&]lang=([\w-]+)/) || [])[1] || '';
      const key = String(url).replace(/[?&](pot|potc|c|cver|xorb|xobt|xovt|cbr|cbrver|cos|cosver|cplatform)=[^&]*/g, '');
      if (lang && !lang.startsWith(secondary) && !ytDone.has(key)) {
        ytDone.add(key);
        origFetch(url + '&tlang=' + secondary, { credentials: 'include' }).then(r => r.ok ? r.text() : '')
          .then(t => t && emit(url + '&tlang=' + secondary, t)).catch(() => {});
      }
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input?.url || String(input);
      const type = res.headers.get('content-type') || '';
      if (res.ok && candidate(url, type)) res.clone().text().then(t => post(url, t)).catch(() => {});
    } catch {}
    return res;
  };

  const XHR = XMLHttpRequest.prototype, origOpen = XHR.open, origSend = XHR.send;
  XHR.open = function (method, url) { this.__gdayUrl = url; return origOpen.apply(this, arguments); };
  XHR.send = function () {
    this.addEventListener('load', () => {
      try {
        const type = this.getResponseHeader('content-type') || '';
        if (this.status >= 400 || !candidate(this.__gdayUrl, type)) return;
        const rt = this.responseType;
        const text = rt === '' || rt === 'text' ? this.responseText
          : rt === 'arraybuffer' ? new TextDecoder().decode(this.response)
          : rt === 'json' ? JSON.stringify(this.response) : null;
        if (text) post(this.__gdayUrl, text);
      } catch {}
    });
    return origSend.apply(this, arguments);
  };

  // ---- pedidos de content.js: saltar a un segundo y traducir ----
  const biggestVideo = () => [...document.querySelectorAll('video')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  function seek(t) {
    if (location.hostname.includes('netflix.')) {
      try {  // en Netflix cambiar currentTime directamente rompe el reproductor
        const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
        vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds().at(-1)).seek(Math.round(t * 1000));
        return;
      } catch {}
    }
    const v = biggestVideo(); if (v) v.currentTime = t;
  }
  const translators = {};
  async function translate(text, from, to) {
    if (!('Translator' in self)) return { error: 'unsupported' };
    const key = from + '>' + to;
    try {
      if (!translators[key]) {
        const av = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
        if (av === 'unavailable') return { error: 'unsupported' };
        translators[key] = Translator.create({ sourceLanguage: from, targetLanguage: to });
      }
      return { text: await (await translators[key]).translate(text) };
    } catch (e) { delete translators[key]; return { error: e?.name === 'NotAllowedError' ? 'needs-click' : 'failed' }; }
  }
  window.addEventListener('message', async e => {
    const d = e.data;
    if (e.source !== window || !d || !d.__gdayCmd) return;
    if (d.__gdayCmd === 'cfg') secondary = d.secondary || 'es';
    if (d.__gdayCmd === 'seek') seek(d.t);
    if (d.__gdayCmd === 'replay') captured.forEach(c => window.postMessage({ __gday: 'subs', url: c.url, text: c.text }, '*'));
    if (d.__gdayCmd === 'tr') window.postMessage({ __gday: 'tr', id: d.id, ...(await translate(d.text, d.from, d.to)) }, '*');
  });
})();
