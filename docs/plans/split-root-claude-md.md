# Split the root `CLAUDE.md`: the monorepo, the app, the UI

## Problem

The root `CLAUDE.md` is two files wearing one name. SOG-UI's own `CLAUDE.md` describes
the boundary — the root governs the monorepo (lint, type-check, commits, branching,
testing, the database, the services) and the package file governs the UI — but what the
root actually holds is mostly Sogverse the web app: roles and dashboards, the service
layer, auth, redirects, CSP, email, the brand-copy rules, the safety-copy rule, and the
transitional UI sections that leave one adoption at a time.

Two concrete failures follow:

- **The app file is not supposed to know the brand Guidebook exists, and today it names
  it.** SOG-UI abstracts the School of Gaming Brand Voice & Identity Guidebook into
  tokens, components, vocabulary and reasoning so that the app consumes the brand with no
  external reference. The root file names the Guidebook in its brand-authority paragraph
  and in two Styling rules, so every session working on the app is handed a source the
  app is meant to be insulated from.
- **The file is long enough that its rules dilute each other.** At roughly 80 KB it is
  loaded on every turn of every session, and a rule's weight in a file that size is a
  function of how near it feels to the task at hand. A monorepo rule about branching and
  an app rule about button order compete for the same attention. Separating them by
  where each is loaded is the cheap half of fixing that; pruning is the other half, and a
  first pruning rides along here.

This was decided on 2026-09-05 and deliberately held back from the theme-adoption branch,
because it touches every section of the root file, has nothing visual to review, and is
easier once the theme adoption has landed. The theme adoption merged into `dev` on
2026-09-07, so the precondition is met.

## Scale

- The root `CLAUDE.md` is ~80 KB. By section, everything from "Architecture" through
  "Documentation" is app material except the documentation rules themselves; "Commands",
  "Branching", "Environment Variables", "Database", "Testing" and "Code Style" are
  monorepo material. Roughly three quarters of the file moves.
- 62 references in 44 files point at "the root `CLAUDE.md`" by name — colocated
  `CLAUDE.md` files, `docs/`, code comments, test comments and three migration comments.
  Those citing a section that moves would point at the wrong file after the split.
- No user-facing change. No code change beyond comments.

## The decision

Three files, one boundary each.

- **Root `CLAUDE.md`: the monorepo only.** Commands, branching, environment variables,
  the database tripwires, the cross-package testing summary, code style (lint discipline
  and the correctness-by-mechanism loop), the documentation rules (colocated files,
  `docs/` categories, `TODO.md` ownership, the no-symbol-citation rule), and one short
  pointer per package file saying what lives there. The Documentation section's table of
  colocated homes stays at root, because it is the map of the whole repo.
- **`src/CLAUDE.md`: the app.** New file. It auto-loads whenever a file under `src/` is
  read or edited. It receives, in the root's current order: RBAC and the role rules,
  "SOG-UI owns the UI", key conventions, the service layer pattern, Supabase clients,
  auth architecture, redirects and origin safety, CSP, layout and scrolling, loading and
  disabled state, button order, date and time, brand versus platform, brand vocabulary,
  partner brands, safety copy, locale versus spoken language, styling, authored rich
  text, the UI component reference, preview scenes, and the two pointer sections for
  enrollment/billing and voice. It states that the app's UI authority is SOG-UI and it
  **never names the Guidebook**.
- **`packages/sog-ui/CLAUDE.md`: the UI.** Unchanged in substance. It becomes the only
  `CLAUDE.md` in the repo that names the Guidebook, as the library's input. Its
  ownership paragraph is reworded so that "the root file's existing rule for a construct
  not yet adopted" reads "the app file's", because that is where those rules now live.

**The root keeps a reminder line for rules that fire before any file is opened.** A
nested file loads only once a file under it is touched, and a few app rules govern
decisions made earlier than that: where a new route goes and how it is classified,
that admins are trusted to act only through the admin UI, that caller-supplied redirect
targets go through the internal-path resolver and request-derived origins through the
origin helper, and that any auth state change ends in a full-page navigation. The root's
pointer to `src/CLAUDE.md` names those in one line each, with the full rule in the app
file. This is the one place the split deliberately duplicates prose: a reminder that
survives context summarisation is worth a sentence.

