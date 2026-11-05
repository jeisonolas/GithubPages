// Pasa cleanText por las Biblias completas de la copia privada (los .json.gz de tools/build_texts.py).
// Esos archivos tienen copyright y no están en el repo: este test solo corre en local, con
//   BIBLIA_DIR=C:/Users/jeiso/Downloads/biblia-supabase node --test docs/estudio/tests/
// Sin BIBLIA_DIR se salta (por ejemplo en la GitHub Action).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { loadApp } = require("./load.js");

const DIR = process.env.BIBLIA_DIR;
const app = loadApp();

for (const version of ["RV1960", "LBLA", "NTV", "BTX3", "PDT", "RV1909"]) {
  const file = DIR && path.join(DIR, `${version}.json.gz`);
  test(`Biblia completa ${version}`, { skip: !file || !fs.existsSync(file) ? "sin BIBLIA_DIR" : false }, () => {
    const bible = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
    const problems = [];
    let verses = 0;
    for (const [book, chapters] of Object.entries(bible)) {
      for (const [chapter, list] of Object.entries(chapters)) {
        for (const [verse, raw] of list) {
          verses++;
          const html = app.cleanText(raw, version, Number(book));
          const text = html.replace(/<[^>]+>/g, "");
          const where = `${book}:${chapter}:${verse}`;
          if (!text.trim()) problems.push(`${where} vacío`);
          if (/&(amp|lt|gt|quot);/.test(html)) problems.push(`${where} entidad HTML visible`);
          if (/[a-záéíóúñ][A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(text)) problems.push(`${where} palabras pegadas`);
          if (html.split("<i>").length !== html.split("</i>").length) problems.push(`${where} cursiva sin cerrar`);
        }
      }
    }
    assert.equal(Object.keys(bible).length, 66);
    assert.ok(verses > 31000, `${verses} versículos`);
    assert.deepEqual(problems.slice(0, 10), []);
  });
}
