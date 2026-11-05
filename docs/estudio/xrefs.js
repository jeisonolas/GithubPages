"use strict";
// Referencias cruzadas de OpenBible.info (CC-BY), generadas con tools/build_crossrefs.py en data/xref/{libro}.json.
// Cada libro se descarga la primera vez que se abre y queda en IndexedDB para leer sin conexión.
// Usa globales de app.js (el, settings, fetchChapter, goTo), strongs.js (status) y texts.js (idb).

// Subir al volver a generar data/xref: fuerza la nueva descarga en cada dispositivo.
const XREF_REVISION = 1;
const XREF_PREVIEWS = 8; // cuántas se muestran con texto antes de «Ver más»
const xrefBooks = {};

// "43.3.16" o "43.3.16-3.18" → { book, chapter, verse, endChapter, endVerse }
function parseXref(s) {
  const [start, end] = s.split("-");
  const [book, chapter, verse] = start.split(".").map(Number);
  const [endChapter, endVerse] = end ? end.split(".").map(Number) : [chapter, verse];
  return { book, chapter, verse, endChapter, endVerse };
}

function xrefLabel(r) {
  const start = `${window.BOOKS[r.book - 1].name} ${r.chapter}:${r.verse}`;
  if (r.endChapter !== r.chapter) return `${start}–${r.endChapter}:${r.endVerse}`;
  return r.endVerse !== r.verse ? `${start}-${r.endVerse}` : start;
}

function xrefBook(book) {
  return xrefBooks[book] ??= (async () => {
    const key = `xref@${XREF_REVISION}:${book}`;
    const local = await idb("readonly", (s) => s.get(key)).catch(() => null);
    if (local) return local;
    const res = await fetch(`data/xref/${book}.json`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    idb("readwrite", (s) => s.put(data, key)).catch(() => {});
    return data;
  })().catch((e) => { delete xrefBooks[book]; throw e; });
}

async function getXrefs(book, chapter, verse) {
  return ((await xrefBook(book))[chapter]?.[verse] || []).map(parseXref);
}

// Texto del pasaje en la versión base, sin HTML. Si salta de capítulo, solo el primero.
async function xrefText(r) {
  const verses = await fetchChapter(settings.base, r.book, r.chapter);
  const last = r.endChapter === r.chapter ? r.endVerse : Infinity;
  const tmp = document.createElement("div");
  tmp.innerHTML = Object.keys(verses).filter((v) => v >= r.verse && v <= last).map((v) => verses[v]).join(" ");
  return tmp.textContent.trim();
}

// Lleva al pasaje y abre su panel, con un botón para volver al versículo de origen.
async function jumpToXref(r, origin) {
  await goTo(r.book, r.chapter);
  document.getElementById(`v${r.verse}`)?.scrollIntoView({ block: "center" });
  openVerse(r.verse, origin);
}

function xrefItem(r, origin) {
  const text = el("span", { className: "xref-text" });
  const item = el("button", { type: "button", className: "xref" }, [el("b", { textContent: xrefLabel(r) }), text]);
  item.addEventListener("click", () => jumpToXref(r, origin));
  return { node: el("li", {}, [item]), fill: () => xrefText(r).then((t) => { text.textContent = t; }).catch(() => {}) };
}

async function renderXrefs(container, book, chapter, verse, onCount) {
  let refs;
  try {
    refs = await getXrefs(book, chapter, verse);
  } catch {
    return container.replaceChildren(el("p", { className: "error", textContent: "No se pudieron cargar las referencias." }));
  }
  onCount(refs.length);
  if (!refs.length) return container.replaceChildren(status("Este versículo no tiene referencias cruzadas."));
  const origin = { book, chapter, verse };
  const items = refs.map((r) => xrefItem(r, origin));
  const list = el("ul", { className: "xref-list" }, items.slice(0, XREF_PREVIEWS).map((i) => i.node));
  items.slice(0, XREF_PREVIEWS).forEach((i) => i.fill());
  let more = "";
  if (items.length > XREF_PREVIEWS) {
    more = el("button", { type: "button", className: "link", textContent: `Ver ${items.length - XREF_PREVIEWS} más` });
    more.addEventListener("click", () => {
      more.remove();
      for (const i of items.slice(XREF_PREVIEWS)) { list.append(i.node); i.fill(); }
    });
  }
  container.replaceChildren(
    el("p", { className: "hint", textContent: `Pasajes relacionados, de más a menos relevantes, en ${settings.base}. Toca uno para ir a él.` }),
    list, more,
    el("p", { className: "credit" }, ["Fuente: ", el("a", { href: "https://www.openbible.info/labs/cross-references/", target: "_blank", rel: "noopener", textContent: "OpenBible.info" }), " (CC BY)."]));
}