**The two Styling rules and the brand-authority paragraph lose their Guidebook
citations, not their substance.** The Press Start 2P rule says the face is an
owner-approved exception outside the sanctioned brand faces; the headings rule says
sentence case is a house rule owner-adopted on 2026-08-24; the brand-authority paragraph
says the app's UI authority is SOG-UI and that a departure from the brand exists only
where the library's own source declares and justifies it. The provenance those citations
carried is already recorded in SOG-UI's own docs, which is where a reader who wants it
goes.

**One pruning rides along: the brand section's finished narrative becomes a record.**
The "Brand vs. Platform" section carries the story of a shift that has landed — the four
finished parts (lockups, cold uses in `messages/`, document titles and `og:site_name`,
the account possessive), the retired product-page absolute title, the removed login-card
sub-line, and the closing "nothing is left open" paragraph. That is history with a lesson
(the next reader must not re-add the sub-line or the absolute title, and must not
"fix" the Klingon calque), so it moves to `docs/records/brand-name-shift-2026-08.md`
with a one-line pointer left in the app file. The rules stay: lead with the brand, no
article on Sogverse, the progression and its corollaries, the lockup and its dash, the
sender name, the em-dash construct, the account possessive with the brand, and the `tlh`
exception. Every cut is listed in the PR description so the owner can veto any of them.

**Cross-references are repointed in the same PR.** Every reference to "the root
`CLAUDE.md`" that cites a section which moved is changed to name `src/CLAUDE.md`
(colocated docs, `docs/`, code and test comments alike). References to sections that
stay — the database grant rule cited by three migrations, the correctness-by-mechanism
loop cited by the architecture docs, the documentation rule cited by `docs/CLAUDE.md` —
are left as they are. Leaving the moved ones pointing at the root is exactly the rot the
documentation rule exists to prevent.

## Rejected alternatives

- **Keep the transitional Guidebook mentions in the app file under a "waiting to move"
  caveat.** Smaller edit, but it contradicts the one thing the app file is for. The
  substance of both Styling rules survives without the citation, so the caveat buys
  nothing but a contradiction.
- **Move the faces and headings rules into SOG-UI now, ahead of their adoption.** That
  is an adoption, with its own library work and review, and it would let a documentation
  split swallow a design decision. The rules stay in the app file, un-cited, until the
  faces adoption retires them.
- **Split by subsystem instead of by package, or in addition.** The older `TODO.md` item
  proposed nested files per subsystem (voice, migrations, DB tests, integration tests) and
  kept the cross-cutting app rules at root. Its subsystem candidates have all since
  landed (`supabase/CLAUDE.md`, `tests/CLAUDE.md`, the colocated voice, layout, PIN, i18n
  and email files exist), and its "stays at root" list is what this plan moves. The two
  are not the same idea: that one sorted rules by the code they govern, this one sorts
  by package. This plan overrides the older item's placement of the cross-cutting rules,
  and the older item is deleted as complete.
- **Leave the cross-references alone and rely on the root pointer.** A reader following
  "root `CLAUDE.md`, Button Order" would land on a file with no such section. The
  documentation rule already forbids citations that rot; repointing is mechanical and
  the regeneration command below finds every one.
- **Do a full pruning pass of the app file in this PR.** Tempting, since every paragraph
  is being handled anyway, but each cut is a judgement the owner should see on its own.
  This plan takes the one pruning that is unambiguously finished history and lists the
  rest as a follow-up.
- **Expect a behaviour change from the `src/` scoping itself.** Almost all app work
  touches something under `src/`, so `src/CLAUDE.md` is loaded in nearly every session
  and the routing gain is close to nil. The split is an ownership win — the Guidebook
  boundary and a root a new contributor can read whole — not a behaviour lever. The
  behaviour levers are the reminder line and the pruning.

## Steps

Work on a `feat/split-root-claude-md` branch off a freshly fetched `dev`, merged back
with `--no-ff`. Review sizing per `docs/plans/CLAUDE.md`: no schema, one surface, so no
agent review; the author reads this plan back cold and builds.

1. **Create `src/CLAUDE.md`** with a two-sentence opening: this file governs Sogverse the
   web app, auto-loads under `src/`, and the app's UI authority is SOG-UI
   (`packages/sog-ui/CLAUDE.md`, read before any UI work). Then move the app sections
   from the root verbatim, in the root's current order. Verify with a diff that every
   moved paragraph appears exactly once across the two files.
2. **Rewrite "SOG-UI owns the UI"** in the app file so "this file" means the app file:
   the transitional UI sections live here, a construct's rule leaves this file with the
   adoption that retires it, and the day this file holds none of them the sweep is done.
   Update the matching sentence in `packages/sog-ui/CLAUDE.md`'s Ownership paragraph
   from "the root file's existing rule" to the app file's, and its closing sentence to
   "a rule about the UI is never added to the root file or the app file".
