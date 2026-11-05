"""Genera data/parallels.js: citas del AT en el NT y pasajes paralelos, de la UBS Parallel Passages Database.

Uso:
    python tools/build_parallels.py ParallelPassages.xml eng.json

Fuentes (las dos CC BY-SA 4.0, así que el archivo generado también lo es):
- https://github.com/ubsicap/ubs-open-license  (parallel passages/ParallelPassages.xml)
- https://github.com/Copenhagen-Alliance/versification-specification  (versification-mappings/standard-mappings/eng.json)

La UBS numera el AT como el texto hebreo (Salmo 22:1 de la RV es su PSA 22:2; Joel 2:28 es JOL 3:1).
Aquí se pasa todo a la numeración inglesa, que es la de la app.

Salida (global window.PARALLELS):
    groups: [[[libro, [[capítulo, desde, hasta], ...], coincidencia 0-100], ...], ...]
    index: {"libro.capítulo.versículo": [grupo, ...]}
La coincidencia es el % de palabras del pasaje que la UBS marca como iguales a las del otro (2/5/8 = plena).
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

USFM = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM "
        "EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP "
        "COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV").split()
BOOK = {code: i + 1 for i, code in enumerate(USFM)}
RANGE = re.compile(r"^([1-3A-Z]{3}) (\d+):(\d+)(?:-(\d+))?$")


def org_to_eng(path):
    """{(libro, cap, vers) hebreo: (cap, vers) inglés}, invirtiendo los rangos de eng.json."""
    out = {}
    for eng, org in json.loads(Path(path).read_text(encoding="utf8"))["mappedVerses"].items():
        e, o = RANGE.match(eng), RANGE.match(org)
        if not (e and o) or e[1] not in BOOK:
            continue  # libros deuterocanónicos y versículos partidos (1:1a)
        e_start, o_start = int(e[3]), int(o[3])
        for k in range(int(o[4] or o[3]) - o_start + 1):
            # el versículo 0 inglés es el título del salmo: en la app va con el versículo 1
            out[(BOOK[o[1]], int(o[2]), o_start + k)] = (int(e[2]), max(1, e_start + k))
    return out


def parse_ref(text, mapping):
    """'LUK 6:27-28,35' → (libro, [[6, 27, 28], [6, 35, 35]]) en numeración inglesa.
    Puede quedar en dos capítulos: 2KI 12:1-2 hebreo es 2 Reyes 11:21–12:1."""
    code, rest = text.split(" ")
    chapter, verses = rest.split(":")
    book = BOOK[code]
    found = set()
    for part in verses.split(","):
        a, _, b = part.partition("-")
        for v in range(int(a), int(b or a) + 1):
            found.add(mapping.get((book, int(chapter), v), (int(chapter), v)))
    spans = []
    for c, v in sorted(found):
        if spans and spans[-1][0] == c and v == spans[-1][2] + 1:
            spans[-1][2] = v
        else:
            spans.append([c, v, v])
    return book, spans


def match(marks):
    full = sum(m in "258" for m in marks)
    return round(100 * full / len(marks)) if marks else 0


def main():
    mapping = org_to_eng(sys.argv[2])
    groups, index = [], defaultdict(list)
    for passage in ET.parse(sys.argv[1]).getroot().iter("Passage"):
        group = []
        for verse in passage.iter("Verse"):
            book, spans = parse_ref(verse.text.strip(), mapping)
            marks = verse.get("GRK") or verse.get("HEB") or ""
            group.append([book, spans, match(marks)])
        gi = len(groups)
        groups.append(group)
        for book, spans, _ in group:
            for chapter, a, b in spans:
                for v in range(a, b + 1):
                    key = f"{book}.{chapter}.{v}"
                    if gi not in index[key]:
                        index[key].append(gi)
    out = Path(__file__).resolve().parent.parent / "data" / "parallels.js"
    out.write_text(
        "// Citas del AT en el NT y pasajes paralelos, en numeración inglesa (la de la app).\n"
        "// Fuente: UBS Parallel Passages Database, © 2023 United Bible Societies, CC BY-SA 4.0\n"
        "// (https://github.com/ubsicap/ubs-open-license), con la versificación de Copenhagen Alliance (CC BY-SA 4.0).\n"
        "// Este archivo se comparte con la misma licencia. Generado con tools/build_parallels.py: no editar a mano.\n"
        f"window.PARALLELS = {json.dumps({'groups': groups, 'index': index}, separators=(',', ':'))};\n",
        encoding="utf8")
    quotes = sum(any(m[0] < 40 for m in g) and any(m[0] >= 40 for m in g) for g in groups)
    print(f"{len(groups)} grupos ({quotes} con citas del AT en el NT), {len(index)} versículos, {out.stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
