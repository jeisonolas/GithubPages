# Estudio Multi-Traducción — Plan de implementación

App web personal para el devocional diario: un capítulo en varias versiones, diferencias
resaltadas, notas y significado de palabras (Strong's).

## 1. Lo que verifiqué (4-nov-2026)

Fuente de textos: **bolls.life** (API gratis, sin clave, CORS abierto `*`).

| Versión | Código | Estado |
|---|---|---|
| Reina-Valera 1960 | `RV1960` | OK |
| La Biblia de las Américas | `LBLA` | OK. Marca en `<i>` las palabras añadidas por los traductores |
| Nueva Traducción Viviente | `NTV` | OK |
| Biblia Textual 3ª ed. | `BTX3` | OK (muy literal) |
| Palabra de Dios para Todos | `PDT` | OK |
| Reina Valera Gómez 2004 | `RV2004` | OK |
| **NVI** | `NVI` | **NO disponible**: Biblica la retiró; la API devuelve un aviso en vez del texto |

Strong's:
- Ninguna versión en español trae números Strong. La única fuente usable es **KJV con Strong's**
  (`<S>2424</S>` tras cada palabra inglesa), AT y NT.
- Definiciones: `dictionary-definition/BDBT/G26` → original griego/hebreo, transliteración,
  pronunciación, definición, origen. **Están en inglés.** No hay diccionario Strong en español
  abierto (la Concordancia Strong en español de Caribe tiene copyright).

Consecuencia: no se puede hacer "clic en una palabra española → su Strong" de forma exacta.
Se hace por versículo (ver §6).

Endpoints:
- `GET /get-books/{VERSION}/` → libros y nº de capítulos
- `GET /get-text/{VERSION}/{libro}/{capítulo}/` → `[{verse, text}]`
- `GET /dictionary-definition/BDBT/{G|H}{número}/`

## 2. Decisiones tomadas

- Versiones por defecto: **RV1960 · LBLA · NTV** (configurable).
- Strong's con definiciones en inglés.
- Uso en **PC y móvil con notas sincronizadas**.
- **Dos usuarios: tú y tu esposa.** Notas **compartidas con autor**: cada uno ve las suyas y
  las del otro, cada autor con su color. Solo el autor puede editar o borrar su nota.
- Notas en texto libre.
- Sincronización con **Supabase** (plan gratuito).

## 3. Stack

- HTML + CSS + JS vanilla, sin build ni dependencias: `index.html`, `styles.css`, `app.js`.
- **Hosting estático en GitHub Pages** (necesario para abrirla desde el móvil). La app no
  contiene texto bíblico, solo lo pide a la API. Se puede añadir a la pantalla de inicio del
  móvil (manifest PWA mínimo).
- Persistencia local: `localStorage` (configuración del dispositivo, caché de capítulos,
  definiciones y notas, cola de cambios pendientes).
- Requiere internet la primera vez que se abre cada capítulo; luego sale de caché.

### Supabase (notas y usuarios)

- Cliente `supabase-js` cargado desde CDN (sin build). La `anon key` y la URL del proyecto van en
  `config.js`; son públicas por diseño, la seguridad la ponen las políticas RLS.
- **Login con email y contraseña.** Al principio era un código por email, pero el plan gratuito de
  Supabase no deja editar la plantilla del email sin SMTP propio, y el enlace mágico en el móvil se
  abre en el navegador y no en la app instalada. Los usuarios los crea el administrador en el panel.
- Solo pueden entrar los dos: tabla `members` con vuestros emails y registro público desactivado
  en Supabase.
- Tablas:
  - `members`: `user_id`, `email`, `display_name`, `color`.
  - `notes`: `id` (uuid), `author_id` (= `auth.uid()` por defecto), `book`, `chapter`,
    `verse` (null = nota general del capítulo), `version`, `quote`, `body`, `created_at`,
    `updated_at`, `deleted_at` (borrado suave).
- Políticas RLS:
  - leer `notes` y `members`: cualquier usuario que esté en `members`;
  - crear, editar y borrar `notes`: solo si `author_id = auth.uid()`.
- Te dejo `supabase/schema.sql` listo para pegar en el SQL Editor.
- Sincronización:
  - al abrir un capítulo se piden sus notas (de los dos) y se guardan en caché;
  - cada cambio se escribe en local y se envía; si no hay conexión queda en la cola y se reenvía
    al volver;
  - no hay conflictos entre vosotros (cada nota solo la edita su autor); entre tus propios
    dispositivos gana el `updated_at` más reciente;
  - **Realtime** (incluido en el plan gratuito): si estáis estudiando el mismo capítulo a la vez,
    la nota de uno aparece al otro sin recargar.
- Límite a tener en cuenta: Supabase pausa los proyectos gratuitos tras 7 días sin actividad.
  Con un uso diario no ocurre; si pasa, se reactiva con un clic en el panel.

## 4. Fase 1 — Lectura multi-versión

- Selector de libro (nombres en español desde `get-books`) y capítulo, botones ◀ ▶ para
  capítulo anterior/siguiente. Recuerda el último capítulo abierto.
- Vista **por versículo** (filas): cada versículo muestra una línea por versión, alineadas.
  Es la vista que hace útil la comparación. Alternativa conmutable: vista en columnas
  (cada versión como texto corrido).
- Configuración (panel ⚙): elegir versiones (mín. 2, por defecto RV1960 · LBLA · NTV), orden,
  versión base para comparar, tamaño de letra, tema claro/oscuro.
- Limpieza del texto: quitar `•` y espacios dobles, respetar `<br>` (poesía), mantener
  `<i>` de LBLA en cursiva (indica palabras añadidas al original: dato valioso para el estudio).

## 5. Fase 2 — Diferencias

- Comparación palabra a palabra de cada versión contra la versión base (LCS sobre palabras,
  sin distinguir mayúsculas, tildes ni puntuación: la LBLA de la API pierde la tilde en
  mayúsculas, "El" por "Él").
- Colores:
  - verde suave: palabras que esta versión tiene y la base no;
  - tachado gris (opcional, toggle): palabras de la base que esta versión omite.
- Cada versión tiene su color de etiqueta para distinguirlas.
- Toggle "Mostrar diferencias" para leer limpio cuando no interesa.
- Indicador por versículo del grado de diferencia (p. ej. un punto más intenso cuanto más
  difieren): ayuda a detectar rápido los versículos donde merece la pena pararse.

Limitación honesta: es una diferencia textual, no semántica. "amor" vs "caridad" se marca igual
que "y" vs "e". Por eso se combina con Strong's (§6).

## 6. Fase 3 — Strong's (significado de palabras)

- Clic en el número de un versículo → panel lateral "Palabras originales" con la lista del
  versículo en el orden de la KJV:
  `shepherd → H7462 · רָעָה · ra'ah`.
  La palabra inglesa de la KJV sirve para identificar a qué palabra española corresponde.
- Clic en una entrada → definición completa (original, transliteración, pronunciación,
  definición, origen, partes de la oración).
- Enlaces entre Strong's dentro de la definición (p. ej. "from G25") navegables.
- "Palabras clave del capítulo": Strong's que se repiten en el capítulo (p. ej. G26 *agape*
  ×5 en 1 Co 13), listados arriba. Es lo que en un estudio suele revelar el hilo del pasaje.
