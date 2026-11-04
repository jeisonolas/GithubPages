"use strict";
// Notas compartidas: copia local + cola de cambios pendientes + Supabase (login y tiempo real).
// Sin config.js rellenado funciona en modo local (solo este navegador).
// Usa globales de app.js ($, el, loadJSON, saveJSON, books, position, settings, saveSettings, goTo).

const SB_CONFIG = window.SUPABASE_CONFIG || {};
const REMOTE = Boolean(SB_CONFIG.url && SB_CONFIG.anonKey && window.supabase);
const sb = REMOTE ? window.supabase.createClient(SB_CONFIG.url, SB_CONFIG.anonKey) : null;

const notesState = {
  me: null,          // { id, name, color, email }
  members: {},       // id -> { name, color }
  all: {},           // id -> nota
  outbox: new Set(), // ids pendientes de subir
  online: navigator.onLine,
  error: null,
  flushing: false,
  pendingScroll: null,
};

const nowISO = () => new Date().toISOString();

function persistNotes() {
  saveJSON("notes", notesState.all);
  saveJSON("notes:outbox", [...notesState.outbox]);
}

function notesChanged() {
  persistNotes();
  renderNotes();
  updateSyncStatus();
  if ($("#notes-dialog").open) renderNotesList();
}

// ---------- Arranque y sesión ----------

async function initNotes() {
  notesState.all = loadJSON("notes", {});
  notesState.outbox = new Set(loadJSON("notes:outbox", []));
  setupNoteUI();

  if (!REMOTE) {
    const profile = { name: "Yo", color: "#8a4b2a", ...loadJSON("profile", {}) };
    notesState.me = { id: "local", ...profile };
    notesState.members = { local: profile };
    notesChanged();
    return;
  }

  notesState.members = loadJSON("members", {});
  window.addEventListener("online", () => { notesState.online = true; syncNow(); });
  window.addEventListener("offline", () => { notesState.online = false; updateSyncStatus(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) setTimeout(() => ensureSignedIn(session)); // fuera del callback
    if (event === "SIGNED_OUT") { notesState.me = null; notesChanged(); }
  });
  const { data: { session } } = await sb.auth.getSession();
  if (session) await ensureSignedIn(session);
  else { updateSyncStatus(); openLogin(); }
}

// onAuthStateChange, getSession y signIn pueden llegar a la vez: una sola entrada.
let signingIn = null;
function ensureSignedIn(session) {
  if (notesState.me) return Promise.resolve();
  signingIn ??= onSignedIn(session).finally(() => { signingIn = null; });
  return signingIn;
}

async function onSignedIn(session) {
  const uid = session.user.id;
  const { data, error } = await sb.from("members").select("*");
  if (!error) {
    notesState.members = Object.fromEntries(data.map((m) => [m.user_id, { name: m.display_name, color: m.color, email: m.email }]));
    saveJSON("members", notesState.members);
  }
  const mine = notesState.members[uid];
  if (!mine) {
    if (!error) { // con conexión y sin fila en members: este email no está dado de alta
      await sb.auth.signOut();
      openLogin("Este email no está dado de alta como miembro (ver supabase/README.md, paso 4).");
      return;
    }
  }
  notesState.me = { id: uid, ...(mine || { name: session.user.email, color: "#8a4b2a" }), email: session.user.email };

  // Notas escritas en modo local antes de configurar Supabase: pasan a ser mías.
  for (const n of Object.values(notesState.all)) {
    if (n.author_id === "local") { n.author_id = uid; n.updated_at = nowISO(); notesState.outbox.add(n.id); }
  }

  sb.channel("notes")
    .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, ({ new: row }) => {
      if (row?.id && mergeRemote(row)) notesChanged();
    })
    .subscribe();

  notesChanged();
  prefetchTexts();
  await syncNow();
}

// Una nota remota sustituye a la local salvo que la local tenga cambios sin subir más recientes.
function mergeRemote(row) {
  const local = notesState.all[row.id];
  if (local && notesState.outbox.has(row.id) && local.updated_at > row.updated_at) return false;
  notesState.all[row.id] = row;
  return true;
}

