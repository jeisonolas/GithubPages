"use strict";
// Resaltado de versículos: cada usuario ve solo los suyos, en todas las versiones y vistas.
// Mismo patrón que las notas: copia local + cola de pendientes + Supabase (tabla highlights).
// Sin sesión se guardan como autor "local" y pasan a ser del usuario al entrar.
// Usa globales de app.js ($, el, loadJSON, saveJSON, position) y de notes.js (sb, REMOTE).

// Textos de la interfaz, juntos para localizarlos (es/en) más adelante.
const HL_TEXT = {
  label: "Resaltar",
  remove: "Quitar",
  removeTitle: "Quitar resaltado",
  colors: { yellow: "Amarillo", green: "Verde", blue: "Azul", pink: "Rosa", purple: "Lila" },
};
const HL_COLORS = Object.keys(HL_TEXT.colors); // el orden de la paleta; los valores van en styles.css

const hlState = {
  uid: null,         // usuario con sesión (null = sin sesión: se guarda como "local")
  all: {},           // hlKey -> { author_id, book, chapter, verse, color (null = quitado), updated_at }
  outbox: new Set(), // claves pendientes de subir
  flushing: false,
};

// ---------- Lógica pura (probada en tests/app.test.js) ----------

const hlKey = (author, book, chapter, verse) => `${author}:${book}:${chapter}:${verse}`;
const hlKeyOf = (h) => hlKey(h.author_id, h.book, h.chapter, h.verse);

// Una fila remota sustituye a la local salvo que la local esté pendiente y sea más reciente.
function mergeHighlight(all, outbox, row) {
  const key = hlKeyOf(row);
  const local = all[key];
  if (local && outbox.has(key) && local.updated_at > row.updated_at) return false;
  all[key] = row;
  return true;
}

// { versículo: color } del capítulo para un autor (los quitados no salen).
function chapterHighlights(all, author, book, chapter) {
  const out = {};
  for (const h of Object.values(all)) {
    if (h.author_id === author && h.book === book && h.chapter === chapter && h.color) out[h.verse] = h.color;
  }
  return out;
}

// Los resaltados hechos sin sesión pasan a ser de uid; si ya tenía uno más reciente, gana ese.
// Devuelve las claves que hay que subir.
function claimLocal(all, uid) {
  const claimed = [];
  for (const [key, h] of Object.entries(all)) {
    if (h.author_id !== "local") continue;
    delete all[key];
    const mine = { ...h, author_id: uid };
    const existing = all[hlKeyOf(mine)];
    if (existing && existing.updated_at >= mine.updated_at) continue;
    all[hlKeyOf(mine)] = mine;
    claimed.push(hlKeyOf(mine));
  }
  return claimed;
}

// ---------- Estado, guardado y sincronización ----------

const hlAuthor = () => hlState.uid || "local";

function persistHighlights() {
  saveJSON("highlights", hlState.all);
  saveJSON("highlights:outbox", [...hlState.outbox]);
}

function highlightsChanged() {
  persistHighlights();
  renderHighlights();
}

function setHighlight(book, chapter, verse, color) {
  const row = { author_id: hlAuthor(), book, chapter, verse, color: color || null, updated_at: new Date().toISOString() };
  hlState.all[hlKeyOf(row)] = row;
  if (hlState.uid) hlState.outbox.add(hlKeyOf(row));
  highlightsChanged();
  syncHighlights();
}

async function syncHighlights() {
  if (!REMOTE || !hlState.uid || hlState.flushing) return;
  hlState.flushing = true;
  try {
    for (const key of [...hlState.outbox]) {
      const { synced_at, ...row } = hlState.all[key];
      const { error } = await sb.from("highlights").upsert(row, { onConflict: "author_id,book,chapter,verse" });
      if (error) throw error;
      hlState.outbox.delete(key);
    }
    const sinceKey = `highlights:since:${hlState.uid}`;
    const since = loadJSON(sinceKey, "1970-01-01T00:00:00Z");
    const { data, error } = await sb.from("highlights").select("*").gte("synced_at", since).order("synced_at").limit(1000);
    if (error) throw error;
    let latest = since;
    for (const row of data) { mergeHighlight(hlState.all, hlState.outbox, row); if (row.synced_at > latest) latest = row.synced_at; }
    saveJSON(sinceKey, latest);
  } catch (err) {
    console.warn("Resaltados sin sincronizar:", err.message || err); // se reintenta en el próximo cambio o al volver
  } finally {
    hlState.flushing = false;
    highlightsChanged();
  }
}

