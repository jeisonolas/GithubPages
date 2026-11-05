"use strict";

const API = "https://bolls.life";

// Versiones en español: bolls.life y la copia privada (texts.js). La RV1909 solo está en la copia.
const VERSIONS = {
  RV1960: { name: "Reina-Valera 1960", color: "#8a4b2a" },
  LBLA:   { name: "La Biblia de las Américas", color: "#2f6b5e" },
  NTV:    { name: "Nueva Traducción Viviente", color: "#3d5a99" },
  BTX3:   { name: "Biblia Textual 3ª ed.", color: "#7a4f8f" },
  PDT:    { name: "Palabra de Dios para Todos", color: "#9a6a12" },
  RV1909: { name: "Reina-Valera 1909", color: "#6b4a3a" },
  RV2004: { name: "Reina Valera Gómez 2004", color: "#5c6b2f" },
};

const DEFAULTS = {
  order: Object.keys(VERSIONS),
  enabled: ["RV1960", "LBLA", "NTV"],
  base: "RV1960",
  fontSize: 18,
  theme: "auto",
  view: "rows",
  showDiff: true,
  showOmitted: false,
  noteFilter: "all",
};

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// ---------- Estado persistente ----------

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cuota llena: se vacía la caché de capítulos (se puede volver a descargar) y se reintenta.
    // Si el almacenamiento está bloqueado del todo, se sigue sin guardar: nunca debe romper la app.
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("ch:")).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* sin espacio o sin acceso */ }
  }
}

const settings = { ...DEFAULTS, ...loadJSON("settings", {}) };
// Si en el futuro se añaden versiones, que aparezcan en la lista.
settings.order = [...settings.order.filter((v) => VERSIONS[v]), ...DEFAULTS.order.filter((v) => !settings.order.includes(v))];
settings.enabled = settings.enabled.filter((v) => VERSIONS[v]);

const activeVersions = () => settings.order.filter((v) => settings.enabled.includes(v));
const saveSettings = () => saveJSON("settings", settings);

// ---------- Datos ----------

// La API gratuita limita las peticiones (429): como mucho 2 a la vez, y reintentos con espera creciente.
const MAX_PARALLEL = 2;
let running = 0;
const queue = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url) {
  if (running >= MAX_PARALLEL) await new Promise((r) => queue.push(r));
  running++;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (attempt === 3) throw err;
        await sleep(1000 * 2 ** attempt);
      }
    }
  } finally {
    running--;
    queue.shift()?.();
  }
}

async function getBooks() {
  return window.BOOKS; // data/books.js
}

// Devuelve { número de versículo: html limpio }.
async function fetchChapter(version, book, chapter) {
  const stored = await storedChapter(version, book, chapter);
  if (stored) return Object.fromEntries(stored.map(([v, t]) => [v, cleanText(t, version, book)]));
  const key = `ch:2:${version}:${book}:${chapter}`; // "2": limpieza nueva, la caché anterior se descarta
  const cached = loadJSON(key, null);
  if (cached) return cached;
  const rows = await fetchJSON(`${API}/get-text/${version}/${book}/${chapter}/`);
  const verses = {};
  for (const { verse, text } of rows) verses[verse] = cleanText(text, version, book);
  saveJSON(key, verses);
  return verses;
}

// ---------- Limpieza del texto ----------

function fixLostEnye(text) {
  const map = window.LBLA_N_FIX || {};
  return text.replace(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g, (w) => {
    const fixed = map[w.toLowerCase()];
    if (!fixed) return w;
    if (w.length > 1 && w === w.toUpperCase()) return fixed.toUpperCase();
    if (w[0] === w[0].toUpperCase()) return fixed[0].toUpperCase() + fixed.slice(1);
    return fixed;
  });
}

// Escapa todo y solo vuelve a permitir <br> y <i>; cierra o descarta cursivas desparejadas.
function sanitize(text) {
  const escaped = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
    .replace(/&lt;(\/?)i&gt;/gi, "<$1i>");
  let open = false;
  const out = escaped.split(/(<\/?i>)/).map((part) => {
    if (part === "<i>") { if (open) return ""; open = true; return part; }
    if (part === "</i>") { if (!open) return ""; open = false; return part; }
    return part;
  }).join("");
  return open ? out + "</i>" : out;
}