async function pullChanges() {
  const since = loadJSON("notes:since", "1970-01-01T00:00:00Z");
  const { data, error } = await sb.from("notes").select("*").gte("synced_at", since).order("synced_at").limit(1000);
  if (error) throw error;
  let latest = since;
  for (const row of data) { mergeRemote(row); if (row.synced_at > latest) latest = row.synced_at; }
  saveJSON("notes:since", latest);
}

async function pushChanges() {
  for (const id of [...notesState.outbox]) {
    const { error } = await sb.from("notes").upsert(notesState.all[id]);
    if (error) throw error;
    notesState.outbox.delete(id);
  }
}

// Si llega un cambio mientras se sincroniza, se repite al terminar (si no, se quedaría pendiente).
let syncAgain = false;
async function syncNow() {
  if (!REMOTE || !notesState.me) return;
  if (notesState.flushing) { syncAgain = true; return; }
  notesState.flushing = true;
  updateSyncStatus();
  try {
    do {
      syncAgain = false;
      await pushChanges();
      await pullChanges();
    } while (syncAgain);
    notesState.error = null;
  } catch (err) {
    notesState.error = err.message || String(err);
  } finally {
    notesState.flushing = false;
    notesChanged();
  }
}

function updateSyncStatus() {
  const s = $("#sync");
  const pending = notesState.outbox.size;
  let text, title = "";
  if (!REMOTE) { text = "Local"; title = "Notas solo en este navegador. Configura Supabase para compartirlas (supabase/README.md)."; }
  else if (!notesState.me) { text = "Entrar"; title = "Entra para ver y escribir notas compartidas."; }
  else if (!notesState.online) { text = pending ? `Sin conexión · ${pending}` : "Sin conexión"; title = "Los cambios se subirán al volver la conexión."; }
  else if (notesState.flushing) text = "Sincronizando…";
  else if (notesState.error) { text = "Error de sync"; title = notesState.error; }
  else if (pending) text = `Pendiente · ${pending}`;
  else text = "Sincronizado";
  s.textContent = text;
  s.title = title || "Sincronizar ahora";
  s.dataset.state = notesState.error ? "error" : pending ? "pending" : "ok";
}

// ---------- Login ----------

function openLogin(message = "") {
  $("#login-msg").textContent = message;
  if (!$("#login").open) $("#login").showModal();
}

// Email + contraseña: el plan gratuito de Supabase no deja cambiar la plantilla del email para
// enviar un código, y el enlace mágico en el móvil se abre en el navegador, no en la app instalada.
async function signIn(e) {
  e.preventDefault();
  $("#login-msg").textContent = "Entrando…";
  const { data, error } = await sb.auth.signInWithPassword({
    email: $("#login-email").value.trim(),
    password: $("#login-password").value,
  });
  if (error) { $("#login-msg").textContent = `No se pudo entrar: ${error.message}`; return; }
  $("#login-password").value = "";
  $("#login").close();
  await ensureSignedIn(data.session);
}

// ---------- Crear, editar, borrar ----------

function saveNote(fields) {
  const now = nowISO();
  const existing = fields.id && notesState.all[fields.id];
  const note = existing
    ? { ...existing, body: fields.body, updated_at: now }
    : {
        id: crypto.randomUUID(), author_id: notesState.me.id,
        book: fields.book, chapter: fields.chapter, verse: fields.verse ?? null,
        version: fields.version ?? null, quote: fields.quote ?? null,
        body: fields.body, created_at: now, updated_at: now, deleted_at: null,
      };
  notesState.all[note.id] = note;
  if (REMOTE) notesState.outbox.add(note.id);
  notesChanged();
  syncNow();
}

function deleteNote(id) {
  const n = notesState.all[id];
  if (!n || !confirm("¿Borrar esta nota?")) return;
  n.deleted_at = n.updated_at = nowISO();
  if (REMOTE) notesState.outbox.add(id);
  notesChanged();
  syncNow();
}