let hlChannel = null;
function onHighlightsSignedIn(uid) {
  if (hlState.uid === uid) return;
  hlState.uid = uid;
  if (hlChannel) sb.removeChannel(hlChannel);
  for (const key of claimLocal(hlState.all, uid)) hlState.outbox.add(key);
  hlChannel = sb.channel("highlights")
    .on("postgres_changes", { event: "*", schema: "public", table: "highlights", filter: `author_id=eq.${uid}` }, ({ new: row }) => {
      if (row?.book && mergeHighlight(hlState.all, hlState.outbox, row)) highlightsChanged();
    })
    .subscribe();
  highlightsChanged();
  syncHighlights();
}

function initHighlights() {
  hlState.all = loadJSON("highlights", {});
  hlState.outbox = new Set(loadJSON("highlights:outbox", []));
  if (!REMOTE) return;
  // No se llama a Supabase dentro del callback (bloquea el cliente): se aplaza.
  sb.auth.onAuthStateChange((event, session) => {
    if (session && event !== "SIGNED_OUT") setTimeout(() => onHighlightsSignedIn(session.user.id));
    if (event === "SIGNED_OUT") { hlState.uid = null; if (hlChannel) sb.removeChannel(hlChannel); hlChannel = null; highlightsChanged(); }
  });
  window.addEventListener("online", syncHighlights);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncHighlights(); });
}

// ---------- Pantalla ----------

// Pinta el color en cada versículo: filas y lado a lado (section.verse) y texto corrido (p con su número).
function renderHighlights() {
  const reader = $("#reader");
  if (!reader?.querySelector(".chapter-title")) return;
  const colors = chapterHighlights(hlState.all, hlAuthor(), position.book, position.chapter);
  for (const s of reader.querySelectorAll("section.verse")) paintHighlight(s, colors[s.id.slice(1)]);
  for (const p of reader.querySelectorAll(".column p")) paintHighlight(p, colors[p.querySelector(".vbtn")?.textContent]);
  renderHighlightPicker();
}

function paintHighlight(node, color) {
  if (color) node.dataset.hl = color;
  else delete node.dataset.hl;
}

// Fila de colores en el panel del versículo (la inserta openVerse).
let pickerVerse = null;
function highlightPicker(verse) {
  pickerVerse = { book: position.book, chapter: position.chapter, verse };
  const swatches = HL_COLORS.map((c) => {
    const b = el("button", { type: "button", className: "hl-swatch", title: HL_TEXT.colors[c], ariaLabel: HL_TEXT.colors[c] });
    b.dataset.hl = c;
    b.addEventListener("click", () => setHighlight(pickerVerse.book, pickerVerse.chapter, pickerVerse.verse, c));
    return b;
  });
  const remove = el("button", { type: "button", className: "link hl-remove", textContent: HL_TEXT.remove, title: HL_TEXT.removeTitle });
  remove.addEventListener("click", () => setHighlight(pickerVerse.book, pickerVerse.chapter, pickerVerse.verse, null));
  const picker = el("div", { className: "hl-picker", role: "group", ariaLabel: HL_TEXT.label }, [
    el("span", { className: "hl-label", textContent: HL_TEXT.label }), ...swatches, remove,
  ]);
  setTimeout(renderHighlightPicker);
  return picker;
}

// Marca el color actual del versículo abierto en el panel.
function renderHighlightPicker() {
  const picker = document.querySelector?.("#panel .hl-picker");
  if (!picker || !pickerVerse) return;
  const { book, chapter, verse } = pickerVerse;
  const current = hlState.all[hlKey(hlAuthor(), book, chapter, verse)]?.color;
  for (const b of picker.querySelectorAll(".hl-swatch")) b.setAttribute("aria-pressed", b.dataset.hl === current);
  picker.querySelector(".hl-remove").hidden = !current;
}
