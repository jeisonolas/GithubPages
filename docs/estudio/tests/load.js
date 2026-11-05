// Carga los scripts de la app (son scripts clásicos, sin módulos) en un contexto aislado de Node,
// sin DOM. Solo se prueban las funciones puras; lo que toca la pantalla va en la checklist manual.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const SCRIPTS = ["data/books.js", "data/lbla-fixes.js", "data/strongs-es.js", "strongs.js", "notes.js", "texts.js", "app.js"];

function fakeStorage(quota = Infinity) {
  const data = new Map();
  const size = () => [...data.values()].reduce((s, v) => s + v.length, 0);
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      if (size() - (data.get(k)?.length ?? 0) + String(v).length > quota) throw new Error("QuotaExceededError");
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
    keys: () => [...data.keys()],
    data,
  };
}

function loadApp({ storage = fakeStorage() } = {}) {
  const ctx = { console, setTimeout, clearTimeout, Promise, URL, navigator: { onLine: true } };
  ctx.window = ctx;
  ctx.localStorage = new Proxy(storage, { ownKeys: () => storage.keys(), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  vm.createContext(ctx);
  for (const file of SCRIPTS) {
    let code = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (file === "app.js") code = code.replace(/^init\(\);\s*$/m, ""); // sin arrancar la interfaz
    vm.runInContext(code, ctx, { filename: file });
  }
  // Las const/let de los scripts no son propiedades del contexto: se exponen aquí.
  return Object.assign(ctx, vm.runInContext(
    "({ settings, notesState, VERSIONS, STORED_VERSIONS, align, compareVerse, tokenize, words, normWord, parseKJV, cleanText, saveJSON, loadJSON })",
    ctx,
  ));
}

module.exports = { loadApp, fakeStorage, ROOT };
