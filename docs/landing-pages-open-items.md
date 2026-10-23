# Landing pages: the open items

**Status: open, 2026-10-23.** Everything still unresolved from marketing's landing page
fixes list (13 Oct 2026): the branches built and waiting for the owner's review. **When
an item is resolved — built and merged, or dropped by the owner — delete its section.
Delete this file when nothing is left.** It is self-contained: nothing outside the repo
is needed to pick any item up.

Marketing's list was written without sight of the code, so its items are statements of
intent, not specs: work out the behaviour wanted, check what the code already does, and
recommend. Landing pages exist for search engines and AI apps first and people second;
they are written only through the MCP server (`src/services/landing-pages/CLAUDE.md`).

## Built, waiting for the owner's review

Each branch has a worktree at `.claude/worktrees/<name>` (the branch is `feat/<name>`);
nothing is merged. Review each through `/worktree-flow` from Phase 3 — enter the existing
worktree by path, preview if it is UI, a `code-reviewer` review, and merge only on the
owner's word. Where a final full test run was skipped, run `npm run gates` (and
`npm run test:db:local` if the branch has migrations) before landing.

| Worktree | Item | Points for the review |
|---|---|---|
| `landing-sticky-section` | #17 one sticky section (email sign-up only) in a side column from 1280px, at the page's end with a jump button below that | Built on an earlier version of the email sign-up (Brevo, double opt-in), which landed as a one-way send to Klaviyo: merging `dev` in rewrites its sign-up side. Section backgrounds are on `dev`, so merging it in conflicts in the section renderer: the column inset belongs on each section's inner container, not its band. Image size hints still assume no column. |

**Merge conflicts.** Expect small conflicts between `landing-sticky-section` and the
section registry and renderer on `dev`.
