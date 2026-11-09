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
  for (const [code, e] of es) assert.ok(/^[GH]\d+$/.test(code) && e.g && e.d && e.l && e.t, code);
  for (const v of app.STORED_VERSIONS) assert.ok(v === "KJV" || app.VERSIONS[v], v);
});

test("diccionario Strong en español: ningún código sin entrada", () => {
  const es = app.window.STRONGS_ES;
  // La numeración de Strong salta G2717 y G3203-G3302: esos números no existen.
  const gap = (n) => n === 2717 || (n >= 3203 && n <= 3302);
  const missing = [];
  for (let n = 1; n <= 8674; n++) if (!es[`H${n}`]) missing.push(`H${n}`);
  for (let n = 1; n <= 5624; n++) if (!gap(n) && !es[`G${n}`]) missing.push(`G${n}`);
  assert.deepEqual(missing, []);
  assert.equal(Object.keys(es).length, 8674 + 5624 - 101);
  // Las referencias dentro de las definiciones ("De H1961") apuntan a entradas que existen.
  const broken = [];
  for (const [code, e] of Object.entries(es)) for (const [ref] of e.d.matchAll(/\b[GH]\d+\b/g)) if (!es[ref]) broken.push(`${code} → ${ref}`);
  assert.deepEqual(broken, []);
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

test("doctrina 1689: textos de prueba por versículo", async (t) => {
  await t.test("Romanos 3:24 se cita en la justificación", () => {
    const d = app.doctrineFor(45, 3, 24);
    assert.ok(d.some((x) => x.chapter === 11 && x.title === "De la justificación"), JSON.stringify(d.map((x) => x.chapter)));
    for (const x of d) assert.ok(x.clause && x.sections[x.index] === x.clause);
  });
  await t.test("un capítulo citado entero cuenta para todos sus versículos (Salmo 51)", () => {
    assert.ok(app.doctrineFor(19, 51, 17).length >= 1);
  });
  await t.test("libro de un solo capítulo: «Judas 4» es el versículo 4", () => {
    assert.ok(app.doctrineFor(65, 1, 4).length >= 1);
  });
  await t.test("versículo no citado: lista vacía", () => {
    assert.deepEqual([...app.doctrineFor(13, 1, 1)], []);
  });
  await t.test("temas del capítulo, del más citado al menos", () => {
    const list = app.chapterDoctrines(45, 3);
    assert.ok(list.length > 1 && list.every((x, i) => !i || list[i - 1].count >= x.count));
  });
});

test("doctrina 1689: datos completos y referencias válidas", () => {
  const { titles, paragraphs, refs } = app.LBC;
  assert.equal(Object.keys(titles).length, 32);
  assert.equal(paragraphs.length, 160);
  const books = app.window.BOOKS;
  let n = 0;
  for (const [key, list] of Object.entries(refs)) {
    const [b, c] = key.split(".").map(Number);
    assert.ok(books[b - 1] && c >= 1 && c <= books[b - 1].chapters, key);
    for (const [a, z, pi, si] of list) {
      assert.ok(a >= 1 && z >= a && paragraphs[pi]?.[2][si], `${key} ${a}-${z}`);
      n++;
    }
  }
  assert.ok(n > 1200, `solo ${n} citas`);
});

test("Strong's: la palabra en toda la Biblia", () => {
  const bible = {
    1: { 1: [[1, "God<S>430</S> created<S>1254</S>"], [2, "the earth<S>776</S>"]] },
    43: { 3: [[16, "God<S>2316</S> so loved<S>25</S>"], [35, "The Father loveth<S>25</S>"]], 1: [[1, "the Word<S>3056</S>"]] },
    62: { 4: [[8, "God<S>2316</S> is love<S>26</S>"]] },
  };
  assert.deepEqual([...app.findStrong(bible, "G25")].map((r) => [...r]), [[43, 3, 16], [43, 3, 35]]);
  assert.deepEqual([...app.findStrong(bible, "G2316")].map((r) => [...r]), [[43, 3, 16], [62, 4, 8]]);
  assert.equal(app.findStrong(bible, "G2").length, 0, "G2 no debe coincidir con G25 ni G2316");
  assert.equal(app.findStrong(bible, "H25").length, 0, "los códigos hebreos solo se buscan en el AT");
  assert.deepEqual([...app.findStrong(bible, "H430")].map((r) => [...r]), [[1, 1, 1]]);
});

test("doctrina 1689: traducción al español frase por frase", () => {
  for (const [c, p, en, es] of app.LBC.paragraphs) {
    assert.equal(es?.length, en.length, `${c}.${p}`);
    assert.ok(es.every((s) => s.trim()), `${c}.${p} tiene una frase vacía`);
  }
  const d = app.doctrineFor(45, 3, 24).find((x) => x.chapter === 11);
  assert.match(d.clause, /justifica/);
  assert.ok(d.english[d.index].startsWith("justifieth"), d.english[d.index]);
});

test("citas y paralelos (UBS)", async (t) => {
  const labels = (list) => list.map((e) => e.label);
  await t.test("numeración hebrea convertida: Salmo 22:1 se cita en Mateo 27:46", () => {
    const { quotes } = app.parallelsFor(19, 22, 1);
    assert.ok(labels(quotes).includes("Mateo 27:46"), JSON.stringify(labels(quotes)));
    const nt = app.parallelsFor(40, 27, 46);
    assert.ok(labels(nt.quotes).includes("Salmos 22:1"), JSON.stringify(labels(nt.quotes)));
    assert.ok(labels(nt.parallels).includes("Marcos 15:34"));
  });
  await t.test("Joel 2:28 (JOL 3:1 hebreo) se cita en Hechos 2:17", () => {
    assert.ok(labels(app.parallelsFor(29, 2, 28).quotes).includes("Hechos 2:17"));
    assert.equal(app.parallelsFor(29, 3, 1).quotes.length, 0, "Joel 3:1 de la RV no es la cita");
  });
  await t.test("una cita casi exacta es «literal»", () => {
    const q = app.parallelsFor(44, 2, 17).quotes.find((e) => e.label === "Joel 2:28");
    assert.equal(q?.kind, "literal");
  });
  await t.test("paralelos del AT: 2 Reyes 11:21 (2KI 12:1 hebreo) con 2 Crónicas 24:1", () => {
    assert.ok(labels(app.parallelsFor(12, 11, 21).parallels).includes("2 Crónicas 24:1"));
  });
  await t.test("nombres de pasajes con varios trozos", () => {
    assert.equal(app.spansLabel(42, [[6, 27, 28], [6, 35, 35]]), "Lucas 6:27-28, 35");
    assert.equal(app.spansLabel(12, [[11, 21, 21], [12, 1, 1]]), "2 Reyes 11:21; 12:1");
  });
  await t.test("todos los grupos apuntan a pasajes que existen", () => {
    const books = app.window.BOOKS;
    assert.ok(app.PAR.groups.length > 2000);
    for (const g of app.PAR.groups) for (const [b, spans] of g) for (const [c, a, z] of spans) {
      assert.ok(books[b - 1] && c >= 1 && c <= books[b - 1].chapters && a >= 1 && z >= a, `${b} ${c}:${a}-${z}`);
    }
  });
});
