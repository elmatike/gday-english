"""Colección de mazos importados (estilo Anki), guardada en data/collection.json.

Lee paquetes de Anki (.apkg / .colpkg, formato viejo y nuevo) y archivos de texto (.csv / .txt / .tsv).
"""
import csv
import io
import json
import os
import re
import sqlite3
import tempfile
import threading
import time
import zipfile

try:
    from compression import zstd  # Python 3.14+
except ImportError:  # pragma: no cover
    zstd = None

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
COL_FILE = os.path.join(DATA, 'collection.json')
MEDIA = os.path.join(DATA, 'media')
os.makedirs(MEDIA, exist_ok=True)
ZSTD_MAGIC = b'\x28\xb5\x2f\xfd'
_lock = threading.Lock()

BASE_CSS = ('.card { font-family: arial; font-size: 22px; text-align: center; color: black; background-color: white; }\n'
            '.cloze { font-weight: bold; color: blue; }\n.nightMode .cloze { color: lightblue; }')
STOCK_MODELS = {
    'basic': {'name': 'Básica', 'kind': 'normal', 'fields': ['Frente', 'Reverso'], 'css': BASE_CSS,
              'tmpls': [{'name': 'Tarjeta 1', 'q': '{{Frente}}', 'a': '{{FrontSide}}<hr id=answer>{{Reverso}}'}]},
    'basicrev': {'name': 'Básica (e invertida)', 'kind': 'normal', 'fields': ['Frente', 'Reverso'], 'css': BASE_CSS,
                 'tmpls': [{'name': 'Tarjeta 1', 'q': '{{Frente}}', 'a': '{{FrontSide}}<hr id=answer>{{Reverso}}'},
                           {'name': 'Tarjeta 2', 'q': '{{Reverso}}', 'a': '{{FrontSide}}<hr id=answer>{{Frente}}'}]},
    'cloze': {'name': 'Huecos (cloze)', 'kind': 'cloze', 'fields': ['Texto', 'Extra'], 'css': BASE_CSS,
              'tmpls': [{'name': 'Cloze', 'q': '{{cloze:Texto}}', 'a': '{{cloze:Texto}}<br>{{Extra}}'}]},
}


def _uid(prefix):
    return f'{prefix}{int(time.time() * 1000):x}{os.urandom(2).hex()}'


def load():
    if os.path.exists(COL_FILE):
        with open(COL_FILE, encoding='utf-8') as fh:
            col = json.load(fh)
    else:
        col = {'decks': {}, 'models': {}, 'notes': {}, 'cards': []}
    for k, m in STOCK_MODELS.items():
        col['models'].setdefault(k, m)
    return col


def store(col):
    tmp = COL_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(col, fh, ensure_ascii=False)
    os.replace(tmp, COL_FILE)


def cloze_numbers(flds):
    return sorted({int(n) for f in flds for n in re.findall(r'\{\{c(\d+)::', f or '')}) or [1]


def _card_ords(model, flds):
    if model['kind'] == 'cloze':
        return [n - 1 for n in cloze_numbers(flds)]
    return list(range(len(model['tmpls'])))


# ---------- operaciones desde la app ----------

def apply(op):
    with _lock:
        col = load()
        kind = op.get('op')
        res = {}
        if kind == 'addDeck':
            did = _uid('d')
            col['decks'][did] = {'name': op['name'].strip() or 'Mazo nuevo', 'src': op.get('src', 'manual'), 'created': time.time()}
            res['did'] = did
        elif kind == 'renameDeck':
            col['decks'][op['did']]['name'] = op['name'].strip()
        elif kind == 'deleteDeck':
            did = op['did']
            col['decks'].pop(did, None)
            col['cards'] = [c for c in col['cards'] if c[2] != did]
            alive = {c[0] for c in col['cards']}
            col['notes'] = {k: v for k, v in col['notes'].items() if k in alive}
        elif kind == 'addNotes':
            did = op.get('did')
            if not did:
                did = _uid('d')
                col['decks'][did] = {'name': op.get('deckName') or 'Mazo nuevo', 'src': op.get('src', 'manual'), 'created': time.time()}
            model = col['models'][op['mid']]
            n = 0
            for note in op['notes']:
                nid = _uid('n')
                flds = (list(note['flds']) + [''] * len(model['fields']))[:len(model['fields'])]
                col['notes'][nid] = {'mid': op['mid'], 'flds': flds, 'tags': note.get('tags', [])}
                col['cards'] += [[nid, o, did] for o in _card_ords(model, flds)]
                n += 1
            res.update(did=did, added=n)
        elif kind == 'editNote':
            note = col['notes'][op['nid']]
            note['flds'] = op['flds']
            note['tags'] = op.get('tags', note.get('tags', []))
            model = col['models'][note['mid']]
            if model['kind'] == 'cloze':  # crea o quita tarjetas según los huecos
                did = next((c[2] for c in col['cards'] if c[0] == op['nid']), None)
                want = set(_card_ords(model, note['flds']))
                have = {c[1] for c in col['cards'] if c[0] == op['nid']}
                col['cards'] = [c for c in col['cards'] if c[0] != op['nid'] or c[1] in want]
                col['cards'] += [[op['nid'], o, did] for o in sorted(want - have)]
        elif kind == 'deleteNotes':
            gone = set(op['nids'])
            col['notes'] = {k: v for k, v in col['notes'].items() if k not in gone}
            col['cards'] = [c for c in col['cards'] if c[0] not in gone]
        elif kind == 'moveCards':
            moving = {(c[0], c[1]) for c in op['cards']}
            for c in col['cards']:
                if (c[0], c[1]) in moving:
                    c[2] = op['did']
        else:
            raise ValueError('operación desconocida')
        store(col)
        res['col'] = col
        return res


