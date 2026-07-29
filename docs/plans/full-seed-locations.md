# Plan: full-seed locations — catalog for eyes, rows for the query engine

Decided 2026-07-29, superseding the materialization architecture built earlier on this
same branch (`worktree-french-locale-and-locations`). Executed in phases by subagents
with a lead review between phases. Delete this file when the work lands.

## The invariant

**Human eyes read the catalog; the query engine reads the rows; nothing ever ships the
locations table to a client.**

- The static catalogs (`src/lib/locations/catalog/`) are the ONLY thing UI browsing,
  search and drill-down ever use — exhaustive, code-split, cached, anonymous-safe.
- The `locations` table is fully seeded from the same official data (Finland already
  complete; France gains all 34,875 communes) and serves ONLY server-side query logic:
  FK integrity, ancestor-chain CTEs, substitute matching, RLS-scoped coverage reads.
  35k rows is trivial for Postgres; the old constraint was the fetch-all read pattern,
  which this plan retires.
- The ONE exception to "catalog-only UI": **sites** (admin-created venues) exist in no
  catalog and are fetched from the DB via small scoped queries.

Consequences: **materialization is deleted as a concept** (route, contracts, queries,
tests, registry entry, focus-reveal flow). Nobody mints rows; rows are seed data. The
gedu trust/minting problem and the commune-precision gap both dissolve.

## Decisions already made (do not relitigate)

- Coverage semantics become **positive selection**: a tick is an independent "I cover
  this subtree" claim (one `gedu_locations` row per tick). The enumerate-descendants
  cascade (and "Nord except Lille" exclusion patterns) is deleted — with the exhaustive
  catalog, gedus tick exactly what they cover. Existing FI coverage rows are already
  one-row-per-claim and stay valid. Matching SQL (ancestor walk) is unchanged.
- The new coverage UI is the catalog panel **with checkboxes at every level**, used by
  BOTH countries (FI catalog already ships). Site-level coverage ticks are not offered
  in the new UI; existing site-tick rows remain valid for matching and are shown as
  read-only chips until unticked.
- `/schools` stays Finland-only. `MUNI_COUNTRY_CODE` semantics stay FI (the online-
  municipality-club picker becomes a scoped FI-municipalities query, not a catalog).
- Parent home location (future, `TODO.md`): still stored as catalog codes — it is an
  attribute, nothing references it. Full seed makes an FK *possible* later; not needed.
- The seed migration is **committed but NOT pushed to the staging project during this
  branch**: it is data-only (no type/schema.sql change), CI's db tests run against a
  CI-local stack built from `migrations/`, and applying 35k rows to staging while
  staging still runs dev's fetch-all code would truncate its tree UI. It gets applied
  at release time. (Consequence: French communes absent on staging until then — fine,
  no French operations exist.)
- The batched `.range()` walk + count guard in `LocationsService` survives as the
  shared primitive for any scoped list query that could exceed PostgREST's `max_rows`.

## Phase A — seed the communes, build the scoped read layer

1. `scripts/generate-france-communes-migration.mjs` (or a mode of the existing catalog
   generator — reuse its COG download/parse/canonical-name machinery): emits the next
   migration `supabase/migrations/00131_seed_france_communes.sql`. Deterministic output,
   committed. The migration: inserts all 34,875 communes as `type='municipality'` rows,
   parented to their département by `(country_code='FR', type='district',
   external_code)`, each with `country_code='FR'` and its INSEE code, `NOT EXISTS`-
   guarded on the code key (same idempotency style as 00129), ending with an assertion
   block (exact commune count, zero orphans, zero code-less FR municipalities). Large
   file is expected; batch the VALUES lists sensibly.
2. Do NOT `supabase db push` (see decision above). No type regeneration needed
   (data-only); verify `git diff src/types/database.types.ts` stays empty.
