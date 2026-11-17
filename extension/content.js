// G'day · subtítulos interactivos sobre el reproductor de cualquier sitio.
(() => {
  if (window.__gdayContent) return;
  window.__gdayContent = true;
  // dentro de la app G'day (o de un video incrustado en ella) la página ya tiene sus propios subtítulos
  const insideGday = (() => {
    const local = o => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o);
    if (document.querySelector('meta[name="gday-app"]') || local(location.origin) && location.port === '5190') return true;
    const gday = o => local(o) || /^https:\/\/(gday-english\.vercel\.app|(www\.)?gday\.app)$/i.test(o);
    try { if ([...(location.ancestorOrigins || [])].some(gday)) return true; } catch {}
    try { if (window.top !== window && window.top.document.querySelector('meta[name="gday-app"]')) return true; } catch {}
    return false;
  })();
  if (insideGday) return;

  /* ---------- ajustes ---------- */
  const DEF = {
    enabled: true, disabledSites: [], primary: 'en', secondary: 'es',
    showPrimary: true, showSecondary: true, blurSecondary: false, onlyOnPause: false, autoPause: false,
    lookup: 'hover', resumeAfter: true, size: 100, pos: 12, color: '#ffffff', bg: 'rgba(10,7,16,.72)',
    autoSave: true, sendToGday: true, pageTranslate: true, hideNative: true, rate: 1, autoTranslate: true,
    position: 'bottom', font: 'system', textStyle: 'box', color2: '#e6ddff', bgColor: '#0a0710', bgAlpha: 72,
    loopCount: 1, slowRate: 0.7, defaultRate: 1, dictSite: 'wordreference', showYouglish: true, deckName: 'Palabras de videos',
    wordColors: true, colorLearning: '#a78bfa', showKnown: false, colorKnown: '#5eead4', hoverDelay: 180, pauseOnLookup: true, fullPop: false,
    ttsRate: 0.9, ttsVoice: '',
    keys: { prev: 'a', repeat: 's', next: 'd', slow: 'x', say: 'l', record: 'v', saveLine: 'g', panel: 't', shadow: 'r',
      onlyPause: 'h', toggleTr: 'q', togglePrim: 'w', speedDown: '[', speedUp: ']', offDown: ',', offUp: '.' },
  };
  const merge = saved => ({ ...DEF, ...(saved || {}), keys: { ...DEF.keys, ...(saved?.keys || {}) } });
  let CFG = { ...DEF };
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => res(chrome.runtime.lastError ? null : r)); } catch { res(null); } });
  const host = location.hostname.replace(/^www\./, '');
  const enabledHere = () => CFG.enabled && !CFG.disabledSites.includes(host);
  // los ajustes se cargan después de armar la capa (ver el final del archivo)
  const loadCfg = () => chrome.storage?.sync.get('gday', r => {
    setTimeout(() => { if (!enabledHere() && window.top === window) { lastBadge = 'OFF'; send({ type: 'badge', text: 'OFF' }); } }); CFG = merge(r?.gday); window.postMessage({ __gdayCmd: 'cfg', secondary: CFG.secondary }, '*'); refresh(); });
  chrome.storage?.onChanged.addListener((ch, area) => {
    if (area !== 'sync' || !ch.gday) return;
    CFG = merge(ch.gday.newValue); window.postMessage({ __gdayCmd: 'cfg', secondary: CFG.secondary }, '*'); styleVars();
    if (!enabledHere()) { closePop?.(); if (window.top === window) send({ type: 'badge', text: 'OFF' }); lastBadge = 'OFF'; }
    else if (lastBadge === 'OFF') { lastBadge = null; chooseTracks(); }
    refresh();
  });
  const setCfg = patch => { CFG = { ...CFG, ...patch }; chrome.storage?.sync.set({ gday: CFG }); styleVars(); refresh(); };

  /* ---------- lectura de subtítulos ---------- */
  const toSec = t => String(t).trim().replace(',', '.').split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
  const cleanLine = s => String(s).replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/[​-‍﻿]/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  function parseVtt(raw) {
    const blocks = [], cues = [];
    for (const line of raw.replace(/\r/g, '').split('\n')) {
      if (line.includes('-->')) {
        const prev = blocks.at(-1);
        if (prev && /^\d+$/.test(prev.body.at(-1)?.trim())) prev.body.pop();
        const [a, b] = line.split('-->');
        blocks.push({ start: toSec(a), end: toSec(b.trim().split(/\s+/)[0]), body: [] });
      } else if (line.trim() && blocks.length) blocks.at(-1).body.push(line);
    }
    let prevRaw = '';
    for (const { start, end, body } of blocks) {
      const full = cleanLine(body.join(' '));
      if (!full || full === prevRaw) continue;
      const text = prevRaw && full.startsWith(prevRaw + ' ') ? full.slice(prevRaw.length).trim() : full;  // subtítulos que "ruedan"
      prevRaw = full;
      if (text) cues.push({ start, end, text });
    }
    return cues;
  }
  function parseTtml(raw) {
    const doc = new DOMParser().parseFromString(raw, 'text/xml');
    const tt = doc.documentElement;
    const tick = +tt.getAttribute('ttp:tickRate') || +tt.getAttributeNS('http://www.w3.org/ns/ttml#parameter', 'tickRate') || 1e7;
    const fps = +tt.getAttribute('ttp:frameRate') || 30;
    const time = v => {
      if (!v) return null;
      let m;
      if ((m = v.match(/^([\d.]+)t$/))) return +m[1] / tick;
      if ((m = v.match(/^([\d.]+)(ms|s|m|h|f)$/))) return +m[1] * { ms: .001, s: 1, m: 60, h: 3600, f: 1 / fps }[m[2]];
      if ((m = v.match(/^(\d+):(\d+):(\d+)(?:\.(\d+))?(?::(\d+))?$/))) return +m[1] * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +('0.' + m[4]) : 0) + (m[5] ? +m[5] / fps : 0);
      return null;
    };
    const textOf = n => [...n.childNodes].map(c => c.nodeType === 3 ? c.data : c.localName === 'br' ? ' ' : textOf(c)).join('');
    return [...doc.getElementsByTagNameNS('*', 'p')].map(p => {
      const start = time(p.getAttribute('begin')) ?? 0;
      const end = time(p.getAttribute('end')) ?? start + (time(p.getAttribute('dur')) ?? 3);
      return { start, end, text: cleanLine(textOf(p)) };
    }).filter(c => c.text);
  }
  function parseJson3(raw) {
    const d = JSON.parse(raw);
    return (d.events || []).filter(e => e.segs && !e.aAppend).map(e => ({
      start: e.tStartMs / 1000, end: (e.tStartMs + (e.dDurationMs || 2000)) / 1000,
      text: cleanLine(e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ')),
    })).filter(c => c.text);
  }
  function parseSrv3(raw) {
    const doc = new DOMParser().parseFromString(raw, 'text/xml');
    return [...doc.getElementsByTagName('p'), ...doc.getElementsByTagName('text')].map(p => {
      const t = p.hasAttribute('t') ? +p.getAttribute('t') / 1000 : +p.getAttribute('start');
      const d = p.hasAttribute('d') ? +p.getAttribute('d') / 1000 : +p.getAttribute('dur') || 2;
      return { start: t, end: t + d, text: cleanLine(p.textContent) };
    }).filter(c => c.text);
  }
  function parseAss(raw) {
    let fmt = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    const cues = [];
    for (const line of raw.split(/\r?\n/)) {
      if (/^Format:/i.test(line) && /text/i.test(line)) fmt = line.slice(7).split(',').map(s => s.trim().toLowerCase());
      if (!/^Dialogue:/i.test(line)) continue;
      const parts = line.slice(9).split(','), f = {};
      fmt.forEach((k, i) => { f[k] = i === fmt.length - 1 ? parts.slice(i).join(',') : parts[i]; });
      if (/sign|kara|song|^op|^ed|title/i.test(f.style || '')) continue;  // carteles en pantalla y karaoke
      const text = cleanLine(String(f.text || '').replace(/\{[^}]*\}/g, '').replace(/\\[Nnh]/g, ' '));
      if (text) cues.push({ start: toSec(f.start), end: toSec(f.end), text });
    }
    return cues;
  }
  function parseAny(text) {
    const head = text.slice(0, 2000);
    try {
      if (/"events"\s*:/.test(head) || /^\s*\{/.test(head) && /"wireMagic"|"events"\s*:/.test(text.slice(0, 60000))) return parseJson3(text);
      if (/<tt[\s>]/.test(head) || /<tt[\s>]/.test(text.slice(0, 20000))) return parseTtml(text);
      if (/<timedtext|<transcript/.test(head)) return parseSrv3(text);
      if (/\[Script Info\]|^Dialogue:/m.test(head)) return parseAss(text);
      return parseVtt(text);
    } catch { return []; }
  }
  const EN = /\b(the|and|you|to|is|it|that|what|this|i'm|don't|are|was|have|with|for|just|can|we|he|she|they)\b/gi;
  const ES = /\b(que|de|el|la|los|las|y|no|es|en|lo|por|qué|una|un|pero|con|para|está|estoy|muy|señor|eso)\b/gi;
  function guessLang(url, text, cues) {
    const sample = cues.slice(0, 120).map(c => c.text).join(' ');
    const en = (sample.match(EN) || []).length, es = (sample.match(ES) || []).length;
    if (en + es > 15) return en > es * 1.4 ? 'en' : es > en * 1.4 ? 'es' : 'other';
    if (en + es >= 4 && !(en && es)) return en ? 'en' : 'es';  // pocas frases, pero todas de un solo idioma
    const u = decodeURIComponent(url).toLowerCase();
    const m = u.match(/[?&]tlang=([a-z]{2})/) || u.match(/[?&](?:lang|language|hl)=([a-z]{2})/) || u.match(/[\/_.\-](en|es)(?:[\-_][a-z0-9]+)?[\/_.\-]/)
      || text.slice(0, 800).match(/xml:lang="([a-z]{2})/) || text.slice(0, 300).match(/Language:\s*([a-z]{2})/i);
    if (m) return m[1];
    if (/eng|english/.test(u)) return 'en';
    if (/spa|spanish|espa/.test(u)) return 'es';
    return 'other';
  }

  /* ---------- pistas ---------- */
  let tracks = new Map(), primaryKey = null, secondaryKey = null, offset = 0, pageKey = location.href;
  const setOffset = v => { offset = Math.round(v * 100) / 100; chrome.storage?.local.get('offsets', r => { const o = r?.offsets || {}; o[host] = offset; chrome.storage.local.set({ offsets: o }); }); };
  function addTrack(key, lang, cues, label, append) {
    const old = tracks.get(key);
    if (append && old) {
      const seen = new Set(old.cues.map(c => c.start.toFixed(2) + c.text));
      old.cues.push(...cues.filter(c => !seen.has(c.start.toFixed(2) + c.text)));
      old.cues.sort((a, b) => a.start - b.start);
    } else tracks.set(key, { lang, cues: cues.sort((a, b) => a.start - b.start), label });
    chooseTracks();
  }
  function chooseTracks() {
    const best = lang => [...tracks.entries()].filter(([k, t]) => t.lang === lang).sort((a, b) => (!!b[1].manual - !!a[1].manual) || (!!a[1].live - !!b[1].live) || b[1].cues.length - a[1].cues.length)[0]?.[0];
    if (!tracks.get(primaryKey)?.manual) primaryKey = best(CFG.primary) || null;
    if (!tracks.get(secondaryKey)?.manual) secondaryKey = best(CFG.secondary) || null;
    // aviso en el ícono de la extensión
    const p = tracks.get(primaryKey), s2 = tracks.get(secondaryKey);
    const badge = !enabledHere() ? 'OFF' : p ? p.lang.toUpperCase() + (s2 ? '+' + s2.lang.toUpperCase() : '') : '';
    if (badge !== lastBadge && (badge || window.top === window)) { lastBadge = badge; send({ type: 'badge', text: badge }); }
    refresh();
    if (wantServerTr()) scheduleAutoTr();
    checkCoverage();
  }

  /* ---------- medidor de vocabulario ---------- */
  // Igual que vocab.js de la web: qué parte de las palabras del video ya sabés. Tus palabras sabidas y tus horas de estudio
  // llegan desde G'day (bridge.js) cuando abrís la web; se suman las que marcás "Ya la sé" acá. Aparece después de 5 horas.
  let covDone = null;
  function checkCoverage() {
    const p = tracks.get(primaryKey);
    if (!p || p.lang !== 'en' || p.live || p.cues.length < 20 || covDone === pageKey || !enabledHere()) return;
    covDone = pageKey;
    chrome.storage?.local.get(['gdayProfile', 'knownWords'], r => {
      const P0 = r?.gdayProfile || {};
      if ((P0.hours || 0) < 5) return;
      const K = new Set([...(P0.mastered || []), ...(r.knownWords || [])]);
      const toks = [], lower = new Set();
      for (const c of p.cues) for (const raw of cleanCue(c.text).split(/\s+/)) {
        const w = tok(raw);
        if (!w || /\d/.test(w) || !/[a-z]/.test(w)) continue;
        if (/^[^A-Za-z]*[a-z]/.test(raw)) lower.add(w);
        toks.push([w, /^[^A-Za-z]*[A-Z]/.test(raw)]);
      }
      let n = 0, ok = 0;
      for (const [w, cap] of toks) {
        if (cap && !lower.has(w) && w !== 'i' && !STOP.has(w)) continue;  // nombres propios
        n++;
        if (STOP.has(w) || stems(w).some(x => K.has(x))) ok++;
      }
      if (n < 50) return;
      const pct = ok / n, pc = Math.round(pct * 100);
      toast(pct > 0.8 ? `Sabés el ${pc}% de las palabras de este video. Es muy fácil para vos: te conviene uno más difícil para seguir aprendiendo.`
        : pct < 0.55 ? `Sabés el ${pc}% de las palabras de este video. Es muy difícil para vos: te conviene uno más fácil.`
        : `Sabés el ${pc}% de las palabras de este video. Está bien para tu nivel.`, 9000);
    });
  }
  let lastBadge = null;
  window.addEventListener('message', e => {
    const d = e.data;
    if (e.source === window && d?.__gdayCmd === 'debug')  // diagnóstico: window.postMessage({__gdayCmd:'debug'},'*')
      return window.postMessage({ __gday: 'debug', state: { enabled: enabledHere(), video: !!video, primary: tracks.get(primaryKey)?.lang, secondary: tracks.get(secondaryKey)?.lang,
        tracks: [...tracks.entries()].map(([k, t]) => [k.slice(-40), t.lang, t.cues.length]), cur: curIdx, hidden: box.classList.contains('hidden') } }, '*');
    if (e.source !== window || !d || d.__gday !== 'subs') return;
    const cues = parseAny(d.text);
    if (cues.length < 2) return;
    const lang = guessLang(d.url, d.text, cues);
    // los subtítulos en trozos (Disney+, Max) se juntan en una sola pista por carpeta
    const segmented = /\.(vtt|webvtt)(\?|$)/i.test(d.url) && cues.at(-1).end - cues[0].start < 120;
    const key = segmented ? d.url.split('?')[0].replace(/[^/]+$/, '') + lang : d.url.split(/[?#]/)[0] + '|' + lang + '|' + cues.length + '|' + cues[0].start;
    addTrack(key, lang, cues, lang, segmented);
  });

  // pistas <track> del propio video (TED, Coursera, Udemy y muchos otros)
  function scanTextTracks(v) {
    for (const tt of v?.textTracks || []) {
      const lang = (tt.language || '').slice(0, 2).toLowerCase() || guessLang(tt.label || '', '', []);
      if (lang !== CFG.primary && lang !== CFG.secondary) continue;
      if (tt.mode === 'disabled') tt.mode = 'hidden';
      if (CFG.hideNative && tt.mode === 'showing' && primaryKey) tt.mode = 'hidden';
      const list = [...(tt.cues || [])];
      const key = 'track|' + lang + '|' + (tt.label || tt.id);
      if (list.length && list.length !== tracks.get(key)?.cues.length) addTrack(key, lang, list.map(c => ({ start: c.startTime, end: c.endTime, text: cleanLine(c.text || '') })).filter(c => c.text), tt.label);
    }
  }

  /* ---------- video ---------- */
  let video = null;
  const findVideo = () => [...document.querySelectorAll('video')].filter(v => v.clientWidth > 160 && v.clientHeight > 90)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
  const seek = t => window.postMessage({ __gdayCmd: 'seek', t: Math.max(0, t) }, '*');
  const playing = () => video && !video.paused && !video.ended;

  /* ---------- capa visual (shadow DOM para no mezclar estilos con el sitio) ---------- */
  const hostEl = document.createElement('gday-layer');
  const root = hostEl.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
:host{all:initial}
.box{font-family:var(--font)!important;position:fixed;pointer-events:none;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.subs{transition:bottom .2s;position:absolute;left:50%;transform:translateX(-50%);max-width:92%;text-align:center;pointer-events:auto;display:grid;gap:.15em;justify-items:center}
.line{background:var(--bg);color:var(--fg);border-radius:10px;padding:.18em .55em .24em;line-height:1.35;text-shadow:0 1px 2px #000;white-space:pre-wrap}
.l1{font-size:calc(var(--size) * 1px);font-weight:600}
.l2{font-size:calc(var(--size) * .72px);color:var(--fg2)}
.l2.blur{filter:blur(6px);transition:filter .15s}.l2.blur:hover{filter:none}
.w{cursor:pointer;border-radius:5px;padding:0 .06em}.w.learning{text-decoration:underline 2px var(--learn);text-underline-offset:5px}.w.knownw{color:var(--known)}
.box.outline .line{background:transparent!important;text-shadow:0 0 2px #000,0 0 3px #000,1px 1px 2px #000,-1px -1px 2px #000}
.score{font-size:calc(var(--size) * .62px)}.score .ok{color:#5eead4}.score .miss{color:#fb7185;text-decoration:underline}
.subs{font-family:var(--font)}.w:hover,.w.sel{background:#8b5cf6;color:#fff}
.hidden{display:none!important}
.bar{position:absolute;top:10px;right:10px;justify-content:flex-end;flex-wrap:nowrap;display:flex;gap:5px;pointer-events:auto;opacity:0;transition:opacity .2s}
.bar.on{opacity:1}
.bar button,.bar label{all:unset;cursor:pointer;background:rgba(10,7,16,.82);color:#f1ecfb;border:1px solid #ffffff2a;border-radius:9px;padding:6px 9px;font:500 12px/1 -apple-system,sans-serif;display:flex;align-items:center;gap:4px}
.bar button:hover,.bar label:hover{border-color:#8b5cf6}
.bar .on{background:#7c3aed}
.menu{position:absolute;top:calc(100% + 6px);right:0;display:flex;flex-direction:column;gap:4px;background:rgba(10,7,16,.95);border:1px solid #2c2244;border-radius:12px;padding:8px;min-width:230px;max-height:70vh;overflow:auto}
.menu button,.menu label{justify-content:flex-start;padding:8px 10px;border-color:transparent;background:transparent}
.menu button:hover,.menu label:hover{background:#1e1730}
.menu .badge{padding:2px 10px 6px;font:500 11px -apple-system,sans-serif;color:#9a8fb5;opacity:1}
.narrow-only{display:none!important}.box.narrow .narrow-only{display:flex!important}.box.narrow .wide-only{display:none!important}
.box.panel-open .bar{right:calc(min(340px,45%) + 10px)}
.box.panel-open .subs{left:calc((100% - min(340px,45%)) / 2);max-width:calc(100% - min(340px,45%) - 24px)}
.badge{font-size:10px;opacity:.7}
.panel{position:absolute;top:0;right:0;bottom:0;width:min(340px,45%);background:rgba(10,7,16,.94);color:#f1ecfb;pointer-events:auto;display:flex;flex-direction:column;border-left:1px solid #2c2244}
.panel header{display:flex;gap:6px;padding:10px;align-items:center;border-bottom:1px solid #2c2244}
.panel input{all:unset;flex:1;background:#1e1730;border-radius:8px;padding:7px 9px;font-size:13px}
.panel ol{list-style:none;margin:0;padding:6px;overflow-y:auto;flex:1}
.panel li{padding:7px 8px;border-radius:8px;cursor:pointer;font-size:13px;line-height:1.35}
.panel li:hover{background:#1e1730}.panel li.on{background:#2a1d4a}
.panel li small{display:block;color:#9a8fb5;font-size:11px}
.panel li .t{color:#9a8fb5;font-size:11px;margin-right:6px}
.x{all:unset;cursor:pointer;color:#9a8fb5;font-size:18px;padding:0 4px}
.pop{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;position:fixed;z-index:2147483647;width:320px;max-width:90vw;background:#15101f;color:#f1ecfb;border:1px solid #8b5cf6;border-radius:14px;padding:13px 14px;box-shadow:0 18px 40px -8px #000c;pointer-events:auto;font-size:14px;line-height:1.4}
.pop .hw{font-size:19px;font-weight:700;display:flex;justify-content:space-between;align-items:center;gap:8px}
.pop .base{font-size:12px;color:#9a8fb5}
.pop ul{list-style:none;margin:8px 0;padding:0;display:grid;gap:4px;max-height:150px;overflow:auto}
.pop li small{color:#c4b5fd;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-right:4px}
.pop .ctx{margin-top:8px;padding-top:8px;border-top:1px solid #2c2244;font-size:13px}
.pop .ctx b{color:#c4b5fd}
.pop .ctx .tr{color:#9a8fb5;margin-top:3px}
.pop .row{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.pop button,.pop a{all:unset;cursor:pointer;border:1px solid #2c2244;border-radius:9px;padding:6px 10px;font-size:12px;color:#c4b5fd}
.pop button.pri{background:#7c3aed;border-color:#7c3aed;color:#fff}
.pop .muted{color:#9a8fb5;font-size:12px}
.pop.mini{width:auto;display:flex;align-items:center;gap:6px;padding:5px 5px 5px 12px;border-radius:12px}
.pop.mini .mtr{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.pop.mini button{padding:4px 9px}.pop.mini .more{border:0;font-size:16px;line-height:1;padding:2px 6px}
.toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);background:#7c3aed;color:#fff;padding:9px 14px;border-radius:14px;max-width:min(80vw,560px);text-align:center;font:500 13px -apple-system,sans-serif;z-index:2147483647;pointer-events:none;opacity:0;transition:opacity .2s}
.toast.on{opacity:1}
</style>
<div class="box" id="box">
  <div class="subs" id="subs"><div class="line l1" id="l1"></div><div class="line l2" id="l2"></div><div class="line score hidden" id="score"></div></div>
  <div class="bar" id="bar">
    <button data-k="prev" title="Frase anterior">◀</button><button data-k="repeat" title="Repetir la frase">↺</button><button data-k="next" title="Frase siguiente">▶</button>
    <button data-k="slow" class="wide-only" title="Repetir la frase más lento">Lento</button>
    <button data-k="record" class="wide-only" title="Decí la frase y te marca lo que se entendió">Decila vos</button>
    <button data-k="mine" id="mineBtn" title="Agrega a G'day las palabras más útiles de este episodio para tu nivel">+ Palabras</button>
    <button data-k="more" id="moreBtn" title="Más opciones">Más ▾</button>
    <div class="menu hidden" id="menu">
      <span class="badge" id="badge"></span>
      <button data-k="slow" class="narrow-only">Repetir lento</button>
      <button data-k="record" class="narrow-only">Decila vos</button>
      <button data-k="say">Leer la frase en voz alta</button>
      <button data-k="saveLine">Guardar la frase como tarjeta</button>
      <button data-k="mode-pause">Shadowing (pausa en cada frase)</button>
      <button data-k="mode-hide">Subtítulos solo al pausar</button>
      <button data-k="autotr" id="autotrBtn">Traducir con Chrome</button>
      <button data-k="panel">Transcripción</button>
      <label>Cargar subtítulos (.srt)<input type="file" id="file" accept=".srt,.vtt,.ass,.ssa,.ttml,.xml,.dfxp" hidden></label>
    </div>
  </div>
  <div class="panel hidden" id="panel"><header><input id="q" placeholder="Buscar en la transcripción"><button class="x" data-k="panel">×</button></header><ol id="list"></ol></div>
</div>
<div class="pop hidden" id="pop"></div>
<div class="toast" id="toast"></div>`;
  const $ = id => root.getElementById(id);
  const box = $('box'), l1 = $('l1'), l2 = $('l2'), pop = $('pop');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg, ms = 2200) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
  const FONTS = { system: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif', serif: 'Georgia,"Times New Roman",serif',
    rounded: '"SF Pro Rounded","Nunito","Varela Round",-apple-system,sans-serif', mono: '"SF Mono",Menlo,Consolas,monospace', dyslexic: '"OpenDyslexic","Comic Sans MS",sans-serif' };
  let sizeFactor = 1;
  function styleVars() {
    const hex = CFG.bgColor.replace('#', ''), [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) || 0);
    const vars = { '--size': 26 * CFG.size / 100 * sizeFactor, '--fg': CFG.color, '--fg2': CFG.color2, '--bg': `rgba(${r},${g},${b},${CFG.bgAlpha / 100})`,
      '--font': FONTS[CFG.font] || FONTS.system, '--learn': CFG.colorLearning, '--known': CFG.colorKnown };
    for (const [k, v] of Object.entries(vars)) box.style.setProperty(k, v);
    box.classList.toggle('outline', CFG.textStyle === 'outline');
  }
  styleVars();
  let nativeStyle = null;
  const NATIVE = {
    'netflix.com': '.player-timedtext{display:none!important}', 'youtube.com': '.ytp-caption-window-container{display:none!important}',
    'primevideo.com': '.atvwebplayersdk-captions-overlay{display:none!important}', 'amazon.': '.atvwebplayersdk-captions-overlay{display:none!important}',
    'disneyplus.com': '.dss-subtitle-renderer-wrapper,.hive-subtitle-renderer-wrapper{display:none!important}',
    'max.com': '[data-testid="CueBoxContainer"]{display:none!important}', 'crunchyroll.com': '#velocity-canvas{display:none!important}',
  };
  function mount() {
    const parent = document.fullscreenElement || document.webkitFullscreenElement || document.documentElement;
    if (hostEl.parentNode !== parent) parent.appendChild(hostEl);
    const want = enabledHere() && primaryKey && CFG.hideNative;
    const css = Object.entries(NATIVE).find(([k]) => host.includes(k))?.[1];
    if (want && css && !nativeStyle) { nativeStyle = document.createElement('style'); nativeStyle.textContent = css + 'video::cue{opacity:0!important}'; document.documentElement.appendChild(nativeStyle); }
    if (!want && nativeStyle) { nativeStyle.remove(); nativeStyle = null; }
  }
  document.addEventListener('fullscreenchange', mount);
  document.addEventListener('webkitfullscreenchange', mount);

  /* ---------- frase actual ---------- */
  let loopIdx = -1, loops = 0, slowRestore = null, controlsUp = false;
  let curIdx = -1, stoppedAt = -1, hovering = false, pausedByUs = false, barTimer = 0;
  const P = () => tracks.get(primaryKey)?.cues || [];
  const S2 = () => tracks.get(secondaryKey)?.cues || [];
  const idxAt = t => { const c = P(); let lo = 0, hi = c.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].start <= t) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  const secondaryFor = cue => cue ? S2().filter(e => Math.min(cue.end, e.end) - Math.max(cue.start, e.start) > Math.min(.3, (cue.end - cue.start) / 3)).map(e => e.text).join(' ') : '';
  const lineTr = new Map();
  const statusClass = w => { const st = (CFG.wordColors || CFG.showKnown) ? wordStatus(w) : '';
    return st === 'learning' && CFG.wordColors ? ' learning' : st === 'known' && CFG.showKnown ? ' knownw' : ''; };
  function renderLine() {
    const cue = P()[curIdx], t = video ? video.currentTime + offset : 0;
    const active = cue && t <= cue.end + 0.4;
    l1.innerHTML = active ? cue.text.split(/\s+/).map((w, i) => `<span class="w${statusClass(w)}" data-i="${i}">${esc(w)}</span>`).join(' ') : '';
    let sec = active ? secondaryFor(cue) : '';
    if (active && !sec && !secondaryKey && CFG.showSecondary && autoTr) sec = lineTr.get(cue.text) ?? (serverTr ? '' : (translateLine(cue.text), ''));
    l2.textContent = sec;
    l1.classList.toggle('hidden', !active || !CFG.showPrimary);
    l2.classList.toggle('hidden', !sec || !CFG.showSecondary);
    l2.classList.toggle('blur', CFG.blurSecondary);
    if (!$('panel').classList.contains('hidden')) markPanel();
    if (scoreFor !== curIdx) $('score').classList.add('hidden');
  }
  let scoreFor = -1;
  let autoTr = false;

  // Sin subtítulos en español: el servidor de G'day (Groq) traduce toda la pista de a tandas,
  // empezando por la frase actual. Si no puede, queda el botón del traductor de Chrome.
  let serverTr = false, trRunning = false, trJob = 0, trTimer = 0, trFailed = false, trForced = false, trTries = 0;
  const wantServerTr = () => (CFG.autoTranslate || trForced) && !trFailed && primaryKey && !secondaryKey && CFG.secondary === 'es' && CFG.primary === 'en' && enabledHere();
  function scheduleAutoTr(ms = 800) { clearTimeout(trTimer); trTimer = setTimeout(autoTranslate, ms); }
  // un pedido puede fallar por una vez (el servicio de fondo estaba dormido, sin internet un rato): se reintenta antes de rendirse
  const sendTr = async lines => {
    for (let k = 0; k < 3; k++) {
      const r = await send({ type: 'translate', lines });
      if (r?.es) return r;
      await new Promise(res => setTimeout(res, 1500 * (k + 1)));
    }
    return null;
  };
  async function autoTranslate() {
    if (trRunning || !wantServerTr()) return;
    const job = trJob, cues = P();
    const missing = [...new Set(cues.slice(Math.max(0, curIdx)).concat(cues.slice(0, Math.max(0, curIdx))).map(c => c.text).filter(t => t && !lineTr.has(t)))];
    if (!missing.length) return;
    trRunning = true; serverTr = true; autoTr = true; scheduleBadge();
    try {
      for (let i = 0; i < missing.length; i += 40) {
        const lines = missing.slice(i, i + 40);
        const r = await sendTr(lines);
        if (job !== trJob) return;
        if (!r?.es) {
          // se vuelve a probar más tarde; recién después de varios intentos se pasa al traductor de Chrome
          if (++trTries < 4) { trRunning = false; return scheduleAutoTr(15000 * trTries); }
          if (!lineTr.size) { serverTr = false; autoTr = false; trFailed = true; scheduleBadge(); }
          return;
        }
        trTries = 0;
        lines.forEach((t, k) => lineTr.set(t, r.es[k] || ''));
        renderLine();
      }
    } finally { if (job === trJob) trRunning = false; }
    if (job === trJob && P().some(c => !lineTr.has(c.text))) scheduleAutoTr();  // la pista siguió creciendo
  }
  async function translateLine(text) {
    if (lineTr.has(text)) return;
    lineTr.set(text, '');
    const r = await translate(text);
    if (r.text) { lineTr.set(text, r.text); renderLine(); } else { lineTr.delete(text); if (r.error) autoTr = false; }
  }

  function refresh() {
    mount();
    const show = enabledHere() && video && primaryKey;
    box.classList.toggle('hidden', !show);
    if (show) { scheduleBadge(); renderLine(); }
  }
  function scheduleBadge() {
    const p = tracks.get(primaryKey), s = tracks.get(secondaryKey);
    $('badge').textContent = `${p ? p.lang.toUpperCase() : '–'}${s ? ' + ' + s.lang.toUpperCase() : autoTr ? ' + traducción' : ''}`;
    root.querySelector('[data-k="mode-pause"]').classList.toggle('on', CFG.autoPause);
    root.querySelector('[data-k="mode-hide"]').classList.toggle('on', CFG.onlyOnPause);
    $('autotrBtn').classList.toggle('hidden', !!secondaryKey);
    $('autotrBtn').classList.toggle('on', autoTr);
  }

  /* ---------- subtítulos leídos de la pantalla (cuando el sitio no deja ver el archivo) ---------- */
  const SCREEN_SEL = {
    'netflix.': '.player-timedtext-text-container', 'youtube.': '.ytp-caption-window-container .caption-window',
    'primevideo.': '.atvwebplayersdk-captions-text', 'amazon.': '.atvwebplayersdk-captions-text',
    'disneyplus.': '.dss-subtitle-renderer-cue-window, .hive-subtitle-renderer-cue-window', 'max.com': '[data-testid="CueBoxContainer"]',
  };
  const GENERIC_SEL = '.vjs-text-track-display, .jw-text-track-display, .jw-captions, .plyr__captions, .shaka-text-container, .bmpui-ui-subtitle-overlay, .fp-captions, [class*="caption" i], [class*="subtitle" i]';
  let domCue = null, seekGuard = 0;
  function readScreen() {
    if (Date.now() < seekGuard) return;  // justo después de saltar, la pantalla todavía muestra el texto anterior
    if ([...tracks.values()].some(t => !t.live && t.lang === CFG.primary)) return;  // ya hay un archivo: es más preciso
    const site = Object.entries(SCREEN_SEL).find(([k]) => host.includes(k))?.[1];
    const vr = video.getBoundingClientRect();
    let els = [...document.querySelectorAll(site || GENERIC_SEL)];
    if (!site) els = els.filter(el => {  // en sitios desconocidos, solo texto visible encima del video
      if (el.closest('button,a,input,select,[role=button],[role=menu],[role=dialog],nav,header') || el.querySelector('button,input,select')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.bottom > vr.top && r.top < vr.bottom && r.right > vr.left && r.left < vr.right;
    }).filter((el, _, all) => !all.some(o => o !== el && o.contains(el)));
    const text = cleanLine(els.map(el => el.innerText || el.textContent || '').join(' ')).slice(0, 300);
    const t = video.currentTime, key = 'screen';
    if (domCue && (text !== domCue.text || t < domCue.start - 0.5)) { domCue.end = Math.max(domCue.start + 0.3, t); domCue = null; }
    if (!text || text.length < 2 || domCue) return;
    let tr = tracks.get(key);
    if (!tr) { tr = { lang: CFG.primary, cues: [], label: 'pantalla', live: true }; tracks.set(key, tr); }
    // la frase ya se había leído (volviste atrás o saltaste a la mitad): se reutiliza en vez de duplicarla
    const again = tr.cues.find(c => c.text === text && t >= c.start - 0.5 && t <= Math.max(c.end, c.start + 8) + 0.5);
    domCue = again || { start: t, end: t + 30, text };
    if (!again) { tr.cues.push(domCue); tr.cues.sort((a, b) => a.start - b.start); }
    if (tr.cues.length >= 6 && tr.cues.length % 6 === 0) { const g = guessLang('', '', tr.cues); if (g !== 'other') tr.lang = g; }
    chooseTracks();
  }

  // Tiempo de inmersión para G'day: cuenta mientras el video corre con subtítulos en inglés y la pestaña está a la vista.
  // Se manda de a pedacitos al servicio de fondo, que lo guarda hasta que abrís G'day (ver bridge.js).
  let watchMs = 0, watchLast = 0;
  function countWatch() {
    const now = Date.now(), dt = now - (watchLast || now); watchLast = now;
    if (dt <= 1000 && playing() && document.visibilityState === 'visible' && tracks.get(primaryKey)?.lang === 'en') watchMs += dt;
    if (watchMs >= 15000) flushWatch();
  }
  function flushWatch() {
    const sec = Math.floor(watchMs / 1000);
    if (sec < 1) return;
    watchMs -= sec * 1000; send({ type: 'watch', sec });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushWatch(); });
  addEventListener('pagehide', flushWatch);
  function tick() {
    if (location.href !== pageKey && !location.hostname.includes('crunchyroll')) {  // otro video en sitios de una sola página
      const sameVideo = location.hostname.includes('youtube') && new URL(location.href).searchParams.get('v') === new URL(pageKey).searchParams.get('v');
      pageKey = location.href;
      if (!sameVideo) { tracks = new Map(); primaryKey = secondaryKey = null; curIdx = -1; lineTr.clear(); domCue = null; trJob++; trRunning = false; serverTr = false; trFailed = false; trForced = false; trTries = 0; autoTr = false; }
    }
    const v = findVideo();
    if (v !== video) { video = v; curIdx = -1; if (v && CFG.defaultRate !== 1) v.playbackRate = CFG.defaultRate; v?.addEventListener('seeking', () => { seekGuard = Date.now() + 500; if (domCue) { domCue.end = Math.max(domCue.start + 0.3, Math.min(domCue.end, domCue.start + 8)); domCue = null; } }); refresh(); }
    if (!video) return;
    scanTextTracks(video);
    if (enabledHere()) readScreen();
    if (!enabledHere() || !primaryKey) return;
    countWatch();
    const r = video.getBoundingClientRect();
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    box.classList.toggle('narrow', r.width < 560);
    const f = Math.min(1.4, Math.max(0.55, r.width / 900));
    if (Math.abs(f - sizeFactor) > 0.03) { sizeFactor = f; styleVars(); }
    const subsEl = $('subs');
    if (CFG.position === 'top') { subsEl.style.top = CFG.pos + '%'; subsEl.style.bottom = 'auto'; } else { subsEl.style.bottom = (CFG.pos + (controlsUp ? 9 : 0)) + '%'; subsEl.style.top = 'auto'; }
    const t = video.currentTime + offset, idx = idxAt(t), cue = P()[curIdx];
    // después de un salto manual solo se actualiza la frase: no se repite ni se pausa la anterior
    if (Date.now() < seekGuard && idx !== curIdx) { curIdx = idx; loopIdx = idx; loops = 0; stoppedAt = -1; renderLine(); return; }
    // repetir cada frase varias veces
    const loopBack = () => { if (loopIdx !== curIdx) { loopIdx = curIdx; loops = 0; } if (loops < CFG.loopCount - 1) { loops++; seek(P()[curIdx].start - offset + 0.01); return true; } return false; };
    if (CFG.loopCount > 1 && playing() && cue && t >= cue.end - 0.12 && loopBack()) return;
    // modo shadowing: pausa al terminar cada frase
    if (CFG.autoPause && playing() && cue && t >= cue.end - 0.12 && stoppedAt !== curIdx) { stoppedAt = curIdx; video.pause(); }
    if (idx !== curIdx) {
      if (CFG.loopCount > 1 && playing() && curIdx >= 0 && idx === curIdx + 1 && loopBack()) return;
      if (CFG.autoPause && playing() && curIdx >= 0 && stoppedAt !== curIdx && idx === curIdx + 1) { stoppedAt = curIdx; video.pause(); return; }
      curIdx = idx; loopIdx = idx; loops = 0; renderLine();
    } else if (cue && t > cue.end + 0.4 && l1.innerHTML) renderLine();
    $('subs').classList.toggle('hidden', CFG.onlyOnPause && playing() && !hovering);
    if (slowRestore && (curIdx !== slowRestore.idx || t > (P()[curIdx]?.end ?? 0) + 0.2)) { video.playbackRate = slowRestore.rate; slowRestore = null; }
  }
  setInterval(tick, 120);
  document.addEventListener('mousemove', e => {
    if (!video || box.classList.contains('hidden')) return;
    const r = video.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      $('bar').classList.add('on'); clearTimeout(barTimer); barTimer = setTimeout(() => { if ($('menu').classList.contains('hidden')) { $('bar').classList.remove('on'); controlsUp = false; } }, 2500); controlsUp = true;
    }
  }, { passive: true });

  /* ---------- navegación ---------- */
  const jump = i => { const c = P()[i]; if (!c) return; stoppedAt = -1; loopIdx = i; loops = 0; seek(c.start - offset + 0.01); if (video?.paused) video.play(); };
  const prevLine = () => { const t = (video?.currentTime || 0) + offset, c = P()[curIdx]; jump(c && t - c.start < 1.2 ? curIdx - 1 : curIdx); };
  const nextLine = () => jump(curIdx + 1);
  const repeatLine = () => jump(Math.max(0, curIdx));
  const slowLine = () => { if (!video || curIdx < 0) return; slowRestore = { idx: Math.max(0, curIdx), rate: slowRestore?.rate ?? video.playbackRate };
    video.playbackRate = CFG.slowRate; jump(Math.max(0, curIdx)); toast(`Repitiendo a ${CFG.slowRate}x`); };
  function speak(text) {
    const u = new SpeechSynthesisUtterance(text), voices = speechSynthesis.getVoices();
    u.voice = voices.find(v => v.voiceURI === CFG.ttsVoice) || voices.find(v => /en[-_]AU/i.test(v.lang)) || null;
    u.lang = u.voice?.lang || 'en-AU'; u.rate = CFG.ttsRate; speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  const sayLine = () => { const c = P()[curIdx]; if (!c) return; if (playing()) { video.pause(); pausedByUs = true; } speak(c.text); };
  // decir la frase: el reconocimiento de voz de Chrome compara lo que dijiste con el subtítulo
  const norm = w => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '');
  function compareWords(target, said) {
    const shown = target.split(/\s+/), a = shown.map(norm), b = said.split(/\s+/).map(norm).filter(Boolean);
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const hit = Array(a.length).fill(false);
    for (let i = a.length, j = b.length; i && j;) { if (a[i - 1] === b[j - 1]) { hit[i - 1] = true; i--; j--; } else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--; }
    return { shown, hit, score: a.length ? hit.filter(Boolean).length / a.length : 0 };
  }
  function recordLine() {
    const c = P()[curIdx], SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!c) return;
    if (!SR) return toast('Este navegador no reconoce voz');
    if (playing()) video.pause();
    const rec = new SR(); rec.lang = { en: 'en-AU', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', it: 'it-IT', de: 'de-DE', ja: 'ja-JP' }[CFG.primary] || 'en-US';
    const sc = $('score'); scoreFor = curIdx; sc.classList.remove('hidden'); sc.textContent = 'Escuchando… decí la frase';
    rec.onresult = e => {
      const said = e.results[0][0].transcript, r = compareWords(c.text, said);
      sc.innerHTML = `<b>${Math.round(r.score * 100)}%</b> · ${r.shown.map((w, i) => `<span class="${r.hit[i] ? 'ok' : 'miss'}">${esc(w)}</span>`).join(' ')}`;
    };
    rec.onerror = e => { sc.textContent = e.error === 'not-allowed' ? 'Permití el micrófono para este sitio' : 'No te escuché, probá de nuevo'; };
    try { rec.start(); } catch { sc.textContent = 'No se pudo usar el micrófono'; }
  }
  async function saveLine() {
    const c = P()[curIdx]; if (!c) return;
    let tr = secondaryFor(c) || lineTr.get(c.text) || '';
    if (!tr) tr = (await Promise.race([translate(c.text), new Promise(r => setTimeout(() => r({}), 3000))])).text || '';
    const r = await send({ type: 'save', item: { word: c.text, tr, ctx: '', ctxTr: '', kind: 'frase', url: location.href, title: document.title, t: video ? Math.round(video.currentTime) : null } });
    toast(r?.dup ? 'Esa frase ya estaba guardada' : r?.gday ? 'Frase guardada en tus tarjetas' : r?.ok ? 'Frase guardada en tu libreta' : 'No se pudo guardar');
  }

  /* ---------- "+ Palabras": minado automático del episodio ---------- */
  // Recorre todos los subtítulos en inglés del episodio, cuenta qué palabras se repiten y elige las más útiles para tu nivel:
  // saca las palabras muy comunes, los nombres propios y las que ya tenés en G'day (tu perfil llega por bridge.js cuando abrís la web).
  // Cada tarjeta lleva la palabra, una frase real del episodio y su traducción (la de la plataforma si existe).
  const STOP = new Set(`a about above after again against all almost alone along already also always am an and another any anybody anyone anything anyway are aren't around as ask asked at away back bad be because been before being below best better between big both but by call called came can can't cannot come comes coming could couldn't day did didn't do does doesn't doing don't done down each else even ever every everybody everyone everything few find first for from get gets getting give go goes going gone gonna good got gotta great guy guys had hadn't has hasn't have haven't having he he'd he'll he's hear hello help her here hers herself hey hi him himself his hmm how i i'd i'll i'm i've if in into is isn't it it's its itself just keep kind know known last leave let let's life like little long look looking lot made make man many may maybe me mean men might mine more most mr mrs much must my myself need never new next nice no nobody none nor not nothing now of off oh ok okay old on once one only or other our ours ourselves out over own people place please put really right said same saw say says see seen she she'd she'll she's should shouldn't so some somebody someone something sorry still stuff such sure take talk tell than thank thanks that that's the their theirs them themselves then there there's these they they'd they'll they're they've thing things think this those though thought through time to today together told too tonight try trying two uh um under until up upon us very wait want wanted wanna was wasn't way we we'd we'll we're we've well went were weren't what what's when where where's whether which while who who's whole whom why will with without woman won't work would wouldn't yeah yes yet you you'd you'll you're you've your yours yourself yourselves`.split(' '));
  const showTitle = () => {
    const nf = document.querySelector('[data-uia="video-title"] h4, [data-uia="video-title"]')?.textContent;
    const t = (nf || document.title || '').replace(/\s*[-|·–]\s*(YouTube|Netflix|Prime Video|Disney\+|Max|Crunchyroll)\s*$/i, '').replace(/^\(\d+\)\s*/, '').trim();
    return (t || host).slice(0, 60).replace(/::/g, ':');
  };
  const cleanCue = t => String(t).replace(/<[^>]+>/g, ' ').replace(/\[[^\]]*\]|\([^)]*\)|♪[^♪]*♪?/g, ' ').replace(/^\s*[-–]?\s*[A-Z][A-Z .']{1,20}:\s*/gm, ' ').replace(/\s+/g, ' ').trim();
  let mining = false;
  async function mineWords() {
    if (mining) return;
    const cues = P();
    if (!cues.length) return toast('Todavía no hay subtítulos en inglés de este video');
    if (tracks.get(primaryKey)?.lang !== 'en') return toast('Los subtítulos principales tienen que estar en inglés');
    mining = true; $('mineBtn').textContent = 'Buscando…';
    try {
      const prof = await new Promise(r => chrome.storage?.local.get(['gdayProfile', 'words', 'knownWords'], x => r(x || {})));
      const P0 = prof.gdayProfile || {}, level = P0.level || 1, levels = P0.levels || {};
      const have = new Set([...(P0.known || []), ...(prof.knownWords || []), ...(prof.words || []).map(w => w.word.toLowerCase())]);
      const inHave = w => stems(w).some(x => have.has(x));
      // 1) contar palabras del episodio
      const info = new Map();  // clave -> { n, lower, cues: [índices] }
      cues.forEach((c, i) => {
        const text = cleanCue(c.text);
        text.split(/\s+/).forEach((raw, k) => {
          const w = tok(raw);
          if (w.length < 3 || /\d/.test(w) || STOP.has(w) || w.includes("'")) return;
          const key = IRR[w] || w;
          if (STOP.has(key)) return;
          const e = info.get(key) || { n: 0, lower: 0, cues: [] };
          e.n++;
          // si nunca aparece en minúscula, es un nombre propio (Will, Hopper) y no se elige
          if (/^[^A-Za-z]*[a-z]/.test(raw)) e.lower++;
          if (e.cues.at(-1) !== i) e.cues.push(i);
          info.set(key, e);
        });
      });
      // 2) puntaje: cuántas veces se repite × qué tan de tu nivel es
      const lvlOf = w => stems(w).map(x => levels[x]).find(Boolean);
      const weight = w => {
        const l = lvlOf(w);
        if (l) return l < level ? 0 : l === level ? 3 : l === level + 1 ? 1.5 : 0.7;
        return [0.5, 1.2, 2][level - 1] || 1;  // palabras fuera de la lista de G'day: más útiles cuanto más avanzás
      };
      const ranked = [...info.entries()]
        .filter(([w, e]) => e.lower > 0 && e.n >= 2 && !inHave(w))
        .map(([w, e]) => ({ w, e, score: Math.min(e.n, 12) * weight(w) }))
        .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 30);
      if (!ranked.length) return toast('No encontré palabras nuevas para tu nivel en este episodio', 3500);
      // 3) diccionario: forma base y traducción; las que no están (nombres, ruidos) se descartan
      const want = level === 1 ? 8 : level === 2 ? 10 : 12, out = [], seen = new Set();
      for (let i = 0; i < ranked.length && out.length < want; i += 6) {
        const res = await Promise.all(ranked.slice(i, i + 6).map(x => send({ type: 'dict', cands: stems(x.w) })));
        res.forEach((d, k) => {
          const x = ranked[i + k], base = d?.word?.toLowerCase();
          if (!d?.senses?.length || !base || seen.has(base) || have.has(base) || out.length >= want) return;
          seen.add(base);
          // la frase de ejemplo: una de largo mediano, así se entiende sola
          const cand = x.e.cues.map(j => cues[j]).sort((a, b) => Math.abs(cleanCue(a.text).split(' ').length - 9) - Math.abs(cleanCue(b.text).split(' ').length - 9))[0];
          out.push({ word: d.word, tr: d.senses[0].trans.slice(0, 2).join(', '), cue: cand, n: x.e.n });
        });
      }
      if (!out.length) return toast('No encontré palabras nuevas para tu nivel en este episodio', 3500);
      // 4) traducción de cada frase: la de la plataforma; si no hay, la automática
      for (const o of out) {
        o.ctx = cleanCue(o.cue.text);
        o.ctxTr = secondaryFor(o.cue) || lineTr.get(o.cue.text) || (await Promise.race([translate(o.ctx), new Promise(r => setTimeout(() => r({}), 3000))])).text || '';
      }
      const deckName = `Series y pelis::${showTitle()}`;
      const r = await send({ type: 'mine', items: out.map(o => ({ word: o.word, tr: o.tr, ctx: o.ctx, ctxTr: o.ctxTr, kind: 'minada', deckName,
        url: location.href, title: document.title, t: Math.round(o.cue.start) })) });
      if (!r || r.error) return toast('No se pudieron guardar las palabras');
      const list = out.map(o => o.word).join(', ');
      toast(`${r.added} ${r.added === 1 ? 'palabra' : 'palabras'} a “${showTitle()}”: ${list}${r.where === 'opened' ? ' · se pasan a G\'day en segundo plano' : ''}`, 6000);
    } catch (e) { toast('No se pudo buscar palabras'); }
    finally { mining = false; $('mineBtn').textContent = '+ Palabras'; }
  }

  /* ---------- panel de transcripción ---------- */
  function buildPanel() {
    const q = $('q').value.toLowerCase(), sec = S2();
    $('list').innerHTML = P().map((c, i) => [c, i]).filter(([c]) => !q || c.text.toLowerCase().includes(q)).map(([c, i]) => {
      const s = sec.length ? secondaryFor(c) : '';
      return `<li data-i="${i}"><span class="t">${Math.floor(c.start / 60)}:${String(Math.floor(c.start % 60)).padStart(2, '0')}</span>${esc(c.text)}${s ? `<small>${esc(s)}</small>` : ''}</li>`;
    }).join('');
    markPanel(true);
  }
  function markPanel(scroll) {
    root.querySelectorAll('#list li.on').forEach(li => li.classList.remove('on'));
    const li = root.querySelector(`#list li[data-i="${curIdx}"]`);
    if (li) { li.classList.add('on'); if (scroll || !hovering) { const l = $('list'); l.scrollTop = li.offsetTop - l.clientHeight / 3; } }
  }
  $('q').addEventListener('input', buildPanel);
  $('list').addEventListener('click', e => { const li = e.target.closest('li'); if (li) jump(+li.dataset.i); });

  /* ---------- traducción ---------- */
  let trId = 0;
  const trWait = new Map();
  window.addEventListener('message', e => { const d = e.data; if (e.source === window && d?.__gday === 'tr') { trWait.get(d.id)?.(d); trWait.delete(d.id); } });
  const translate = (text, from = CFG.primary, to = CFG.secondary) => new Promise(res => {
    const id = ++trId; trWait.set(id, res);
    window.postMessage({ __gdayCmd: 'tr', id, text, from, to }, '*');
    setTimeout(() => { if (trWait.has(id)) { trWait.delete(id); res({ error: 'timeout' }); } }, 15000);
  });

  /* ---------- diccionario emergente ---------- */
  const tok = w => w.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\-]/g, '').replace(/^'+|'+$/g, '');
  const IRR = { ran: 'run', got: 'get', went: 'go', gone: 'go', made: 'make', took: 'take', taken: 'take', came: 'come', gave: 'give', given: 'give', found: 'find', said: 'say', told: 'tell', knew: 'know', known: 'know', thought: 'think', saw: 'see', seen: 'see', bought: 'buy', brought: 'bring', felt: 'feel', left: 'leave', kept: 'keep', held: 'hold', meant: 'mean', met: 'meet', paid: 'pay', sat: 'sit', spoke: 'speak', wrote: 'write', written: 'write', ate: 'eat', eaten: 'eat', drank: 'drink', slept: 'sleep', lost: 'lose', sent: 'send', built: 'build', fell: 'fall', won: 'win', sold: 'sell', taught: 'teach', caught: 'catch', fought: 'fight', stood: 'stand', heard: 'hear', became: 'become', began: 'begin', begun: 'begin', broke: 'break', broken: 'break', chose: 'choose', drove: 'drive', flew: 'fly', forgot: 'forget', grew: 'grow', hid: 'hide', rode: 'ride', rose: 'rise', shook: 'shake', stole: 'steal', threw: 'throw', thrown: 'throw', woke: 'wake', wore: 'wear', was: 'be', were: 'be', is: 'be', are: 'be', am: 'be', been: 'be', has: 'have', had: 'have', does: 'do', did: 'do', done: 'do', children: 'child', men: 'man', women: 'woman', people: 'person', better: 'good', best: 'good', worse: 'bad', worst: 'bad' };
  const stems = w => [...new Set([w, IRR[w], w.replace(/'s$/, ''), w.replace(/ies$/, 'y'), w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/ied$/, 'y'),
    w.replace(/ed$/, ''), w.replace(/ed$/, 'e'), w.replace(/(.)\1ed$/, '$1'), w.replace(/ing$/, ''), w.replace(/ing$/, 'e'), w.replace(/(.)\1ing$/, '$1'),
    w.replace(/(.)\1{2,}/g, '$1$1'), w.replace(/(.)\1{2,}/g, '$1')])].filter(x => x && x.length > 1);
  function candidates(words, from, to) {
    const t = words.map(tok), out = [];
    if (to > from) out.push(t.slice(from, to + 1).join(' '));
    for (let len = 4; len >= 2; len--) for (let s = Math.max(0, from - len + 1); s <= from && s + len <= t.length; s++) {
      const rest = t.slice(s + 1, s + len).join(' ');
      for (const f of stems(t[s] || '')) out.push(f + ' ' + rest);
    }
    out.push(...stems(t[from]));
    return [...new Set(out)].filter(Boolean).slice(0, 40);
  }
  let popState = null;
  async function openPop(words, from, to, context, anchor, kind) {
    const raw = words.slice(from, to + 1).join(' ').replace(/^[^\w']+|[^\w']+$/g, '');
    if (!raw) return;
    if (kind === 'video' && playing() && CFG.pauseOnLookup) { video.pause(); pausedByUs = true; }
    const st = popState = { raw, context, ctxTr: '', word: raw, tr: '', kind, args: [words, from, to, context, anchor, kind] };
    const full = st.full = CFG.fullPop || openPop.forceFull; openPop.forceFull = false;
    pop.classList.toggle('mini', !full);
    l1.querySelectorAll('.w').forEach((s, k) => s.classList.toggle('sel', kind === 'video' && k >= from && k <= to));
    pop.classList.remove('hidden');
    pop.innerHTML = full ? `<div class="hw"><span>${esc(raw)}</span><button class="x" data-p="close">×</button></div><p class="muted">Buscando…</p>`
      : `<span class="mtr">…</span><button data-p="known">Ya la sé</button><button class="more" data-p="more" title="Ver más">⋯</button>`;
    place(anchor);
    const known = kind === 'video' ? secondaryFor(P()[curIdx]) : '';
    st.ctxTr = known;
    const d = await send({ type: 'dict', cands: candidates(words, from, to) });
    if (popState !== st) return;
    // cuadro chico (por defecto): una sola traducción, "Ya la sé" y ⋯ para ver todo
    if (!full) {
      if (d?.senses?.length) { st.word = d.word; st.tr = d.senses[0].trans[0]; }
      else { const r = await translate(raw); if (popState !== st) return; st.tr = r?.text || ''; }
      const m = pop.querySelector('.mtr'); if (m) m.textContent = st.tr || 'Sin traducción';
      place(anchor);
      if (CFG.autoSave && st.tr) save(st, true);
      return;
    }
    let defs = '';
    if (d?.senses?.length) {
      st.word = d.word; st.tr = d.senses[0].trans.slice(0, 2).join(', ');
      defs = `${d.word !== tok(raw) ? `<div class="base">${d.word.includes(' ') ? 'Expresión' : 'Forma base'}: ${esc(d.word)}</div>` : ''}
        <ul>${d.senses.map(x => `<li><small>${esc(POS[x.pos] || x.pos || '')}</small>${esc(x.trans.join(', '))}</li>`).join('')}</ul>`;
    } else defs = `<p class="muted" id="wtr">${d?.error ? 'Sin conexión con el diccionario de G\'day.' : 'No está en el diccionario.'} Traduciendo…</p>`;
    const hi = esc(context).replace(new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), m => `<b>${m}</b>`);
    pop.innerHTML = `<div class="hw"><span>${esc(st.word)}</span><button class="x" data-p="close">×</button></div>${defs}
      ${context && context !== raw ? `<div class="ctx">${hi}<div class="tr" id="ctxtr">${esc(st.ctxTr)}</div></div>` : ''}
      <div class="row"><button data-p="say">Escuchar</button><button class="pri" data-p="save">Guardar en G'day</button><button data-p="known">Ya la sé</button>
      <a href="${DICTS[CFG.dictSite]?.[1](encodeURIComponent(st.word)) || DICTS.wordreference[1](encodeURIComponent(st.word))}" target="_blank" rel="noopener">${DICTS[CFG.dictSite]?.[0] || 'WordReference'}</a>
      ${CFG.showYouglish ? `<a href="https://youglish.com/pronounce/${encodeURIComponent(st.word)}/english/aus" target="_blank" rel="noopener" title="Escuchala en videos reales">YouGlish</a>` : ''}</div>`;
    place(anchor);
    // la traducción de la frase (y de la palabra si no estaba en el diccionario) llega después, sin frenar el diccionario
    if (!st.ctxTr && context && context !== raw) translate(context).then(r => { if (popState === st && r?.text) { st.ctxTr = r.text; const el = root.getElementById('ctxtr'); if (el) el.textContent = r.text; } });
    if (!st.tr) {
      const r = await translate(raw);
      if (popState !== st) return;
      st.tr = r?.text || '';
      const el = root.getElementById('wtr');
      if (el) el.outerHTML = st.tr ? `<ul><li>${esc(st.tr)}</li></ul>` : `<p class="muted">${r?.error === 'unsupported' ? 'Sin traducción: tu Chrome no trae el traductor incorporado.' : 'No encontré una traducción.'}</p>`;
    }
    if (CFG.autoSave && st.tr) save(st, true);
  }
  const DICTS = {
    wordreference: ['WordReference', w => `https://www.wordreference.com/enes/${w}`],
    cambridge: ['Cambridge', w => `https://dictionary.cambridge.org/dictionary/english-spanish/${w}`],
    spanishdict: ['SpanishDict', w => `https://www.spanishdict.com/translate/${w}`],
    linguee: ['Linguee', w => `https://www.linguee.com/english-spanish/search?query=${w}`],
    google: ['Google Traductor', w => `https://translate.google.com/?sl=en&tl=es&text=${w}`],
    urban: ['Urban Dictionary', w => `https://www.urbandictionary.com/define.php?term=${w}`],
  };
  const POS = { noun: 'sustantivo', verb: 'verbo', adjective: 'adjetivo', adverb: 'adverbio', pronoun: 'pronombre', preposition: 'preposición', conjunction: 'conjunción', interjection: 'interjección', phrase: 'frase', idiom: 'expresión' };
  function place(a) {
    const pw = pop.offsetWidth || 320, ph = pop.offsetHeight || 160;
    let x = Math.min(innerWidth - pw - 10, Math.max(10, a.left + a.width / 2 - pw / 2)), y = a.top - ph - 10;
    if (y < 10) y = Math.min(innerHeight - ph - 10, a.bottom + 10);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function closePop() {
    if (!popState) return;
    popState = null; pop.classList.add('hidden');
    l1.querySelectorAll('.w.sel').forEach(s => s.classList.remove('sel'));
    if (pausedByUs && CFG.resumeAfter && video?.paused) video.play();
    pausedByUs = false;
  }
  async function save(st, auto) {
    const r = await send({ type: 'save', item: { word: st.word, tr: st.tr, ctx: st.context, ctxTr: st.ctxTr, url: location.href, title: document.title, t: video ? Math.round(video.currentTime) : null } });
    if (!auto) toast(r?.gday ? 'Guardada en tus tarjetas de G\'day' : r?.ok ? 'Guardada en tu libreta (abrí G\'day para pasarla a tarjetas)' : 'No se pudo guardar');
  }
  pop.addEventListener('click', e => {
    const k = e.target.closest('[data-p]')?.dataset.p;
    if (k === 'close') closePop();
    if (k === 'more') { openPop.forceFull = true; openPop(...popState.args); return; }
    if (k === 'say') speak(popState.word);
    if (k === 'known') {
      const w = popState.word.toLowerCase();
      chrome.storage?.local.get('knownWords', r => { const set = new Set(r?.knownWords || []); set.add(w); chrome.storage.local.set({ knownWords: [...set] }); });
      toast(`“${popState.word}” marcada como conocida`); closePop();
    }
    if (k === 'save') save(popState, false);
  });

  // pasar el mouse o hacer clic sobre una palabra del subtítulo
  let hoverTimer;
  l1.addEventListener('mouseover', e => {
    const w = e.target.closest('.w'); if (!w || CFG.lookup !== 'hover') return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => wordPop(w), CFG.hoverDelay);
  });
  l1.addEventListener('mouseout', () => clearTimeout(hoverTimer));
  l1.addEventListener('click', e => { const w = e.target.closest('.w'); if (w) wordPop(w); });
  l1.addEventListener('mouseup', () => {  // seleccionar varias palabras = traducir la frase elegida
    const sel = root.getSelection ? root.getSelection() : getSelection();
    const spans = [...l1.querySelectorAll('.w')].filter(s => sel && sel.containsNode?.(s, true));
    if (spans.length > 1) { wordPop(spans[0], +spans.at(-1).dataset.i); sel.removeAllRanges(); }
  });
  function wordPop(w, toIdx) {
    const cue = P()[curIdx]; if (!cue) return;
    const i = +w.dataset.i;
    openPop(cue.text.split(/\s+/), i, toIdx ?? i, cue.text, w.getBoundingClientRect(), 'video');
  }
  $('subs').addEventListener('mouseenter', () => { hovering = true; });
  $('subs').addEventListener('mouseleave', () => { hovering = false; if (CFG.lookup === 'hover') setTimeout(() => { if (!hovering && !pop.matches(':hover')) closePop(); }, 350); });
  pop.addEventListener('mouseleave', () => { if (CFG.lookup === 'hover' && popState?.kind === 'video') setTimeout(() => { if (!hovering && !pop.matches(':hover')) closePop(); }, 350); });

  // traductor en cualquier página: doble clic o seleccionar texto
  document.addEventListener('dblclick', e => {
    if (!CFG.enabled || !CFG.pageTranslate || e.composedPath().includes(hostEl)) return;
    const sel = getSelection(), text = sel?.toString().trim();
    if (!text || text.length > 80 || !/[a-z]/i.test(text)) return;
    const node = sel.anchorNode, full = node?.textContent || text;
    const sentence = (full.match(new RegExp(`[^.!?\\n]*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.!?\\n]*[.!?]?`, 'i')) || [text])[0].trim().slice(0, 300);
    const words = text.split(/\s+/);
    mount(); box.classList.remove('hidden');
    openPop(words, 0, words.length - 1, sentence, sel.getRangeAt(0).getBoundingClientRect(), 'page');
  });
  let swallowClick = 0;
  document.addEventListener('mousedown', e => {
    if (!popState || e.composedPath().includes(hostEl)) return;
    const r = video?.getBoundingClientRect();
    const onVideo = r && popState.kind === 'video' && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const resumes = pausedByUs && CFG.resumeAfter;
    closePop();
    // YouTube, Netflix y otros pausan/reanudan con el clic sobre el video: ese clic se ignora para que el video siga
    if (onVideo && resumes) swallowClick = Date.now() + 700;
  }, true);
  window.addEventListener('click', e => {
    if (Date.now() < swallowClick) { swallowClick = 0; e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);

  /* ---------- botones y archivo ---------- */
  root.addEventListener('click', e => {
    const k = e.target.closest('[data-k]')?.dataset.k;
    if (!k) return;
    if (k === 'more') { $('menu').classList.toggle('hidden'); return; }
    if (k !== 'mode-pause' && k !== 'mode-hide' && k !== 'more') $('menu').classList.add('hidden');
    if (k === 'prev') prevLine();
    if (k === 'slow') slowLine();
    if (k === 'say') sayLine();
    if (k === 'record') recordLine();
    if (k === 'saveLine') saveLine();
    if (k === 'mine') mineWords();
    if (k === 'next') nextLine();
    if (k === 'repeat') repeatLine();
    if (k === 'autotr') {
      if (autoTr) { autoTr = false; serverTr = false; trJob++; trRunning = false; trFailed = true; trForced = false; scheduleBadge(); return renderLine(); }
      // primero el traductor de G'day (no depende de la versión de Chrome)
      if (CFG.primary === 'en' && CFG.secondary === 'es' && primaryKey) {
        trFailed = false; trForced = true; trTries = 0; trJob++; trRunning = false;
        toast('Traduciendo al español…');
        autoTranslate();
        return;
      }
      toast('Activando el traductor de Chrome…');
      translate('hello').then(r => {
        autoTr = !r.error; lineTr.clear(); scheduleBadge(); renderLine();
        toast(r.error ? (r.error === 'unsupported' ? 'Tu Chrome no tiene el traductor incorporado (necesitás Chrome 138 o más nuevo)' : 'No se pudo activar el traductor') : 'Traducción automática activada');
      });
    }
    if (k === 'panel') { const p = $('panel'); p.classList.toggle('hidden'); box.classList.toggle('panel-open', !p.classList.contains('hidden')); if (!p.classList.contains('hidden')) buildPanel(); }
    if (k === 'mode-pause') { setCfg({ autoPause: !CFG.autoPause }); toast(CFG.autoPause ? 'Shadowing: pausa al final de cada frase' : 'Shadowing desactivado'); }
    if (k === 'mode-hide') { setCfg({ onlyOnPause: !CFG.onlyOnPause }); toast(CFG.onlyOnPause ? 'Subtítulos solo al pausar' : 'Subtítulos siempre visibles'); }
  });
  $('file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text(), cues = parseAny(text);
    if (cues.length < 2) return toast('No encontré subtítulos en ese archivo');
    const lang = guessLang(f.name, text, cues), key = 'file|' + f.name;
    tracks.set(key, { lang, cues, label: f.name, manual: true });
    if (lang === CFG.secondary) secondaryKey = key; else primaryKey = key;
    e.target.value = '';
    toast(`Cargados ${cues.length} subtítulos (${lang === CFG.secondary ? 'traducción' : 'principal'})`);
    refresh();
  });

  /* ---------- atajos de teclado ---------- */
  document.addEventListener('keydown', e => {
    if (!enabledHere() || !primaryKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.composedPath()[0]?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.composedPath()[0]?.isContentEditable) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') return closePop();
    const click = sel => () => root.querySelector(sel).click();
    const ACTIONS = {
      prev: prevLine, next: nextLine, repeat: repeatLine, slow: slowLine, say: sayLine, record: recordLine, saveLine,
      panel: click('[data-k="panel"]'), shadow: click('[data-k="mode-pause"]'), onlyPause: click('[data-k="mode-hide"]'),
      toggleTr: () => setCfg({ showSecondary: !CFG.showSecondary }), togglePrim: () => setCfg({ showPrimary: !CFG.showPrimary }),
      offDown: () => { setOffset(offset - 0.25); toast(`Desfase: ${offset.toFixed(2)} s (se guarda para este sitio)`); renderLine(); },
      offUp: () => { setOffset(offset + 0.25); toast(`Desfase: ${offset.toFixed(2)} s (se guarda para este sitio)`); renderLine(); },
      speedDown: () => { const r = Math.max(.3, +(video.playbackRate - .1).toFixed(2)); video.playbackRate = r; toast(`Velocidad ${r}x`); },
      speedUp: () => { const r = Math.min(3, +(video.playbackRate + .1).toFixed(2)); video.playbackRate = r; toast(`Velocidad ${r}x`); },
    };
    const name = Object.keys(CFG.keys).find(n => String(CFG.keys[n] || '').toLowerCase() === k);
    if (name && ACTIONS[name]) { e.preventDefault(); e.stopImmediatePropagation(); ACTIONS[name](); }
  }, true);

  // mensajes desde el popup de la extensión
  chrome.runtime?.onMessage.addListener((m, _s, reply) => {
    if (m.type === 'status') reply({ host, video: !!video, tracks: [...tracks.values()].map(t => ({ lang: t.lang, n: t.cues.length, label: t.label, live: !!t.live, manual: !!t.manual })), primary: tracks.get(primaryKey)?.lang, secondary: tracks.get(secondaryKey)?.lang });
    if (m.type === 'autotr') { autoTr = true; lineTr.clear(); translate('hello').then(r => { autoTr = !r.error; reply({ ok: !r.error, error: r.error }); renderLine(); scheduleBadge(); }); return true; }
  });
  let learning = new Set(), knownSet = new Set();
  const wordStatus = w => { const t = tok(w); if (!t) return ''; const st = stems(t);
    if (st.some(x => knownSet.has(x))) return 'known'; if (st.some(x => learning.has(x))) return 'learning'; return ''; };
  const isKnown = () => false;
  const loadKnown = () => chrome.storage?.local.get(['words', 'offsets', 'knownWords'], r => {
    learning = new Set((r?.words || []).filter(w => w.kind !== 'frase').map(w => w.word.toLowerCase()));
    knownSet = new Set(r?.knownWords || []);
    if (r?.offsets?.[host] != null) offset = r.offsets[host];
    renderLine();
  });
  chrome.storage?.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.words || ch.knownWords)) loadKnown(); });
  loadKnown();
  loadCfg();
  window.postMessage({ __gdayCmd: 'replay' }, '*');  // pide los subtítulos que se bajaron antes de que arrancara esta parte
})();