let editing = null;
function openEditor(fields) {
  if (!notesState.me) return REMOTE ? openLogin("Entra para escribir notas.") : null;
  editing = fields;
  const where = fields.verse ? `${bookName(fields.book)} ${fields.chapter}:${fields.verse}` : `${bookName(fields.book)} ${fields.chapter} · reflexión`;
  $("#note-ref").textContent = where + (fields.version ? ` (${fields.version})` : "");
  $("#note-quote").hidden = !fields.quote;
  $("#note-quote").textContent = fields.quote ? `«${fields.quote}»` : "";
  $("#note-body").value = fields.body || "";
  $("#note-dialog").showModal();
  $("#note-body").focus();
}

function submitNote(e) {
  e.preventDefault();
  const body = $("#note-body").value.trim();
  if (body) saveNote({ ...editing, body });
  else if (editing.id) deleteNote(editing.id);
  $("#note-dialog").close();
}

// ---------- Render en el capítulo ----------

const bookName = (id) => books.find((b) => b.id === id)?.name ?? `Libro ${id}`;
const author = (id) => notesState.members[id]
  || (id === "local" ? { name: "Yo (sin subir)", color: "#8a4b2a" } : { name: "?", color: "#888" });
const isMine = (n) => notesState.me && n.author_id === notesState.me.id;

function passesFilter(n) {
  if (settings.noteFilter === "mine") return isMine(n);
  if (settings.noteFilter === "others") return !isMine(n);
  return true;
}

function chapterNotes(book, chapter) {
  return Object.values(notesState.all)
    .filter((n) => n.book === book && n.chapter === chapter && !n.deleted_at && passesFilter(n))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function noteCard(n) {
  const a = author(n.author_id);
  const date = new Date(n.updated_at).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  const actions = isMine(n) ? [
    button("Editar", () => openEditor({ ...n })),
    button("Borrar", () => deleteNote(n.id)),
  ] : [];
  return el("article", { className: "note", style: `--c:${a.color}` }, [
    el("header", {}, [
      el("span", { className: "note-author", textContent: a.name }),
      el("span", { className: "note-meta", textContent: `${date}${n.version ? " · " + n.version : ""}${notesState.outbox.has(n.id) ? " · pendiente" : ""}` }),
      el("span", { className: "note-actions" }, actions),
    ]),
    n.quote ? el("blockquote", { textContent: n.quote }) : "",
    el("p", { className: "note-body", textContent: n.body }),
  ]);
}

function button(text, onClick, className = "link") {
  const b = el("button", { type: "button", className, textContent: text });
  b.addEventListener("click", onClick);
  return b;
}

function renderNotes() {
  const reader = $("#reader");
  if (!reader.querySelector(".chapter-title")) return; // aún cargando
  const { book, chapter } = position;
  const notes = chapterNotes(book, chapter);
  const byVerse = {};
  for (const n of notes) (byVerse[n.verse ?? 0] ??= []).push(n);

  // Notas por versículo (vista por versículos).
  for (const section of reader.querySelectorAll("section.verse")) {
    const v = Number(section.id.slice(1));
    const vnum = section.querySelector(".vnum");
    if (!vnum.querySelector(".add-note")) {
      vnum.append(button("✎", () => openEditor({ book, chapter, verse: v }), "add-note"));
      vnum.lastChild.title = "Añadir nota";
    }
    let box = section.querySelector(".verse-notes");
    if (!box) section.append(box = el("div", { className: "verse-notes" }));
    box.replaceChildren(...(byVerse[v] || []).map(noteCard));
  }

  // Reflexión del capítulo: una por autor.
  let reflections = reader.querySelector("#chapter-notes");
  if (!reflections) reader.append(reflections = el("section", { id: "chapter-notes" }));
  const general = byVerse[0] || [];
  const myReflection = general.find(isMine);
  reflections.replaceChildren(
    el("h3", { textContent: "Reflexión del capítulo" }),
    ...general.map(noteCard),
    myReflection || !notesState.me ? "" : button("＋ Escribir mi reflexión", () => openEditor({ book, chapter, verse: null }), "add-reflection"),
    !notesState.me && REMOTE ? button("Entra para tomar notas", () => openLogin(), "add-reflection") : "",
  );

  highlightQuotes(notes.filter((n) => n.quote && n.verse && n.version));

  if (notesState.pendingScroll) {
    document.getElementById(`v${notesState.pendingScroll}`)?.scrollIntoView({ block: "center" });
    notesState.pendingScroll = null;
  }
}

// Subraya en el texto las frases citadas, con el color de su autor (CSS Custom Highlight API).
function highlightQuotes(notes) {
  if (!window.CSS?.highlights) return;
  CSS.highlights.clear();
  const ranges = {};
  for (const n of notes) {
    const line = [...document.querySelectorAll(`#v${n.verse} .line`)].find((l) => l.querySelector(".tag")?.textContent === n.version);
    const range = line && findText(line.querySelector(".text"), n.quote);
    if (range) (ranges[n.author_id] ??= []).push(range);
  }
  const ids = Object.keys(ranges);
  ids.forEach((id, i) => CSS.highlights.set(`note-${i}`, new Highlight(...ranges[id])));
  $("#note-highlights").textContent = ids.map((id, i) =>
    `::highlight(note-${i}) { text-decoration: underline 2px ${author(id).color}; text-underline-offset: 4px; }`).join("\n");
}

function findText(root, needle) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let full = "";
  while (walker.nextNode()) { nodes.push([walker.currentNode, full.length]); full += walker.currentNode.data; }
  const start = full.indexOf(needle);
  if (start < 0) return null;
  const end = start + needle.length;
  const at = (pos) => { for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i][1] <= pos) return [nodes[i][0], pos - nodes[i][1]]; };
  const range = new Range();
  range.setStart(...at(start));
  range.setEnd(...at(end));
  return range;
}

