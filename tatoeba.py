#!/usr/bin/env python3
"""Arma tatoeba-data.js: frases inglés-español de Tatoeba para "Lectura en voz alta".

Tatoeba (https://tatoeba.org) publica sus frases con licencia CC BY 2.0 FR.
Uso:  python3 tatoeba.py            (descarga lo que falte en data/tatoeba/ y genera el archivo)
      python3 tatoeba.py --por-nivel 1500

Cómo elige las frases:
  - solo frases en inglés que tienen traducción al español y audio grabado por una persona
    (el audio es una buena señal de que la frase es natural y la revisó un hablante);
  - sin nombres propios (Tatoeba está lleno de "Tom" y "Mary") ni números o símbolos raros;
  - el nivel sale del largo y de qué tan comunes son sus palabras (contadas en todo el inglés de Tatoeba);
  - dentro de cada nivel van de la más fácil a la más difícil.
"""
import bz2, collections, json, os, re, sys, tarfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'data', 'tatoeba')
OUT = os.path.join(HERE, 'tatoeba-data.js')
BASE = 'https://downloads.tatoeba.org/exports/'
FILES = {
    'eng_sentences.tsv': 'per_language/eng/eng_sentences.tsv.bz2',
    'spa_sentences.tsv': 'per_language/spa/spa_sentences.tsv.bz2',
    'eng-spa_links.tsv': 'per_language/eng/eng-spa_links.tsv.bz2',
    'sentences_with_audio.csv': 'sentences_with_audio.tar.bz2',
}
# nivel: (palabras mín., palabras máx., palabra más rara permitida según su puesto en la lista de frecuencia)
LEVELS = {1: (3, 7, 1200), 2: (6, 11, 3500), 3: (9, 16, 9000)}
WORD = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)*")
OK_CHARS = re.compile(r"^[A-Za-z ,.'?!-]+$")
# afuera: versículos bíblicos, inglés antiguo y groserías (Tatoeba tiene de todo)
SKIP = set('''heaven heavens spirit lord god gods jesus christ disciples disciple sinners sin sins thee thou thy thine hath doth
ye unto shalt verily blessed holy prophet prophets angel angels pharisees israel moses apostles lest whence thereof
fuck fucking fucked shit bitch ass asshole damn dick cock pussy sex sexy kill killed suicide rape murder murdered'''.split())


def fetch():
    os.makedirs(RAW, exist_ok=True)
    for name, url in FILES.items():
        dest = os.path.join(RAW, name)
        if os.path.exists(dest):
            continue
        arch = os.path.join(RAW, os.path.basename(url))
        if not os.path.exists(arch):
            print('Descargando', url)
            urllib.request.urlretrieve(BASE + url, arch)
        if arch.endswith('.tar.bz2'):
            with tarfile.open(arch) as t:
                member = next(m for m in t.getmembers() if m.name.endswith(name) and m.isfile())
                with t.extractfile(member) as src, open(dest, 'wb') as out:
                    out.write(src.read())
        else:
            with bz2.open(arch) as src, open(dest, 'wb') as out:
                out.write(src.read())


def rows(name):
    with open(os.path.join(RAW, name), encoding='utf-8') as f:
        for line in f:
            yield line.rstrip('\n').split('\t')


def main():
    per_level = int(sys.argv[sys.argv.index('--por-nivel') + 1]) if '--por-nivel' in sys.argv else 1200
    fetch()

    eng = {int(r[0]): r[2] for r in rows('eng_sentences.tsv') if len(r) >= 3}
    spa = {int(r[0]): r[2] for r in rows('spa_sentences.tsv') if len(r) >= 3}
    audio = {int(r[1]) for r in rows('sentences_with_audio.csv') if len(r) >= 2 and r[1].isdigit()}
    links = collections.defaultdict(list)
    for r in rows('eng-spa_links.tsv'):
        a, b = int(r[0]), int(r[1])
        if a in eng and b in spa:
            links[a].append(b)

    # frecuencia de cada palabra en todo el inglés de Tatoeba; "low" cuenta cuántas veces aparece en minúscula
    freq, low = collections.Counter(), collections.Counter()
    for text in eng.values():
        for m in WORD.finditer(text):
            w = m.group()
            freq[w.lower()] += 1
            if w.islower():
                low[w] += 1
    rank = {w: i for i, (w, _) in enumerate(freq.most_common())}
    # palabras que casi nunca van en minúscula: nombres (Tom, Mary, Boston...). "I" y sus formas no cuentan.
    proper = {w for w, n in freq.items() if low[w] < n * 0.15 and w != 'i' and not w.startswith("i'")}

    picked = {1: [], 2: [], 3: []}
    seen = set()
    for sid, text in eng.items():
        if sid not in audio or sid not in links or not OK_CHARS.match(text):
            continue
        words = [w.lower() for w in WORD.findall(text)]
        if not words or any(w in proper or w in SKIP for w in words):
            continue
        key = ' '.join(words)
        if key in seen:
            continue
        hardest = max(rank.get(w, 10 ** 6) for w in words)
        for lvl, (lo, hi, top) in LEVELS.items():
            prev_top = LEVELS[lvl - 1][2] if lvl > 1 else 0
            if lo <= len(words) <= hi and hardest < top and (lvl == 1 or hardest >= prev_top or len(words) > LEVELS[lvl - 1][1]):
                es = min((spa[b] for b in links[sid]), key=len)  # la traducción más corta suele ser la más directa
                picked[lvl].append((hardest + 40 * len(words), sid, text, es))
                seen.add(key)
                break

    out = []
    for lvl in (1, 2, 3):
        items = sorted(picked[lvl])
        # repartidas a lo largo de todo el rango, así hay variedad y no solo las mil más cortas
        step = max(1, len(items) / per_level)
        chosen = [items[int(i * step)] for i in range(min(per_level, len(items)))]
        print(f'Nivel {lvl}: {len(items)} candidatas, {len(chosen)} elegidas')
        out += [[lvl, text, es, sid] for _, sid, text, es in chosen]

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// Generado por tatoeba.py. Frases de Tatoeba (https://tatoeba.org), licencia CC BY 2.0 FR.\n')
        f.write('// [nivel, inglés, español, número de la frase en Tatoeba]\n')
        f.write('export default ')
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('Listo:', OUT, f'({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
