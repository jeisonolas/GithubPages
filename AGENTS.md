## Project Specifics

| | |
|---|---|
| Proyecto | GitHub Pages personal (`https://jeisonolas.github.io/GithubPages/`): utilidades HTML sueltas en `docs/*.html` y la app **Estudio Multi-Traducción** en `docs/estudio/`. |
| Definition of done | `node --test "docs/estudio/tests/*.test.js"` en verde. Si se toca `cleanText` o la copia privada, también con `BIBLIA_DIR` apuntando a los `.json.gz` (ver `docs/estudio/README.md`). |
| Referencia | [`docs/estudio/README.md`](docs/estudio/README.md) |

### Where Things Are

- Arquitectura de Estudio, cómo probar en local, cómo publicar y cómo regenerar los textos:
  `docs/estudio/README.md`.
- Por qué se decidió cada cosa (versiones, Supabase, plan B, fidelidad de los textos):
  `docs/estudio/PLAN.md`.
- Configuración de Supabase (tablas, RLS, miembros, bucket): `docs/estudio/supabase/README.md`.
- Las utilidades de `docs/*.html` son páginas autocontenidas, sin dependencias entre ellas.

### Constraints That Bite

- **Todo lo que está en `docs/` es público**: GitHub Pages lo publica desde `master /docs`. Las
  Biblias generadas (`*.json.gz`) tienen copyright y solo van al bucket privado `biblia`, nunca al
  repo.
- `docs/estudio/config.js` lleva a propósito la clave **publishable** de Supabase, que es pública
  por diseño y está protegida por RLS. No la quites. Nunca pongas ahí la `service_role`.
- Los scripts de Estudio son **clásicos y comparten variables globales**. El orden de los
  `<script>` en `index.html` es parte del contrato. No hay bundler: no los conviertas en módulos.
- Si cambias `cleanText`, sube el prefijo de la caché `ch:2:` en `fetchChapter` **y** en la
  limpieza de `init()` (`app.js`). Si no, los dispositivos siguen mostrando el texto ya limpiado
  con las reglas antiguas.
- Si regeneras los `.json.gz`, sube `TEXTS_REVISION` en `texts.js`. Si no, cada dispositivo se
  queda con la copia que ya tiene en IndexedDB.
- `vendor/supabase.js` está copiado a propósito: así no depende de un CDN.
- `master` no admite push directo. Se trabaja en una rama con PR, y el dueño hace el merge.

<!-- CORE:BEGIN — synced from ~/.claude/templates/agents-core.md. Do not edit here; edit the template and run sync-agents.ps1 -->
## Before Starting Any Task

Read only what the task needs from `README.md` and `ai_context/architecture.md`. Load nothing
preemptively.

## Definition of Done

The verification command in *Project Specifics* passes locally. Never report success without
having run it.

After code changes: state what changed, how it was verified, and any residual risk.

## Context Files

`ai_context/architecture.md` is the durable record — update it when structure, technologies, or
system behavior change. Sections:

```md
# Architecture
## System Overview
## Tech Stack
## Key Modules
## Runtime / Infrastructure
## Coding Standards
## Testing Strategy
## Known Risks
## Points For Improvement
```

`ai_context/session.md` is local per developer (gitignored); shared state never lives only there.
`ai_context/decisions.md` keeps a rolling window of the 5 most recent decisions.

## Security

Secret configuration keys travel **empty** in versioned config files; operators fill them per
environment. Redact tokens, credentials, and session blobs in logs, docs, examples, and commit
messages. Security-scan exceptions live in versioned allowlist files, each with a written
justification.

## Git & Commits

- Branch from the current active branch before starting any feature, fix, or task.
- Naming: `feat/description`, `fix/description`, `chore/description`, `refactor/description`.
- Never commit directly to `main` or `develop`.
- Conventional Commits: `feat(auth): add token refresh flow`, `fix(api): handle empty customer response`.
<!-- CORE:END -->
