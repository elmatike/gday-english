"""Funciones de consulta de G'day: diccionario, buscador de YouTube, subtítulos y links de otros sitios.

Las usan el servidor local (server.py) y las funciones de Vercel (carpeta api/).
No guardan nada: solo consultan.
"""
import json
import os
import re
import sqlite3
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
DICT = next((p for p in (os.path.join(HERE, 'dict', 'en-es.sqlite3'), os.path.join(HERE, 'data', 'dict', 'en-es.sqlite3'))
             if os.path.exists(p)), None)
LANG_PREFIXES = ('en', 'es')
_db = None
_db_lock = threading.Lock()

# Verbos irregulares frecuentes: forma conjugada -> forma base
IRREGULAR = {}
for _line in """be was were been being am is are|have has had having|do does did done doing|go goes went gone going
say says said|get gets got gotten getting|make makes made making|know knew known|think thought|take took taken|see saw seen
come came|give gave given|find found|tell told|feel felt|leave left|bring brought|begin began begun|keep kept|hold held
write wrote written|stand stood|hear heard|let|mean meant|set|meet met|run ran|pay paid|sit sat|speak spoke spoken|lie lay lain
lead led|read|grow grew grown|lose lost|fall fell fallen|send sent|build built|understand understood|draw drew drawn
break broke broken|spend spent|cut|rise rose risen|drive drove driven|buy bought|wear wore worn|choose chose chosen
seek sought|throw threw thrown|catch caught|deal dealt|win won|forget forgot forgotten|sell sold|fight fought|teach taught
eat ate eaten|drink drank drunk|sing sang sung|swim swam swum|fly flew flown|ride rode ridden|sleep slept|steal stole stolen
wake woke woken|shake shook shaken|hide hid hidden|bite bit bitten|freeze froze frozen|forgive forgave forgiven|blow blew blown
hang hung|shoot shot|shut|hit|hurt|put|cost|quit|spread|feed fed|bleed bled|lend lent|light lit|slide slid|stick stuck
sting stung|swing swung|strike struck|dig dug|spin spun|bend bent|bet|bind bound|burn burnt|dream dreamt|learn learnt
smell smelt|spell spelt|spill spilt|kneel knelt|mistake mistook mistaken|overcome overcame|undo undid undone|withdraw withdrew withdrawn
child children|man men|woman women|person people|foot feet|tooth teeth|mouse mice|good better best|bad worse worst""".replace('\n', '|').split('|'):
    _words = _line.split()
    for _form in _words[1:]:
        IRREGULAR.setdefault(_form, _words[0])


# ---------- diccionario ----------

def _dict_db():
    global _db
    if _db is None and DICT:
        # solo lectura: así funciona también en Vercel, donde los archivos no se pueden modificar
        _db = sqlite3.connect(f'file:{DICT}?mode=ro&immutable=1', uri=True, check_same_thread=False)
    return _db


def dict_lookup(cands):
    db = _dict_db()
    if db is None:
        return {'error': 'No está instalado el diccionario (dict/en-es.sqlite3).'}
    tried = []
    for c in cands:
        for w in (c, IRREGULAR.get(c)):
            if w and w not in tried:
                tried.append(w)
    with _db_lock:
        for w in tried:
            rows = db.execute('SELECT lexentry, trans_list FROM translation WHERE written_rep = ? COLLATE NOCASE '
                              'ORDER BY importance DESC, score DESC', (w,)).fetchall()
            if not rows:
                continue
            senses = {}
            for lex, trans in rows:
                pos = (lex or '').split('__')[1].lower() if lex and '__' in lex else ''
                lst = senses.setdefault(pos, [])
                for t in (trans or '').split(' | '):
                    t = t.strip()
                    if t and len(t) <= 40 and t not in lst:
                        lst.append(t)
            out = [{'pos': p, 'trans': t[:6]} for p, t in senses.items() if t][:3]
            if out:
                return {'word': w, 'senses': out}
    return {'word': cands[0] if cands else '', 'senses': []}


def api_dict(q):
    cands = [c.strip().lower() for c in q.get('w', '').split('|') if c.strip()][:40]
    return dict_lookup(cands), 200


# ---------- yt-dlp: como módulo de Python (Vercel) o como programa instalado (tu compu) ----------

class YtError(Exception):
    pass


