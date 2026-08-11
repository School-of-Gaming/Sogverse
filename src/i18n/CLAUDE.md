# i18n (next-intl)

This directory holds the next-intl request wiring. The i18n system spans the whole stack: UI strings, email templates, page metadata, and user-facing constants. Locales currently shipped: English (`en`, source of truth), Finnish (`fi`), Swedish (`sv`), French (`fr`), Klingon (`tlh`, easter egg). `en` is the default.

## Locale vs. spoken language

Two different concepts that English would both call "language" — deliberately named differently. Do not conflate them.

- **Locale** (`locale`) — which translation of the web app the user sees. Backed by `profiles.locale`, the `locale` cookie, the LocalePicker, and next-intl's `useLocale()`/`getTranslations()`/`useTranslations()`. Owned by `src/lib/constants/locales.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_CONFIG`, detection/validation helpers).
- **Spoken language** (`spoken_languages`) — the human languages a user speaks / a club is delivered in, used to match gamers to gedus. Backed by the `spoken_languages` reference table and the `profiles.spoken_languages` array. UI lives in the spoken-language checkboxes component under `components/ui/`.

The two are fully independent: a Finnish-speaking parent can have `locale = "fi"` (app in Finnish) and `spoken_languages = ["en"]` (wants their child in English-speaking clubs).

**Rule: Use the word *locale* for the UI translation system and *spoken language* for human fluency. Never name one after the other.**

**Rule: A language's display name always comes from the shared language-name hook (`useLanguageNames`, `src/hooks/`), never from `spoken_languages.name` or `LOCALE_CONFIG.label` directly.** Those two are English *fallbacks*, not display strings — rendering them raw ships English names to every non-English viewer (this happened on three admin surfaces at once). The hook resolves any code via `Intl.DisplayNames` in the viewer's locale and takes the English value as its fallback argument.

## Files in this directory

- `request.ts` — next-intl request config (SSR/RSC). Resolves the per-request locale and loads its messages.
- `messages.ts` — `Messages` type (derived from `en.json`) and `loadMessages(locale)`, a static import map of `messages/<code>.json`. Static imports so a moved/deleted message file fails the build, not runtime.
- `types.ts` — module augmentation that registers `Messages` as next-intl's `AppConfig["Messages"]`, giving compile-time key validation and autocomplete in `useTranslations()`/`getTranslations()`.

## Translation files

Per-locale JSON in `messages/<code>.json` at the repo root (`en`, `fi`, `sv`, `fr`, `tlh`). `en.json` is the source of truth; the others mirror its shape exactly.

**Rule: Every user-facing string must be translated for every locale file in `messages/`. Never leave placeholder copy or skip a locale. Best-effort translation is expected; Klingon (`tlh`) is an easter egg where fun takes are welcome and accuracy is not the goal.**

**Rule: legal-page namespaces are served in English under `tlh` — the easter egg stops at the courtroom door.** A privacy policy, a set of terms, a safeguarding policy and their programme-specific siblings are binding text a family may be held to; an in-character rendering of one is a joke told at the reader's expense, and it is the one place where "accuracy is not the goal" is the wrong instruction. **The attributions page is in this set too**, for the adjacent reason: it is the credit two data licences oblige us to publish, and a licence condition discharged in Klingon is a licence condition not discharged. The shape: the `tlh` values for those namespaces are the `en` values **verbatim**, so the catalog stays structurally identical to `en` and the completeness and placeholder-parity gates pass unchanged. The same applies to those pages' `metadata.pages` titles and to any link label that names one of the documents — a footer link must call a page what the page calls itself. Everything else in `tlh` (nav, dashboards, marketing copy) stays in character.

**Rule: No emoji in `messages/` files** — untranslatable, unthemeable copy. When a string needs a glyph, render a `lucide-react` icon next to the translated text in the component.

A CI script (under `scripts/`) validates translation completeness on every push — missing keys, empty values, and stale keys. It picks up new locale files automatically.

## Editing a message catalog