3. **Strip the Guidebook citations** from the Press Start 2P rule, the headings rule and
   the brand-authority paragraph as decided above. Grep the app file for "Guidebook"
   afterwards; the count must be zero.
4. **Write the record** `docs/records/brand-name-shift-2026-08.md` from the brand
   section's finished narrative, dated, frozen, in the records house style. Replace the
   moved paragraphs in the app file with one line: the shift landed in August 2026 and
   its story is in that record. Delete nothing that is a rule.
5. **Reduce the root** to the monorepo sections. Add the package pointers directly under
   the Commands section: one paragraph for `src/CLAUDE.md` naming what it holds plus the
   one-line reminders decided above, one for `packages/sog-ui/CLAUDE.md`. Keep the
   Documentation section at root, including the colocated-homes table, and add
   `src/CLAUDE.md` as a row in that table.
6. **Repoint cross-references.** Regenerate the list with

   ```
   rg -n --glob '!node_modules' 'root `?CLAUDE\.md`?|root file' .
   ```

   and for each hit decide by the section it cites: moved → name `src/CLAUDE.md`;
   stayed → leave. Migration comments citing the grant rule stay. `TODO.md`'s own
   mentions are handled in step 7.
7. **Update `TODO.md`.** Delete the older "Split subsystem-specific rules out of root
   `CLAUDE.md`" item (its candidates have landed and its placement is overridden). The
   newer item this plan grew out of was removed when the plan landed. Repoint the
   safety-copy section's "(root `CLAUDE.md`)" citation to the app file.
8. **Verify the loading.** In a fresh session, read a file under `src/` and confirm via
   `/context` that `src/CLAUDE.md` is loaded alongside the root; read a file under
   `supabase/` and confirm it is not. `npm run lint` and `npm run type-check` stay clean
   (comment edits only, but the type-check fans out to the package).
9. **PR description** lists every paragraph cut from the brand section, so the owner can
   veto individually, and names the two Styling rules whose citations were stripped.
10. **Delete this plan** when the work merges, and propose the follow-ups below by
    headline.

## Acceptance criteria

- The root `CLAUDE.md` contains no section about roles, auth, layout, buttons, dates,
  brand, safety copy, locale, styling, rich text, the style guide or preview scenes, and
  contains a pointer paragraph for each of the two package files.
- `src/CLAUDE.md` exists, holds every moved section, and the word "Guidebook" does not
  appear in it.
- `packages/sog-ui/CLAUDE.md` is the only `CLAUDE.md` in the repo that names the
  Guidebook.
- Every paragraph of the former root appears in exactly one of the three files or in the
  new record; nothing is lost and nothing is duplicated except the reminder lines the
  decision names.
- The regeneration command in step 6 returns no hit that cites a moved section by the
  root's name.
- The older split item is gone from `TODO.md`; the newer one is gone once this lands.
- Lint and type-check are clean.

## Constraints discovered while deciding

- **A nested `CLAUDE.md` loads lazily**, on the first read or edit of a file under its
  directory, and the root loads on every turn. That is what makes the split cheap, and
  it is also why the root keeps reminder lines for rules that fire before a file is
  opened.
- **The two package files must never disagree**, by SOG-UI's own rule. Any sentence in
  either that describes the boundary has to be edited in the same change.
- **The documentation rule forbids citing symbols and rotting pointers**, so the 62
  cross-references are in scope, not a follow-up.
- **The Documentation section is repo-wide**, not app material, even though most of its
  table rows point under `src/`: it is the map of every colocated file, including
  `supabase/`, `tests/` and `packages/`.
- **Records are frozen once written**, so the brand narrative goes in dated and is not
  later extended; a future brand decision is a rule in the app file, not an addendum.

## Follow-ups

Cut from this plan on purpose; proposed by headline when the plan is deleted, written
into `TODO.md` only if the owner names them.

- **A pruning pass over `src/CLAUDE.md`.** Paragraphs that read as finished history or
  as narrative around a rule (the account-possessive sweep's list of mails, the
  "Inter wiring" anecdote, the three-dashes-in-one-lockup aside) are candidates for a
  record or for deletion, each as its own listed cut.
- **Split the mechanisable half off prose rules.** A grep test for the UTC-date
  anti-pattern and a check that a dialog footer never receives a conditional child would
  each retire a sentence from the app file.