def ydl_info(url, flat=False, timeout=90, retry=True):
    """Como _ydl_info, pero si YouTube bloquea la consulta prueba con otros reproductores oficiales de YouTube."""
    try:
        return _ydl_info(url, flat, timeout)
    except YtError as e:
        if not retry or flat or 'youtube.com' not in url or not re.search(r'not a bot|sign in to confirm|429', str(e), re.I):
            raise
        last = e
        for client in ('tv_embedded', 'web_embedded', 'mweb', 'ios', 'android_vr'):
            try:
                return _ydl_info(url, flat, timeout, client)
            except YtError as e2:
                last = e2
        raise last


def _ydl_info(url, flat=False, timeout=90, client=None):
    try:
        import yt_dlp
    except ImportError:
        yt_dlp = None
    if yt_dlp:
        opts = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'noplaylist': not flat}
        if flat:
            opts['extract_flat'] = True
        if client:
            opts['extractor_args'] = {'youtube': {'player_client': [client]}}
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.sanitize_info(ydl.extract_info(url, download=False))
        except Exception as e:
            raise YtError(str(e))
    args = ['yt-dlp', '--no-warnings', '-J'] + (['--flat-playlist'] if flat else ['--no-playlist'])
    args += (['--extractor-args', f'youtube:player_client={client}'] if client else []) + [url]
    try:
        res = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise YtError('Falta instalar yt-dlp (brew install yt-dlp)')
    except subprocess.TimeoutExpired:
        raise YtError('El sitio tardó demasiado en responder')
    if res.returncode != 0 or not res.stdout.strip():
        raise YtError(res.stderr)
    return json.loads(res.stdout)


def _yt_error(e):
    msg = str(e)
    if re.search(r'not a bot|sign in to confirm', msg, re.I):
        return {'error': 'YouTube bloqueó la consulta desde este servidor. Probá de nuevo en un rato o pegá el link en la app de tu compu.'}, 503
    if re.search(r'logged-in|login|cookies|sign in', msg, re.I):
        return {'error': 'Ese sitio pide iniciar sesión para ver el video, así que la app no lo puede abrir.'}, 422
    if 'Falta instalar' in msg or 'tardó' in msg:
        return {'error': msg}, 500
    return {'error': 'No pude abrir ese link. Puede que el sitio no sea compatible o que el video sea privado.'}, 422


def fetch_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', 'replace')


def fetch_subs(url):
    """Baja un archivo de subtítulos. Si viene partido en trozos (lista .m3u8, como en TED), los une."""
    text = fetch_text(url)
    if not text.lstrip().startswith('#EXTM3U'):
        return text
    parts = ['WEBVTT', '']
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        chunk = fetch_text(urllib.parse.urljoin(url, line))
        parts += [l for l in chunk.splitlines() if not l.startswith(('WEBVTT', 'X-TIMESTAMP-MAP', 'NOTE'))]
        parts.append('')
    return '\n'.join(parts)


def pick_subs(info, lang):
    """Busca subtítulos en un idioma: primero los hechos por personas, después los automáticos."""
    for source in (info.get('subtitles') or {}, info.get('automatic_captions') or {}):
        codes = sorted(source, key=lambda c: (c != lang, '-orig' in c, len(c)))
        for code in codes:
            if code == lang or code.startswith(lang + '-') or code.startswith(lang + '_'):
                for t in sorted(source[code], key=lambda t: t.get('ext') != 'vtt'):
                    if t.get('ext') in ('vtt', 'srt') and t.get('url'):
                        try:
                            return fetch_subs(t['url'])
                        except Exception:
                            pass
    return ''


# ---------- buscador y subtítulos de YouTube ----------

def api_search(q):
    query = q.get('q', '').strip()
    if not query:
        return [], 200
    try:
        info = ydl_info(f'ytsearch18:{query}', flat=True)
    except YtError as e:
        return _yt_error(e)
    items = []
    for e in info.get('entries') or []:
        vid = e.get('id') or ''
        if len(vid) == 11:
            items.append({'id': vid, 'title': e.get('title') or '', 'channel': e.get('channel') or e.get('uploader') or '',
                          'duration': e.get('duration')})
    return items, 200


