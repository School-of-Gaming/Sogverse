# docs/projects

Working docs for a piece of work that runs across many sessions and is still being shaped
while it is built. A project doc is the project's memory: the next session reads it first,
and the session that learns or decides something writes it down before it ends.

## How it differs from its neighbours

- **Not a plan.** A plan in `../plans/` is decided before building starts. A project mixes
  what is decided with what is only proposed, ideas still being weighed and tasks under way.
  Every proposal carries a date and says it is not yet decided, so a later session never
  builds an idea as though the owner had chosen it.
- **Not an investigation.** The work is committed; the open questions are about how, not
  whether.
- **Not `TODO.md`.** A project's tasks and ideas live in its own doc, never mirrored into
  `TODO.md`.

## Lifecycle

Open → work and refine → **move what lasts to its home → delete the doc.**

When the project is done, its durable results leave before the file goes: a rule into the
colocated `CLAUDE.md` or `docs/architecture/` doc that owns it, a story worth keeping into
`../records/`. Its open ideas are proposed to the owner by headline, and only the ones the
owner names are carried on, as a `TODO.md` item or a new project. The rest go with the doc,
and git history is the record.

## Keeping it useful between sessions

- **Update it in the session that did the work.** A session that ends with the doc
  describing yesterday leaves the next one to rediscover today.
- **Remove a finished task; don't tick it.** Anything it decided goes into the decision
  log, dated.
- **Current state stays at the top and stays true.** When the pages, code or assets it
  describes change, rewrite that section; don't append a correction below it.
- **The owner's decisions are marked as the owner's.** A session may add a task or an
  idea it finds; only the owner moves a proposal to decided.

## Naming

One file per project, kebab-case, named for the subject (`public-pages.md`).
