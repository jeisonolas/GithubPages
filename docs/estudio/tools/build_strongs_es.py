"""Genera data/strongs-es.js (window.STRONGS_ES) a partir de tools/strongs_es.tsv.

Uso:
    python tools/build_strongs_es.py

strongs_es.tsv tiene una fila por código Strong (H1-H8674 y G1-G5624, los que existen) con las columnas
code, g (glosa), d (definición), l (lema), t (transliteración) y p (pronunciación). g y d son traducción
propia de las definiciones de Strong (1890, dominio público); l, t y p salen tal cual de la edición JSON
de Open Scriptures (CC BY-SA, https://github.com/openscriptures/strongs). Para corregir o mejorar una
entrada se edita el TSV y se vuelve a ejecutar este script.
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "strongs_es.tsv"
OUT = ROOT / "data" / "strongs-es.js"

HEADER = """// Diccionario Strong en español: todas las entradas hebreas (H) y griegas (G) del diccionario de Strong.
// Traducción propia de las definiciones de Strong (1890, dominio público), a partir de la edición JSON de
// Open Scriptures (CC BY-SA, https://github.com/openscriptures/strongs). Esta traducción se comparte con la misma licencia.
// Campos: g = glosa, d = definición, l = lema original, t = transliteración, p = pronunciación (solo en hebreo).
// Generado por tools/build_strongs_es.py desde tools/strongs_es.tsv: no lo edites a mano.
"""


def main():
    out = {}
    with SRC.open(encoding="utf8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            code = row["code"]
            if code in out:
                raise SystemExit(f"código repetido: {code}")
            if not (row["g"] and row["d"]):
                raise SystemExit(f"falta glosa o definición: {code}")
            entry = {k: row[k] for k in ("g", "d", "l", "t")}
            if row["p"]:
                entry["p"] = row["p"]
            out[code] = entry
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(f"{HEADER}window.STRONGS_ES = {body};\n", encoding="utf8", newline="\n")
    print(f"{len(out)} entradas, {OUT.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