function cleanText(raw, version, book) {
  let t = raw.replace(/\|par/g, " ").replace(/•/g, " ").replace(/&quot;/g, '"');
  if (version === "NTV" && book === 19) t = t.replace(/^\s*Salmo \d+\s+/, ""); // encabezado, no es texto
  if (version === "PDT") t = t.replace(/<p[^>]*>.*?<\/p>/g, " ").replace(/<\/?[pb]>/g, " "); // títulos de sección
  if (version === "BTX3") t = t.replace(/°/g, ""); // marcas de notas al pie que la fuente no trae
  if (version === "LBLA") t = fixLostEnye(t).replace(/(^|[\s"“'(])z(?=[A-ZÁÉÍÓÚÑ])/g, "$1¿"); // "zQué" → "¿Qué"
  // Palabras pegadas en la fuente ("elSeñor", "deDios"): en español no hay mayúsculas dentro de una palabra.
  t = t.replace(/([a-záéíóúüñ])([A-ZÁÉÍÓÚÑ][a-záéíóúüñ])/g, "$1 $2");
  return sanitize(t)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:?!])/g, "$1")
    .replace(/(\s*<br>\s*)+$/g, "")
    .replace(/<i>\s*<\/i>/g, "")
    .trim();
}

// ---------- Diferencias ----------

const TOKEN_RE = /(<\/?(?:i|br)>)|([\p{L}\p{N}]+)|([^<\p{L}\p{N}]+|<)/gu;

function tokenize(html) {
  return [...html.matchAll(TOKEN_RE)].map(([text, tag, word]) => ({ text, word: Boolean(word) }));
}

const words = (tokens) => tokens.filter((t) => t.word).map((t) => t.text);

// Sin mayúsculas ni tildes: la LBLA de la API pierde la tilde en mayúsculas ("El" por "Él").
const normWord = (w) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Alinea las palabras de la base (a) con las de otra versión (b).
// Devuelve qué palabras de b son nuevas y qué palabras de a faltan (y antes de qué palabra de b).
function align(a, b) {
  const A = a.map(normWord);
  const B = b.map(normWord);
  const n = A.length, m = B.length, w = m + 1;
  const L = new Uint16Array((n + 1) * w); // L[i][j] = LCS de A[i:] y B[j:]
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    }
  }
  const added = new Set();
  const omittedBefore = new Map();
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { i++; j++; }
    else if (j >= m || (i < n && L[(i + 1) * w + j] >= L[i * w + j + 1])) {
      if (!omittedBefore.has(j)) omittedBefore.set(j, []);
      omittedBefore.get(j).push(a[i++]);
    } else added.add(j++);
  }
  const similarity = n + m ? (2 * L[0]) / (n + m) : 1;
  return { added, omittedBefore, similarity };
}

const escapeHTML = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Marca en el html de otra versión las palabras nuevas y, si se pide, las omitidas de la base.
function highlight(html, { added, omittedBefore }) {
  let j = 0;
  let out = "";
  const omitted = (k) => settings.showOmitted && omittedBefore.has(k)
    ? `<del class="diff-del" title="Está en ${settings.base}">${escapeHTML(omittedBefore.get(k).join(" "))}</del> `
    : "";
  for (const t of tokenize(html)) {
    if (!t.word) { out += t.text; continue; }
    out += omitted(j);
    out += added.has(j) ? `<mark class="diff-add">${t.text}</mark>` : t.text;
    j++;
  }
  out += omitted(j) ? " " + omitted(j).trim() : "";
  return out.replace(/<\/mark>(\s+)<mark class="diff-add">/g, "$1"); // une palabras seguidas
}

