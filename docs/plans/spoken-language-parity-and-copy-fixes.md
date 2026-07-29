# Plan: spoken-language parity + copy fixes (Phase 5 of the French-locale work)

Decided 2026-07-29. The only still-open phase of the French locale + location-catalog
effort (phases 1–4 landed on branch `worktree-french-locale-and-locations`; the original
plan file was deleted with Phase 4 per the plans lifecycle). Delete this file when this
work lands.

**Rule being implemented: every real (non-novelty) UI locale has a matching spoken
language.** A French UI implies French-delivered clubs are offerable. Klingon (`tlh`) is
exempt (novelty). "Locale" and "spoken language" remain distinct systems — this is a
parity requirement between them, not a merge.

## Work

1. Migration (next free number): insert `fr` into the `spoken_languages` reference table
   (follow the existing rows' shape; check `supabase/schema.sql` for the table's columns
   and existing grants — data-only, so no grant changes expected). Follow the
   supabase/CLAUDE.md migration workflow (push → regenerate types). Data-only migrations
   don't change `schema.sql`.
2. Replace the hardcoded code→translation-key map in
   `src/components/ui/spoken-language-checkboxes.tsx` with `Intl.DisplayNames` resolution
   in the viewer's locale (the admin club filters already use this pattern). Delete the
   now-dead `common.languageEnglish/Finnish/Swedish` keys from all five message files.
3. `SPOKEN_LANG_TO_COUNTRY` in `src/components/ui/language-flag.tsx` gains `fr: "FR"`;
   type its values against `FlagCountry` (from `src/components/ui/flags.ts`) so flag
   registration is compile-checked, like the locale picker's.
4. Parity tripwire: a db test (CI-only) asserting every `SUPPORTED_LOCALES` entry except
   `tlh` has a `spoken_languages` row. Add the parity step to the "Adding a locale"
   checklist in `src/i18n/CLAUDE.md` (novelty locales exempt).
5. Copy fixes (English-source issues reviewed with Kyle):
   - `parent.waitlist.positionValue` + `purchaseConfirmation.waitlist.positionValue`:
     the whole ordinal pattern is per-locale. en keeps `#{position}`; fr already has
     `n° {position}`; fix `fi`/`sv`/`tlh`, which copied the English `#` (not idiomatic
     in either) — fi/sv use their native ordinal conventions.
   - `gedu.sessionDetails.copyAllParentEmails`: identical `one`/`other` branches in
     every locale — collapse the plural to a plain `({count})` in all five files.
     (`admin.groups.nonBinaryCount` is NOT collapsed: English is invariant but fi/fr
     genuinely inflect — the plural slot is load-bearing.)
   - Apostrophe normalization: standardize all message files on the typographic
     apostrophe `’` (U+2019) — polished-product standard, and it sidesteps ICU
     MessageFormat's ASCII-`'` escape hazard. Normalize `en.json`'s mixed usage; other
     locales likewise where they used ASCII `'`. Quote *pairs* keep each locale's
     national convention (fr guillemets, fi/sv `”…”`, en curly).

## Gates

`npm run lint` (0/0) · `npm run type-check` · `npx vitest run tests/unit
tests/integration` · `node scripts/check-translations.mjs`. Db tests run in CI on push.