**Rule: for any change touching more than a handful of keys, edit a catalog with a script that round-trips the file — not a hand merge.** Every `messages/*.json` round-trips byte-identically through `JSON.stringify(parsed, null, 2) + "\n"`, so a scripted set-by-path merge cannot reformat the file or reorder keys. Assert each target path already exists, so a mistyped key fails loudly instead of silently adding one the other locales don't have.

Gates for a catalog change: the completeness script under `scripts/`, **plus** an ICU parse of every string in the changed locale and a placeholder/tag parity check against `en.json`. Human-supplied copy is the main source of broken `{placeholder}` and `<tag>` pairs, and completeness checking does not look inside a value. `intl-messageformat` is already available as a transitive dep — a throwaway check script has to sit inside the repo to resolve it.

French typography: U+2019 for apostrophes (never U+0027, outside code samples) and a no-break space only after `n°`. Copy pasted from a person or a spreadsheet always arrives with straight apostrophes; normalise on the way in.

## French register and glossary

**Rule: French is a transcreation, not a literal mirror of `en.json`.** Public-page marketing copy — including the slogan, whose French imagery deliberately differs from the English — was rewritten by a native speaker rather than translated. CI enforces key parity and cannot see meaning, so a French string that says something other than its English counterpart on a public page is intentional and must not be "corrected" back.

**The divergence is scoped to French alone.** `fi`, `sv` and `tlh` render the English positioning; French does not. Do not reconcile the two in either direction — neither by pulling French back toward the English source, nor by pushing the French imagery outward into the other locales. Diverging a second locale is a positioning decision for the owner, not a consistency fix.

- **Role name splits by register.** `animateur` / `animatrice` on public and parent-facing surfaces; `éducateur de jeu` in formal copy — terms, privacy policy, discipline policy, the educator registration page, and staff back-office. `animateur` is the familiar word from French youth-club and summer-camp culture; `éducateur de jeu` reads as a calque but is the right register for legal and internal text.
- **`Gedu` is a product name, never translated — but never used cold in general public prose.** Describe the adult as an `animateur` there. `Gedu` appears where the copy introduces it with a gloss, and throughout the signed-in product (dashboards, voice, admin, email), where the reader already knows the word.
- **Municipality: the adjective is `municipal` / `municipaux`, the noun stays `commune`.** "Clubs municipaux", but "payé par votre commune". `municipal` maps to town-funded public services in French; `communal` is correct but less instinctive.
- **`vous` to adults, `tu` in child-facing strings.**
- **Never use the middle dot (`Prêt·e`) to dodge gender agreement — reframe instead.** It is visually awkward on screen and contested in France. Open child-facing prompts with a construction that takes no agreement, and where inserting a name would force a participle to inflect, state the event as a noun phrase (an enrolment is confirmed) rather than agreeing with the person.

## Locale resolution

Priority order:

1. **User profile** — `profiles.locale` (set via the locale picker).
2. **Cookie** — the `locale` cookie (set on every locale change; works for logged-out users).
3. **Accept-Language header** — walks the full ranked list and picks the first supported locale (via `detectLocaleFromHeader`).
4. **Default** — English.

The SSR/RSC path (`request.ts`) checks cookie then header (no DB access there). API routes that need the user's preference check `profiles.locale` then fall back to the header.

**Rule: Validate any incoming locale value before use.** Use `resolveLocale()`/`isSupportedLocale()` from `src/lib/constants/locales.ts` to narrow `unknown` (profile column, request body) to `SupportedLocale` — never trust a raw string or cast.

## Usage patterns

- **Server components / `generateMetadata()`** — `await getTranslations("namespace")` from `next-intl/server`.
- **Client components** — `useTranslations("namespace")` from `next-intl` (file must be `"use client"`).
- **Email templates** (server-side, outside React) — `await getEmailTranslator(locale)` (built on `use-intl/core`, scoped to the email namespace). Operates on plain strings; it does **not** get the compile-time key safety the React APIs have.

Locale always comes from `useLocale()` (client) or `getLocale()` (server) — never hardcode it.

## Timezone for formatters