// ---------- Anotar una frase seleccionada ----------

function selectionTarget() {
  const sel = getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const text = range.startContainer.parentElement?.closest(".line .text");
  if (!text || !text.contains(range.endContainer)) return null; // solo dentro de un mismo versículo y versión
  const quote = sel.toString().replace(/\s+/g, " ").trim().slice(0, 300);
  if (!quote) return null;
  return {
    range, quote,
    verse: Number(text.closest("section.verse").id.slice(1)),
    version: text.closest(".line").querySelector(".tag").textContent,
  };
}

function onSelectionChange() {
  const btn = $("#quote-note");
  const t = notesState.me ? selectionTarget() : null;
  if (!t) { btn.hidden = true; return; }
  const r = t.range.getBoundingClientRect();
  btn.style.left = `${Math.max(8, Math.min(innerWidth - 140, r.left + r.width / 2 - 60))}px`;
  btn.style.top = `${Math.min(innerHeight - 50, r.bottom + 8)}px`;
  btn.hidden = false;
}

// ---------- Vista "Notas" y exportación ----------

function filteredAll() {
  const q = $("#notes-search").value.trim().toLowerCase();
  const who = $("#notes-author").value;
  return Object.values(notesState.all)
    .filter((n) => !n.deleted_at)
    .filter((n) => who === "all" || n.author_id === who)
    .filter((n) => !q || `${n.body} ${n.quote || ""} ${bookName(n.book)}`.toLowerCase().includes(q));
}

function renderNotesList() {
  const order = $("#notes-order").value;
  const notes = filteredAll().sort(order === "book"
    ? (a, b) => a.book - b.book || a.chapter - b.chapter || (a.verse ?? 0) - (b.verse ?? 0)
    : (a, b) => b.updated_at.localeCompare(a.updated_at));
  $("#notes-count").textContent = `${notes.length} nota${notes.length === 1 ? "" : "s"}`;
  $("#notes-list").replaceChildren(...notes.map((n) => {
    const refText = `${bookName(n.book)} ${n.chapter}${n.verse ? ":" + n.verse : " · reflexión"}`;
    const go = button(refText, () => {
      notesState.pendingScroll = n.verse;
      $("#notes-dialog").close();
      goTo(n.book, n.chapter);
    }, "link note-ref");
    const card = noteCard(n);
    card.querySelector("header").prepend(go);
    return card;
  }));
}

