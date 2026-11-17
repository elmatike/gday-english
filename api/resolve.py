# Función de Vercel: /api/resolve (el código está en gday_core.py, igual que en el servidor local)
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import gday_core  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        gday_core.serve(self, '/api/resolve')