`DEFAULT_TIMEZONE` (`Europe/Helsinki`) in `src/lib/constants/locales.ts` is the server-side default for next-intl's date/time formatters (`useFormatter`). HTTP headers carry no timezone, so it can't be auto-detected. This affects only next-intl formatters — `date-fns-tz` handles its own timezone logic. Used in both the server request config and the client provider.

## Namespaces

Translation keys are organized into top-level namespaces in the JSON files. Two namespaces are **server-only** and stripped from the client bundle (in the root `app/layout.tsx`) before reaching `NextIntlClientProvider`:

- `email` — email templates.
- `metadata` — page titles via `generateMetadata()`.

All other namespaces (role/feature pages, public pages, feature components, layout chrome, `common`) ship to the client.

**Rule: a client component must never read a server-only namespace, and rendered page copy must never live in one.** The strip is invisible from the call site — the same `useTranslations("metadata.pages")` line works in a server component and throws `MISSING_MESSAGE` in a client one — so the failure only shows up when a component crosses the boundary, which it does silently the day someone adds `"use client"` above it or renders it inside a client-side shell. Keep the two apart at the source: `metadata` names *documents* (`generateMetadata()` and nothing else). Anything painted into the page — including a visually-hidden `h1` that happens to say the same words as the page title — is content and belongs in a content namespace, so the server and client renderings of a body can read one key and stay in step.

## The locale config is the single point of control

`LOCALE_CONFIG` in `src/lib/constants/locales.ts` holds everything that varies per locale — English label, native label, flag country, and the locale to render Stripe's own chrome in. `SUPPORTED_LOCALES` beside it is the ordered list, and the config `satisfies` a record keyed by it, so a locale with no config (or a config entry for no locale) fails the build. A unit test pins that the two are in the same order.

