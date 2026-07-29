# Plan: French locale + location-catalog architecture

Decided 2026-07-29. Executed in four phases on branch `worktree-french-locale-and-locations`,
each phase delegated to a subagent and reviewed before the next starts. Delete this file when
the work lands.

## Decisions already made (do not relitigate)

- **New UI locale `fr`** (bare code, French as written in France; "vous" register). Bare
  language codes stay the scheme; region-qualified codes (`fr-CA`, `pt-BR`, …) are added
  only if we ever need two variants of one language — a tripwire comment goes at the
  `LOCALE_CONFIG` definition site and in the i18n CLAUDE.md checklist, and
  `detectLocaleFromHeader` gets exact-tag-then-language matching now so no structural prep
  remains.
- **Single point of control**: one `LOCALE_CONFIG` object in `src/lib/constants/locales.ts`
  owns everything per-locale (label, nativeLabel, country flag, Stripe locale).
  `SUPPORTED_LOCALES` derives from its key order. The two hand-maintained Stripe maps
  (checkout route, billing-portal route) are replaced by a config field typed as the
  intersection of Stripe's checkout + portal locale types (type-only import).
- **Klingon (`tlh`) is always last** in the picker — encoded by definition order and pinned
  by a unit test (`SUPPORTED_LOCALES.at(-1) === "tlh"`). Order for now: en, fi, sv, fr, tlh.
- **Flags**: `country` in `LOCALE_CONFIG` is typed `FlagCountry | "KLINGON"` where
  `FlagCountry = keyof typeof FLAGS` (type-only import from `src/components/ui/flags.ts`),
  so a locale whose flag isn't registered fails to compile. FR flag gets added.
