"""Genera data/lbc1689.js: la Confesión Bautista de 1689 indexada por los versículos que cita como prueba.

Uso:
    python tools/build_1689.py <carpeta src/ de BaptistSymbolics/1689Confession>

Fuente: https://github.com/BaptistSymbolics/1689Confession (CC0, texto original en inglés).
Salida (global window.LBC1689):
    titles: {capítulo: título en español}
    paragraphs: [[capítulo, párrafo, [frase, ...]], ...]
    refs: {"libro.capítulo": [[desde, hasta, índice de párrafo, índice de frase], ...]}
Un capítulo citado entero ("Psalm 51") se guarda como versículos 1-999.
"""
import json
import re
import sys
import tomllib
from collections import defaultdict
from pathlib import Path

NAMES = ("Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth 1_Samuel 2_Samuel 1_Kings 2_Kings "
         "1_Chronicles 2_Chronicles Ezra Nehemiah Esther Job Psalm Proverbs Ecclesiastes Song_of_Solomon Isaiah "
         "Jeremiah Lamentations Ezekiel Daniel Hosea Joel Amos Obadiah Jonah Micah Nahum Habakkuk Zephaniah Haggai "
         "Zechariah Malachi Matthew Mark Luke John Acts Romans 1_Corinthians 2_Corinthians Galatians Ephesians "
         "Philippians Colossians 1_Thessalonians 2_Thessalonians 1_Timothy 2_Timothy Titus Philemon Hebrews James "
         "1_Peter 2_Peter 1_John 2_John 3_John Jude Revelation").split()
BOOK = {n.replace("_", " "): i + 1 for i, n in enumerate(NAMES)}
BOOK.update({"Psalms": 19, "Cant": 22, "Canticles": 22, "1 Chro": 13})
ONE_CHAPTER = {31, 57, 63, 64, 65}  # Abdías, Filemón, 2 y 3 Juan, Judas: "Jude 4" es el versículo 4
WHOLE = (1, 999)

TITLES = {
    1: "De las Santas Escrituras", 2: "De Dios y de la Santa Trinidad", 3: "Del decreto de Dios",
    4: "De la creación", 5: "De la divina providencia", 6: "De la caída del hombre, del pecado y de su castigo",
    7: "Del pacto de Dios", 8: "De Cristo el Mediador", 9: "Del libre albedrío", 10: "Del llamamiento eficaz",
    11: "De la justificación", 12: "De la adopción", 13: "De la santificación", 14: "De la fe salvadora",
    15: "Del arrepentimiento para vida y salvación", 16: "De las buenas obras",
    17: "De la perseverancia de los santos", 18: "De la seguridad de la gracia y de la salvación",
    19: "De la ley de Dios", 20: "Del evangelio y del alcance de su gracia",
    21: "De la libertad cristiana y de la libertad de conciencia",
    22: "De la adoración religiosa y del día de reposo", 23: "De los juramentos y votos lícitos",
    24: "Del magistrado civil", 25: "Del matrimonio", 26: "De la iglesia", 27: "De la comunión de los santos",
    28: "Del bautismo y la Cena del Señor", 29: "Del bautismo", 30: "De la Cena del Señor",
    31: "Del estado del hombre después de la muerte y de la resurrección de los muertos", 32: "Del juicio final",
}


def parse(verses):
    """'Romans 3:24,25; Psalm 51; Colossians 1:21;22' → [(libro, capítulo, desde, hasta), ...]"""
    s = verses.replace(" etc.", "").replace(".-", "-").replace(". &", "")
    out, book, chapter = [], None, None
    for part in re.split(r";|\.\s+(?=[123] [A-Z]|[A-Z])", s):
        part = part.strip().rstrip(".")
        if not part:
            continue
        m = re.match(r"^((?:[123] )?[A-Za-z][A-Za-z ]*?)\.?\s+(\d.*)$", part)
        if m:
            book, rest = BOOK[m.group(1)], m.group(2)
            if book in ONE_CHAPTER:  # "3 John 8,9,10"; la fuente escribe "Jude 6:7" por los versículos 6 y 7
                chapter, rest = "1", rest.removeprefix("1:").replace(":", ",")
            elif ":" in rest:
                chapter, rest = rest.split(":", 1)
            elif "," in rest:  # estilo antiguo "21,1" = capítulo 21, versículo 1
                chapter, rest = rest.split(",", 1)
            else:
                out.append((book, int(rest), *WHOLE))
                continue
        elif book is None or not re.fullmatch(r"[\d,\- ]+", part):
            raise ValueError(f"No entiendo «{part}» en «{verses}»")
        else:
            rest = part  # "1:21;22": otro versículo del mismo capítulo
        for v in filter(None, rest.split(",")):  # la fuente a veces deja una coma al final
            a, _, b = v.strip().partition("-")
            out.append((book, int(chapter), int(a), int(b or a)))
    return out


def main():
    src = Path(sys.argv[1])
    paragraphs, refs, titles = [], defaultdict(list), {}
    for f in sorted(src.glob("*.toml")):
        d = tomllib.loads(f.read_text(encoding="utf8"))
        c, p = int(d["chapter"]), int(d["paragraph"])
        titles[c] = d["chapter_title"]
        pi = len(paragraphs)
        paragraphs.append([c, p, [s["text"].strip() for s in d["sections"]]])
        for si, s in enumerate(d["sections"]):
            for book, chapter, a, b in parse(s["verses"]) if s["verses"].strip() else []:
                entry = [a, b, pi, si]
                if entry not in refs[f"{book}.{chapter}"]:
                    refs[f"{book}.{chapter}"].append(entry)
    assert sorted(titles) == sorted(TITLES), "cambió la lista de capítulos"
    data = {"titles": TITLES, "paragraphs": paragraphs, "refs": refs}
    out = Path(__file__).resolve().parent.parent / "data" / "lbc1689.js"
    out.write_text(
        "// Confesión Bautista de 1689 (texto original en inglés) indexada por sus textos de prueba.\n"
        "// Fuente: https://github.com/BaptistSymbolics/1689Confession (CC0). Títulos en español: traducción propia.\n"
        "// Generado con tools/build_1689.py: no editar a mano.\n"
        f"window.LBC1689 = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf8")
    n = sum(len(v) for v in refs.values())
    print(f"{len(paragraphs)} párrafos, {n} citas en {len(refs)} capítulos bíblicos, {out.stat().st_size / 1e3:.0f} KB")


if __name__ == "__main__":
    main()
