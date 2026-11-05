# Estudio Multi-Traducción

App web para el devocional diario de Jeison y Mile. Muestra un capítulo en varias versiones
españolas, resalta las diferencias, permite tomar notas compartidas y explica las palabras originales
con Strong's.

- **Publicada en:** <https://jeisonolas.github.io/GithubPages/estudio/>
- **Plan y decisiones:** [PLAN.md](PLAN.md)
- **Configuración de Supabase:** [supabase/README.md](supabase/README.md)

Está hecha con HTML, CSS y JavaScript sin frameworks ni compilación: scripts clásicos que se cargan
en orden desde `index.html`. El único paquete externo es supabase-js, copiado en `vendor/`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura, diálogos (ajustes, ayuda, login, notas) y orden de carga de los scripts. |
| `app.js` | Núcleo: versiones, ajustes, carga de capítulos, limpieza del texto (`cleanText`), diferencias (`align`, `compareVerse`), navegación y pintado. Arranca con `init()`. |
| `texts.js` | Copia privada: descarga las Biblias del bucket `biblia` de Supabase a IndexedDB y las lee de ahí. |
| `strongs.js` | Panel del versículo (pestañas *Palabras originales*, *Referencias* y *Doctrina*): KJV con Strong's como puente, definiciones, dónde más aparece cada palabra en la Biblia (`findStrong`, sobre la KJV de la copia privada) y palabras clave del capítulo. |
| `doctrine.js` | Doctrina: textos de prueba de la Confesión Bautista de 1689 por versículo (pestaña del panel) y temas del capítulo (barra bajo el título). |
| `xrefs.js` | Referencias cruzadas: carga `data/xref/{libro}.json` (se guarda en IndexedDB), vista previa en la versión base y salto al pasaje. |
| `notes.js` | Sesión de Supabase, notas (copia local, cola de envío, tiempo real), editor, lista y exportación. |
| `styles.css` | Temas, lector, vistas, panel y notas. |
| `config.js` | URL de Supabase y clave **publishable**, que es pública por diseño. Nunca la `service_role`. |
| `data/books.js` | Los 66 libros con sus capítulos (nombres de la RV1960). |
| `data/lbla-fixes.js` | 124 palabras a las que la LBLA de la fuente les quitó la ñ. |
| `data/xref/*.json` | Referencias cruzadas de OpenBible.info (CC BY), una por libro, ordenadas por votos. |
| `data/lbc1689.js` | Confesión de 1689 (inglés original, CC0) indexada por los versículos que cita, con los títulos de los capítulos en español. |
| `data/strongs-es.js` | Significado en español de las 1.500 palabras Strong más frecuentes (CC BY-SA). |
| `supabase/*.sql` | Tablas, RLS, miembros y bucket privado. |
| `tools/build_crossrefs.py` | Genera `data/xref/` a partir de `cross_references.txt` de OpenBible. |
| `tools/build_1689.py` | Genera `data/lbc1689.js` a partir de los `.toml` de BaptistSymbolics/1689Confession. |
| `tools/build_texts.py` | Genera los `.json.gz` de la copia privada a partir de las Biblias completas. |
| `tests/` | Tests con `node --test`, sin dependencias. |

## De dónde sale el texto

`fetchChapter(version, libro, capítulo)` en `app.js` prueba tres fuentes, en este orden:

1. **Copia privada** (`texts.js`): si hay sesión, cada versión se descarga una vez del bucket y queda
   en IndexedDB (`estudio` → `texts`, con clave `VERSIÓN@TEXTS_REVISION`). Así funciona sin conexión.
2. **Caché de `localStorage`** (`ch:2:VERSIÓN:libro:capítulo`), con lo último que se leyó de la API.
3. **bolls.life**, como mucho 2 peticiones a la vez y con reintentos.

En las tres, el texto pasa por `cleanText` antes de pintarse. Las correcciones de la fuente están
en un solo sitio: la ñ y las comillas de la LBLA, las palabras pegadas, los títulos de la PDT, las
marcas de la BTX3 y el encabezado de los salmos de la NTV.

Strong's usa la KJV de la misma copia privada (o de la API). Las definiciones en español salen de
`data/strongs-es.js` y las de inglés de bolls (BDBT).

## Probar en local

```bash
cd docs/estudio
python -m http.server 5173
```