# ---------- importar ----------

def _varint(buf, i):
    shift = val = 0
    while True:
        b = buf[i]
        i += 1
        val |= (b & 0x7F) << shift
        if not b & 0x80:
            return val, i
        shift += 7


def _pb(buf):
    """Decodificador mínimo de protobuf: {número de campo: [valores]}."""
    out, i = {}, 0
    try:
        while i < len(buf):
            key, i = _varint(buf, i)
            fn, wt = key >> 3, key & 7
            if wt == 0:
                v, i = _varint(buf, i)
            elif wt == 1:
                v, i = buf[i:i + 8], i + 8
            elif wt == 2:
                ln, i = _varint(buf, i)
                v, i = buf[i:i + ln], i + ln
            elif wt == 5:
                v, i = buf[i:i + 4], i + 4
            else:
                break
            out.setdefault(fn, []).append(v)
    except IndexError:
        pass
    return out


def _s(pb, fn, default=''):
    v = pb.get(fn)
    return v[0].decode('utf-8', 'replace') if v and isinstance(v[0], (bytes, bytearray)) else default


def _unz(b):
    return zstd.decompress(b) if zstd and b[:4] == ZSTD_MAGIC else b


def _read_db(db):
    tables = {r[0] for r in db.execute("select name from sqlite_master where type='table'")}
    models, decks = {}, {}
    if 'notetypes' in tables:  # esquema nuevo (Anki 2.1.50+)
        for ntid, name, cfg in db.execute('select id, name, config from notetypes'):
            pb = _pb(cfg or b'')
            models[str(ntid)] = {'name': name, 'kind': 'cloze' if pb.get(1, [0])[0] == 1 else 'normal',
                                 'css': _s(pb, 3), 'fields': [], 'tmpls': []}
        for ntid, ord_, name in db.execute('select ntid, ord, name from fields order by ntid, ord'):
            models[str(ntid)]['fields'].append(name)
        for ntid, ord_, name, cfg in db.execute('select ntid, ord, name, config from templates order by ntid, ord'):
            pb = _pb(cfg or b'')
            models[str(ntid)]['tmpls'].append({'name': name, 'q': _s(pb, 1), 'a': _s(pb, 2)})
        for did, name in db.execute('select id, name from decks'):
            decks[str(did)] = name.replace('\x1f', '::')
    else:  # esquema viejo: todo en la tabla col como JSON
        row = db.execute('select models, decks from col').fetchone()
        for mid, m in json.loads(row[0]).items():
            models[str(mid)] = {'name': m['name'], 'kind': 'cloze' if m.get('type') == 1 else 'normal', 'css': m.get('css', ''),
                                'fields': [f['name'] for f in sorted(m['flds'], key=lambda f: f['ord'])],
                                'tmpls': [{'name': t['name'], 'q': t['qfmt'], 'a': t['afmt']} for t in sorted(m['tmpls'], key=lambda t: t['ord'])]}
        for did, d in json.loads(row[1]).items():
            decks[str(did)] = d['name']
    notes = {str(nid): (str(mid), flds.split('\x1f'), tags.split()) for nid, mid, flds, tags in
             db.execute('select id, mid, flds, tags from notes')}
    cards = [(str(nid), ord_, str(odid or did)) for nid, did, odid, ord_ in db.execute('select nid, did, odid, ord from cards order by due, id')]
    return models, decks, notes, cards


