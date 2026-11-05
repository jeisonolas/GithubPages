"""Genera la copia privada de los textos para el bucket `biblia` de Supabase.

Uso:
  python tools/build_texts.py <salida> VER=archivo [VER=archivo ...]

Cada archivo es una Biblia completa en uno de estos formatos:
  - bolls.life:  https://bolls.life/static/translations/{VER}.zip  (lista de {book, chapter, verse, text})
  - helloao:     https://bible.helloao.org/api/{id}/complete.json  (RV1909 = spa_r09)

Escribe <salida>/{VER}.json.gz con {libro: {capítulo: [[versículo, texto], ...]}}. El texto va tal
cual: la limpieza (ñ de la LBLA, cursivas, |par...) la hace la app con cleanText, igual que con la
API, para que haya una sola versión de esas reglas. Al final imprime un informe de integridad.

Los archivos generados tienen copyright (salvo RV1909 y KJV): no se suben al repo, solo al bucket.
"""
import gzip
import json
import re
import sys
from collections import Counter
from pathlib import Path


def load_bolls(data):
    out = {}
    for r in data:
        # La KJV de bolls trae también apócrifos y los añadidos griegos de Ester (cap. 11-16).
        if r["book"] <= 66 and not (r["book"] == 17 and r["chapter"] > 10):
            out.setdefault(r["book"], {}).setdefault(r["chapter"], []).append([r["verse"], r["text"]])
    return out


def load_helloao(data):
    out = {}
    for b in data["books"]:
        for c in b["chapters"]:
            ch = c["chapter"]
            verses = [[x["number"], " ".join(i if isinstance(i, str) else i.get("text", "") for i in x["content"])]
                      for x in ch["content"] if x["type"] == "verse"]
            verses = [v for v in verses if v[1].strip()]  # versículos unidos al anterior vienen vacíos
            out.setdefault(b["order"], {})[ch["number"]] = verses
    return out


def load(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return load_helloao(data) if isinstance(data, dict) else load_bolls(data)


def report(ver, bible):
    verses = [(b, c, v, t) for b, chs in bible.items() for c, vs in chs.items() for v, t in vs]
    plain = lambda t: re.sub(r"<[^>]+>", "", t)
    empty = [f"{b}:{c}:{v}" for b, c, v, t in verses if not plain(t).strip()]
    dup = [f"{b}:{c}" for b, chs in bible.items() for c, vs in chs.items() if len({v for v, _ in vs}) != len(vs)]
    glued = Counter(m for *_, t in verses for m in re.findall(r"\b[a-záéíóúñ]+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b", plain(t)))
    odd = Counter(ch for *_, t in verses for ch in plain(t) if not re.match(r"[\w\s.,;:¿?¡!'\"«»“”‘’()\[\]\-–—…|•/*]", ch))
    italics = sum(1 for *_, t in verses if t.count("<i>") != t.count("</i>"))
    print(f"{ver}: {len(bible)} libros, {sum(len(c) for c in bible.values())} capítulos, {len(verses)} versículos")
    print(f"   vacíos: {len(empty)} {empty[:5]}")
    print(f"   versículos repetidos en: {dup[:5]}")
    print(f"   cursivas sin cerrar: {italics}")
    print(f"   posibles palabras pegadas: {sum(glued.values())} {glued.most_common(8)}")
    print(f"   caracteres raros: {odd.most_common(10)}")


def main():
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    for arg in sys.argv[2:]:
        ver, path = arg.split("=", 1)
        bible = load(path)
        report(ver, bible)
        raw = json.dumps(bible, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        target = out_dir / f"{ver}.json.gz"
        target.write_bytes(gzip.compress(raw, 9, mtime=0))
        print(f"   -> {target.name}: {len(raw) / 1e6:.1f} MB, comprimido {target.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