function openNotesView() {
  $("#notes-author").replaceChildren(
    el("option", { value: "all", textContent: "Todos" }),
    ...Object.entries(notesState.members).map(([id, m]) => el("option", { value: id, textContent: m.name })),
  );
  renderNotesList();
  $("#notes-dialog").showModal();
}

function download(name, content, type) {
  const a = el("a", { href: URL.createObjectURL(new Blob([content], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportMarkdown() {
  const notes = filteredAll().sort((a, b) => a.book - b.book || a.chapter - b.chapter || (a.verse ?? 999) - (b.verse ?? 999));
  let md = `# Notas de estudio\n\nExportado el ${new Date().toLocaleDateString("es-ES")}\n`;
  let current = "";
  for (const n of notes) {
    const head = `${bookName(n.book)} ${n.chapter}`;
    if (head !== current) { md += `\n## ${head}\n`; current = head; }
    const who = author(n.author_id).name;
    const where = n.verse ? `**v. ${n.verse}**` : "**Reflexión**";
    md += `\n${where} · ${who}${n.version ? ` · ${n.version}` : ""}\n`;
    if (n.quote) md += `\n> ${n.quote}\n`;
    md += `\n${n.body}\n`;
  }
  download(`notas-estudio-${new Date().toISOString().slice(0, 10)}.md`, md, "text/markdown");
}

function exportJSON() {
  download(`notas-estudio-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(Object.values(notesState.all), null, 2), "application/json");
}

// ---------- Perfil (en Configuración) ----------

function renderAccount() {
  const me = notesState.me;
  $("#account-email").textContent = !REMOTE ? "Modo local (sin cuenta)" : me ? me.email : "Sin sesión";
  $("#profile-name").value = me?.name || "";
  $("#profile-color").value = me?.color || "#8a4b2a";
  $("#profile-name").disabled = $("#profile-color").disabled = !me;
  $("#sign-out").hidden = !REMOTE || !me;
  $("#note-filter").value = settings.noteFilter;
}

async function saveProfile() {
  const me = notesState.me;
  if (!me) return;
  me.name = $("#profile-name").value.trim() || me.name;
  me.color = $("#profile-color").value;
  notesState.members[me.id] = { ...notesState.members[me.id], name: me.name, color: me.color };
  if (REMOTE) {
    saveJSON("members", notesState.members);
    await sb.from("members").update({ display_name: me.name, color: me.color }).eq("user_id", me.id);
  } else saveJSON("profile", { name: me.name, color: me.color });
  notesChanged();
}

// ---------- Eventos ----------

function setupNoteUI() {
  $("#sync").addEventListener("click", () => (REMOTE && !notesState.me ? openLogin() : syncNow()));
  $("#open-notes").addEventListener("click", openNotesView);
  $("#login-form").addEventListener("submit", signIn);
  $("#note-form").addEventListener("submit", submitNote);
  $("#note-cancel").addEventListener("click", () => $("#note-dialog").close());
  for (const id of ["#notes-search", "#notes-author", "#notes-order"]) $(id).addEventListener("input", renderNotesList);
  $("#export-md").addEventListener("click", exportMarkdown);
  $("#export-json").addEventListener("click", exportJSON);
  $("#profile-name").addEventListener("change", saveProfile);
  $("#profile-color").addEventListener("change", saveProfile);
  $("#sign-out").addEventListener("click", async () => { await sb.auth.signOut(); renderAccount(); openLogin(); });
  $("#note-filter").addEventListener("change", (e) => { settings.noteFilter = e.target.value; saveSettings(); renderNotes(); });
  $("#open-settings").addEventListener("click", renderAccount);

  let timer;
  document.addEventListener("selectionchange", () => { clearTimeout(timer); timer = setTimeout(onSelectionChange, 150); });
  const quoteBtn = $("#quote-note");
  quoteBtn.addEventListener("pointerdown", (e) => e.preventDefault()); // no perder la selección
  quoteBtn.addEventListener("click", () => {
    const t = selectionTarget();
    if (!t) return;
    quoteBtn.hidden = true;
    openEditor({ book: position.book, chapter: position.chapter, verse: t.verse, version: t.version, quote: t.quote });
    getSelection().removeAllRanges();
  });
}
