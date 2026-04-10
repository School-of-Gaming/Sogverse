# i18n Architecture

next-intl-powered internationalisation supporting English, Finnish, and Swedish across the full stack: UI strings, email templates, page metadata, and user-facing constants.

## Overview

All user-facing strings are extracted into per-locale JSON files (`messages/{en,fi,sv}.json`). The UI language is resolved per-request (cookie > Accept-Language > default English) and persisted to the user's profile. Server components use `getTranslations()`, client components use `useTranslations()`, and email templates use a standalone translator built on `use-intl/core`. A CI script validates translation completeness on every push.

## Component Map

```
Configuration
├── src/i18n/request.ts               -- next-intl request config (locale resolution, message loading)
├── src/i18n/types.ts                 -- TypeScript augmentation for compile-time key safety
├── next.config.ts                    -- createNextIntlPlugin() wraps the Next.js config
└── eslint.config.mjs                 -- eslint-plugin-i18next (jsx-only mode, attribute exclusions)

Translation files (messages/)
├── en.json                           -- English (source of truth)
├── fi.json                           -- Finnish
└── sv.json                           -- Swedish

Language preference (user setting)
├── src/lib/constants/language-preference.ts  -- SUPPORTED_LANGUAGES, detection/validation helpers
├── src/providers/language-provider.tsx        -- LanguageProvider context (cookie + DB persistence)
├── src/components/layout/language-picker.tsx  -- Dropdown UI with country flags
├── src/app/api/user/language-preference/route.ts  -- PATCH endpoint to persist preference
└── supabase/migrations/00022_profile_language_preference.sql  -- profiles.language_preference column

Email translation
├── src/lib/email-templates/translator.ts  -- getEmailTranslator() (use-intl/core, scoped to email namespace)
└── src/lib/email-templates/registry.ts    -- Template definitions with i18n subject/fromName

CI validation
└── scripts/check-translations.mjs    -- Checks missing keys, empty values, stale keys
```

## Locale Resolution

Priority order (same logic in both SSR and API routes):

1. **User profile** -- `language_preference` column (set via language picker)
2. **Cookie** -- `language` cookie (set on every language change, works for logged-out users)
3. **Accept-Language header** -- walks the full ranked list via `detectLanguageFromHeader()`, picks the first supported language
4. **Default** -- English

The SSR path (`src/i18n/request.ts`) checks cookie then header. API routes check profile preference then header.

## Translation Usage Patterns

### Server components (RSC)

```typescript
import { getTranslations } from "next-intl/server";

// In generateMetadata()
const t = await getTranslations("metadata.pages");
return { title: t("signIn") };

// In component body -- server components can also use getTranslations()
```

### Client components

```typescript
"use client";
import { useTranslations } from "next-intl";

const t = useTranslations("admin.dashboard");
return <h1>{t("title")}</h1>;
```

### Email templates (server-side, outside React)

```typescript
import { getEmailTranslator } from "@/lib/email-templates/translator";

const t = await getEmailTranslator(locale);  // locale from profile or header
const subject = t("passwordReset.subject");
const html = buildPasswordResetEmail(t, resetLink, locale);
```

## Message Namespaces

Translation keys are organised into namespaces (top-level keys in the JSON files):

| Namespace | Used by | Client-shipped? |
|-----------|---------|-----------------|
| `common` | Shared UI strings (buttons, labels) | Yes |
| `admin`, `auth`, `gamer`, `gedu`, `parent`, `settings` | Role/feature pages | Yes |
| `about`, `home`, `sorg`, `yty`, `clubs`, `docs`, `checkout` | Public pages | Yes |
| `enrollment`, `groups`, `tokens`, `voice`, `minecraft` | Feature components | Yes |
| `header`, `sidebar`, `footer`, `feedback` | Layout components | Yes |
| `email` | Email templates (server-only) | **No** |
| `metadata` | Page titles via `generateMetadata()` (server-only) | **No** |

Server-only namespaces are stripped in `src/app/layout.tsx` before passing messages to `NextIntlClientProvider`, reducing the client RSC payload by ~10%.

## Type Safety

`src/i18n/types.ts` augments the `next-intl` module with the English message structure. This gives:
- Compile-time validation of translation keys in `useTranslations()` and `getTranslations()`
- IDE autocomplete for all keys
- Build failures on key typos

The email translator (`use-intl/core`) operates on plain strings and does not benefit from this type augmentation.

## Adding a New Language

1. Create `messages/{code}.json` by copying `en.json` and translating all values
2. Add the language code to `SUPPORTED_LANGUAGES` in `src/lib/constants/language-preference.ts`
3. Add its config entry to `LANGUAGE_CONFIG` (label, native label, country flag code)
4. The CI script (`check-translations.mjs`) will automatically validate the new file
5. No changes needed to `next.config.ts`, `request.ts`, or provider code

## Adding a New Namespace

1. Add the namespace object to all three JSON files (`en.json`, `fi.json`, `sv.json`)
2. Use it in components via `useTranslations("myNamespace")` or `getTranslations("myNamespace")`
3. If the namespace is **server-only** (email templates, metadata, cron jobs), add it to the destructure in `src/app/layout.tsx` so it's excluded from the client bundle

## Database

The `profiles` table has a nullable `language_preference` column (`text`). Null means "auto-detect from browser". The column is updated via `PATCH /api/user/language-preference` using the admin client (bypasses RLS). Existing RLS policies on profiles cover this column.

This is distinct from the `languages` array on `gamer_profiles`/`gedu_profiles` which stores languages the user *speaks* (for matching purposes).

## Future Improvements

### Per-page message scoping

Currently all client namespaces (~43KB raw, ~14KB gzipped) are passed to `NextIntlClientProvider` in the root layout on every page navigation. Before i18n, strings were inline in code-split component bundles and only the current page's strings were sent.

next-intl supports passing only the namespaces each page needs (via `pick()` or per-page providers). This would reduce the per-navigation payload, especially for role-specific namespaces -- e.g. a gamer never needs the `admin` namespace (9KB raw, 3.4KB gzip).

**Current impact:** ~14KB gzipped per navigation (comparable to a font file). Moderate -- not blocking but worth revisiting as the translation corpus grows or more languages are added.

**Approach when needed:** Move `NextIntlClientProvider` into per-layout wrappers that declare their namespaces, or filter messages by the user's role in the root layout.

### ICU placeholder validation in CI

The `check-translations.mjs` script validates key presence and non-empty values, but does not verify that ICU placeholders (e.g. `{gamerName}`, `{productName}`) match between source and target locales. A dropped or extra placeholder is the most common i18n runtime error. Adding a placeholder comparison step would catch these before merge.

### Stripe product name localisation

Stripe product names and descriptions are fetched from the Stripe API in English. See the "Translate Stripe Product Names & Descriptions" section in `TODO.md` for the planned approach using Stripe metadata fields.

### Hardcoded metadata descriptions

Page titles in `generateMetadata()` are translated, but `description` and `openGraph` fields remain hardcoded English across ~17 pages. These affect search results and social card previews for non-English users.
