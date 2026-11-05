"use strict";
// Doctrina: qué enseña la Confesión Bautista de 1689 con cada versículo (sus textos de prueba).
// Datos en data/lbc1689.js, generados con tools/build_1689.py. El texto va en español (traducción propia) y en el inglés original.
// Usa globales de app.js (el, position) y strongs.js (openPanel, status, ref, openVerse).

const LBC = window.LBC1689 || { titles: {}, paragraphs: [], refs: {} };

// [{ chapter, paragraph, title, clause, sections, english, index }] de las frases que citan este versículo.
// clause y sections van en español; english, el párrafo original.
function doctrineFor(book, chapter, verse) {
  return (LBC.refs[`${book}.${chapter}`] || [])
    .filter(([a, b]) => verse >= a && verse <= b)
    .map(([, , pi, si]) => {
      const [c, p, english, sections] = LBC.paragraphs[pi];
      return { chapter: c, paragraph: p, title: LBC.titles[c], clause: sections[si], sections, english, index: si };
    })
    .sort((x, y) => x.chapter - y.chapter || x.paragraph - y.paragraph || x.index - y.index);
}

// Capítulos de la confesión que citan algún versículo de este capítulo bíblico, del más citado al menos.
function chapterDoctrines(book, chapter) {
  const by = {};
  for (const [, , pi] of LBC.refs[`${book}.${chapter}`] || []) {
    const c = LBC.paragraphs[pi][0];
    by[c] ??= { chapter: c, title: LBC.titles[c], count: 0 };
    by[c].count++;
  }
  return Object.values(by).sort((x, y) => y.count - x.count || x.chapter - y.chapter);
}

const highlighted = (sections, index) => sections.flatMap((s, i) => [i ? " " : "", i === index ? el("mark", { textContent: s }) : s]);

// El párrafo de la confesión con resaltada la frase que se apoya en el versículo
// (la frase sola suele ser un fragmento sin sentido: «…but by»).
function clauseNode(d, verseButton) {
  return el("li", { className: "doctrine" }, [
    el("div", { className: "doctrine-ref" }, [verseButton || "", el("b", { textContent: `${d.chapter}.${d.paragraph}` })]),
    el("blockquote", { lang: "es" }, highlighted(d.sections, d.index)),
    el("details", { className: "original-en" }, [el("summary", { textContent: "Original (inglés, 1677)" }), el("p", { lang: "en" }, highlighted(d.english, d.index))]),
  ]);
}

const doctrineCredit = () => el("p", { className: "credit" }, ["Traducción propia del original (1677/1689) de ",
  el("a", { href: "https://github.com/BaptistSymbolics/1689Confession", target: "_blank", rel: "noopener", textContent: "BaptistSymbolics" }), " (CC0)."]);

// Pestaña «Doctrina» del panel del versículo.
function renderDoctrine(container, book, chapter, verse) {
  const items = doctrineFor(book, chapter, verse);
  if (!items.length) {
    container.replaceChildren(status("La Confesión de 1689 no cita este versículo como prueba."));
    return 0;
  }
  const groups = [];
  for (const d of items) {
    if (groups.at(-1)?.chapter !== d.chapter) groups.push({ chapter: d.chapter, title: d.title, items: [] });
    groups.at(-1).items.push(d);
  }
  container.replaceChildren(
    el("p", { className: "hint", textContent: "Lo que la Confesión Bautista de 1689 enseña usando este versículo como prueba. Va el párrafo entero con resaltada la frase que apoya; debajo, el original en inglés." }),
    ...groups.flatMap((g) => [
      el("h3", { className: "doctrine-title", textContent: `Cap. ${g.chapter} · ${g.title}` }),
      el("ul", { className: "doctrine-list" }, g.items.map((d) => clauseNode(d))),
    ]),
    doctrineCredit());
  return items.length;
}

// Panel de un capítulo de la confesión: qué versículos de este capítulo bíblico cita y para qué.
function openDoctrineChapter(c) {
  const { book, chapter } = position;
  const entries = (LBC.refs[`${book}.${chapter}`] || []).filter(([, , pi]) => LBC.paragraphs[pi][0] === c).sort((x, y) => x[0] - y[0]);
  openPanel(`1689 · Cap. ${c}`,
    el("h3", { className: "doctrine-title", textContent: LBC.titles[c] }),
    el("ul", { className: "doctrine-list" }, entries.map(([a, b, pi, si]) => {
      const [, p, english, sections] = LBC.paragraphs[pi];
      const label = b === 999 ? "Todo el capítulo" : a === b ? `v. ${a}` : `vv. ${a}-${b}`;
      const btn = el("button", { type: "button", className: "link", textContent: label });
      btn.addEventListener("click", () => { document.getElementById(`v${a}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); openVerse(a); });
      return clauseNode({ chapter: c, paragraph: p, clause: sections[si], sections, english, index: si }, btn);
    })),
    doctrineCredit());
}

// Barrita bajo las palabras clave: los temas doctrinales del capítulo.
function renderDoctrineChips(container, book, chapter) {
  const list = chapterDoctrines(book, chapter);
  if (!list.length) return container.replaceChildren();
  container.replaceChildren(el("span", { className: "kw-title", textContent: "Doctrina (1689):" }), ...list.slice(0, 6).map((d) => {
    const chip = el("button", { type: "button", className: "chip", title: `Confesión de 1689, capítulo ${d.chapter}` }, [
      `${d.chapter} · ${d.title.replace(/^(De la |Del |De los |De las |De )/, "")}`, el("span", { className: "count", textContent: `×${d.count}` }),
    ]);
    chip.addEventListener("click", () => openDoctrineChapter(d.chapter));
    return chip;
  }));
}
