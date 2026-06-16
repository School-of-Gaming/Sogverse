# i18n (next-intl)

This directory holds the next-intl request wiring. The i18n system spans the whole stack: UI strings, email templates, page metadata, and user-facing constants. Locales currently shipped: English (`en`, source of truth), Finnish (`fi`), Swedish (`sv`), Klingon (`tlh`, easter egg). `en` is the default.

## Locale vs. spoken language

Two different concepts that English would both call "language" — deliberately named differently. Do not conflate them.

- **Locale** (`locale`) — which translation of the web app the user sees. Backed by `profiles.locale`, the `locale` cookie, the LocalePicker, and next-intl's `useLocale()`/`getTranslations()`/`useTranslations()`. Owned by `src/lib/constants/locales.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_CONFIG`, detection/validation helpers).
- **Spoken language** (`spoken_languages`) — the human languages a user speaks / a club is delivered in, used to match gamers to gedus. Backed by the `spoken_languages` reference table and the `profiles.spoken_languages` array. UI lives in the spoken-language checkboxes component under `components/ui/`.

The two are fully independent: a Finnish-speaking parent can have `locale = "fi"` (app in Finnish) and `spoken_languages = ["en"]` (wants their child in English-speaking clubs).

**Rule: Use the word *locale* for the UI translation system and *spoken language* for human fluency. Never name one after the other.**

## Files in this directory

- `request.ts` — next-intl request config (SSR/RSC). Resolves the per-request locale and loads its messages.
- `messages.ts` — `Messages` type (derived from `en.json`) and `loadMessages(locale)`, a static import map of `messages/<code>.json`. Static imports so a moved/deleted message file fails the build, not runtime.
- `types.ts` — module augmentation that registers `Messages` as next-intl's `AppConfig["Messages"]`, giving compile-time key validation and autocomplete in `useTranslations()`/`getTranslations()`.

## Translation files

Per-locale JSON in `messages/<code>.json` at the repo root (`en`, `fi`, `sv`, `tlh`). `en.json` is the source of truth; the others mirror its shape exactly.

**Rule: Every user-facing string must be translated for every locale file in `messages/`. Never leave placeholder copy or skip a locale. Best-effort translation is expected; Klingon (`tlh`) is an easter egg where fun takes are welcome and accuracy is not the goal.**

**Rule: No emoji in `messages/` files** — untranslatable, unthemeable copy. When a string needs a glyph, render a `lucide-react` icon next to the translated text in the component.

A CI script (under `scripts/`) validates translation completeness on every push — missing keys, empty values, and stale keys. It picks up new locale files automatically.

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

## Adding a locale

1. Create `messages/<code>.json` by copying `en.json` and translating every value.
2. Add the code to `SUPPORTED_LOCALES` and an entry to `LOCALE_CONFIG` (label, native label, country flag) in `src/lib/constants/locales.ts`.
3. Add its import to the `messageLoaders` map in `messages.ts`.
4. CI validation picks it up automatically. No changes needed to `request.ts`, `types.ts`, `next.config.ts`, or provider code.

## Adding a namespace

1. Add the namespace object to **all** locale JSON files.
2. Use it via `useTranslations("ns")` / `getTranslations("ns")`.
3. If it's server-only (email, metadata, cron), add it to the strip list in the root `app/layout.tsx` so it stays out of the client bundle.

## Database

`profiles.locale` is a nullable `text` column; null means "auto-detect from browser." It's persisted via a PATCH endpoint using the admin client; existing profiles RLS covers it. Distinct from `profiles.spoken_languages` (see locale-vs-spoken-language above): `locale` controls the app translation and the language of Sogverse communications; `spoken_languages` is the user's preferred club/product languages for gamer↔gedu matching.

## Future direction

The current setup resolves locale from cookie/header with no locale signal in the URL. The intended next step is **locale-prefix routing with translated slugs** (next-intl's `defineRouting()` + `pathnames`, a `[locale]` segment): each language gets its own URL namespace (`/fi/tietoa`, `/sv/om-oss`), bare paths redirect by the same resolution order as today. This unlocks locale-specific OG images/metadata (OG crawlers send no cookies, so cookie-only resolution can't do this), `hreflang` tags, per-language sitemaps, and URLs that always match displayed content. The cookie/profile system would remain as the redirect hint and persistence layer; the URL becomes the source of truth per request.

Other known gaps: client message payload is shipped whole per navigation rather than per-page scoped (could filter namespaces by role/page), and `description`/`openGraph` metadata fields are still hardcoded English on many pages.
