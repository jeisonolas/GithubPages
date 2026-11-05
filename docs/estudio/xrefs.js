"use strict";
// Referencias cruzadas de OpenBible.info (CC-BY), generadas con tools/build_crossrefs.py en data/xref/{libro}.json.
// Cada libro se descarga la primera vez que se abre y queda en IndexedDB para leer sin conexión.
// Citas y paralelos: data/parallels.js (UBS, CC BY-SA).
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

function xrefItem(r, origin, label = xrefLabel(r), badge = "") {
  const text = el("span", { className: "xref-text" });
  const head = el("span", { className: "xref-head" }, [el("b", { textContent: label }), badge ? el("span", { className: "badge", textContent: badge }) : ""]);
  const item = el("button", { type: "button", className: "xref" }, [head, text]);
  item.addEventListener("click", () => jumpToXref(r, origin));
  return { node: el("li", {}, [item]), fill: () => xrefText(r).then((t) => { text.textContent = t; }).catch(() => {}) };
}

// ---------- Citas del AT en el NT y pasajes paralelos (UBS, data/parallels.js) ----------

const PAR = window.PARALLELS || { groups: [], index: {} };

// "Lucas 6:27-28, 35" / "2 Reyes 11:21; 12:1"
function spansLabel(book, spans) {
  let out = window.BOOKS[book - 1].name, prev = null;
  for (const [c, a, b] of spans) {
    const vv = a === b ? `${a}` : `${a}-${b}`;
    out += prev === null ? ` ${c}:${vv}` : prev === c ? `, ${vv}` : `; ${c}:${vv}`;
    prev = c;
  }
  return out;
}

// Qué tan literal es la cita: % de palabras del pasaje del NT que la UBS marca como iguales al AT.
const quoteKind = (match) => (match >= 50 ? "literal" : match >= 20 ? "parcial" : "alusión");

// { quotes, parallels } del versículo. En el NT, "quotes" son los pasajes del AT que cita; en el AT, los del
// NT que lo citan. "parallels" son los del mismo testamento (evangelios entre sí, Reyes/Crónicas…).
function parallelsFor(book, chapter, verse) {
  const nt = book >= 40;
  const quotes = [], parallels = [];
  const seen = new Set();
  for (const gi of PAR.index[`${book}.${chapter}.${verse}`] || []) {
    const group = PAR.groups[gi];
    const self = group.find(([b, spans]) => b === book && spans.some(([c, a, z]) => c === chapter && verse >= a && verse <= z));
    for (const m of group) {
      if (m === self) continue;
      const [b, spans, match] = m;
      const key = `${b}:${JSON.stringify(spans)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [c, a, z] = spans[0];
      const entry = { label: spansLabel(b, spans), r: { book: b, chapter: c, verse: a, endChapter: c, endVerse: z } };
      if ((b >= 40) === nt) parallels.push(entry);
      else quotes.push({ ...entry, kind: quoteKind(nt ? self[2] : match) });
    }
  }
  return { quotes, parallels };
}

// Marca ❝ bajo el número de los versículos que citan el AT o que el NT cita.
function quoteMark(book, chapter, verse) {
  const { quotes } = parallelsFor(book, chapter, verse);
  if (!quotes.length) return "";
  const title = `${book >= 40 ? "Cita" : "Citado en"} ${quotes.map((q) => q.label).join(", ")}`;
  return el("span", { className: "quote-mark", title, textContent: "❝" });
}

function xrefSection(title, items) {
  items.forEach((i) => i.fill());
  return [el("h3", { className: "doctrine-title", textContent: title }), el("ul", { className: "xref-list" }, items.map((i) => i.node))];
}

const credit = (text, href, name, license) => el("p", { className: "credit" }, [text, el("a", { href, target: "_blank", rel: "noopener", textContent: name }), ` (${license}).`]);

async function renderXrefs(container, book, chapter, verse, onCount) {
  const origin = { book, chapter, verse };
  const { quotes, parallels } = parallelsFor(book, chapter, verse);
  const nodes = [];
  if (quotes.length) nodes.push(...xrefSection(book >= 40 ? "Cita del Antiguo Testamento" : "Citado en el Nuevo Testamento", quotes.map((q) => xrefItem(q.r, origin, q.label, q.kind))));
  if (parallels.length) nodes.push(...xrefSection("Pasajes paralelos", parallels.map((p) => xrefItem(p.r, origin, p.label))));
  if (nodes.length) nodes.push(credit("Citas y paralelos: ", "https://github.com/ubsicap/ubs-open-license", "UBS Parallel Passages", "CC BY-SA"));

  let refs = [], failed = false;
  try { refs = await getXrefs(book, chapter, verse); } catch { failed = true; }
  // Lo que ya sale como cita o paralelo no se repite en la lista general.
  const shown = new Set([...quotes, ...parallels].map(({ r }) => `${r.book}.${r.chapter}.${r.verse}`));
  refs = refs.filter((r) => !shown.has(`${r.book}.${r.chapter}.${r.verse}`));
  onCount(quotes.length + parallels.length + refs.length);

  if (refs.length) {
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
    nodes.push(el("h3", { className: "doctrine-title", textContent: "Referencias cruzadas" }), list, more,
      credit("Fuente: ", "https://www.openbible.info/labs/cross-references/", "OpenBible.info", "CC BY"));
  } else if (failed) {
    nodes.push(el("p", { className: "error", textContent: "No se pudieron cargar las referencias cruzadas." }));
  }
  if (!nodes.length) return container.replaceChildren(status("Este versículo no tiene referencias cruzadas."));
  container.replaceChildren(el("p", { className: "hint", textContent: `De más a menos relevantes, en ${settings.base}. Toca uno para ir a él.` }), ...nodes);
}
