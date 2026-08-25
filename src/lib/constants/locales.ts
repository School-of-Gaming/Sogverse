// =============================================================================
// UI LOCALE constants (next-intl)
// =============================================================================
//
// This file owns the **UI locale** system — which translation of the web app
// the user sees (English, Finnish, Swedish, French, Klingon, ...). It backs:
//   - profiles.locale           (DB column)
//   - the `locale` cookie       (set on every locale change for SSR)
//   - the LocalePicker dropdown in the header
//   - next-intl's getTranslations / useTranslations
//
// **Not the same as spoken languages.** "Spoken languages" are the human
// languages a user speaks / a club is delivered in (Finnish, English, Swedish,
// ...) — the `spoken_language` enum, stored in `products.spoken_language_code`
// and the `profiles.spoken_languages` array. That system is owned by
// ./spoken-languages.ts, this file's sibling.
//
// We use the word **locale** for UI translation (matches next-intl's
// `useLocale()` and Unicode/ICU terminology) and **spoken language** for human
// fluency. They are deliberately named differently — see CLAUDE.md and
// src/i18n/CLAUDE.md.
//
// Adding a locale is a checklist, not a one-liner: `LOCALE_CONFIG` entry → flag
// registration → messages loader → `messages/<code>.json` → phone-country
// decision. The full checklist lives in src/i18n/CLAUDE.md ("Adding a locale").
// The translation-completeness CI script discovers `messages/*.json` on its own
// and needs no edit.

import type Stripe from "stripe";
import type { FlagCountry } from "@/components/ui/flags";

/**
 * The Stripe locale codes we may hand to *either* Stripe surface we localize —
 * Checkout sessions and the Billing Portal. The two enums are close but not
 * identical (the portal ships extra English regions), so the intersection is
 * the only set safe to use from one config field. `import type` keeps the
 * Stripe SDK out of every bundle that reads a locale label.
 */
type StripeLocale = Stripe.Checkout.SessionCreateParams.Locale &
  Stripe.BillingPortal.SessionCreateParams.Locale;

interface LocaleDefinition {
  /** English name of the language, for admin-facing UI. */
  label: string;
  /** The language's own name, for the user-facing picker. */
  nativeLabel: string;
  /**
   * Flag rendered beside the locale. `FlagCountry` is the registry in
   * src/components/ui/flags.ts, so a locale whose flag was never imported fails
   * to compile. `"KLINGON"` is the one non-country value — the picker draws it
   * inline rather than from country-flag-icons.
   */
  country: FlagCountry | "KLINGON";
  /**
   * Locale to render Stripe's own chrome in. `"auto"` means "let Stripe read
   * the browser's Accept-Language" — the honest answer for a locale Stripe does
   * not speak, rather than silently picking the wrong language.
   */
  stripe: StripeLocale;
}

/**
 * Every supported locale, **in picker order — Klingon always last.** `tlh` is a
 * novelty easter egg, so it never sits among the languages someone might
 * actually need; real locales go before it. A unit test pins
 * `SUPPORTED_LOCALES.at(-1) === "tlh"`.
 *
 * **Codes are bare language subtags** (`fr`, not `fr-FR`). A region-qualified
 * code is added only when we genuinely ship two variants of one language
 * (`fr` *and* `fr-CA`). Doing so touches more than this list: the `locale`
 * column and cookie carry the longer code, `detectLocaleFromHeader` already
 * prefers an exact tag match over a language-subtag one, and any future
 * locale-prefixed routing has to decide how the region appears in URLs. Decide
 * the scheme deliberately — do not add one incidentally.
 *
 * A related but smaller open question: the bare `en` tag is also what `Intl`
 * formats with, and bare `en` means US conventions — timezone names render as
 * "GMT+3" / "GMT+1" where a Helsinki or UK reader expects "EEST" / "BST". The
 * fit for that is a per-locale *formatting* tag in `LOCALE_CONFIG` (`en-GB`
 * for `en`), which leaves the locale code, column, cookie and URLs alone; it
 * is a site-wide decision about every date the app renders, tracked in
 * `src/i18n/CLAUDE.md`.
 *
 * Written out as a literal tuple rather than derived from `LOCALE_CONFIG`'s
 * keys: `Object.keys` is typed `string[]`, and narrowing it back to this tuple
 * would take exactly the kind of type assertion the lint config bans. The tuple
 * is what lets `z.enum(SUPPORTED_LOCALES)` compile at its call sites, and the
 * two stay in lockstep anyway — `LOCALE_CONFIG` below `satisfies` a record
 * keyed by this union, so a locale here with no config (or a config with no
 * locale here) fails the build, and a unit test pins the order.
 */