// Para un versículo: html por versión (resaltado si toca) y grado de diferencia 0–1.
function compareVerse(versions, data, n) {
  const base = data[settings.base]?.[n];
  const result = { html: {}, difference: null };
  const sims = [];
  for (const v of versions) {
    const text = data[v]?.[n];
    result.html[v] = text;
    if (text === undefined || base === undefined || v === settings.base) continue;
    const diff = align(words(tokenize(base)), words(tokenize(text)));
    sims.push(diff.similarity);
    if (settings.showDiff) result.html[v] = highlight(text, diff);
  }
  if (sims.length) result.difference = 1 - sims.reduce((s, x) => s + x, 0) / sims.length;
  return result;
}

// ---------- Navegación ----------

let books = [];
const position = loadJSON("position", { book: 43, chapter: 1 });
let renderToken = 0;

function parseHash() {
  const m = location.hash.match(/^#(\d+)\/(\d+)$/);
  return m ? { book: +m[1], chapter: +m[2] } : null;
}

function goTo(book, chapter) {
  const b = books.find((x) => x.id === book) || books[0];
  position.book = b.id;
  position.chapter = Math.min(Math.max(1, chapter), b.chapters);
  saveJSON("position", position);
  const hash = `#${position.book}/${position.chapter}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  syncSelectors();
  closePanel();
  return render();
}

function step(delta) {
  const i = books.findIndex((b) => b.id === position.book);
  let c = position.chapter + delta;
  if (c < 1 && i > 0) return goTo(books[i - 1].id, books[i - 1].chapters);
  if (c > books[i].chapters && i < books.length - 1) return goTo(books[i + 1].id, 1);
  goTo(position.book, c);
}

function syncSelectors() {
  const b = books.find((x) => x.id === position.book);
  $("#book").value = b.id;
  $("#chapter").replaceChildren(...Array.from({ length: b.chapters }, (_, i) => el("option", { value: i + 1, textContent: i + 1 })));
  $("#chapter").value = position.chapter;
  const i = books.indexOf(b);
  $("#prev").disabled = i === 0 && position.chapter === 1;
  $("#next").disabled = i === books.length - 1 && position.chapter === b.chapters;
}

// ---------- Render ----------

function tag(version, isBase = false) {
  return el("span", {
    className: isBase ? "tag base" : "tag",
    textContent: version,
    title: VERSIONS[version].name + (isBase ? " (base de comparación)" : ""),
    style: `--c:${VERSIONS[version].color}`,
  });
}

function missingText(book) {
  return book >= 40
    ? "No incluido en el texto principal de esta versión (variante textual)."
    : "En esta versión está unido a un versículo cercano.";
}

function html(str) {
  const span = el("span", { className: "text" });
  span.innerHTML = str; // ya saneado en cleanText
  return span;
}

function renderRows(versions, data, book) {
  const numbers = [...new Set(versions.flatMap((v) => Object.keys(data[v] || {}).map(Number)))].sort((a, b) => a - b);
  return numbers.map((n) => {
    const cmp = compareVerse(versions, data, n);
    return el("section", { className: "verse", id: `v${n}` }, [
      el("div", { className: "vnum" }, [verseButton(n), differenceMeter(cmp.difference), quoteMark(book, position.chapter, n)]),
      el("div", { className: "lines" }, versions.map((v) => {
        let text;
        if (!data[v]) text = el("span", { className: "text error", textContent: "No se pudo cargar esta versión." });
        else if (data[v][n] === undefined) text = el("span", { className: "text missing", textContent: missingText(book) });
        else text = html(cmp.html[v]);
        text.style.setProperty("--c", VERSIONS[v].color);
        return el("div", { className: "line" }, [tag(v, v === settings.base && settings.showDiff), text]);
      })),
    ]);
  });
}

function verseButton(n) {
  const b = el("button", { type: "button", className: "vbtn", textContent: n, title: "Ver palabras originales (Strong's)" });
  b.addEventListener("click", () => openVerse(n));
  return b;
}

// Barrita bajo el número: más llena cuanto más difieren las versiones de la base.
function differenceMeter(difference) {
  if (difference === null || !settings.showDiff) return "";
  const pct = Math.round(difference * 100);
  return el("span", { className: "meter", title: `Diferencia con ${settings.base}: ${pct}%`, style: `--d:${Math.min(1, difference * 1.6)}` });
}

function renderColumns(versions, data) {
  const grid = el("div", { className: "columns", style: `grid-template-columns: repeat(${versions.length}, 1fr)` });
  const compared = {};
  for (const v of versions) {
    const col = el("article", { className: "column" }, [el("h3", {}, [tag(v, v === settings.base && settings.showDiff)])]);
    if (!data[v]) col.append(el("p", { className: "error", textContent: "No se pudo cargar esta versión." }));
    else for (const n of Object.keys(data[v])) {
      compared[n] ??= compareVerse(versions, data, n);
      const p = el("p", {}, [el("sup", {}, [verseButton(n)])]);
      p.insertAdjacentHTML("beforeend", compared[n].html[v]);
      col.append(p);
    }
    grid.append(col);
  }
  return [grid];
}

async function render() {
  const token = ++renderToken;
  const { book, chapter } = position;
  const versions = activeVersions();
  const reader = $("#reader");
  reader.replaceChildren(el("p", { className: "status", textContent: "Cargando…" }));

  const results = await Promise.allSettled(versions.map((v) => fetchChapter(v, book, chapter)));
  if (token !== renderToken) return; // el usuario ya cambió de capítulo
  const data = {};
  results.forEach((r, i) => { data[versions[i]] = r.status === "fulfilled" ? r.value : null; });

  const name = books.find((b) => b.id === book).name;
  document.title = `${name} ${chapter} · Estudio`;
  const title = el("h2", { className: "chapter-title", textContent: `${name} ${chapter}` });
  if (versions.every((v) => !data[v])) {
    reader.replaceChildren(title, el("p", { className: "error", textContent: "No se pudo cargar el capítulo. Revisa la conexión." }));
    return;
  }
  const side = settings.view === "side";
  const body = settings.view === "columns" ? renderColumns(versions, data) : renderRows(versions, data, book);
  // "Lado a lado": cada versículo es una fila con una columna por versión; las etiquetas van en una
  // cabecera fija en vez de repetirse en cada versículo.
  reader.classList.toggle("side", side);
  reader.style.setProperty("--n", versions.length);
  document.documentElement.style.setProperty("--bar-h", `${$(".bar").offsetHeight}px`);
  const head = side ? el("div", { className: "side-head" }, [el("span"), ...versions.map((v) => tag(v, v === settings.base && settings.showDiff))]) : "";
  const keywords = el("div", { className: "keywords" });
  const doctrines = el("div", { className: "keywords" });
  const legend = el("p", { className: "legend" }, settings.showDiff
    ? [el("mark", { className: "diff-add", textContent: "verde" }), ` = distinto de ${settings.base} · toca el número del versículo o una palabra en verde para ver el original · `, helpLink()]
    : ["Toca el número del versículo para ver las palabras originales · ", helpLink()]);
  reader.replaceChildren(title, legend, keywords, doctrines, head, ...body);
  renderKeywords(keywords, book, chapter);
  renderDoctrineChips(doctrines, book, chapter);
  renderNotes();
  $("#view").value = settings.view;
  $("#toggle-diff").setAttribute("aria-pressed", settings.showDiff);
}

function helpLink() {
  const b = el("button", { type: "button", className: "link", textContent: "¿cómo funciona?" });
  b.addEventListener("click", () => $("#help").showModal());
  return b;
}

// Tocar una palabra resaltada abre las palabras originales de su versículo
// (si no se está seleccionando texto para una nota).
function onReaderClick(e) {
  const mark = e.target.closest("mark.diff-add");
  if (!mark || !getSelection().isCollapsed) return;
  const n = mark.closest("section.verse")?.id.slice(1) ?? mark.closest("p")?.querySelector(".vbtn")?.textContent;
  if (n) openVerse(Number(n));
}

// ---------- Configuración ----------

function applyAppearance() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.style.setProperty("--font-size", `${settings.fontSize}px`);
}

function renderSettings() {
  $("#version-list").replaceChildren(...settings.order.map((v, i) => {
    const check = el("input", { type: "checkbox", checked: settings.enabled.includes(v) });
    check.addEventListener("change", () => {
      const enabled = check.checked ? [...settings.enabled, v] : settings.enabled.filter((x) => x !== v);
      $("#settings-error").hidden = enabled.length >= 2;
      if (enabled.length < 2) { check.checked = true; return; }
      settings.enabled = enabled;
      settingsChanged();
    });
    const move = (d) => {
      const j = i + d;
      [settings.order[i], settings.order[j]] = [settings.order[j], settings.order[i]];
      settingsChanged();
    };
    const up = el("button", { type: "button", textContent: "▲", disabled: i === 0, title: "Subir" });
    const down = el("button", { type: "button", textContent: "▼", disabled: i === settings.order.length - 1, title: "Bajar" });
    up.addEventListener("click", () => move(-1));
    down.addEventListener("click", () => move(1));
    return el("li", {}, [check, tag(v), el("span", { textContent: VERSIONS[v].name }), up, down]);
  }));

  const active = activeVersions();
  if (!active.includes(settings.base)) settings.base = active[0];
  $("#base-version").replaceChildren(...active.map((v) => el("option", { value: v, textContent: `${v} — ${VERSIONS[v].name}` })));
  $("#base-version").value = settings.base;
  $("#font-size").value = settings.fontSize;
  $("#theme").value = settings.theme;
  $("#show-omitted").checked = settings.showOmitted;
}

function settingsChanged() {
  saveSettings();
  renderSettings();
  render();
}

function toggleDiff() {
  settings.showDiff = !settings.showDiff;
  saveSettings();
  render();
}

// ---------- Arranque ----------

async function init() {
  Object.keys(localStorage).filter((k) => /^ch:(?!2:)/.test(k) || k === "books").forEach((k) => localStorage.removeItem(k));
  applyAppearance();
  try {
    books = await getBooks();
  } catch {
    $("#reader").replaceChildren(el("p", { className: "error", textContent: "No se pudo cargar la lista de libros. Revisa la conexión y recarga." }));
    return;
  }
  $("#book").replaceChildren(...books.map((b) => el("option", { value: b.id, textContent: b.name })));

  $("#book").addEventListener("change", (e) => goTo(+e.target.value, 1));
  $("#chapter").addEventListener("change", (e) => goTo(position.book, +e.target.value));
  $("#prev").addEventListener("click", () => step(-1));
  $("#next").addEventListener("click", () => step(1));
  $("#view").addEventListener("change", (e) => {
    settings.view = e.target.value;
    saveSettings();
    render();
  });
  $("#open-settings").addEventListener("click", () => { renderSettings(); $("#settings").showModal(); });
  $("#open-help").addEventListener("click", () => $("#help").showModal());
  $("#reader").addEventListener("click", onReaderClick);
  if (!loadJSON("help-seen", false)) { $("#help").showModal(); saveJSON("help-seen", true); }
  $("#base-version").addEventListener("change", (e) => { settings.base = e.target.value; saveSettings(); render(); });
  $("#show-omitted").addEventListener("change", (e) => { settings.showOmitted = e.target.checked; saveSettings(); render(); });
  $("#toggle-diff").addEventListener("click", toggleDiff);
  $("#font-size").addEventListener("input", (e) => { settings.fontSize = +e.target.value; saveSettings(); applyAppearance(); });
  $("#theme").addEventListener("change", (e) => { settings.theme = e.target.value; saveSettings(); applyAppearance(); });
  $("#panel-close").addEventListener("click", closePanel);
  window.addEventListener("hashchange", () => { const p = parseHash(); if (p) goTo(p.book, p.chapter); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, select, textarea, dialog") || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
    if (e.key === "d") toggleDiff();
    if (e.key === "Escape") closePanel();
  });

  initNotes();
  const start = parseHash() || position;
  goTo(start.book, start.chapter);
}

init();