Abre <http://localhost:5173>. Usa el mismo Supabase que la versión publicada, así que las notas que
escribas en local son reales. Las de prueba, empiézalas por `[PRUEBA]` y luego bórralas.

## Tests

```bash
node --test "docs/estudio/tests/*.test.js"
```

Se ejecutan desde la raíz del repo y también en cada PR, con la GitHub Action
`.github/workflows/estudio-tests.yml`. Cubren la limpieza del texto, las diferencias, la lectura de la
KJV, la fusión de notas, el almacenamiento lleno y los datos incluidos.

Para revisar también las Biblias completas en tu PC, apunta al directorio de los `.json.gz`:

```bash
BIBLIA_DIR="C:/Users/jeiso/Downloads/biblia-supabase" node --test "docs/estudio/tests/*.test.js"
```

**Si cambias `cleanText`, ejecuta este test**: es el que pasa la limpieza por los 31.000 versículos
de cada versión. Además, sube el prefijo de la caché `ch:2:` (en `fetchChapter` y en `init()`). Esa
caché guarda el texto ya limpio, así que, si no lo subes, los dispositivos seguirán mostrando la
limpieza antigua.

### Checklist manual antes de publicar algo grande

Esto necesita cuentas y dispositivos reales, así que no lo cubren los tests:

- [ ] Entrar con email y contraseña. Salir y volver a entrar.
- [ ] Una nota creada en el PC aparece en el móvil sin recargar (tiempo real) y lleva el nombre de
      quien la escribió.
- [ ] Editar y borrar una nota; sin conexión queda «pendiente» y se sube al volver.
- [ ] En un navegador sin datos, tras entrar, se descargan las versiones y después se lee con el modo
      avión activado.
- [ ] Tocar un versículo abre las palabras originales; tocar una palabra abre su definición.
- [ ] Cambiar de vista (apiladas, lado a lado, texto corrido) en el PC y en el móvil.
- [ ] Exportar las notas en Markdown y en JSON.

## Publicar

1. Trabaja en una rama de este repo (`C:\Dev\GithubPages`), nunca directamente en `master`.
2. Ejecuta los tests y abre un PR.
3. Al fusionarlo, GitHub Pages publica `docs/` en 1–2 minutos. Si un móvil no ve el cambio,
   recarga la página.

## Regenerar la copia privada

Hace falta si cambia la fuente o se añade una versión:

1. Descarga las Biblias completas:
   - bolls.life: `https://bolls.life/static/translations/{VER}.zip`
   - RV1909: `https://bible.helloao.org/api/spa_r09/complete.json`
2. Genera los archivos:
   ```bash
   python tools/build_texts.py <salida> RV1960=RV1960.json LBLA=LBLA.json ... RV1909=complete.json KJV=KJV.json
   ```
3. Pasa el test de Biblias completas con `BIBLIA_DIR=<salida>`.
4. Sube los `.json.gz` al bucket `biblia`, sustituyendo los que hay. No los subas al repo: tienen
   copyright.
5. Sube en uno `TEXTS_REVISION` en `texts.js`, para que cada dispositivo los vuelva a descargar.

## Regenerar las referencias cruzadas

1. Descarga `https://a.openbible.info/data/cross-references.zip` y descomprímelo.
2. `python tools/build_crossrefs.py cross_references.txt` (por defecto: 3 votos o más, 20 por versículo).
3. Ejecuta los tests y sube en uno `XREF_REVISION` en `xrefs.js`.

A diferencia de las Biblias, estos archivos sí van en el repo: la licencia CC BY lo permite, con la
atribución que se muestra en el panel y en la ayuda.

## Regenerar la Confesión de 1689

1. Descarga <https://github.com/BaptistSymbolics/1689Confession> (CC0).
2. `python tools/build_1689.py <repo>/src`. El script corrige las citas irregulares de la fuente
   («1 Chro. 21,1», «Jude 6:7», comas finales) y falla con un mensaje si encuentra una que no entiende.
3. Ejecuta los tests. No hace falta subir ninguna revisión: es un script normal, así que llega con la
   página.

## Añadir una versión

1. Añádela a `VERSIONS` en `app.js`, con nombre y color.
2. Si va en la copia privada, añádela a `STORED_VERSIONS` en `texts.js` y sigue los pasos de
   «Regenerar la copia privada».
3. Si su fuente tiene errores propios, corrígelos en `cleanText` y añade un caso en `tests/app.test.js`.