export const SUPPORTED_LOCALES = ["en", "fi", "sv", "fr", "tlh"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * The single definition of everything that varies per locale. Nothing
 * downstream keeps a parallel map — the Stripe checkout and billing-portal
 * routes used to hand-maintain one each, and a new locale meant remembering
 * both.
 *
 * Keep the entries in `SUPPORTED_LOCALES` order (the compiler enforces that the
 * key *sets* match; only the order is on the author).
 */
export const LOCALE_CONFIG = {
  en: {
    label: "English",
    nativeLabel: "English",
    country: "GB",
    stripe: "en",
  },
  fi: {
    label: "Finnish",
    nativeLabel: "Suomi",
    country: "FI",
    stripe: "fi",
  },
  sv: {
    label: "Swedish",
    nativeLabel: "Svenska",
    country: "SE",
    stripe: "sv",
  },
  fr: {
    label: "French",
    nativeLabel: "Français",
    country: "FR",
    stripe: "fr",
  },
  // Klingon stays last — see the ordering rule on SUPPORTED_LOCALES.
  tlh: {
    label: "Klingon",
    nativeLabel: "Klingon",
    country: "KLINGON",
    stripe: "auto",
  },
} as const satisfies Record<SupportedLocale, LocaleDefinition>;

export const DEFAULT_LOCALE: SupportedLocale = "en";

// Server-side default for next-intl's date/time formatters (useFormatter).
// Not auto-detected from the browser — HTTP headers don't carry timezone.
// Only affects next-intl formatters, not date-fns-tz which handles its own
// timezone logic. Helsinki chosen as most users are in Finland/Sweden (±1h).
// Used in both src/i18n/request.ts (server) and src/providers/index.tsx (client).
export const DEFAULT_TIMEZONE = "Europe/Helsinki";

/**
 * Walk an Accept-Language header in priority order and return the first
 * supported locale, or `null` when the header asked for nothing we ship (and
 * when there is no header at all).
 *
 * Handles the full ranked header so users whose primary language is
 * unsupported but who list a supported language lower in the preference
 * list still get a match. Also accepts a single tag like "fi-FI"
 * (navigator.language) — treated as a one-entry list with implicit q=1.
 *
 * Each entry is tried as a whole tag first, then truncated to its language
 * subtag (RFC 4647 "lookup"). Today every supported locale is a bare language
 * code, so the exact pass never decides anything — it exists so that the day we
 * ship a region-qualified locale (see the tripwire on `LOCALE_CONFIG`), a
 * browser asking for `fr-CA` gets `fr-CA` instead of falling through to `fr`.
 *
 * Quality order stays the outer loop: a caller's higher-ranked language beats a
 * lower-ranked exact tag, because "the language I actually want" outranks "the
 * region variant you happen to have".
 *
 * Most callers want `detectLocaleFromHeader` below, which folds the no-match
 * case into `DEFAULT_LOCALE`. Reach for this one only when "we could not match
 * this browser" has to stay distinguishable from "this browser asked for
 * English" — measurement being the case in hand: a German-only visitor picking
 * French is a missing-locale finding, not us guessing English wrongly, and the
 * two are the same value once the fallback is applied.
 */
export function matchLocaleFromHeader(
  header: string | null,
): SupportedLocale | null {
  if (!header) return null;

  // Parse into { tag, q } entries sorted by descending quality
  const entries: { tag: string; q: number }[] = [];
  for (const entry of header.split(",")) {
    const parts = entry.trim().split(";");
    const tag = parts[0].trim();
    if (!tag) continue;

    let q = 1;
    for (let i = 1; i < parts.length; i++) {
      const param = parts[i].trim();
      if (param.startsWith("q=")) {
        q = parseFloat(param.slice(2));
        if (isNaN(q)) q = 0;
      }
    }
    entries.push({ tag, q });
  }

  entries.sort((a, b) => b.q - a.q);

  for (const { tag } of entries) {
    // Language tags are case-insensitive per RFC 5646; our codes are lowercase.
    const full = tag.toLowerCase();
    if (isSupportedLocale(full)) return full;

    const lang = full.split("-")[0];
    if (isSupportedLocale(lang)) return lang;
  }

  return null;
}

/**
 * The locale to *render* for a request carrying this Accept-Language header:
 * the best supported match, or `DEFAULT_LOCALE` when there is none. Serving a
 * page has to name some locale, so every no-match path — no header, an empty
 * one, a browser asking only for languages we don't ship — resolves to English
 * here.
 */
export function detectLocaleFromHeader(
  header: string | null,
): SupportedLocale {
  return matchLocaleFromHeader(header) ?? DEFAULT_LOCALE;
}

/**
 * What a request's `Accept-Language` header negotiated to — a supported locale,
 * or `"none"` when the browser asked only for languages we don't ship (or sent
 * no header at all).
 *
 * `"none"` is a distinct value on purpose. The render path folds every no-match
 * case into `DEFAULT_LOCALE`, but for measurement that conflation is fatal: a
 * German-only visitor switching to French would otherwise read as "overrode a
 * correct English guess", when the finding is really "we don't ship their
 * language". One is a detection bug, the other is a roadmap item.
 *
 * Lives here rather than beside the analytics events that carry it: it is a
 * fact about locale detection, and the server components that read it must not
 * be one deleted `type` keyword away from pulling the client analytics module
 * into their bundle.
 */
export type DetectedLocale = SupportedLocale | "none";

/**
 * The `DetectedLocale` for a request carrying this `Accept-Language` header —
 * `matchLocaleFromHeader` with the no-match case named. The `"none"` sentinel
 * is declared directly above, so the coercion into it belongs here too rather
 * than being spelled out at each call site.
 */
export function toDetectedLocale(header: string | null): DetectedLocale {
  return matchLocaleFromHeader(header) ?? "none";
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Validate a user-supplied locale value and fall back to a default. Use this
 * when reading `profiles.locale` or a locale from a request body — it narrows
 * `unknown` to `SupportedLocale` in one step without per-call-site casts.
 *
 * For multi-source resolution with Accept-Language fallback, don't use this —
 * inline the chain (see src/app/api/auth/forgot-password/route.ts).
 */
export function resolveLocale(
  value: unknown,
  fallback: SupportedLocale = DEFAULT_LOCALE,
): SupportedLocale {
  return isSupportedLocale(value) ? value : fallback;
}

/**
 * The Stripe locale to render Stripe's own chrome in, for a locale value we do
 * not trust yet (a nullable `profiles.locale`, a resolved request locale).
 *
 * Anything we don't recognise — including a locale Stripe has no translation
 * for — becomes `"auto"`, which tells Stripe to read the browser's
 * Accept-Language. Both Stripe surfaces we localize (Checkout, Billing Portal)
 * call this, so the mapping is stated once in `LOCALE_CONFIG`.
 */
export function stripeLocaleOrAuto(value: unknown): StripeLocale {
  return isSupportedLocale(value) ? LOCALE_CONFIG[value].stripe : "auto";
}