3. Scoped read layer in `LocationsService` + queries + contracts as needed:
   - municipalities by country (for `/schools` FI and the FI muni-club picker),
   - sites (all, with embedded parent chain for grouping/breadcrumbs) and sites by
     parent municipality id,
   - locations by ids (coverage chips, misc display),
   - resolve catalog codes → rows: `(country_code, type, external_code) IN (...)`
     (coverage save needs ids for ticked codes).
   Each method uses the paged walk primitive where the result could exceed `max_rows`.
   React Query hooks with sensible keys under `locationKeys`; unit tests via the
   `postgrest-fetch` mock per the house pattern.
4. Do NOT remove `getAllLocations` or touch UI in this phase — consumers migrate in
   B/C. Gates: lint 0/0, type-check, unit+integration, check-translations.

## Phase B — coverage editor on the catalog

1. Extract the catalog panel from `catalog-picker.tsx` into a reusable browse/search
   component with a selection-mode prop: single-confirm (Phase C keeps using it) and
   multi-checkbox (this phase). Checkboxes at every level; ticks are independent claims;
   ticked ancestors do not auto-tick descendants (a subtree claim is one tick). The
   dialog/import/error-retry shell stays shared.
2. Rebuild the coverage editor on it (both countries; country switcher like the
   catalog dialog). Current coverage loads via the gedu's rows joined to locations
   (scoped, from Phase A) and maps rows → catalog codes for tick display; save diffs
   ticks → inserts/deletes `gedu_locations` rows through the existing self-scoped write
   path, resolving codes → location ids via the Phase A resolver. Site-tick rows render
   as read-only chips (removable). The committing rule applies to save.
3. Replace all three mounts (gedu settings, `/register-gedu`, admin user-detail).
   `/register-gedu` drops the whole-table locations prefetch (spoken-languages prefetch
   stays); check the layout-shift rule on the new panel.
4. Delete `coverage-cascade.ts` + its tests; update/replace coverage editor tests and
   the ui-components demos (fixture catalogs, no network).
5. Gates as usual; every new user-facing string in all five message files.

## Phase C — product picker on the catalog, delete materialization

1. Site mode rebuild: default view lists existing sites (scoped query, grouped by
   municipality with ancestor context); the catalog panel (single mode) navigates
   geography for opening a NEW venue — drilling to a commune shows its sites (scoped,
   by resolving the commune code → row) plus the existing "create site" dialog, whose
   parent id comes from the same resolution. Selected-site card/breadcrumb keeps
   working from embedded chains. Municipality mode (FI online clubs): scoped FI
   municipalities list with search — no catalog needed, no tree.
2. Delete the materialization stack: route + integration tests + registry entry,
   `materializeLocation`/`useMaterializeLocation`, `materializeLocationBody`, the
   dialog's materialize mutation and focus-reveal handoff, `focusId` machinery.
   `LocationTree` itself: delete if no consumer remains (expected), preserving
   `buildAncestorChain` wherever it needs to live for remaining callers; delete
   now-dead i18n keys across all five files (check every `locations.catalog.*` and
   `locations.tree.*` key for remaining consumers first).
3. Retire `getAllLocations`/`useAllLocations` (club filters move to embedded product
   location chains or a scoped fetch). Nothing may fetch the whole table.
4. Update ui-components demos. Gates as usual.

## Phase D — docs, cleanup, final review

1. Rewrite `src/services/locations/CLAUDE.md` around the invariant (vocabulary rows =
   seed data; scoped reads only; the sites exception; positive-selection coverage;
   annual refresh now also emits a rename/merge reconciliation script against DB rows —
   still applied manually). Update `TODO.md` (parent-location entry notes full seed;
   retire stale entries; the site-only-creation server-side tightening entry becomes
   simpler and stays). Update `tests` registry notes as needed.
2. Sweep: no `getAllLocations` references, no materialize references, no dead keys,
   `npm run build` passes, full gates green.
3. Final review subagent over the whole branch diff vs dev (same protocol as before),
   lead verifies findings, fixes land, push for CI.
