"use strict";
// Strong's: palabras originales por versículo (vía KJV con números Strong) y definiciones BDB/Thayer.
// Usa globales de app.js ($, el, API, fetchJSON, loadJSON, saveJSON, books, position).

// Palabras de función muy frecuentes: se listan, pero no cuentan como "palabras clave"
// ni se les piden definiciones automáticamente.
const STRONG_STOP = new Set([
  // Griego: artículo, conjunciones, preposiciones, pronombres, "ser", "decir"
  ..."3588 2532 1161 846 1722 1519 3754 3756 3361 1063 2443 1537 575 4314 1909 5100 3739 3778 1473 4771 5210 2249 1510 2076 2258 1488 2071 2070 2075 1526 5607 1511 3767 235 5613 3326 1223 5259 2596 3844 4012 5228 1437 1487 302 3779 3568 1438 1691 3165 3427 3450 4675 4571 4671 5216 5213 5209 2257 2254 2248 3956 3004 2036 2046 5346 2192 1096 3739 3588 3778 5124 5023 1565 3778 2228 3761 3762 3765 3708 2400 1492"
    .split(" ").map((n) => "G" + n),
  // Hebreo: partícula de objeto, relativos, preposiciones, negaciones, "ser", "decir", "hacer"
  ..."853 834 3588 413 5921 3605 559 1961 3808 4480 3651 5704 518 1571 854 5973 2088 1931 589 595 859 1992 1993 6213 3426 369 408 2009 6258 3541 8033 1157 8478 310 6440 3602 3644 2063 428 1834 1767 3605 1992 1958 834"
    .split(" ").map((n) => "H" + n),
]);

function parseKJV(text, prefix) {
  const parts = text
    .replace(/<sup>.*?<\/sup>/g, "")
    .replace(/<(?!\/?S>)[^>]+>/g, "")
    .replace(/¶/g, "")
    .split(/<S>(\d+)<\/S>/);
  const pairs = [];
  for (let i = 1; i < parts.length; i += 2) {
    const eng = parts[i - 1].trim().replace(/^[\s,.;:!?()'"]+|[\s,.;:!?()'"]+$/g, "");
    pairs.push([eng, prefix + Number(parts[i])]);
  }
  return pairs;
}

async function getKJV(book, chapter) {
  const key = `kjv:${book}:${chapter}`;
  const cached = loadJSON(key, null);
  if (cached) return cached;
  const prefix = book >= 40 ? "G" : "H";
  const verses = {};
  for (const { verse, text } of await fetchJSON(`${API}/get-text/KJV/${book}/${chapter}/`)) verses[verse] = parseKJV(text, prefix);
  saveJSON(key, verses);
  return verses;
}

const pendingDefinitions = {};
function getDefinition(code) {
  const key = `def:${code}`;
  const cached = loadJSON(key, null);
  if (cached) return Promise.resolve(cached);
  pendingDefinitions[code] ??= fetchJSON(`${API}/dictionary-definition/BDBT/${code}/`).then(([e]) => {
    if (!e) throw new Error("Sin definición");
    const def = { lexeme: e.lexeme, translit: e.transliteration, pron: e.pronunciation, short: e.short_definition, html: e.definition };
    saveJSON(key, def);
    return def;
  }).finally(() => { delete pendingDefinitions[code]; });
  return pendingDefinitions[code];
}

// La definición viene en HTML de terceros: se reconstruye solo con etiquetas permitidas.
// Los enlaces "S:G5368" se convierten en botones que abren esa definición.
function safeDefinition(html, onLink) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const KEEP = { B: "b", I: "i", P: "p", OL: "ol", LI: "li", BR: "br", EL: "span", HE: "span" };
  const walk = (node, parent) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { parent.append(child.textContent); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const href = child.tagName === "A" ? child.getAttribute("href") || "" : "";
      const strong = href.match(/^S:([GH]\d+)$/);
      if (strong) {
        const btn = el("button", { type: "button", className: "link", textContent: child.textContent });
        btn.addEventListener("click", () => onLink(strong[1]));
        parent.append(btn);
        continue;
      }
      const tag = KEEP[child.tagName];
      if (!tag) { walk(child, parent); continue; }
      const out = document.createElement(tag);
      if (child.tagName === "EL") { out.lang = "grc"; out.className = "original"; }
      if (child.tagName === "HE") { out.lang = "he"; out.dir = "rtl"; out.className = "original"; }
      parent.append(out);
      walk(child, out);
    }
  };
  const frag = document.createDocumentFragment();
  walk(doc.body, frag);
  return frag;
}

// ---------- Panel ----------

function openPanel(title, ...content) {
  $("#panel-title").textContent = title;
  $("#panel-body").replaceChildren(...content);
  $("#panel").hidden = false;
  document.body.classList.add("panel-open");
  $("#panel-body").scrollTop = 0;
}

function closePanel() {
  $("#panel").hidden = true;
  document.body.classList.remove("panel-open");
  document.querySelectorAll(".verse.selected").forEach((v) => v.classList.remove("selected"));
}

