// G'day · menú de la extensión: estado, ajustes y libreta de palabras.
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
const KEY_NAMES = { prev: 'Frase anterior', repeat: 'Repetir la frase', next: 'Frase siguiente', slow: 'Repetir más lento', say: 'Leer la frase con voz',
  record: 'Decir la frase (puntaje)', saveLine: 'Guardar la frase', shadow: 'Shadowing', onlyPause: 'Subtítulos solo al pausar', panel: 'Transcripción',
  toggleTr: 'Mostrar u ocultar traducción', togglePrim: 'Mostrar u ocultar inglés', speedDown: 'Más lento', speedUp: 'Más rápido',
  offDown: 'Subtítulos antes', offUp: 'Subtítulos después' };
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let CFG = { ...DEF }, site = '';
const LANG = { en: 'inglés', es: 'español', other: 'otro idioma', pt: 'portugués', fr: 'francés' };

async function init() {
  CFG = merge((await chrome.storage.sync.get('gday')).gday);
  fillVoices();
  renderKeys();
  showPower();
  document.querySelectorAll('[data-c]').forEach(el => {
    const v = CFG[el.dataset.c];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
  // subtítulos en español: visibles, difuminados u ocultos (por dentro son showSecondary y blurSecondary)
  $('#trMode').value = !CFG.showSecondary ? 'hide' : CFG.blurSecondary ? 'blur' : 'show';
  $('#trMode').onchange = e => { const m = e.target.value; CFG.showSecondary = m !== 'hide'; CFG.blurSecondary = m === 'blur'; saveCfg(); };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try { site = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
  $('#site').textContent = site || 'este sitio';
  $('#siteOn').checked = !CFG.disabledSites.includes(site);
  // ¿está G'day abierto?
  chrome.runtime.sendMessage({ type: 'ping' }, r => {
    const ok = r && !r.error;
    $('#server').textContent = ok ? "G'day conectado" : 'Sin conexión';
    $('#server').className = 'pill ' + (ok ? 'ok' : 'off');
    $('#server').title = !ok ? 'Sin internet: el diccionario completo no está disponible por ahora'
      : r.local ? 'Diccionario completo y tarjetas disponibles'
      : 'Diccionario completo disponible. Las palabras pasan a tus tarjetas cuando abrís G\'day' + (r.pending ? ` (${r.pending} pendientes)` : '');
    if (ok && r.synced) renderWords();
  });
  // ¿qué encontró en esta pestaña?
  chrome.tabs.sendMessage(tab.id, { type: 'status' }, s => {
    const here = $('#here');
    const reload = '<div class="btns"><button class="btn" id="reload">Recargar la pestaña</button></div>';
    if (chrome.runtime.lastError || !s) {
      here.innerHTML = /^(chrome|edge|about|chrome-extension):/.test(tab.url || '') || /chromewebstore|chrome\.google\.com\/webstore/.test(tab.url || '')
        ? '<p>Chrome no deja que las extensiones funcionen en esta página.</p>'
        : `<p>G'day todavía no está activo en esta pestaña. Pasa cuando la página se abrió antes de instalar o actualizar la extensión.</p>${reload}`;
      return bindReload(tab);
    }
    if (!CFG.enabled || CFG.disabledSites.includes(site)) { here.innerHTML = '<p>G\'day está <b>desactivado</b> en este sitio. Activalo abajo, en Ajustes.</p>'; return; }
    if (!s.tracks.length) {
      here.innerHTML = s.video
        ? `<p><b>Hay un video, pero todavía no hay subtítulos.</b></p>
           <p>1. Activá los subtítulos en ${LANG[CFG.primary]} en el reproductor del sitio (el botón CC o “Subtítulos”).</p>
           <p>2. Si el video no tiene subtítulos, tocá <b>.srt</b> en la barra de G'day sobre el video y cargá un archivo.</p>
           <p>3. Si los subtítulos están grabados en la imagen, no hay texto para leer.</p>${reload}`
        : `<p>No encontré un video en esta página. Si hay uno, dale play y volvé a abrir este menú.</p><p>Igual podés hacer doble clic sobre cualquier palabra para traducirla.</p>`;
      return bindReload(tab);
    }
    const src = t => t.manual ? 'archivo que cargaste' : t.live ? 'leídos de la pantalla' : 'archivo del sitio';
    here.innerHTML = `<p><b>${s.primary ? 'Subtítulos en ' + LANG[s.primary] : 'Sin subtítulos en ' + LANG[CFG.primary]}</b>${s.secondary ? ' + traducción en ' + LANG[s.secondary] : ''}</p>
      <p>Encontrados: ${s.tracks.map(t => `${LANG[t.lang] || t.lang}, ${t.n} líneas (${src(t)})`).join(' · ')}.</p>
      ${s.tracks.some(t => t.live) ? '<p>Los subtítulos leídos de la pantalla se van armando mientras mirás: para volver a frases anteriores, tienen que haber pasado.</p>' : ''}
      ${s.secondary ? '' : '<p>Para la traducción, activá una vez los subtítulos en español en el reproductor, o tocá <b>Traducir</b> en la barra de G\'day sobre el video.</p>'}`;
  });
  renderWords();
}

function bindReload(tab) { const b = document.getElementById('reload'); if (b) b.onclick = () => { chrome.tabs.reload(tab.id); window.close(); }; }

function saveCfg() { chrome.storage.sync.set({ gday: CFG }); showPower(); }

// interruptor general de arriba
function showPower() {
  $('#power').classList.toggle('on', CFG.enabled);
  $('#powerTxt').textContent = CFG.enabled ? 'Encendida' : 'Apagada';
  document.body.classList.toggle('off', !CFG.enabled);
  const box = document.querySelector('[data-c="enabled"]'); if (box) box.checked = CFG.enabled;
}
$('#power').addEventListener('click', () => { CFG.enabled = !CFG.enabled; saveCfg(); });

function fillVoices() {
  const sel = $('#voices'), put = () => {
    const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
    sel.innerHTML = '<option value="">Automática (australiana si hay)</option>' + vs.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${v.lang})</option>`).join('');
    sel.value = CFG.ttsVoice || '';
  };
  put(); speechSynthesis.onvoiceschanged = put;
}

// editor de atajos: se toca el casillero y se aprieta la tecla
function renderKeys() {
  const shown = k => k === ' ' ? 'espacio' : k;
  $('#keys').innerHTML = Object.entries(KEY_NAMES).map(([n, label]) => `<input readonly data-key="${n}" value="${esc(shown(CFG.keys[n] || ''))}"><span>${label}</span>`).join('')
    + '<span></span><span><button class="btn" id="resetKeys" style="margin-top:6px">Atajos de fábrica</button></span>';
  document.querySelectorAll('[data-key]').forEach(inp => inp.addEventListener('keydown', e => {
    e.preventDefault();
    if (['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
    const key = e.key === 'Backspace' || e.key === 'Delete' ? '' : e.key.toLowerCase();
    if (key) for (const n of Object.keys(CFG.keys)) if (CFG.keys[n] === key) CFG.keys[n] = '';  // una tecla, una función
    CFG.keys[inp.dataset.key] = key; saveCfg(); renderKeys();
  }));
  $('#resetKeys').onclick = () => { CFG.keys = { ...DEF.keys }; saveCfg(); renderKeys(); };
}
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'siteOn') {
    CFG.disabledSites = el.checked ? CFG.disabledSites.filter(s => s !== site) : [...new Set([...CFG.disabledSites, site])];
    return saveCfg();
  }
  const k = el.dataset.c;
  if (!k) return;
  CFG[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' || 'num' in el.dataset ? +el.value : el.value;
  saveCfg();
});
document.addEventListener('input', e => { if (e.target.type === 'range' && e.target.dataset.c) { CFG[e.target.dataset.c] = +e.target.value; saveCfg(); } });

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button, .tab').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); $('#' + b.dataset.tab).classList.add('on');
}));

async function renderWords() {
  const { words = [] } = await chrome.storage.local.get('words');
  $('#words').innerHTML = words.length ? words.slice(0, 200).map((w, i) => `<li><span class="dot ${w.synced ? '' : 'no'}" title="${w.synced ? 'En tus tarjetas' : 'Pendiente'}"></span>
    <div><b>${esc(w.word)}</b> · ${esc(w.tr || '—')}<small>${esc(w.ctx || '')}</small></div><button data-del="${i}" title="Borrar">×</button></li>`).join('')
    : '<li><div><small>Todavía no guardaste palabras. Pasá el mouse sobre una palabra de los subtítulos.</small></div></li>';
}
$('#words').addEventListener('click', async e => {
  const i = e.target.dataset.del; if (i == null) return;
  const { words = [] } = await chrome.storage.local.get('words');
  words.splice(+i, 1); await chrome.storage.local.set({ words }); renderWords();
});
$('#export').addEventListener('click', async () => {
  const { words = [] } = await chrome.storage.local.get('words');
  const clean = s => String(s || '').replace(/[\t\n\r]+/g, ' ');
  const lines = ['#separator:tab', '#html:false', "#deck:Palabras de videos", ...words.map(w => `${clean(w.word)}\t${clean(w.tr)}\t${clean(w.ctx)}\t${clean(w.ctxTr)}`)];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
  a.download = 'gday-palabras.txt'; a.click();
});
$('#sync').addEventListener('click', () => chrome.runtime.sendMessage({ type: 'sync' }, r => {
  // sin servidor local: al abrir la página de G'day, ella misma agrega las palabras pendientes
  if (r?.web) return chrome.tabs.create({ url: r.web });
  $('#sync').textContent = r?.error ? 'No se pudo conectar' : `${r?.n || 0} palabras pasadas`;
  renderWords();
}));

$('#resetCfg').addEventListener('click', async () => {
  if (!confirm('¿Volver todos los ajustes de la extensión a los de fábrica? Tu libreta de palabras no se borra.')) return;
  CFG = merge({}); saveCfg(); location.reload();
});
$('#clearKnown').addEventListener('click', async () => { await chrome.storage.local.set({ knownWords: [] }); $('#clearKnown').textContent = 'Listo'; });

init();
