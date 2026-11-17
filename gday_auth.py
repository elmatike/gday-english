"""Inicio de sesión con Google para guardar el progreso en el Google Drive de cada usuario.

Lo usan el servidor local (server.py) y la función de Vercel api/auth.py.

Cómo funciona:
- /api/auth?a=login     manda al usuario a la pantalla de Google (permiso: solo la carpeta privada de la app en su Drive).
- /api/auth?code=...     Google vuelve acá. El permiso de larga duración (refresh token) se guarda cifrado
                         en una cookie de este navegador (HttpOnly: la página no la puede leer).
- /api/auth?a=token     la app pide un permiso corto (1 hora) para leer y escribir su archivo en Drive.
- /api/auth?a=logout    cierra la sesión y le quita el permiso a G'day en la cuenta de Google.

El servidor no guarda nada: ni datos ni cuentas. Todo el progreso vive en el Drive de cada usuario.
La única excepción es el ranking semanal (opcional, solo para quien se anota): ver la sección "ranking" más abajo.

Configuración (una sola vez):
- GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET: el "ID de cliente OAuth" de Google Cloud.
  En tu compu también sirve poner el JSON que descarga Google en data/google-oauth.json.
- GDAY_SECRET: una clave larga al azar para cifrar la cookie. En tu compu se crea sola en data/.secret.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookies import SimpleCookie
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
SCOPES = 'openid email https://www.googleapis.com/auth/drive.appdata'
COOKIE = 'gday_rt'
STATE_COOKIE = 'gday_st'
COOKIE_DAYS = 400  # lo máximo que Chrome deja durar una cookie; se renueva sola cada vez que se usa


def _config():
    cid = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
    sec = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()
    if not (cid and sec):
        try:
            with open(os.path.join(DATA, 'google-oauth.json'), encoding='utf-8') as fh:
                d = json.load(fh)
            d = d.get('web') or d.get('installed') or d
            cid, sec = d.get('client_id', ''), d.get('client_secret', '')
        except (OSError, ValueError):
            pass
    return (cid, sec) if cid and sec else None


def _key():
    k = os.environ.get('GDAY_SECRET', '').strip()
    if k:
        return hashlib.sha256(k.encode()).digest()
    path = os.path.join(DATA, '.secret')  # solo en tu compu: la versión publicada usa GDAY_SECRET
    try:
        with open(path, 'rb') as fh:
            return hashlib.sha256(fh.read()).digest()
    except OSError:
        os.makedirs(DATA, exist_ok=True)
        raw = secrets.token_bytes(32)
        with open(path, 'wb') as fh:
            fh.write(raw)
        return hashlib.sha256(raw).digest()


# Cifrado con la biblioteca estándar: flujo de HMAC-SHA256 (modo contador) y autenticación HMAC (cifrar y después firmar).
def _stream(key, nonce, n):
    out = b''
    i = 0
    while len(out) < n:
        out += hmac.new(key, b'enc' + nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest()
        i += 1
    return out[:n]


def seal(data):
    key, nonce = _key(), secrets.token_bytes(16)
    raw = json.dumps(data, separators=(',', ':')).encode()
    ct = bytes(a ^ b for a, b in zip(raw, _stream(key, nonce, len(raw))))
    tag = hmac.new(key, b'mac' + nonce + ct, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(nonce + ct + tag).decode().rstrip('=')


def unseal(token):
    try:
        blob = base64.urlsafe_b64decode(token + '=' * (-len(token) % 4))
        nonce, ct, tag = blob[:16], blob[16:-32], blob[-32:]
        key = _key()
        if len(blob) < 49 or not hmac.compare_digest(tag, hmac.new(key, b'mac' + nonce + ct, hashlib.sha256).digest()):
            return None
        return json.loads(bytes(a ^ b for a, b in zip(ct, _stream(key, nonce, len(ct)))))
    except Exception:
        return None


def _origin(req):
    host = req.headers.get('X-Forwarded-Host') or req.headers.get('Host') or 'localhost'
    proto = req.headers.get('X-Forwarded-Proto') or ('http' if host.split(':')[0] in ('localhost', '127.0.0.1') else 'https')
    return f'{proto}://{host}'


def _cookies(req):
    c = SimpleCookie()
    try:
        c.load(req.headers.get('Cookie') or '')
    except Exception:
        pass
    return {k: v.value for k, v in c.items()}


def _set_cookie(name, value, req, max_age):
    secure = '; Secure' if _origin(req).startswith('https') else ''
    return f'{name}={value}; Path=/api/auth; Max-Age={max_age}; HttpOnly; SameSite=Lax{secure}'


def _post_form(url, fields):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), method='POST',
                                 headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode()), r.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode()), e.code
        except ValueError:
            return {}, e.code


def _email_of(id_token):
    try:
        part = id_token.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4))).get('email', '')
    except Exception:
        return ''


def _same_origin(req):
    """Los pedidos que devuelven un permiso o cierran sesión solo valen desde la propia app."""
    o = req.headers.get('Origin')
    if o:
        return o == _origin(req)
    ref = urlparse(req.headers.get('Referer') or '')
    return f'{ref.scheme}://{ref.netloc}' == _origin(req) if ref.netloc else req.headers.get('Sec-Fetch-Site') in (None, 'same-origin')


# ---------- ranking semanal (Supabase) ----------
# Solo participa quien inicia sesión con Google y toca "Unirme al ranking". En Supabase se guarda, por semana:
# un código anónimo de la cuenta (no el mail), el apodo que eligió y los minutos estudiados. Nada más.
# Configuración: SUPABASE_URL y SUPABASE_SERVICE_KEY (la clave "service_role", que nunca llega al navegador).
# Tabla: ver supabase-ranking.sql
import datetime
import re

NICK_RE = re.compile(r"^[\w áéíóúñüÁÉÍÓÚÑÜ.\-']{2,20}$")


def _sb():
    url = os.environ.get('SUPABASE_URL', '').strip().rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_KEY', '').strip()
    return (url, key) if url and key else None


def _sb_call(method, path, body=None, extra=None):
    url, key = _sb()
    # las claves nuevas de Supabase (sb_secret_...) van solo en "apikey"; la service_role vieja (un JWT) también en Authorization
    headers = {'apikey': key, 'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + key} if key.startswith('eyJ') else {}), **(extra or {})}
    req = urllib.request.Request(url + '/rest/v1/' + path, method=method, headers=headers,
                                 data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=10) as r:
        raw = r.read().decode()
        return (json.loads(raw) if raw else None), r.headers


def _uid(email):
    # código anónimo y estable por cuenta: no se puede volver al mail sin la clave secreta del servidor
    return hmac.new(_key(), b'rank:' + email.lower().encode(), hashlib.sha256).hexdigest()[:32]


def _monday(d=None):
    d = d or datetime.datetime.now(datetime.timezone.utc).date()
    return d - datetime.timedelta(days=d.weekday())


def _ahead(week, minutes):
    """Cuántas personas del ranking tienen más minutos que `minutes` esta semana."""
    _, h = _sb_call('GET', f'rank_week?week=eq.{week}&minutes=gt.{int(minutes)}&select=uid',
                    extra={'Prefer': 'count=exact', 'Range': '0-0'})
    return int((h.get('Content-Range') or '*/0').split('/')[-1] or 0)


def _rank_list(uid, local_min=None):
    week = _monday().isoformat()
    rows, _ = _sb_call('GET', f'rank_week?week=eq.{week}&select=uid,nick,minutes&order=minutes.desc,updated_at.asc&limit=10')
    top = [{'nick': r['nick'], 'minutes': r['minutes'], 'me': r['uid'] == uid} for r in rows or []]
    me = None
    if uid:
        mine, _ = _sb_call('GET', f'rank_week?week=eq.{week}&uid=eq.{uid}&select=nick,minutes')
        if mine:
            me = {'nick': mine[0]['nick'], 'minutes': mine[0]['minutes'], 'pos': _ahead(week, mine[0]['minutes']) + 1}
    out = {'week': week, 'top': top, 'me': me}
    # puesto privado: quien no está anotado manda sus minutos (solo el número, no se guarda nada)
    # y se le dice en qué puesto quedaría. Solo lo ve esa persona.
    if me is None and local_min is not None:
        out['localPos'] = _ahead(week, local_min) + 1
    return out


def _rank(req, a, sess, out):
    if not _sb():
        return out({'error': 'norank'}, 501)
    uid = _uid(sess['email']) if sess and sess.get('email') else None
    try:
        if a == 'rank':
            q = urllib.parse.parse_qs(urllib.parse.urlparse(req.path).query)
            try:
                local_min = max(0, min(int((q.get('m') or [''])[0]), 7 * 24 * 60))
            except ValueError:
                local_min = None
            return out({**_rank_list(uid, local_min), 'signedIn': bool(uid)})
        if req.command != 'POST':
            return out({'error': 'usar POST'}, 405)
        if not uid:
            return out({'error': 'nologin'}, 401)
        n = int(req.headers.get('Content-Length') or 0)
        body = json.loads(req.rfile.read(min(n, 4000)) or b'{}') if n else {}
        if a == 'rankleave':
            _sb_call('DELETE', f'rank_week?uid=eq.{uid}')
            return out({'ok': True})
        # rankpost: minutos de la semana que manda la app
        nick = ' '.join(str(body.get('nick', '')).split())
        if not NICK_RE.match(nick):
            return out({'error': 'apodo'}, 400)
        try:
            week = datetime.date.fromisoformat(str(body.get('week', '')))
        except ValueError:
            return out({'error': 'semana'}, 400)
        today = datetime.datetime.now(datetime.timezone.utc).date()
        if week.weekday() != 0 or not (today - datetime.timedelta(days=8) <= week <= today + datetime.timedelta(days=1)):
            return out({'error': 'semana'}, 400)
        # tope razonable: no más que el tiempo transcurrido de la semana (y nunca más de 16 h por día)
        days = min(7, max(1, (today - week).days + 2))
        minutes = max(0, min(int(body.get('minutes') or 0), days * 16 * 60))
        _sb_call('POST', 'rank_week?on_conflict=uid,week',
                 {'uid': uid, 'week': week.isoformat(), 'nick': nick, 'minutes': minutes, 'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()},
                 {'Prefer': 'resolution=merge-duplicates,return=minimal'})
        return out({'ok': True, **_rank_list(uid)})
    except urllib.error.URLError:
        return out({'error': 'db'}, 502)


# ---------- sala de chat (Supabase) ----------
# Una sala en pixel art donde la gente camina y chatea en inglés. Para entrar hay que iniciar sesión con Google.
# En Supabase se guarda solo: código anónimo de la cuenta, apodo, cómo se ve el muñequito, dónde está parado,
# y los mensajes de los últimos minutos (se borran solos). Tablas: ver supabase-lobby.sql
# En tu compu, sin Supabase, la sala vive en la memoria del servidor y se puede entrar sin sesión (para probar).
LOBBY_ROOMS = ('cafe', 'beach')
LOBBY_LOOK = {'skin': 6, 'hair': 10, 'style': 8, 'eyes': 5, 'top': 4, 'shirt': 12, 'bottom': 3, 'pants': 8, 'shoes': 6}
LOBBY_N = 12           # el cuarto es de 12 x 12 baldosas
LOBBY_ALIVE = 20       # segundos sin noticias para dar a alguien por ido
LOBBY_KEEP = 300       # los mensajes se muestran 5 minutos
_lobby_mem = {'users': {}, 'msgs': [], 'id': 0}
_lobby_last_say = {}


def _lobby_local():
    return not os.environ.get('VERCEL') and not _sb()


def _sid(uid):
    return hashlib.sha256(b'lobby:' + uid.encode()).hexdigest()[:12]


def _lobby_clean(text):
    text = ''.join(c for c in str(text) if c.isprintable())
    return ' '.join(text.split())[:140]


def _lobby(req, a, sess, out):
    local = _lobby_local()
    if not local and not _sb():
        return out({'error': 'nolobby'}, 501)
    if req.command != 'POST':
        return out({'error': 'usar POST'}, 405)
    n = int(req.headers.get('Content-Length') or 0)
    try:
        body = json.loads(req.rfile.read(min(n, 4000)) or b'{}') if n else {}
    except ValueError:
        return out({'error': 'json'}, 400)
    uid = _uid(sess['email']) if sess and sess.get('email') else None
    if not uid and local and re.fullmatch(r'[a-z0-9]{8,24}', str(body.get('guest', ''))):
        uid = 'guest-' + body['guest']  # solo en tu compu, para probar con dos pestañas
    if not uid:
        return out({'error': 'nologin'}, 401)
    now = time.time()
    try:
        if a == 'lobbyleave':
            if local:
                _lobby_mem['users'].pop(uid, None)
            else:
                _sb_call('DELETE', f'lobby_users?uid=eq.{uid}')
            return out({'ok': True})

        nick = ' '.join(str(body.get('nick', '')).split())
        if not NICK_RE.match(nick):
            return out({'error': 'apodo'}, 400)
        room = body.get('room') if body.get('room') in LOBBY_ROOMS else LOBBY_ROOMS[0]
        raw = body.get('look') if isinstance(body.get('look'), dict) else {}
        look = {k: max(0, min(int(raw.get(k) or 0) if str(raw.get(k, 0)).lstrip('-').isdigit() else 0, m - 1)) for k, m in LOBBY_LOOK.items()}
        acc = raw.get('acc') if isinstance(raw.get('acc'), dict) else {}
        acc = {k: v for k, v in acc.items() if k in ('head', 'face', 'body', 'hand') and isinstance(v, str) and re.fullmatch(r'[a-z]{2,16}', v)}
        if acc:
            look['acc'] = acc
        for k in ('fx', 'emote'):  # lo que tiene en la mano y el gesto (saludar, bailar, sentarse)
            v = raw.get(k)
            if isinstance(v, str) and re.fullmatch(r'[a-z]{1,12}', v):
                look[k] = v
        x, y = (max(0, min(int(v) if str(v).isdigit() else 0, LOBBY_N - 1)) for v in (body.get('x', 0), body.get('y', 0)))
        say = _lobby_clean(body.get('say', ''))
        if say and now - _lobby_last_say.get(uid, 0) < 1.2:
            say = ''  # demasiado rápido: se ignora
        if say:
            _lobby_last_say[uid] = now
        try:
            since = max(0, int(body.get('since') or 0))
        except (TypeError, ValueError):
            since = 0
        me = {'uid': uid, 'room': room, 'nick': nick, 'look': look, 'x': x, 'y': y}

        if local:
            m = _lobby_mem
            m['users'][uid] = {**me, 'seen': now}
            if say:
                m['id'] += 1
                m['msgs'].append({'id': m['id'], 'room': room, 'uid': uid, 'nick': nick, 'body': say, 'at': now})
            m['msgs'] = [r for r in m['msgs'] if now - r['at'] < LOBBY_KEEP][-200:]
            users = [u for u in m['users'].values() if u['room'] == room and now - u['seen'] < LOBBY_ALIVE]
            msgs = [r for r in m['msgs'] if r['room'] == room and r['id'] > since][-30:]
            last = m['id']
        else:
            iso = lambda t: datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
            _sb_call('POST', 'lobby_users?on_conflict=uid', {**me, 'seen': iso(now)}, {'Prefer': 'resolution=merge-duplicates,return=minimal'})
            if say:
                _sb_call('POST', 'lobby_msgs', {'room': room, 'uid': uid, 'nick': nick, 'body': say}, {'Prefer': 'return=minimal'})
                if secrets.randbelow(40) == 0:  # de vez en cuando se borra lo viejo
                    _sb_call('DELETE', f'lobby_msgs?at=lt.{iso(now - 3600)}')
                    _sb_call('DELETE', f'lobby_users?seen=lt.{iso(now - 3600)}')
            users = _sb_call('GET', f'lobby_users?room=eq.{room}&seen=gt.{iso(now - LOBBY_ALIVE)}&select=uid,nick,look,x,y&limit=60')[0] or []
            msgs = _sb_call('GET', f'lobby_msgs?room=eq.{room}&id=gt.{since}&at=gt.{iso(now - LOBBY_KEEP)}'
                                   '&select=id,uid,nick,body&order=id.desc&limit=30')[0] or []
            msgs.reverse()
            last = max([since] + [r['id'] for r in msgs])
        return out({
            'me': _sid(uid), 'last': last,
            'users': [{'id': _sid(u['uid']), 'nick': u['nick'], 'look': u['look'], 'x': u['x'], 'y': u['y']} for u in users],
            'msgs': [{'id': r['id'], 'from': _sid(r['uid']), 'nick': r['nick'], 'text': r['body']} for r in msgs],
            'counts': _lobby_counts(local, now),
        })
    except urllib.error.URLError:
        return out({'error': 'db'}, 502)


def _lobby_counts(local, now):
    if local:
        us = [u for u in _lobby_mem['users'].values() if now - u['seen'] < LOBBY_ALIVE]
    else:
        iso = datetime.datetime.fromtimestamp(now - LOBBY_ALIVE, datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
        us = _sb_call('GET', f'lobby_users?seen=gt.{iso}&select=room&limit=500')[0] or []
    return {r: sum(1 for u in us if u['room'] == r) for r in LOBBY_ROOMS}


def handle(req):
    """Devuelve (status, headers, body) para /api/auth."""
    q = {k: v[0] for k, v in urllib.parse.parse_qs(urlparse(req.path).query).items()}
    cfg = _config()
    a = q.get('a', '')
    redirect_uri = _origin(req) + '/api/auth'
    json_headers = [('Content-Type', 'application/json; charset=utf-8'), ('Cache-Control', 'no-store')]

    def out(data, status=200, extra=()):
        return status, json_headers + list(extra), json.dumps(data, ensure_ascii=False).encode()

    def back(msg, extra=()):
        return 302, [('Location', '/#settings' + (f'?cloud={msg}' if msg else '')), ('Cache-Control', 'no-store')] + list(extra), b''

    if a == 'status':
        return out({'configured': bool(cfg)})
    if not cfg and a in ('lobby', 'lobbyleave') and _lobby_local() and _same_origin(req):
        return _lobby(req, a, None, out)
    if not cfg:
        return out({'error': 'noconfig', 'configured': False}, 501) if a != 'login' else back('noconfig')
    cid, csec = cfg

    if a == 'login':
        state = secrets.token_urlsafe(24)
        params = {'client_id': cid, 'redirect_uri': redirect_uri, 'response_type': 'code', 'scope': SCOPES,
                  'access_type': 'offline', 'prompt': 'consent', 'include_granted_scopes': 'true', 'state': state}
        if q.get('hint'):
            params['login_hint'] = q['hint']
        return 302, [('Location', 'https://accounts.google.com/o/oauth2/v2/auth?' + urllib.parse.urlencode(params)),
                     ('Set-Cookie', _set_cookie(STATE_COOKIE, state, req, 600)), ('Cache-Control', 'no-store')], b''

    if 'code' in q or 'error' in q:  # Google vuelve con la respuesta
        clear_state = ('Set-Cookie', _set_cookie(STATE_COOKIE, '', req, 0))
        if 'error' in q:
            return back('cancel', [clear_state])
        if not q.get('state') or q.get('state') != _cookies(req).get(STATE_COOKIE):
            return back('error', [clear_state])
        d, status = _post_form('https://oauth2.googleapis.com/token', {
            'code': q['code'], 'client_id': cid, 'client_secret': csec, 'redirect_uri': redirect_uri, 'grant_type': 'authorization_code'})
        rt = d.get('refresh_token')
        if status != 200 or not rt:
            return back('error', [clear_state])
        if 'drive.appdata' not in d.get('scope', ''):
            return back('noscope', [clear_state])  # destildó el permiso de Drive en la pantalla de Google
        sealed = seal({'rt': rt, 'email': _email_of(d.get('id_token', '')), 't': int(time.time())})
        return back('ok', [clear_state, ('Set-Cookie', _set_cookie(COOKIE, sealed, req, COOKIE_DAYS * 86400))])

    if not _same_origin(req):
        return out({'error': 'origen no permitido'}, 403)
    sess = unseal(_cookies(req).get(COOKIE, ''))

    if a == 'token':
        if not sess:
            return out({'signedIn': False, 'configured': True})
        d, status = _post_form('https://oauth2.googleapis.com/token', {
            'client_id': cid, 'client_secret': csec, 'refresh_token': sess['rt'], 'grant_type': 'refresh_token'})
        if status != 200 or not d.get('access_token'):
            if d.get('error') == 'invalid_grant':  # el usuario le sacó el permiso a G'day desde su cuenta de Google
                return out({'signedIn': False, 'configured': True, 'expired': True}, 200, [('Set-Cookie', _set_cookie(COOKIE, '', req, 0))])
            return out({'error': 'google', 'signedIn': True, 'email': sess.get('email', '')}, 502)
        # se renueva la cookie para que la sesión no venza mientras se use
        return out({'signedIn': True, 'email': sess.get('email', ''), 'access_token': d['access_token'], 'expires_in': d.get('expires_in', 3600)},
                   200, [('Set-Cookie', _set_cookie(COOKIE, _cookies(req)[COOKIE], req, COOKIE_DAYS * 86400))])

    if a in ('rank', 'rankpost', 'rankleave'):
        return _rank(req, a, sess, out)

    if a in ('lobby', 'lobbyleave'):
        return _lobby(req, a, sess, out)

    if a == 'logout':
        if req.command != 'POST':
            return out({'error': 'usar POST'}, 405)
        if sess:
            _post_form('https://oauth2.googleapis.com/revoke', {'token': sess['rt']})
        return out({'ok': True}, 200, [('Set-Cookie', _set_cookie(COOKIE, '', req, 0))])

    return out({'error': 'acción desconocida'}, 400)


def serve(req):
    status, headers, body = handle(req)
    req.send_response(status)
    for k, v in headers:
        req.send_header(k, v)
    req.send_header('Content-Length', str(len(body)))
    req.end_headers()
    req.wfile.write(body)