const ref = (n) => `${books.find((b) => b.id === position.book).name} ${position.chapter}:${n}`;
const status = (text) => el("p", { className: "status", textContent: text });

function lexemeNode(def, code) {
  return el("span", { className: "original", lang: code[0] === "G" ? "grc" : "he", textContent: def.lexeme });
}

async function openVerse(n) {
  document.querySelectorAll(".verse.selected").forEach((v) => v.classList.remove("selected"));
  document.getElementById(`v${n}`)?.classList.add("selected");
  openPanel(`${ref(n)} · palabras originales`, status("Cargando…"));
  const { book, chapter } = position;
  let pairs;
  try {
    pairs = (await getKJV(book, chapter))[n];
  } catch {
    return openPanel(`${ref(n)} · palabras originales`, el("p", { className: "error", textContent: "No se pudo cargar la KJV con Strong's." }));
  }
  if (book !== position.book || chapter !== position.chapter) return;
  if (!pairs?.length) return openPanel(`${ref(n)} · palabras originales`, status("La KJV no tiene este versículo (numeración distinta)."));

  const list = el("ul", { className: "strong-list" }, pairs.map(([eng, code]) => {
    const stop = STRONG_STOP.has(code);
    const lex = el("span", { className: "lex" });
    const item = el("button", { type: "button", className: stop ? "strong-item stop" : "strong-item" }, [
      el("span", { className: "eng", textContent: eng || "—", title: eng ? "" : "Sin palabra propia en la KJV" }),
      lex,
      el("span", { className: "code", textContent: code }),
    ]);
    item.addEventListener("click", () => showDefinition(code, () => openVerse(n)));
    if (!stop) getDefinition(code).then((d) => lex.append(lexemeNode(d, code), " ", el("span", { className: "translit", textContent: d.translit }))).catch(() => {});
    return el("li", {}, [item]);
  }));
  openPanel(`${ref(n)} · palabras originales`,
    el("p", { className: "hint", textContent: "Palabras en el orden de la KJV (inglés), con su término original. Toca una para ver su significado." }),
    list);
}

async function showDefinition(code, onBack) {
  const back = onBack ? el("button", { type: "button", className: "back", textContent: "← Volver" }) : "";
  if (back) back.addEventListener("click", onBack);
  openPanel(code, back, status("Cargando…"));
  let def;
  try { def = await getDefinition(code); } catch {
    return openPanel(code, back, el("p", { className: "error", textContent: "No se encontró la definición." }));
  }

  // Dónde aparece en el capítulo actual.
  let where = "";
  try {
    const kjv = await getKJV(position.book, position.chapter);
    const verses = Object.keys(kjv).filter((v) => kjv[v].some(([, c]) => c === code));
    if (verses.length) {
      where = el("p", { className: "where" }, ["En este capítulo: ", ...verses.flatMap((v, i) => {
        const b = el("button", { type: "button", className: "link", textContent: v });
        b.addEventListener("click", () => { document.getElementById(`v${v}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); openVerse(v); });
        return i ? [", ", b] : [b];
      })]);
    }
  } catch { /* sin KJV: se omite */ }

  const goTo = (c) => showDefinition(c, () => showDefinition(code, onBack));
  openPanel(code, back,
    el("div", { className: "def-head" }, [
      el("div", { className: "def-lexeme" }, [lexemeNode(def, code)]),
      el("div", {}, [el("b", { textContent: def.translit }), ` · ${def.pron}`]),
      // short_definition a veces trae basura tipo "[idiom] break": solo se muestra si parece una glosa.
      def.short && !def.short.startsWith("[") ? el("div", { className: "def-short", textContent: def.short }) : "",
    ]),
    where,
    el("div", { className: "def-body", lang: "en" }, [safeDefinition(def.html, goTo)]));
}

// ---------- Palabras clave del capítulo ----------

async function renderKeywords(container, book, chapter) {
  let kjv;
  try { kjv = await getKJV(book, chapter); } catch { return; }
  if (book !== position.book || chapter !== position.chapter) return;
  const count = {}, label = {};
  for (const pairs of Object.values(kjv)) for (const [eng, code] of pairs) {
    if (STRONG_STOP.has(code) || !eng) continue;
    count[code] = (count[code] || 0) + 1;
    label[code] ??= eng;
  }
  const top = Object.keys(count).filter((c) => count[c] >= 2).sort((a, b) => count[b] - count[a]).slice(0, 8);
  if (!top.length) return;
  container.replaceChildren(el("span", { className: "kw-title", textContent: "Palabras clave:" }), ...top.map((code) => {
    const chip = el("button", { type: "button", className: "chip", title: code }, [
      el("span", { className: "eng", textContent: label[code] }), el("span", { className: "count", textContent: `×${count[code]}` }),
    ]);
    chip.addEventListener("click", () => showDefinition(code));
    getDefinition(code).then((d) => chip.prepend(lexemeNode(d, code), " ")).catch(() => {});
    return chip;
  }));
}