# Respaldo: YouTube suele bloquear a los servidores en la nube ("confirmá que no sos un robot").
# Si pasa, se piden los subtítulos a Supadata (supadata.ai), que no está bloqueado.
# Solo se usa si hay una clave SUPADATA_API_KEY; mode=native: nunca genera transcripciones con IA (cuestan más).
def supadata(vid, lang):
    key = os.environ.get('SUPADATA_API_KEY', '').strip()
    if not key:
        return None
    hdr = {'x-api-key': key, 'User-Agent': 'gday/1.0', 'Accept': 'application/json'}
    get = lambda u: json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=hdr), timeout=30).read().decode('utf-8', 'replace'))
    try:
        d = get('https://api.supadata.ai/v1/transcript?' + urllib.parse.urlencode(
            {'url': f'https://www.youtube.com/watch?v={vid}', 'lang': lang, 'mode': 'native'}))
        for _ in range(10):  # videos largos: responde con un trabajo que hay que consultar
            if not d.get('jobId') or d.get('content'):
                break
            time.sleep(2)
            d = get(f"https://api.supadata.ai/v1/transcript/{d['jobId']}")
            if d.get('status') == 'failed':
                return None
        return d if isinstance(d.get('content'), list) and d['content'] else None
    except Exception:
        return None