- Caché de definiciones en `localStorage`.

Limitaciones:
- ~~Definiciones en inglés.~~ Resuelto con traducción propia: primero las 1.500 palabras más
  frecuentes y después el diccionario entero (14.197 entradas, `tools/strongs_es.tsv`). El
  `data/strongs-es.js` resultante pesa ~1,9 MB (~0,55 MB con gzip, que GitHub Pages aplica). Se
  carga entero y de forma síncrona, como antes: partirlo o cargarlo bajo demanda obligaría a hacer
  asíncrono `strongs.js` y, a este tamaño, no compensa.
- La numeración de versículos KJV y española no siempre coincide (títulos de Salmos, Malaquías 4,
  Joel 2–3, algunos pasajes más). En esos casos el panel puede quedar desplazado un versículo;
  se añade una tabla de ajustes para los casos conocidos.

## 7. Fase 4 — Notas

- Clic en el texto de un versículo (o seleccionar una frase) → añadir nota. Si hay texto
  seleccionado, la nota guarda la cita y la versión.
- Nota general del capítulo: la reflexión del devocional del día. Cada uno escribe la suya y
  se ven una junto a la otra.
- Los versículos con nota se marcan con un punto del color de cada autor; las frases citadas,
  subrayadas con ese color.
- Filtro: mis notas / las de ella / las dos.
- Vista "Notas": listado por fecha o por libro, con buscador y filtro por autor.
- Exportar a Markdown (capítulo o todo, con autor) y a JSON como copia de seguridad.
- Indicador de sincronización (sincronizado / pendiente / sin conexión).
- Pantalla de entrada (email y contraseña) y de perfil (nombre y color).

