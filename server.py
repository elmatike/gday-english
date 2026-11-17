"""Servidor local de G'day.

Uso:  python3 server.py   (abre http://localhost:5190)
Necesita yt-dlp para el buscador de YouTube:  brew install yt-dlp

Las consultas (diccionario, YouTube, links) están en gday_core.py y son las mismas que usa la versión publicada.
Este servidor agrega lo que solo tiene sentido en tu compu: el progreso en un archivo, los audios del diario
y los mazos importados que usa la extensión de Chrome.
"""
import datetime
import glob
import json
import mimetypes
import os
import re
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import collection
import gday_auth
import gday_core as core

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('PORT', 5190))
DATA = os.path.join(HERE, 'data')
PROGRESS = os.path.join(DATA, 'progress.json')
BACKUPS = os.path.join(DATA, 'backups')
AUDIO = os.path.join(DATA, 'audio')
AUDIO_ID = re.compile(r'^[a-z0-9]{2,40}$')
for d in (DATA, BACKUPS, AUDIO):
    os.makedirs(d, exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def end_headers(self):
        # que el navegador revise siempre si hay una versión nueva de la app
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == '/api/transcribe':
            return core.serve_transcribe(self)
        if url.path == '/api/translate':
            return core.serve_translate(self)
        if url.path == '/api/auth':
            return gday_auth.serve(self)
        if url.path in core.ROUTES:
            return self.json(*core.ROUTES[url.path](q))
        if url.path == '/api/progress':
            if not os.path.exists(PROGRESS):
                return self.json({})
            with open(PROGRESS, encoding='utf-8') as fh:
                return self.send_bytes(fh.read().encode(), 'application/json; charset=utf-8')
        if url.path.startswith('/api/audio/'):
            f = self.audio_path(url.path)
            if not f or not os.path.exists(f):
                return self.json({'error': 'no existe'}, 404)
            with open(f, 'rb') as fh:
                return self.send_bytes(fh.read(), 'audio/webm')
        if url.path == '/api/collection':
            return self.json(collection.load())
        if url.path.startswith('/api/media/'):
            name = os.path.basename(urllib.parse.unquote(url.path[len('/api/media/'):]))
            f = os.path.join(collection.MEDIA, name)
            if not name or not os.path.isfile(f):
                return self.json({'error': 'no existe'}, 404)
            with open(f, 'rb') as fh:
                return self.send_bytes(fh.read(), mimetypes.guess_type(name)[0] or 'application/octet-stream')
        if url.path.startswith('/data/'):
            return self.json({'error': 'privado'}, 403)
        return super().do_GET()

    def read_body(self):
        return self.rfile.read(int(self.headers.get('Content-Length', 0)))

    def do_PUT(self):
        url = urlparse(self.path)
        if url.path == '/api/progress':
            body = self.read_body()
            try:
                json.loads(body)
            except ValueError:
                return self.json({'error': 'JSON inválido'}, 400)
            tmp = PROGRESS + '.tmp'
            with open(tmp, 'wb') as fh:
                fh.write(body)
            os.replace(tmp, PROGRESS)  # escritura atómica: nunca queda un archivo a medias
            # una copia por día, se guardan las últimas 30
            with open(os.path.join(BACKUPS, f'progress-{datetime.date.today()}.json'), 'wb') as fh:
                fh.write(body)
            for old in sorted(glob.glob(os.path.join(BACKUPS, 'progress-*.json')))[:-30]:
                os.remove(old)
            return self.json({'ok': True})
        if url.path.startswith('/api/audio/'):
            f = self.audio_path(url.path)
            if not f:
                return self.json({'error': 'ID inválido'}, 400)
            with open(f, 'wb') as fh:
                fh.write(self.read_body())
            return self.json({'ok': True})
        return self.json({'error': 'no encontrado'}, 404)

    def do_POST(self):
        url = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == '/api/transcribe':
            return core.serve_transcribe(self)
        if url.path == '/api/translate':
            return core.serve_translate(self)
        if url.path == '/api/auth':
            return gday_auth.serve(self)
        try:
            if url.path == '/api/import':
                return self.json(collection.import_file(q.get('name', 'mazo'), self.read_body(), q.get('reverse') == '1'))
            if url.path == '/api/col':
                return self.json(collection.apply(json.loads(self.read_body())))
        except (ValueError, KeyError) as e:
            return self.json({'error': str(e) or 'Operación inválida'}, 400)
        except Exception as e:  # archivo dañado u otro problema al leer el mazo
            return self.json({'error': f'No pude leer ese archivo ({type(e).__name__}).'}, 400)
        return self.json({'error': 'no encontrado'}, 404)

    def do_DELETE(self):
        f = self.audio_path(urlparse(self.path).path)
        if f and os.path.exists(f):
            os.remove(f)
        return self.json({'ok': True})

    def audio_path(self, path):
        vid = path.rsplit('/', 1)[-1]
        return os.path.join(AUDIO, vid + '.webm') if AUDIO_ID.match(vid) else None

    def json(self, data, status=200):
        return self.send_bytes(json.dumps(data, ensure_ascii=False).encode(), 'application/json; charset=utf-8', status)

    def send_bytes(self, body, ctype, status=200):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if '/api/' in (args[0] if args else ''):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    print(f"G'day en http://localhost:{PORT}")
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