- **Phone countries** are a separate concern from locales (intentional drift: US has no
  locale, Klingon has no country). They move to a shared constant
  (`PHONE_COUNTRIES`, typed against `FlagCountry` and react-phone-number-input's `Country`),
  consumed by `src/components/ui/phone-input.tsx`. FR (+33) is added.
- **`/schools` stays Finland-only. `MUNI_COUNTRY_CODE` stays `"FI"`.** Deliberate design
  decisions, not bugs. Do not parameterize them.
- **Locations move to a catalog + materialization pattern, for BOTH France and Finland**
  (consistency establishes the pattern for future countries):
  - An exhaustive, official, static **catalog** per country (generated from INSEE COG 2026
    for FR; Statistics Finland classifications for FI) ships as a code-split static JSON
    asset. Admins browse/search it with zero network round-trips while picking.
  - The **DB keeps only operational rows** (rows something references). France seeds
    country + 18 régions + 101 départements (~120 rows, DROM included — they are
    constitutionally France). Communes are **materialized on demand**: when an admin picks
    one from the catalog, a server route get-or-creates the DB chain from catalog data.
    Admins never type location names — they only ever name **sites**. Typos/duplicates are
    structurally impossible.
  - New nullable `locations.external_code` column holds the official statistical code
    (INSEE code for FR; Tilastokeskus region/municipality code for FI), unique per
    `(country_code, external_code)` where not null. Materialization dedupes on it (France
    has homonymous communes; names are not a safe key). Finland's existing rows get
    backfilled.
  - `getAllLocations()` is batched through `.range()` pages so the PostgREST
    `max_rows = 1000` cap can never silently truncate (Finland + France operational rows
    share that budget today).
  - Gedu coverage needs no commune rows: a tick means "this whole subtree", so
    département-level coverage automatically includes communes materialized later.
  - Catalog refresh: rerunning the generator against a new annual COG release updates the
    catalog; it prints a diff report against materialized DB rows (renames/merges) but
    reconciliation of DB rows is manual/deferred.
- **`messages/fr.json`**: best-effort full translation by the agent, using en (source of
  truth) + fi/sv for context and reading the consuming UI code when ambiguous. Anything
  needing native-speaker judgement is flagged in
  `C:\Users\Kyle\Downloads\fr-translation-review.md` for human handoff.

## Phase 1 — `messages/fr.json` translation

Create `messages/fr.json`: complete French translation of all 1,656 keys in `en.json`.

- Exact key structure/order of `en.json`; do NOT copy `about.easterEgg` (tlh-only).
- ICU placeholders preserved verbatim (names, plural/select structure); no emoji; valid
  JSON, 2-space indent.
- Style: "vous"; brand names untranslated (School of Gaming, Sogverse, Minecraft, Discord,
  Stripe, WhatsApp); French (France) vocabulary; consistent terms (club, camp, session,
  commune); punctuation style consistent with how fi/sv files handle it.
- Consult fi.json/sv.json for how ambiguous strings were interpreted; read the consuming
  component when a key's context is unclear.
- Verify: `node scripts/check-translations.mjs` reports zero missing/empty/mismatched and
  no extra keys for [fr]; `JSON.parse` sanity check.
- Write `C:\Users\Kyle\Downloads\fr-translation-review.md`: table of flagged strings
  (key, English, chosen French, why it needs review) + a short note on global choices
  (vous, term glossary) so a native reviewer has context.

## Phase 2 — locale plumbing (single point of control + register `fr`)

1. Refactor `src/lib/constants/locales.ts`:
   - `LOCALE_CONFIG` becomes the single definition: `{ label, nativeLabel, country, stripe }`
     per locale, `as const satisfies Record<string, LocaleDefinition>`; entries ordered
     en, fi, sv, fr, tlh with the Klingon-last rule stated in a comment.
   - `stripe`: `Stripe.Checkout.SessionCreateParams.Locale &
     Stripe.BillingPortal.SessionCreateParams.Locale` via `import type Stripe from "stripe"`.
     Values: en/fi/sv/fr map to themselves; tlh → "auto".
   - `country`: `FlagCountry | "KLINGON"` (`import type { FlagCountry } from
     "@/components/ui/flags"`).
   - `SUPPORTED_LOCALES` derived from `Object.keys(LOCALE_CONFIG)` (typed tuple cast so
     `z.enum(SUPPORTED_LOCALES)` in products.contracts keeps compiling);
     `SupportedLocale = keyof typeof LOCALE_CONFIG`; `DEFAULT_LOCALE` unchanged ("en").
   - `detectLocaleFromHeader`: exact-tag match first (case-insensitive full tag), then
     language-subtag match — behavior identical for today's set; add the region-code
     tripwire comment here and at `LOCALE_CONFIG`.
2. `src/components/ui/flags.ts`: add `FR` import to `FLAGS`; export
   `type FlagCountry = keyof typeof FLAGS`.
3. `src/i18n/messages.ts`: add `fr` loader.
4. New `PHONE_COUNTRIES` constant (in `src/lib/constants/`, own file or colocated
   sensibly): `["FI", "FR", "GB", "SE", "US"]`, typed to satisfy both `FlagCountry` and
   react-phone-number-input's `Country`; `phone-input.tsx` consumes it.
5. Replace `APP_TO_STRIPE_LOCALE` (checkout route) and `STRIPE_PORTAL_LOCALES`
   (billing-portal route) with reads of `LOCALE_CONFIG[locale].stripe` (keep each route's
   fallback-to-"auto" behavior for unsupported/null input).
6. Tests: update `tests/integration/api/user-locale.test.ts` to iterate imported
   `SUPPORTED_LOCALES`; add/extend unit tests — Klingon-last pin, exact-tag header
   matching (e.g. "fr-FR" → fr still, and an exact match wins over a lower-q language
   match), config completeness compiles.
7. Docs: `src/i18n/CLAUDE.md` — update shipped-locale lists, rewrite "Adding a locale"
   checklist (config entry → flag → messages loader → messages/<code>.json → phone-country
   decision → Klingon-last → region-code tripwire); update the header comment in
   `locales.ts`.
8. `npm run lint`, `npm run type-check`, `npx vitest run` (unit+integration) all green.

## Phase 3 — locations data layer (external codes, France seed, catalogs, batched fetch)

1. Migration (next free number): `ALTER TABLE public.locations ADD COLUMN external_code
   text` + `COMMENT` (official statistical code: INSEE COG for FR, Statistics Finland for
   FI; null on admin-created sites) + unique partial index on
   `(country_code, external_code) WHERE external_code IS NOT NULL`. Then, in the same or a
   sibling migration: idempotent France seed — `('France','country',NULL,'FR')` with
   external_code from COG, 18 régions, 101 départements (using the `district` type,
   hierarchy position between region and municipality), all with INSEE codes, `NOT
   EXISTS`-guarded like `00109`; Finland backfill — set `external_code` on existing FI
   region/municipality rows by name match (Tilastokeskus maakunta + kunta codes), warn-not-
   fail on unmatched.
2. Follow `supabase/CLAUDE.md` migration workflow exactly (push → regenerate
   `database.types.ts` → dump `schema.sql`) before committing. Check whether the
   authorization-spine/db tests need updates (new column on an already-classified table;
   no new functions or grants expected).
3. Catalog generator `scripts/generate-location-catalogs.mjs`: reads official source data
   (INSEE COG 2026 CSV from data.gouv.fr; Statistics Finland municipality/region
   classification) and emits compact per-country catalogs (e.g.
   `src/lib/locations/catalog/fr.json`, `fi.json`) with codes + official names, structured
   région → département → communes (FR) / region → municipalities (FI). Document source
   URLs + refresh procedure in the script header. Commit the generated catalogs; raw
   source files are fetched, not committed. Generator also prints a diff report against
   nothing for now (the DB-reconciliation report is described in the locations CLAUDE.md
   as part of the refresh procedure).
4. `LocationsService.getAllLocations()`: page through `.range()` in 1000-row batches until
   a short page; unit-test the batching (mockable client).
5. Push the branch so CI runs db tests.

## Phase 4 — catalog picker UI + materialization route

1. Contracts + route `POST /api/admin/locations/materialize`: body
   `{ country_code, external_code }` (a municipality/commune-level catalog entry).
   Validates the pair against the server-side catalog import; get-or-creates the ancestor
   chain (région → département → commune for FR; region → municipality for FI) keyed by
   `external_code`, using the caller's server-side client (admin role-gated — same posture
   as the existing locations create route). Returns the municipality row. Register in the
   integration suite's route posture registry + tests.
