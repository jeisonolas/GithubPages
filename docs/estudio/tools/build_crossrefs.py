"""Genera data/xref/{libro}.json a partir de las referencias cruzadas de OpenBible.info (CC-BY).

Uso:
    python tools/build_crossrefs.py cross_references.txt [--min-votes 3] [--max 20]

Fuente: https://a.openbible.info/data/cross-references.zip
Cada archivo es {capítulo: {versículo: ["libro.cap.vers" o "libro.cap.vers-cap.vers", ...]}},
ordenado de más a menos votos. Numeración de la KJV, igual que la de las versiones de la app.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

OSIS = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov "
        "Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark "
        "Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet "
        "1John 2John 3John Jude Rev").split()
BOOK = {name: i + 1 for i, name in enumerate(OSIS)}


def verse(osis):
    b, c, v = osis.split(".")
    return BOOK[b], int(c), int(v)


def target(osis):
    start, _, end = osis.partition("-")
    b, c, v = verse(start)
    if end:
        eb, ec, ev = verse(end)
        if eb == b and (ec, ev) > (c, v):  # los rangos entre libros (18) se quedan en su primer versículo
            return f"{b}.{c}.{v}-{ec}.{ev}"
    return f"{b}.{c}.{v}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data" / "xref"))
    ap.add_argument("--min-votes", type=int, default=3)
    ap.add_argument("--max", type=int, default=20, help="máximo de referencias por versículo")
    args = ap.parse_args()

    refs = defaultdict(list)  # (libro, cap, vers) -> [(votos, destino)]
    with open(args.source, encoding="utf8") as f:
        next(f)
        for line in f:
            src, dst, votes = line.rstrip("\n").split("\t")[:3]
            if int(votes) >= args.min_votes:
                refs[verse(src)].append((int(votes), target(dst)))

    books = defaultdict(lambda: defaultdict(dict))
    total = 0
    for (b, c, v), items in refs.items():
        items.sort(key=lambda x: -x[0])
        seen = []
        for _, dst in items:
            if dst not in seen:
                seen.append(dst)
        books[b][c][v] = seen[: args.max]
        total += len(books[b][c][v])

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    size = 0
    for b in range(1, 67):
        path = out / f"{b}.json"
        path.write_text(json.dumps(books.get(b, {}), separators=(",", ":")), encoding="utf8")
        size += path.stat().st_size
    print(f"{len(refs)} versículos, {total} referencias, {size / 1e6:.1f} MB en {out}")


if __name__ == "__main__":
    main()