def _import_apkg(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = set(z.namelist())
    for name in ('collection.anki21b', 'collection.anki21', 'collection.anki2'):
        if name in names:
            raw = z.read(name)
            if name.endswith('b'):
                if zstd is None:
                    raise ValueError('Este mazo usa el formato nuevo de Anki y tu Python no puede descomprimirlo.')
                raw = zstd.decompress(raw)
            break
    else:
        raise ValueError('El archivo no parece un mazo de Anki.')
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as tmp:
        tmp.write(raw)
    try:
        db = sqlite3.connect(tmp.name)
        models, decks, notes, cards = _read_db(db)
        db.close()
    finally:
        os.remove(tmp.name)
    # archivos de imagen y audio
    media = {}
    if 'media' in names:
        mraw = z.read('media')
        try:
            media = {k: v for k, v in json.loads(mraw.decode('utf-8')).items()}
        except (UnicodeDecodeError, ValueError):
            entries = _pb(_unz(mraw)).get(1, [])
            for idx, entry in enumerate(entries):
                e = _pb(entry)
                zipname = str(e[255][0]) if 255 in e else str(idx)
                media[zipname] = _s(e, 1)
    files = {}
    for zipname, fname in media.items():
        if zipname in names and fname:
            files[fname] = _unz(z.read(zipname))
    return models, decks, notes, cards, files


def _import_text(text, filename):
    meta, rows = {}, []
    lines = text.lstrip('﻿').splitlines()
    body = []
    for line in lines:
        m = re.match(r'^#(\w[\w ]*):(.*)$', line)
        if m and not body:
            meta[m.group(1).strip().lower()] = m.group(2).strip()
        elif line.strip():
            body.append(line)
    sep = {'tab': '\t', 'semicolon': ';', 'comma': ',', 'pipe': '|', 'space': ' ', 'colon': ':'}.get(meta.get('separator', '').lower(), meta.get('separator'))
    if not sep:
        first = body[0] if body else ''
        sep = '\t' if '\t' in first else ';' if ';' in first else ','
    for r in csv.reader(body, delimiter=sep):
        r = [c.strip() for c in r]
        if len(r) >= 2 and (r[0] or r[1]):
            tags = r[2].split() if len(r) > 2 and meta.get('tags column') == '3' else []
            back = r[1] if len(r) <= 2 or tags else '<br>'.join(x for x in r[1:] if x)
            rows.append(([r[0], back], tags))
    if not rows:
        raise ValueError('No encontré tarjetas. Cada línea tiene que tener frente y reverso separados por tabulación, punto y coma o coma.')
    if meta.get('html', 'true').lower() == 'false' or not any('<' in f for (fl, _) in rows for f in fl):
        rows = [([f.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;') for f in fl], t) for fl, t in rows]
    deck = meta.get('deck') or os.path.splitext(os.path.basename(filename))[0]
    return deck, rows


def import_file(filename, data, reverse=False):
    imp = _uid('i')
    low = filename.lower()
    with _lock:
        col = load()
        if low.endswith(('.apkg', '.colpkg')):
            models, decks, notes, cards, files = _import_apkg(data)
            # copia los archivos con un prefijo para que no choquen entre mazos
            rename = {}
            for fname, content in files.items():
                safe = re.sub(r'[^\w.\-]', '_', fname)
                new = f'{imp}_{safe}'
                with open(os.path.join(MEDIA, new), 'wb') as fh:
                    fh.write(content)
                rename[fname] = new

            def fix(text):
                if not rename:
                    return text
                text = re.sub(r'\[sound:([^\]]+)\]', lambda m: f'[sound:{rename.get(m.group(1), m.group(1))}]', text)
                return re.sub(r'(src\s*=\s*)(["\']?)([^"\'\s>]+)\2',
                              lambda m: f'{m.group(1)}{m.group(2)}{rename.get(m.group(3), m.group(3))}{m.group(2)}', text)
            used_decks = {c[2] for c in cards}
            for mid, m in models.items():
                col['models'][f'{imp}-{mid}'] = m
            for did in used_decks:
                col['decks'][f'{imp}-{did}'] = {'name': decks.get(did, 'Mazo importado'), 'src': 'apkg', 'created': time.time()}
            for nid, (mid, flds, tags) in notes.items():
                col['notes'][f'{imp}-{nid}'] = {'mid': f'{imp}-{mid}', 'flds': [fix(f) for f in flds], 'tags': tags}
            col['cards'] += [[f'{imp}-{nid}', o, f'{imp}-{did}'] for nid, o, did in cards if nid in notes]
            summary = {'decks': sorted(decks.get(d, 'Mazo importado') for d in used_decks), 'notes': len(notes),
                       'cards': len(cards), 'media': len(files)}
        elif low.endswith(('.csv', '.txt', '.tsv')):
            deck, rows = _import_text(data.decode('utf-8', 'replace'), filename)
            did = f'{imp}-deck'
            mid = 'basicrev' if reverse else 'basic'
            col['decks'][did] = {'name': deck, 'src': 'csv', 'created': time.time()}
            n = 0
            for flds, tags in rows:
                nid = f'{imp}-{n}'
                col['notes'][nid] = {'mid': mid, 'flds': flds, 'tags': tags}
                col['cards'] += [[nid, o, did] for o in range(len(col['models'][mid]['tmpls']))]
                n += 1
            summary = {'decks': [deck], 'notes': n, 'cards': n * (2 if reverse else 1), 'media': 0}
        else:
            raise ValueError('Formato no compatible. Usá .apkg, .colpkg, .csv, .txt o .tsv.')
        store(col)
    return summary