2. UI: a catalog-picker flow (search-as-you-type over the static catalog, capped rendered
   results, plus drill-down) reachable from the product location picker's site mode, for
   adding a municipality that isn't in the DB yet — one code path for FI and FR (picking an
   already-materialized municipality is a no-op get). The catalog JSON is loaded via
   dynamic import (code-split) when the flow opens. After materialization the picker
   selects the new municipality so the admin can immediately add a site under it.
   - Restrict inline creation (`allowedChildTypes`) to `site` only everywhere — locations
     now only enter the DB via seeds or materialization.
   - New i18n keys in **all five** message files (fr included).
   - Add a fixture-driven demo to `/admin/ui-components`.
3. `SUPPORTED_COUNTRIES` gains FR: hierarchy region ("Region"/fr "Région(s)") →
   district ("Department"/fr "Département(s)") → municipality ("Commune"/fr "Commune(s)")
   → site; `nameI18n: { fr: "France" }`. Since `fr` is now a supported UI locale, FR levels
   get `fr` i18n label pairs (per the locations CLAUDE.md rule).
4. Docs: rewrite the affected parts of `src/services/locations/CLAUDE.md` — catalog +
   materialization pattern, external_code semantics, refresh procedure, the batched-fetch
   rule, and fix the stale grants comment in `locations.service.ts` (claims 00021 revoked
   DML; 00123 restored INSERT/UPDATE).
5. `npm run lint`, `npm run type-check`, `npx vitest run` green; push for CI db tests.

## Out of scope (explicitly)

- `/schools` internationalization, slug scoping, region-group country headers.
- Locale-prefix URL routing (separate future effort; region-code scheme must be decided
  before it ships).
- Reconciling commune renames from future COG releases into materialized DB rows.
