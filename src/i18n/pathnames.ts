/**
 * Every route in the app, keyed by its **internal** pathname — the segments the
 * filesystem under `src/app/[locale]/` actually declares — with the external
 * slug each locale serves it under.
 *
 * Two systems read this map and neither may be given a second one:
 *
 * - **next-intl's routing config** (`./routing.ts`) rewrites an incoming
 *   external URL onto the internal route and types every wrapped `Link` href
 *   against these keys, so a route missing here is a compile error at its call
 *   site rather than a silent 404.
 * - **The path normalizer** (`@/lib/navigation/locale-path`) derives its
 *   external ⇄ internal translation from exactly this data, which is what lets
 *   the proxy's security checks match a translated, locale-prefixed request
 *   against the bare internal route shapes they were written for.
 *
 * **Only the public content routes carry translated slugs.** Dashboard, auth,
 * voice, settings and preview segments are app surfaces rather than indexable
 * content, so they keep their English segments in every locale and are declared
 * here as a plain string (one value for all locales). `/roblox` and `/docs` are
 * brand/partner surfaces and stay English too.
 *
 * **Klingon reuses the English slugs.** URLs are infrastructure; the easter egg
 * is the content.
 *
 * A locale added to `SUPPORTED_LOCALES` fails the build here until it is given
 * a column in every translated entry — which is the point: a new locale must
 * not silently 404 on the public pages.
 */

import type { Pathnames } from "next-intl/routing";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