## 8. Fase 5 — Pulido

- Diseño legible para lectura larga (tipografía serif para el texto bíblico).
- Responsive desde la fase 1: en móvil las versiones se apilan por versículo y el panel de
  Strong's/notas se abre como hoja inferior.
- Despliegue en GitHub Pages + manifest para instalar en el móvil.
- Atajos de teclado: ← → capítulo, `d` diferencias, `n` nota.
- Estados de error claros (sin conexión, versión no disponible).

## 9. Fidelidad de los textos (verificado el 4-nov-2026)

Descargué las tres versiones completas de bolls.life y las comprobé de dos formas.

**Integridad** (toda la Biblia):

| | Libros | Capítulos | Versículos | Observaciones |
|---|---|---|---|---|
| RV1960 | 66 | 1189 | 31.102 | Completa. 2 restos de formato (`\|par` en Hch 1:20 y 1 P 2:6) |
| LBLA | 66 | 1189 | 31.102 | Completa, pero con **errores de conversión** (abajo) |
| NTV | 66 | 1189 | 31.064 | Completa. Los 40 "huecos" son correctos (abajo) |

**Cotejo con BibleGateway** (que tiene licencia de las tres) en 8 capítulos (Gn 1, Sal 23,
Is 53, Mt 5, Jn 3, Ro 8, Ef 2, Ap 21), 221 versículos por versión:

- **RV1960: fiel.** 213 de 221 idénticos. El resto son tildes de la ortografía anterior
  ("éste", "sólo"; BibleGateway usa la edición actualizada "este", "solo"), una errata
  ("estálos" por "está en los", Mt 5:16) y **faltan los títulos de los Salmos**
  ("Salmo de David").
- **NTV: fiel.** Las diferencias son de puntuación entre ediciones (2009 frente a la
  actual). Los versículos que faltan son los que la NTV no incluye en el texto principal por
  crítica textual (Mt 17:21, Mc 9:44, Jn 5:4, Hch 8:37…) y las listas del censo de Números 1–2,
  donde une versículos. Es la NTV real, no un error.
- **LBLA: con fallos.** El texto es el correcto, pero:
  - en 8 libros (Gn, Éx, Nm, 1 Cr, Neh, Est, Job, Is) se perdió la **ñ**: "manana", "anos",
    "senor" (~880 apariciones en ~124 palabras distintas);
  - hay palabras pegadas ("sefingió", "queme", "delrey") y cursivas mal cerradas en 13
    títulos de Salmos;
  - es la LBLA de 1997; BibleGateway tiene una revisión posterior, así que algunos versículos
    difieren a propósito ("Y dijo Dios" frente a "Entonces dijo Dios", Gn 1:3).

Qué hace la app con esto:

- **Reparación automática de la ñ en LBLA**: si una palabra no existe en el vocabulario de las
  tres versiones y cambiando `n` por `ñ` aparece una sola palabra válida, se corrige. Probado:
  corrige las ~880 apariciones sin ambigüedad.