**Rule: per-locale data belongs in `LOCALE_CONFIG`, never in a second map keyed by locale.** The Stripe Checkout and Billing Portal routes each used to hand-maintain their own app-locale → Stripe-locale map; a new locale meant remembering both, and forgetting one shipped a page in the wrong language. The Stripe mapping is now a config field (typed as the intersection of Stripe's Checkout and Billing Portal locale enums, so a value only one surface accepts fails to compile), read through the shared helper that falls back to Stripe's `auto` for anything unsupported.

**Rule: Klingon (`tlh`) is always the last entry.** It's a novelty easter egg and never sits among languages a user might actually need. The picker renders `SUPPORTED_LOCALES` in order, and a unit test pins the last entry.

**Rule: locale codes are bare language subtags** (`fr`, not `fr-FR`). A region-qualified code is only added when we genuinely ship two variants of one language — it changes what the `locale` column and cookie carry and forces a decision about how regions appear in any future locale-prefixed URLs. The header matcher already prefers an exact tag match over a language-subtag one, so no structural prep remains; the decision does. The tripwire comment lives at the `LOCALE_CONFIG` definition.

## Adding a locale

1. Add the code to `SUPPORTED_LOCALES` and its entry to `LOCALE_CONFIG` in `src/lib/constants/locales.ts` — label, native label, flag country, Stripe locale (`"auto"` if Stripe doesn't speak it). Place it **before** `tlh` in both.
2. Register its flag in `src/components/ui/flags.ts` (a named per-country import — never the barrel). `country` is typed against that registry, so an unregistered flag fails the build.
3. Add its loader to the `messageLoaders` map in `messages.ts`.
4. Create `messages/<code>.json` by copying `en.json` and translating every value.
5. **Give it a matching spoken language** — a data-only migration inserting the code into the `spoken_languages` reference table, and its country in the spoken-language → flag map under `components/ui/`. Shipping a UI locale says we serve families who speak that language, so a club has to be offerable in it the same day, and `products.spoken_language_code` can only reference a row in that table. **Novelty locales are exempt** (Klingon is an easter egg, not a language a club is delivered in). A CI db test asserts this parity, so skipping it fails the build rather than shipping a dead language option. This is a parity requirement between the two systems, not a merge — locale and spoken language stay distinct everywhere else.
6. Decide separately whether the country belongs in `PHONE_COUNTRIES` (`src/lib/constants/phone.ts`). That list is **not** derived from locales and drifts on purpose — US is a phone country with no locale, Klingon a locale with no country.
7. CI translation validation picks the new file up automatically. No changes needed to `request.ts`, `types.ts`, `next.config.ts`, the check script, or provider code.
8. Produce the native-speaker review handoff for the new translation — see the
   "Native-speaker review handoff" section below.

## Native-speaker review handoff

A new locale ships as best-effort translation and then gets a human pass. The handoff is
**one styled `.xlsx`** the owner uploads to Google Sheets and sends to a native speaker
(built programmatically with a spreadsheet lib; a plain CSV loses the styling that makes
it usable). What the reviewer is like drives every choice: **no code access, thinks in UI
terms, assumes the English source is correct.** English-source problems found during
translation go to the team, never into the reviewer's file.

Two tabs:

- **"Read me"** — plain-language cover note: what the product is, how to fill the sheet
  in, the global choices to confirm as questions (register policy — e.g. vous/tu split —
  glossary, brand names kept in English), and one practical rule stated without jargon:
  text in curly braces is filled in automatically — keep it exactly, but it may move
  within the sentence; same for angle-bracket tags. No mention of JSON, keys, or ICU.
- **"Strings to review"** — one row per flagged string. Columns, in order: row number ·
  where it appears (plain UI location — trace the key's actual consumer, don't guess from
  the namespace; group rows by UI area) · English source · current translation · why
  we're asking (plain language; when a string contains a placeholder whose values matter,
  enumerate them so every combination can be checked) · corrected translation (edit
  here) · reviewer comments · **internal reference last** (the message key, marked
  "please ignore" — it's how edits get applied back precisely). Extract source/current
  text programmatically from the message files, never retype it. Style: frozen header,
  filter row, zebra striping, wrapped text, the two edit columns visibly highlighted, the
  reference column demoted to small gray.

Flag selectively (~5% of the catalog, not everything): idiom/tone doubts, marketing
taglines, legal text, and gendered/inflection frames. Drop staff-internal tooling and
developer-docs strings — a non-technical reviewer can't judge them. Invite the reviewer
to add rows for anything not flagged that bothers them.

### Applying a returned review

It is a merge, not an overwrite.

- **Reconcile every row against the *current* value, not the one in the workbook** — the
  catalog moves on while the review is out, and a reviewer edit must never silently revert
  a later fix. Re-apply house typography onto their wording rather than pasting it raw. An
  empty correction column means "approved", not "blank".
- **A correction often quotes only the sentence being fixed.** Splice that sentence into
  the existing value; replacing the whole string drops the substantive copy that followed
  it — most damaging in legal text, where the dropped clause is the obligation.
- **A reviewer may return a second artifact** (a full copy rewrite) beside the workbook.
  Do not assume the newer file supersedes the older: diff them and take the conflicts to
  the owner. A rewrite drafted from the original text silently reverts the workbook's own
  corrections — including the ones the reviewer argued for hardest.
- **A glossary or register verdict fans out well beyond the flagged rows.** Scope it with
  the owner before mass-editing, then sweep the whole catalog for the old term so no
  stragglers survive.

## Adding a namespace

1. Add the namespace object to **all** locale JSON files.
2. Use it via `useTranslations("ns")` / `getTranslations("ns")`.
3. If it's server-only (email, metadata, cron), add it to the strip list in the root `app/layout.tsx` so it stays out of the client bundle.

## Database

`profiles.locale` is a nullable `text` column; null means "auto-detect from browser." It's persisted via a PATCH endpoint using the admin client; existing profiles RLS covers it. Distinct from `profiles.spoken_languages` (see locale-vs-spoken-language above): `locale` controls the app translation and the language of Sogverse communications; `spoken_languages` is the user's preferred club/product languages for gamer↔gedu matching.

## Known gaps

Client message payload is shipped whole per navigation rather than per-page scoped (could filter namespaces by role/page). Localizing per-page SEO metadata (descriptions, OG text) is tracked in `TODO.md`.
