const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, fakeStorage } = require("./load.js");

const app = loadApp();
const plain = (html) => html.replace(/<[^>]+>/g, "");

test("limpieza: errores conocidos de la fuente", async (t) => {
  await t.test("LBLA: comillas, palabras pegadas, ¿ perdida y ñ perdida", () => {
    assert.equal(app.cleanText("&quot;Tráeme caza&quot;", "LBLA", 1), '"Tráeme caza"');
    assert.equal(app.cleanText("porque elSeñor la entregará", "LBLA", 11), "porque el Señor la entregará");
    assert.equal(app.cleanText('Le preguntó: "zDe quién eres?"', "LBLA", 1), 'Le preguntó: "¿De quién eres?"');
    const [broken, fixed] = Object.entries(app.window.LBLA_N_FIX)[0];
    assert.equal(app.cleanText(`la ${broken} de`, "LBLA", 1), `la ${fixed} de`);
  });
  await t.test("PDT: sin títulos de sección ni HTML", () => {
    const raw = "<p align='center'><b><i>La creación del mundo</i></b></p>Cuando en el principio Dios creó";
    assert.equal(app.cleanText(raw, "PDT", 1), "Cuando en el principio Dios creó");
  });
  await t.test("BTX3: sin marcas °", () => {
    assert.equal(app.cleanText("En un principio° creó °Elohim°", "BTX3", 1), "En un principio creó Elohim");
  });
  await t.test("NTV: sin el encabezado «Salmo N»", () => {
    assert.equal(app.cleanText("Salmo 23 El SEÑOR es mi pastor", "NTV", 19), "El SEÑOR es mi pastor");
  });
  await t.test("marcas de párrafo y espacios", () => {
    assert.equal(app.cleanText("uno |par dos • tres , cuatro<br><br>", "RV1960", 1), "uno dos tres, cuatro");
  });
});

test("limpieza: solo deja pasar <br> e <i>", () => {
  const out = app.cleanText('<script>alert(1)</script><b>x</b> <i>bien</i>', "RV1960", 1);
  assert.ok(!/<(script|b)>/.test(out), out);
  assert.match(out, /<i>bien<\/i>/);
  assert.equal(app.cleanText("<i>sin cerrar", "LBLA", 1), "<i>sin cerrar</i>");
  assert.equal(app.cleanText("sobra</i> aquí", "LBLA", 1), "sobra aquí");
});

test("diferencias entre versiones", async (t) => {
  app.settings.base = "A";
  app.settings.showDiff = true;
  app.settings.showOmitted = false;
  const compare = (a, b) => app.compareVerse(["A", "B"], { A: { 1: a }, B: { 1: b } }, 1);

  await t.test("textos iguales: sin marcas y diferencia 0", () => {
    const r = compare("Porque de tal manera amó Dios", "Porque de tal manera amó Dios");
    assert.ok(!r.html.B.includes("<mark"));
    assert.equal(r.difference, 0);
  });
  await t.test("mayúsculas y tildes no cuentan como diferencia", () => {
    assert.ok(!compare("cree en Él", "Cree en El").html.B.includes("<mark"));
  });
  await t.test("marca las palabras nuevas y une las seguidas", () => {
    const r = compare("amó Dios al mundo", "amó tanto tanto Dios al mundo");
    assert.equal(r.html.B, 'amó <mark class="diff-add">tanto tanto</mark> Dios al mundo');
    assert.ok(r.difference > 0 && r.difference < 1);
  });
  await t.test("con «mostrar omitidas» enseña lo que falta de la base", () => {
    app.settings.showOmitted = true;
    assert.match(compare("amó Dios al mundo", "amó al mundo").html.B, /<del class="diff-del"[^>]*>Dios<\/del>/);
    app.settings.showOmitted = false;
  });
  await t.test("las cursivas no rompen el resaltado", () => {
    assert.equal(plain(compare("le dijo", "le <i>dijo</i> así").html.B), "le dijo así");
  });
});

test("Strong's: lectura de la KJV etiquetada", () => {
  const text = "In the beginning<S>7225</S> God<S>430</S> created<S>1254</S> <S>853</S> the heaven<sup>a</sup><S>8064</S>.";
  assert.deepEqual([...app.parseKJV(text, "H")].map((p) => [...p]), [
    ["In the beginning", "H7225"], ["God", "H430"], ["created", "H1254"], ["", "H853"], ["the heaven", "H8064"],
  ]);
});

test("notas: una remota no pisa un cambio local pendiente más nuevo", () => {
  const { notesState } = app;
  notesState.all = { n1: { id: "n1", body: "local", updated_at: "2026-02-01T00:00:00Z" } };
  notesState.outbox = new Set(["n1"]);
  assert.equal(app.window.mergeRemote({ id: "n1", body: "remota", updated_at: "2026-01-01T00:00:00Z" }), false);
  assert.equal(notesState.all.n1.body, "local");
  assert.equal(app.window.mergeRemote({ id: "n1", body: "remota", updated_at: "2026-03-01T00:00:00Z" }), true);
  assert.equal(notesState.all.n1.body, "remota");
});

test("preferencias: con el almacenamiento lleno se vacía la caché de capítulos", () => {
  const storage = fakeStorage(100);
  const fresh = loadApp({ storage });
  storage.setItem("ch:2:RV1960:1:1", "x".repeat(98));
  fresh.saveJSON("help-seen", true);
  assert.equal(storage.getItem("help-seen"), "true");
  assert.equal(storage.getItem("ch:2:RV1960:1:1"), null);
  assert.doesNotThrow(() => loadApp({ storage: fakeStorage(0) }).saveJSON("help-seen", true));
});

test("datos incluidos", () => {
  const books = app.window.BOOKS;
  assert.equal(books.length, 66);
  assert.equal(books.reduce((s, b) => s + b.chapters, 0), 1189);
  const es = Object.entries(app.window.STRONGS_ES);
  assert.equal(es.length, 1500);
  for (const [code, e] of es) assert.ok(/^[GH]\d+$/.test(code) && e.g && e.d, code);
  for (const v of app.STORED_VERSIONS) assert.ok(v === "KJV" || app.VERSIONS[v], v);
});

test("referencias cruzadas: lectura y nombre del pasaje", () => {
  const one = app.parseXref("43.3.16");
  assert.deepEqual({ ...one }, { book: 43, chapter: 3, verse: 16, endChapter: 3, endVerse: 16 });
  assert.equal(app.xrefLabel(one), "Juan 3:16");
  assert.equal(app.xrefLabel(app.parseXref("20.8.22-8.31")), "Proverbios 8:22-31");
  assert.equal(app.xrefLabel(app.parseXref("1.1.1-2.3")), "Génesis 1:1–2:3");
});

test("referencias cruzadas: los 66 archivos apuntan a pasajes que existen", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { ROOT } = require("./load.js");
  const books = app.window.BOOKS;
  let total = 0;
  for (const b of books) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/xref", `${b.id}.json`), "utf8"));
    for (const [c, verses] of Object.entries(data)) {
      assert.ok(+c >= 1 && +c <= b.chapters, `${b.name} ${c}`);
      for (const refs of Object.values(verses)) for (const s of refs) {
        const r = app.parseXref(s);
        const to = books[r.book - 1];
        assert.ok(to && r.chapter >= 1 && r.endChapter <= to.chapters && r.verse >= 1, s);
        assert.ok(r.endChapter > r.chapter || r.endVerse >= r.verse, s);
        total++;
      }
    }
  }
  assert.ok(total > 150000, `solo ${total} referencias`);
});