- Las palabras pegadas **no** se separan automáticamente: el detector daba falsos positivos
  ("decrecieron" → "de crecieron"). En su lugar, **corrección manual**: en cada versículo hay un
  "corregir texto"; la corrección se guarda en Supabase (tabla `text_fixes`) y se aplica para los
  dos.
- Versículos omitidos (NTV): se muestra "— no incluido en el texto principal de esta
  versión" en lugar de un hueco. Para el estudio es información útil (Textus Receptus frente a
  texto crítico).
- Se limpian `|par`, `•`, espacios dobles y cursivas sin cerrar.

## 10. Plan B si la API cae

> **Estado:** implementado en `texts.js` + `tools/build_texts.py` + `supabase/storage.sql`, con 7
> versiones: RV1960, LBLA, NTV, BTX3, PDT, RV1909 (dominio público, de eBible/helloao) y KJV. La
> lista de libros va en `data/books.js`. Al revisar las Biblias completas salieron errores de la
> fuente que ahora corrige `cleanText`: `&quot;` y palabras pegadas en la LBLA, la «¿» convertida en
> «z», el HTML de los títulos de la PDT y las marcas «°» de la BTX3. Pendiente: las definiciones de
> Strong's que no están en español siguen viniendo de bolls (punto 4).

Durante la búsqueda, una API alternativa (bible-api.deno.dev) no respondía: estos servicios
gratuitos son frágiles. Por eso **la app no depende de la API en el día a día**:

1. **Copia privada de los textos.** Un script (`tools/build_texts.py`) descarga las versiones
   completas de bolls.life (~2 MB comprimidas cada una), aplica la limpieza y las reparaciones de
   §9 y las sube a un **bucket privado de Supabase Storage**, accesible solo para los dos usuarios.
   No se publica en el repo ni en GitHub Pages (sería redistribuir textos con copyright).
2. **Copia en cada dispositivo.** Al entrar por primera vez, la app descarga esas versiones a
   IndexedDB. A partir de ahí la lectura es 100 % local: más rápida, funciona sin conexión y
   no le afecta que caiga bolls.life.
3. **bolls.life queda como fuente secundaria**: para versiones que no estén en la copia
   privada (añadir PDT o BTX3 desde ajustes) y para la descarga inicial.
4. **Strong's**: el script guarda también la KJV con Strong's y los diccionarios de griego
   y hebreo de **OpenScriptures** (dominio público, en GitHub), así que tampoco dependen de la
   API.
5. Si bolls.life desapareciera del todo, la copia privada sigue funcionando. Para añadir una
   versión nueva habría que buscar otra fuente; el script tiene la descarga aislada en una
   función para poder cambiarla.

Hasta que exista Supabase (fases 1–3) se lee directamente de bolls.life con caché local.

## 11. Riesgos

- **bolls.life** puede caer o retirar versiones (ya pasó con NVI). Cubierto por el plan B (§10).
- **Supabase gratuito** pausa el proyecto tras 7 días sin uso; los dispositivos siguen leyendo
  su copia local y se reactiva con un clic.
- RV1960, LBLA y NTV tienen copyright: uso personal y familiar sí, difundir la app no. La URL de
  GitHub Pages es pública, pero sin login no hay textos ni notas: estos solo se descargan tras
  entrar.

## 12. Lo que necesito de ti

- Antes de la fase 4: crear un proyecto en supabase.com (gratis), pegar `schema.sql` y darme
  la URL y la `anon key`. Te dejo los pasos exactos.
- Los dos emails, y los nombres y colores con los que queréis aparecer.
- Un repo en GitHub para publicarla en Pages (o lo creo yo con `gh` si me das el ok).

## 13. Orden de entrega

Fase 1 → 2 → 3 → 4 → 5, cada una usable por sí sola. Revisas al acabar cada fase.
Las fases 1–3 no necesitan Supabase: se pueden usar mientras montas el proyecto.