export const PATHNAMES = {
  // --- Public content: translated slugs -------------------------------------
  "/": "/",
  "/shop": {
    en: "/shop",
    fi: "/kauppa",
    sv: "/butik",
    fr: "/boutique",
    tlh: "/shop",
  },
  "/shop/confirmation": {
    en: "/shop/confirmation",
    fi: "/kauppa/vahvistus",
    sv: "/butik/bekraftelse",
    fr: "/boutique/confirmation",
    tlh: "/shop/confirmation",
  },
  "/shop/[id]": {
    en: "/shop/[id]",
    fi: "/kauppa/[id]",
    sv: "/butik/[id]",
    fr: "/boutique/[id]",
    tlh: "/shop/[id]",
  },
  "/schools": {
    en: "/schools",
    fi: "/koulut",
    sv: "/skolor",
    fr: "/ecoles",
    tlh: "/schools",
  },
  "/schools/[municipalityName]": {
    en: "/schools/[municipalityName]",
    fi: "/koulut/[municipalityName]",
    sv: "/skolor/[municipalityName]",
    fr: "/ecoles/[municipalityName]",
    tlh: "/schools/[municipalityName]",
  },
  "/schools/[municipalityName]/[id]": {
    en: "/schools/[municipalityName]/[id]",
    fi: "/koulut/[municipalityName]/[id]",
    sv: "/skolor/[municipalityName]/[id]",
    fr: "/ecoles/[municipalityName]/[id]",
    tlh: "/schools/[municipalityName]/[id]",
  },
  "/privacy": {
    en: "/privacy",
    fi: "/tietosuoja",
    sv: "/integritet",
    fr: "/confidentialite",
    tlh: "/privacy",
  },
  "/terms-and-conditions": {
    en: "/terms-and-conditions",
    fi: "/kayttoehdot",
    sv: "/villkor",
    fr: "/conditions-generales",
    tlh: "/terms-and-conditions",
  },
  "/anti-bullying-and-discipline": {
    en: "/anti-bullying-and-discipline",
    fi: "/kiusaamisen-vastaisuus-ja-kurinpito",
    sv: "/mot-mobbning-och-disciplin",
    fr: "/lutte-contre-le-harcelement-et-discipline",
    tlh: "/anti-bullying-and-discipline",
  },

  "/about": {
    en: "/about",
    fi: "/meista",
    sv: "/om-oss",
    fr: "/a-propos",
    tlh: "/about",
  },
  "/library": {
    en: "/library",
    fi: "/kirjasto",
    sv: "/bibliotek",
    fr: "/bibliotheque",
    tlh: "/library",
  },
  // One segment, two addresses: an article's id or the slug of its title in
  // the page's locale (`src/lib/slug.ts`).
  "/library/[idOrSlug]": {
    en: "/library/[idOrSlug]",
    fi: "/kirjasto/[idOrSlug]",
    sv: "/bibliotek/[idOrSlug]",
    fr: "/bibliotheque/[idOrSlug]",
    tlh: "/library/[idOrSlug]",
  },
  "/team": {
    en: "/team",
    fi: "/tiimi",
    sv: "/team",
    fr: "/equipe",
    tlh: "/team",
  },
  // One segment, two addresses: a person's id or the slug of their first name
  // and nickname (`src/lib/slug.ts`).
  "/team/[idOrSlug]": {
    en: "/team/[idOrSlug]",
    fi: "/tiimi/[idOrSlug]",
    sv: "/team/[idOrSlug]",
    fr: "/equipe/[idOrSlug]",
    tlh: "/team/[idOrSlug]",
  },
  // Admin-only, but the child of a translated route, so translated with it.
  // Reached by the article's id alone; the segment is named for its parent's.
  "/library/[idOrSlug]/preview": {
    en: "/library/[idOrSlug]/preview",
    fi: "/kirjasto/[idOrSlug]/esikatselu",
    sv: "/bibliotek/[idOrSlug]/forhandsvisning",
    fr: "/bibliotheque/[idOrSlug]/apercu",
    tlh: "/library/[idOrSlug]/preview",
  },
  // A landing page: its id, or the slug its version in the page's locale
  // stores (`src/services/landing-pages/`). There is no index at `/discover`.
  "/discover/[idOrSlug]": {
    en: "/discover/[idOrSlug]",
    fi: "/tutustu/[idOrSlug]",
    sv: "/upptack/[idOrSlug]",
    fr: "/decouvrir/[idOrSlug]",
    tlh: "/discover/[idOrSlug]",
  },
  // Admin-only, translated with its parent like the Library article preview,
  // and reached by the page's id alone.
  "/discover/[idOrSlug]/preview": {
    en: "/discover/[idOrSlug]/preview",
    fi: "/tutustu/[idOrSlug]/esikatselu",
    sv: "/upptack/[idOrSlug]/forhandsvisning",
    fr: "/decouvrir/[idOrSlug]/apercu",
    tlh: "/discover/[idOrSlug]/preview",
  },
  "/attributions": {
    en: "/attributions",
    fi: "/lahteet",
    sv: "/kallor",
    fr: "/credits",
    tlh: "/attributions",
  },

  // --- Public, English segments in every locale -----------------------------
  "/docs/minecraft-api": "/docs/minecraft-api",
  "/docs/lynx-api": "/docs/lynx-api",
  "/roblox": "/roblox",
  "/roblox/privacy": "/roblox/privacy",
  "/roblox/safeguarding": "/roblox/safeguarding",
  "/roblox/terms": "/roblox/terms",

  // --- Auth -----------------------------------------------------------------
  "/login": "/login",
  "/register": "/register",
  "/register-gedu": "/register-gedu",
  "/forgot-password": "/forgot-password",
  "/reset-password": "/reset-password",
  "/reset-pin": "/reset-pin",
  "/seat-offer": "/seat-offer",
  "/verify-email": "/verify-email",
  "/select-profile": "/select-profile",
  "/complete-registration": "/complete-registration",
  "/oauth/consent": "/oauth/consent",
  "/link-discord": "/link-discord",

  // --- Shared ---------------------------------------------------------------
  "/settings": "/settings",
  "/settings/profile": "/settings/profile",

  // --- Admin ----------------------------------------------------------------
  "/admin": "/admin",
  "/admin/camps": "/admin/camps",
  "/admin/camps/new": "/admin/camps/new",
  "/admin/camps/[id]": "/admin/camps/[id]",
  "/admin/camps/[id]/edit": "/admin/camps/[id]/edit",
  "/admin/camps/[id]/groups/[groupId]": "/admin/camps/[id]/groups/[groupId]",
  "/admin/consumer-clubs": "/admin/consumer-clubs",
  "/admin/consumer-clubs/new": "/admin/consumer-clubs/new",
  "/admin/consumer-clubs/[id]": "/admin/consumer-clubs/[id]",
  "/admin/consumer-clubs/[id]/edit": "/admin/consumer-clubs/[id]/edit",
  "/admin/consumer-clubs/[id]/groups/[groupId]":
    "/admin/consumer-clubs/[id]/groups/[groupId]",
  "/admin/events": "/admin/events",
  "/admin/events/new": "/admin/events/new",
  "/admin/events/[id]": "/admin/events/[id]",
  "/admin/events/[id]/edit": "/admin/events/[id]/edit",
  "/admin/events/[id]/groups/[groupId]": "/admin/events/[id]/groups/[groupId]",
  "/admin/municipality-clubs": "/admin/municipality-clubs",
  "/admin/municipality-clubs/new": "/admin/municipality-clubs/new",
  "/admin/municipality-clubs/[id]": "/admin/municipality-clubs/[id]",
  "/admin/municipality-clubs/[id]/edit": "/admin/municipality-clubs/[id]/edit",
  "/admin/municipality-clubs/[id]/groups/[groupId]":
    "/admin/municipality-clubs/[id]/groups/[groupId]",
  "/admin/municipality-invoicing": "/admin/municipality-invoicing",
  "/admin/platform-vision": "/admin/platform-vision",
  "/admin/feedback": "/admin/feedback",
  "/admin/feedback/products": "/admin/feedback/products",
  "/admin/feedback/products/[id]": "/admin/feedback/products/[id]",
  "/admin/feedback/groups/[id]": "/admin/feedback/groups/[id]",
  "/admin/feedback/gedus": "/admin/feedback/gedus",
  "/admin/feedback/gedus/[id]": "/admin/feedback/gedus/[id]",
  "/admin/feedback/gamers/[id]": "/admin/feedback/gamers/[id]",
  "/admin/feedback/responses": "/admin/feedback/responses",
  "/admin/gedu-invoicing": "/admin/gedu-invoicing",
  "/admin/invoice-customers": "/admin/invoice-customers",
  "/admin/invoice-customers/new": "/admin/invoice-customers/new",
  "/admin/invoice-customers/[id]": "/admin/invoice-customers/[id]",
  "/admin/library": "/admin/library",
  "/admin/library/new": "/admin/library/new",
  "/admin/library/[id]": "/admin/library/[id]",
  "/admin/landing-pages": "/admin/landing-pages",
  "/admin/landing-pages/[id]": "/admin/landing-pages/[id]",
  "/admin/sites": "/admin/sites",
  "/admin/sites/[id]": "/admin/sites/[id]",
  "/admin/substitutions": "/admin/substitutions",
  "/admin/testing": "/admin/testing",
  "/admin/tools": "/admin/tools",
  "/admin/ui-components": "/admin/ui-components",
  "/admin/ui-previews": "/admin/ui-previews",
  "/admin/users": "/admin/users",
  "/admin/users/[id]": "/admin/users/[id]",
  "/admin/users/[id]/profile": "/admin/users/[id]/profile",
  "/admin/voice": "/admin/voice",
  "/admin/whatsapp": "/admin/whatsapp",

  // --- Parent (customer) ----------------------------------------------------
  "/parent": "/parent",
  "/parent/camps/[id]": "/parent/camps/[id]",
  "/parent/clubs/[id]": "/parent/clubs/[id]",
  "/parent/events/[id]": "/parent/events/[id]",
  "/parent/change-pin": "/parent/change-pin",
  "/parent/gamers/[id]": "/parent/gamers/[id]",
  "/parent/unlock": "/parent/unlock",

  // --- Gamer ----------------------------------------------------------------
  "/gamer": "/gamer",
  "/gamer/camps/[id]": "/gamer/camps/[id]",
  "/gamer/clubs/[id]": "/gamer/clubs/[id]",
  "/gamer/events/[id]": "/gamer/events/[id]",

  // --- Gedu -----------------------------------------------------------------
  "/gedu": "/gedu",
  "/gedu/camps/[id]": "/gedu/camps/[id]",
  "/gedu/clubs/[id]": "/gedu/clubs/[id]",
  "/gedu/contract": "/gedu/contract",
  "/gedu/events/[id]": "/gedu/events/[id]",
  "/gedu/invoicing": "/gedu/invoicing",
  "/gedu/substitutions": "/gedu/substitutions",

  // --- Voice ----------------------------------------------------------------
  "/voice/[code]": "/voice/[code]",
  "/voice/group/[id]": "/voice/group/[id]",

  // --- Preview (admin-only fixture surfaces) --------------------------------
  "/preview/[surface]/[scenario]": "/preview/[surface]/[scenario]",
} as const satisfies Pathnames<typeof SUPPORTED_LOCALES>;

/** The internal pathname of every route the app declares. */
export type InternalPathname = keyof typeof PATHNAMES;
