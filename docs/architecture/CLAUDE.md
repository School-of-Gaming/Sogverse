# docs/architecture

Living docs for what is too cross-cutting for any one colocated `CLAUDE.md`: multi-system
architecture (products, db-authorization, route-boundary) and repo-wide running topics
(performance, security).

- **Definitive and current.** Each doc describes the system as it exists and is updated
  in the same change that shifts the architecture. A doc that has drifted is a bug.
- **The map, not the reference.** Carry the mental model, the rules an agent can't infer
  from code, and where to look. Concrete shapes — schemas, signatures, behaviour — live
  in code and generated files; restating them here is how a doc rots.
- **A topic doc is a log with a spine.** The running topics (performance, security)
  accumulate findings and decisions over time; keep the current-state summary at the top
  authoritative, and when an entry stops describing anything real, prune it — a lesson
  worth keeping distills into `../records/`.
- One doc per system or topic, named without an `-architecture` suffix — the directory
  already says it.
