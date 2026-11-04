"use strict";
// Copia privada de los textos: bucket "biblia" de Supabase (solo miembros) → IndexedDB del dispositivo.
// Cada versión se descarga una vez tras iniciar sesión; después se lee sin conexión.
// Sin sesión, o para versiones que no están en la copia, la app sigue usando bolls.life.
// Usa globales de notes.js (sb, notesState).

const STORED_VERSIONS = ["RV1960", "LBLA", "NTV", "BTX3", "PDT", "RV1909", "KJV"];
// Subir este número al volver a generar los archivos con tools/build_texts.py: fuerza la nueva descarga.
const TEXTS_REVISION = 1;
let downloaded = false; // se bajó algo nuevo en esta carga de la página
const bibles = {}; // versión -> Promise<{libro: {capítulo: [[versículo, texto], ...]}}>

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("estudio", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("texts");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction("texts", mode).objectStore("texts"));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

async function download(version) {
  const { data, error } = await sb.storage.from("biblia").download(`${version}.json.gz`);
  if (error) throw error;
  const head = new Uint8Array(await data.slice(0, 2).arrayBuffer());
  const gzipped = head[0] === 0x1f && head[1] === 0x8b; // por si el servidor ya lo entrega descomprimido
  return new Response(gzipped ? data.stream().pipeThrough(new DecompressionStream("gzip")) : data).json();
}

function storedBible(version) {
  if (!STORED_VERSIONS.includes(version)) return Promise.resolve(null);
  return bibles[version] ??= (async () => {
    const local = await idb("readonly", (s) => s.get(`${version}@${TEXTS_REVISION}`)).catch(() => null);
    if (local) return local;
    if (!notesState.me || notesState.me.id === "local") { delete bibles[version]; return null; } // tras el login se reintenta
    const bible = await download(version);
    downloaded = true;
    await idb("readwrite", (s) => s.put(bible, `${version}@${TEXTS_REVISION}`)).catch(() => {}); // sin espacio: se usa solo en memoria
    return bible;
  })().catch(() => null); // sin conexión o sin el archivo en el bucket: API hasta la próxima carga de la página
}

// [[versículo, texto sin limpiar], ...] o null si hay que ir a la API.
async function storedChapter(version, book, chapter) {
  return (await storedBible(version))?.[book]?.[chapter] ?? null;
}

// Tras iniciar sesión: descarga en segundo plano las versiones activas y la KJV (Strong's).
// Si el capítulo actual se pintó antes con la API (o con error, como la RV1909), se repinta.
async function prefetchTexts() {
  await Promise.all([...activeVersions(), "KJV"].map(storedBible));
  if (downloaded) render();
}