def to_vtt(content):
    ts = lambda ms: '%02d:%02d:%02d.%03d' % (ms // 3600000, ms // 60000 % 60, ms // 1000 % 60, ms % 1000)
    out = ['WEBVTT', '']
    for c in content:
        text = (c.get('text') or '').strip()
        if not text:
            continue
        start = int(c.get('offset') or 0)
        out += [f'{ts(start)} --> {ts(start + max(1, int(c.get("duration") or 0)))}', text, '']
    return '\n'.join(out)


def api_subs(q):
    vid = q.get('id', '')
    if len(vid) != 11 or not all(c.isalnum() or c in '-_' for c in vid):
        return {'error': 'ID de video inválido'}, 400
    info, err = None, None
    try:
        # con Supadata disponible no vale la pena insistir con YouTube: se pasa directo al respaldo
        info = ydl_info(f'https://www.youtube.com/watch?v={vid}', retry=not os.environ.get('SUPADATA_API_KEY', '').strip())
    except YtError as e:
        err = e
    en = pick_subs(info, 'en') if info else ''
    es = pick_subs(info, 'es') if info else ''
    if not en:  # bloqueado o no se pudieron bajar: se prueba con Supadata
        d = supadata(vid, 'en')
        if d and str(d.get('lang', '')).startswith('en'):
            en = to_vtt(d['content'])
            if not es and any(str(l).startswith('es') for l in d.get('availableLangs') or []):
                d2 = supadata(vid, 'es')
                if d2 and str(d2.get('lang', '')).startswith('es'):
                    es = to_vtt(d2['content'])
    if not en and err:
        return _yt_error(err)
    return {'title': (info or {}).get('title') or '', 'en': en, 'es': es}, 200


# ---------- links de otros sitios ----------

VIDEO_EXT = ('.mp4', '.webm', '.m4v', '.mov', '.ogv')


def api_resolve(q):
    """Convierte el link de una página (TED, Internet Archive...) en un video reproducible."""
    link = q.get('url', '').strip()
    if not re.match(r'^https?://', link):
        return {'error': 'Pegá un link que empiece con http:// o https://'}, 400
    if urlparse(link).path.lower().endswith(VIDEO_EXT):
        return {'src': link, 'title': os.path.basename(urlparse(link).path), 'en': '', 'es': ''}, 200
    try:
        info = ydl_info(link)
    except YtError as e:
        return _yt_error(e)
    formats = info.get('formats') or [info]
    ok = [f for f in formats if f.get('url') and f.get('protocol', 'https') in ('http', 'https')
          and f.get('vcodec') != 'none' and f.get('acodec') != 'none' and f.get('ext') in ('mp4', 'webm', 'ogv', 'm4v', 'mov')]
    base = {'title': info.get('title') or link, 'thumb': info.get('thumbnail') or '', 'en': pick_subs(info, 'en'), 'es': pick_subs(info, 'es')}
    if not ok:
        hls = [f.get('manifest_url') or f.get('url') for f in formats
               if str(f.get('protocol', '')).startswith('m3u8') and (f.get('manifest_url') or f.get('url'))]
        if hls:
            return {'src': hls[0], 'hls': True, **base}, 200
        return {'error': 'Ese sitio usa un formato de video que la app no puede reproducir.'}, 422
    ok.sort(key=lambda f: (f.get('ext') in ('mp4', 'webm'), min(f.get('height') or 0, 720), f.get('tbr') or 0), reverse=True)
    return {'src': ok[0]['url'], **base}, 200


# ---------- voz a texto en el servidor (para iPhone, donde el reconocimiento de Safari falla) ----------
# Usa la primera clave que encuentre en las variables de entorno. Nunca se escribe la clave en el código.
STT = [('GROQ_API_KEY', 'https://api.groq.com/openai/v1/audio/transcriptions', 'whisper-large-v3-turbo'),
       ('OPENAI_API_KEY', 'https://api.openai.com/v1/audio/transcriptions', 'gpt-4o-mini-transcribe')]
STT_MAX = 4 * 1024 * 1024  # Vercel acepta hasta 4,5 MB por pedido; 2 minutos de voz pesan ~1 MB
# solo la app puede usarlo (cada transcripción cuesta)
STT_ORIGINS = re.compile(r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://(gday-english[\w-]*\.vercel\.app|(www\.)?gday\.app)$|^chrome-extension://[a-p]{32}$')


def stt_provider():
    for env, url, model in STT:
        key = os.environ.get(env, '').strip()
        if key:
            return key, url, model
    return None


def stt_allowed(headers):
    origin = headers.get('Origin') or ''
    if not origin:
        ref = urlparse(headers.get('Referer') or '')
        origin = f'{ref.scheme}://{ref.netloc}' if ref.netloc else ''
    return bool(STT_ORIGINS.match(origin))


def transcribe(body, ctype, headers):
    """Recibe el audio grabado y devuelve {'text': ...}."""
    if not stt_allowed(headers):
        return {'error': 'origen no permitido'}, 403
    prov = stt_provider()
    if not prov:
        return {'error': 'nostt'}, 501
    if not body:
        return {'error': 'Audio vacío'}, 400
    if len(body) > STT_MAX:
        return {'error': 'La grabación es demasiado larga'}, 413
    key, url, model = prov
    ct = (ctype or '').split(';')[0].strip().lower()
    ext = {'audio/mp4': 'mp4', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'm4a', 'audio/mpeg': 'mp3',
           'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav'}.get(ct, 'webm')
    boundary = 'gday' + os.urandom(12).hex()
    parts = []
    for name, val in (('model', model), ('language', 'en'), ('response_format', 'json'), ('temperature', '0')):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{val}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="voz.{ext}"\r\n'
                 f'Content-Type: {ct or "audio/webm"}\r\n\r\n'.encode() + body + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    req = urllib.request.Request(url, data=b''.join(parts), method='POST', headers={
        'Authorization': f'Bearer {key}', 'Content-Type': f'multipart/form-data; boundary={boundary}', 'User-Agent': 'gday/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.loads(r.read().decode('utf-8', 'replace'))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            return {'error': 'busy'}, 503
        if e.code in (401, 403):
            return {'error': 'La clave del servicio de voz no es válida'}, 502
        return {'error': f'El servicio de voz respondió {e.code}'}, 502
    except Exception:
        return {'error': 'No me pude conectar con el servicio de voz'}, 502
    return {'text': (data.get('text') or '').strip()}, 200


def serve_transcribe(req):
    """Atiende /api/transcribe (Vercel y servidor local). GET dice si está configurado."""
    if req.command == 'GET':
        data, status = {'ok': bool(stt_provider())}, 200
    else:
        n = int(req.headers.get('Content-Length') or 0)
        body = req.rfile.read(n) if 0 < n <= STT_MAX else b''
        data, status = transcribe(body, req.headers.get('Content-Type'), req.headers) if n <= STT_MAX else ({'error': 'La grabación es demasiado larga'}, 413)
    out = json.dumps(data, ensure_ascii=False).encode()
    req.send_response(status)
    req.send_header('Content-Type', 'application/json; charset=utf-8')
    req.send_header('Content-Length', str(len(out)))
    req.send_header('Cache-Control', 'no-store')
    req.end_headers()
    req.wfile.write(out)


# ---------- traducción automática de subtítulos (cuando el video no trae español) ----------
# Usa la misma clave de Groq que la voz a texto. Prueba varios modelos por si alguno deja de existir.
TR_MODELS = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant']
TR_MAX_LINES = 80


# Qué traductor usar primero. Para cambiar a uno pago más adelante, se agrega su función acá y se pone
# TRANSLATE_PROVIDER en Vercel. Si el primero falla, se prueba el siguiente.
def translate_lines(lines):
    first = os.environ.get('TRANSLATE_PROVIDER', 'google').strip().lower()
    order = [first] + [p for p in ('google', 'groq') if p != first]
    err = 'error'
    for name in order:
        fn = TRANSLATORS.get(name)
        if not fn:
            continue
        out, err = fn(lines)
        if out:
            return out, None
    return None, err


def translate_google(lines):
    """Google Translate gratuito (sin clave). Varias frases por pedido, cada una vuelve por separado."""
    out, batch = [], []
    def flush():
        if not batch:
            return True
        url = 'https://clients5.google.com/translate_a/t?' + urllib.parse.urlencode(
            [('client', 'dict-chrome-ex'), ('sl', 'en'), ('tl', 'es')] + [('q', l) for l in batch])
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=20) as r:
                data = json.loads(r.read().decode('utf-8', 'replace'))
        except Exception:
            return False
        if not isinstance(data, list) or len(data) != len(batch):
            return False
        out.extend(str(x[0] if isinstance(x, list) else x).strip() for x in data)
        batch.clear()
        return True
    size = 0
    for line in lines:
        enc = len(urllib.parse.quote(line)) + 3
        if batch and size + enc > 6000:  # que la dirección no quede demasiado larga
            if not flush():
                return None, 'busy'
            size = 0
        batch.append(line); size += enc
    if not flush():
        return None, 'busy'
    return out, None


def translate_groq(lines):
    key = os.environ.get('GROQ_API_KEY', '').strip()
    if not key:
        return None, 'notr'
    prompt = ('Translate each English subtitle line into natural, everyday Latin American Spanish. '
              'Keep the meaning and tone, keep it short like a subtitle, do not add explanations. '
              f'Return JSON exactly like {{"es": [...]}} with exactly {len(lines)} strings, one per input line, in the same order.')
    body_base = {'temperature': 0.2, 'response_format': {'type': 'json_object'},
                 'messages': [{'role': 'system', 'content': prompt},
                              {'role': 'user', 'content': json.dumps({'en': lines}, ensure_ascii=False)}]}
    last = 'error'
    for model in TR_MODELS:
        req = urllib.request.Request('https://api.groq.com/openai/v1/chat/completions', method='POST',
                                     data=json.dumps({**body_base, 'model': model}).encode(),
                                     headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'User-Agent': 'gday/1.0'})
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                data = json.loads(r.read().decode('utf-8', 'replace'))
            es = json.loads(data['choices'][0]['message']['content']).get('es')
            if isinstance(es, list) and len(es) == len(lines):
                return [str(x).strip() for x in es], None
            last = 'count'
        except urllib.error.HTTPError as e:
            last = 'busy' if e.code == 429 else 'error'
            if e.code in (401, 403, 429):
                break
        except Exception:
            last = 'error'
    return None, last


TRANSLATORS = {'google': translate_google, 'groq': translate_groq}


def serve_translate(req):
    """POST /api/translate {"lines": [...]} -> {"es": [...]}."""
    status, data = 200, None
    if req.command == 'GET':
        data = {'ok': True}
    elif not stt_allowed(req.headers):
        status, data = 403, {'error': 'origen no permitido'}
    else:
        try:
            n = int(req.headers.get('Content-Length') or 0)
            lines = json.loads(req.rfile.read(n) if 0 < n <= 200000 else b'{}').get('lines')
        except ValueError:
            lines = None
        if not isinstance(lines, list) or not lines or len(lines) > TR_MAX_LINES:
            status, data = 400, {'error': 'Mandá entre 1 y %d frases' % TR_MAX_LINES}
        else:
            es, err = translate_lines([str(x)[:500] for x in lines])
            status, data = (200, {'es': es}) if es else ({'notr': 501, 'busy': 503}.get(err, 502), {'error': err})
    out = json.dumps(data, ensure_ascii=False).encode()
    req.send_response(status)
    req.send_header('Content-Type', 'application/json; charset=utf-8')
    req.send_header('Content-Length', str(len(out)))
    req.send_header('Cache-Control', 'no-store')
    req.end_headers()
    req.wfile.write(out)


ROUTES = {'/api/dict': api_dict, '/api/search': api_search, '/api/subs': api_subs, '/api/resolve': api_resolve,
          '/api/ping': lambda q: ({'ok': True, 'app': 'gday'}, 200)}


def serve(req, route):
    """Atiende un pedido de Vercel: lo usan las clases handler de la carpeta api/."""
    q = {k: v[0] for k, v in urllib.parse.parse_qs(urlparse(req.path).query).items()}
    try:
        data, status = ROUTES[route](q)
    except Exception as e:  # cualquier error se devuelve como mensaje claro
        data, status = {'error': f'Error del servidor ({type(e).__name__})'}, 500
    body = json.dumps(data, ensure_ascii=False).encode()
    req.send_response(status)
    req.send_header('Content-Type', 'application/json; charset=utf-8')
    req.send_header('Cache-Control', 'public, max-age=86400' if route == '/api/dict' and status == 200 else 'no-store')
    req.end_headers()
    req.wfile.write(body)
