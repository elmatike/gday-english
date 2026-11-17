# Función de Vercel: /api/auth (inicio de sesión con Google; el código está en gday_auth.py, igual que en el servidor local)
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import gday_auth  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        gday_auth.serve(self)

    def do_POST(self):
        gday_auth.serve(self)
