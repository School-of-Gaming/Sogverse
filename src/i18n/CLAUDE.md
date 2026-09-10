# i18n (next-intl)

This directory holds the next-intl request wiring. The i18n system spans the whole stack: UI strings, email templates, page metadata, and user-facing constants. Locales currently shipped: English (`en`, source of truth), Finnish (`fi`), Swedish (`sv`), French (`fr`), Klingon (`tlh`, easter egg). `en` is the default.

## Locale vs. spoken language

Two different concepts that English would both call "language" — deliberately named differently. Do not conflate them.

- **Locale** (`locale`) — which translation of the web app the user sees. Decided by the URL's locale segment and exposed through next-intl's `useLocale()`/`getTranslations()`/`useTranslations()`; `profiles.locale`, the `locale` cookie and the LocalePicker are the preference behind it. Owned by `src/lib/constants/locales.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_CONFIG`, detection/validation helpers).
- **Spoken language** (`spoken_language`) — the human languages a user speaks / a club is delivered in, used to match gamers to gedus. A Postgres enum, backed by `products.spoken_language_code` and the `profiles.spoken_languages` array, with the ordered value list and the string guard in `src/lib/constants/spoken-languages.ts`. UI lives in the spoken-language checkboxes component under `components/ui/`.

The two are fully independent: a Finnish-speaking parent can have `locale = "fi"` (app in Finnish) and `spoken_languages = ["en"]` (wants their child in English-speaking clubs).

**Rule: Use the word *locale* for the UI translation system and *spoken language* for human fluency. Never name one after the other.**

**Rule: A language's display name always comes from the shared language-name hook (`useLanguageNames`, `src/hooks/`), never from `LOCALE_CONFIG.label` directly.** That label is an English *fallback*, not a display string — rendering it raw ships English names to every non-English viewer (this happened on three admin surfaces at once). The hook resolves any tag via `Intl.DisplayNames` in the viewer's locale and takes the English value as its fallback argument. The fallback is for the locale side only: `Intl` has no name for `tlh`, and has a name for every spoken language in every locale we ship, so a spoken-language caller passes no fallback at all. No display name is ever stored — the retired reference table's single English `name` column is exactly the thing this rule was written against.

## Files in this directory

- `routing.ts` — the routing contract (`defineRouting`): locales derived from `SUPPORTED_LOCALES`, `localePrefix: "always"`, next-intl's own detection, locale cookie and alternate-links header all off, and the pathnames map.
- `pathnames.ts` — every route in the app keyed by its internal pathname, with the slug each locale serves it under. See "Routes: the pathnames map" below.
- `navigation.ts` — the locale-aware `Link`, `redirect`, `usePathname`, `useRouter` and `getPathname` (`createNavigation`). Use these, not `next/link` / `next/navigation`, wherever a route is named.
- `request.ts` — next-intl request config (SSR/RSC). Resolves the per-request locale and loads its messages.
- `messages.ts` — `Messages` type (derived from `en.json`) and `loadMessages(locale)`, a static import map of `messages/<code>.json`. Static imports so a moved/deleted message file fails the build, not runtime. The `tlh` entry is the one that merges — it is the English-fallback mechanism described under the legal-copy rule below.
- `types.ts` — module augmentation that registers `Messages` as next-intl's `AppConfig["Messages"]`, giving compile-time key validation and autocomplete in `useTranslations()`/`getTranslations()`.

## Translation files

Per-locale JSON in `messages/<code>.json` at the repo root (`en`, `fi`, `sv`, `fr`, `tlh`). `en.json` is the source of truth; the others mirror its shape exactly, with one deliberate hole in `tlh` (see the legal-copy rule below).

**Rule: Every user-facing string must be translated for every locale file in `messages/`. Never leave placeholder copy or skip a locale. Best-effort translation is expected; Klingon (`tlh`) is an easter egg where fun takes are welcome and accuracy is not the goal.**

**Rule: legal-page namespaces are served in English under `tlh` — the easter egg stops at the courtroom door.** A privacy policy, a set of terms, a safeguarding policy and their programme-specific siblings are binding text a family may be held to; an in-character rendering of one is a joke told at the reader's expense, and it is the one place where "accuracy is not the goal" is the wrong instruction. **The attributions page is in this set too**, for the adjacent reason: it is the credit two data licences oblige us to publish, and a licence condition discharged in Klingon is a licence condition not discharged. The same reach applies to those pages' `metadata.pages` titles and to any link label that names one of the documents — a footer link must call a page what the page calls itself.

**The cookie banner (`consent`) is in the set as a whole namespace**, and it is the one entry that is not a document. Every other exemption is text a reader might be held to; this one is the instrument that *records* what they agreed to, and an answer is only worth storing if the reader understood the question. The buttons are why it is the whole namespace rather than the body alone: refusing has to be exactly as easy and as legible as accepting — that is the legal requirement the banner component is built around — and a refusal button written in character is not that. An English question over Klingon buttons would be worse than either.

Everything else in `tlh` (nav, dashboards, marketing copy) stays in character.

**A sentence that *contains* such a link is not itself a link label, and stays in Klingon.** The signup panel's consent sentences do this twice over: a bundle's sentence names two programme documents inside its own rich-text tags, and the rules sentence a parent ticks names the Anti-Bullying and Discipline policy inside one. Both are ordinary product copy and are written in character, with the English document names spelled out inside the tags. That only works because the exemption list matches subtree *roots* — anything filed under an exempted namespace is served in English whole — so a sentence like this one is authored outside it, in the namespace its surface owns rather than beside the names it points at. Two message keys spelling the same word is the cost, and it is the right one.

**The shape: `tlh` omits those keys entirely and they resolve to English at runtime.** They used to be `en`'s values copied in verbatim, which read as tidy — the catalog stayed structurally identical and every gate passed untouched — and was a drift hazard: nothing asserted the byte-equality, so the first English legal edit that nobody thought to mirror would have left Klingon serving *stale* binding text. Omission makes `en` the single source of truth by construction. Three pieces implement it, and a change to one wants a look at the other two:

1. **The message loader lays the `tlh` catalog over the full `en` one** and returns the result as a complete catalog (next-intl 4.x ships no merge helper; its docs point at a general deep-merge package). Ours is spread by hand, subtree by subtree, rather than merged generically — deliberately. A generic deep merge has to assert its own return type, which this repo's lint bans outright, and it would absorb a *new* hole in silence; the hand-written merge is checked by the compiler, so the day a namespace starts omitting a key with no matching line in the loader, the build fails and names the key. **The merge is scoped to `tlh` alone.** Every other locale is loaded as-is and typed as a complete catalog, so a missing `fi`/`fr`/`sv` key stays a build failure rather than quietly becoming English.
2. **The completeness script under `scripts/` carries a `tlh`-scoped exemption** naming exactly those namespaces and labels — a narrow list of subtree roots, not a blanket pass, so a *non*-legal Klingon key that goes missing still fails CI.
3. **Unit tests pin both halves**: that the loader returns English for the omitted keys and Klingon for everything else (and merges no other locale), and that the namespaces are *absent* from `tlh` rather than merely equal to `en`. Absence is the assertion that matters — a partially re-introduced namespace is worse than the old convention it replaced, because it shadows English with a value nothing keeps in step, in the one place where stale text is a liability.

**Rule: No emoji in `messages/` files** — untranslatable, unthemeable copy. When a string needs a glyph, render a `lucide-react` icon next to the translated text in the component.

A CI script (under `scripts/`) validates translation completeness on every push — missing keys, empty values, and stale keys. It picks up new locale files automatically.

## Dead copy: orphaned keys

The catalog only rots in one direction, and it is worth knowing which. A key that is **used but missing** is a build failure: `types.ts` registers the catalog as next-intl's `Messages`, so a translator's key parameter is the union of its namespace's keys. That has been verified by execution for a literal key, for one composed at the call site (`` t(`startModes.${option}`) ``, where the compiler expands the union and even suggests the nearest surviving member), for a key read as a plain property off a catalog object, and for one referenced only from `tests/`. So typos and stale references cannot ship.

Nothing guards the other direction. A key **defined but unreachable** breaks nothing, costs nothing at runtime, and shows up only as translation spend and as copy that reads like a shipping feature to whoever greps the catalog next. 139 such keys had accumulated before anyone counted.

**The one place the compiler does not help is `t.raw()`.** Its key is not validated — verified by deleting one and building clean — so on that path a *missing* key fails at runtime instead, on a legal page. Every `.raw(` call site today is one: `privacy`, `terms`, `discipline`, `robloxPrivacy`, `robloxSafeguarding`, `robloxTerms`, and `roblox.hero.title`. Treat keys in those namespaces as unverifiable by the compiler in either direction.

**There is deliberately no CI check for unreachable keys**, and the reasoning is worth keeping because the idea comes back. A check that is *sound* and *fast* can only prove the subset nothing scopes at all — measured at 86 of the 139, all of them whole namespaces left by a feature deletion. Going further means modelling how a translator can be consumed: composed keys, `t.raw()`, a translator passed to a helper whose parameter names its own key union, a namespace assembled at runtime. Each of those is a belief about next-intl's types, and a stale belief there produces a *false positive* — CI ordering live copy deleted. That trade is bad at any speed, so cleanup stays deliberate: run **`/prune-message-keys`**, which reasons about candidates and then proves each one by deleting it and asking the compiler.

Whole namespaces are the shape that actually accumulates, so if a sweep turns up a large cluster, look for an earlier removal that swept its code and not its copy — both lineages found in 2026-08 were exactly that (the v1 product teardown, and the Sorg token drop taking the enrollment emails with it).

## Editing a message catalog

**Rule: for any change touching more than a handful of keys, edit a catalog with a script that round-trips the file — not a hand merge.** Every `messages/*.json` round-trips byte-identically through `JSON.stringify(parsed, null, 2) + "\n"`, so a scripted set-by-path merge cannot reformat the file or reorder keys. Assert each target path already exists, so a mistyped key fails loudly instead of silently adding one the other locales don't have.

Gates for a catalog change: the completeness script under `scripts/`, **plus** an ICU parse of every string in the changed locale and a placeholder/tag parity check against `en.json`. Human-supplied copy is the main source of broken `{placeholder}` and `<tag>` pairs, and completeness checking does not look inside a value. `intl-messageformat` is already available as a transitive dep — a throwaway check script has to sit inside the repo to resolve it.

French typography: U+2019 for apostrophes (never U+0027, outside code samples) and a no-break space only after `n°`. Copy pasted from a person or a spreadsheet always arrives with straight apostrophes; normalise on the way in.

## The role name: `Gedu`, and what to call the role otherwise

**Rule: `Gedu` is a product name — never translated, and never used cold.** It carries the
signed-in product (dashboards, voice, admin, email), where the reader already knows the
word, and appears in public prose only where the copy introduces it with a gloss ("a Gedu
— a Game Educator"). A public string using it cold has leaked in-house vocabulary at the
one moment the reader cannot decode it.

**One public surface is carved out: `/register-gedu`** (owner ruling, 2026-08). Nobody
arrives at the Gedu registration page by browsing — they were pointed at it by School of
Gaming, and anyone who got that far knows us well enough to have already been told what a
Gedu is — so its title may use the word cold, and the `en` and `fr` titles do. The
carve-out is that page and nothing adjacent to it: every other public surface still
introduces the word with a gloss or reaches for the role name instead.

**Rule: wherever `Gedu` is not the word, each locale has exactly one word for the role.**
Chosen by native speakers, 2026-08-13:

| locale | the role |
|---|---|
| `en` | **Game Educator** — capitalised, a defined term rather than a common noun |
| `fi` | **pelikasvattaja** |
| `sv` | **spelfostrare** |
| `fr` | **animateur** / **animatrice** |

**There is no register split**: one word covers marketing copy, product surfaces and legal
text alike. Earlier catalogues drifted into a second, plainer word for legal pages in every
locale (and French documented the split deliberately). That is retired — a legal page uses
the same word as the home page.

**There is no exception for the Roblox programme documents** (`robloxPrivacy`,
`robloxSafeguarding`, `robloxTerms`), even though they are co-authored with Lynx Educate.
They once named a generic legal *category* of person alongside staff, volunteers and
contractors — `facilitator`, `ohjaaja`, `ledare` — and glossed it back to the house term in
the same breath. Both now collapse into the house term plus a gloss to `Gedu`, because the
gloss said the two sets were the same anyway, so nothing narrowed. Keep it that way: a
policy that names the role differently from the product page is the confusion these
documents can least afford.

## French register and glossary

**Rule: French is a transcreation, not a literal mirror of `en.json`.** Public-page marketing copy — including the slogan, whose French imagery deliberately differs from the English — was rewritten by a native speaker rather than translated. CI enforces key parity and cannot see meaning, so a French string that says something other than its English counterpart on a public page is intentional and must not be "corrected" back.

**The divergence is scoped to French alone.** `fi`, `sv` and `tlh` render the English positioning; French does not. Do not reconcile the two in either direction — neither by pulling French back toward the English source, nor by pushing the French imagery outward into the other locales. Diverging a second locale is a positioning decision for the owner, not a consistency fix.

- **The role name is `animateur` / `animatrice` in every register** — see the glossary section above. French once split this by register, using `éducateur de jeu` in formal copy; that split is retired and the calque is no longer used anywhere.
- **Municipality: the adjective is `municipal` / `municipaux`, the noun stays `commune`.** "Clubs municipaux", but "payé par votre commune". `municipal` maps to town-funded public services in French; `communal` is correct but less instinctive.
- **`vous` to adults, `tu` in child-facing strings.**
- **Never use the middle dot (`Prêt·e`) to dodge gender agreement — reframe instead.** It is visually awkward on screen and contested in France. Open child-facing prompts with a construction that takes no agreement, and where inserting a name would force a participle to inflect, state the event as a noun phrase (an enrolment is confirmed) rather than agreeing with the person.

## Locale resolution: the URL decides

**Rule: every page URL carries its locale, and the URL wins over cookie, profile and `Accept-Language` alike.** The prefix is `always`, so `/en/…` is as prefixed as `/fi/…` — one URL shape, no "bare means English" special case in the proxy, the normalizer, the picker or a test — and a link therefore pins a language for whoever receives it, crawler included. That is the whole point: a shared link and the social card scraped from it render the language they were sent in.

**A bare path is never a page — it is the detector.** The proxy answers one with a redirect into a prefixed URL, choosing by the ladder: `locale` cookie → `Accept-Language` (the full ranked list, via `detectLocaleFromHeader`) → English. `profiles.locale` participates through the cookie, so the SSR path stays DB-free, and a path matching no route is prefixed anyway so a Finnish visitor gets a Finnish 404. Two carve-outs: `/api/*` (a response has no locale, and a redirected `fetch` would break every client-side call for a non-English reader) and the OG image handlers, which take their locale as a query parameter and sit outside the proxy's matcher. The ladder runs **first among the routing decisions**, so every later gate — PIN, auth, role — fires on an already-localized request and a bounce lands in the reader's own language. API routes that need a user's preference still read `profiles.locale` and fall back to the header; the URL governs pages, not money flows or mail.

**Rule: persistence is picker-only.** Visiting a prefixed URL writes no cookie — following a link is reading, touching the picker is choosing — which is why next-intl's own locale cookie is off, and why letting a stored preference redirect a prefixed URL is never the answer to a mismatch. The picker writes the cookie (and `profiles.locale` when signed in) and then re-issues the current route under the new prefix with `replace` rather than `push`, carrying params, query and hash: back should return to the previous page, not the previous language. The one exception is the three sign-in flows — password sign-in, the OAuth callback and the account switch — which seed the cookie from the signed-in profile, so a fresh device's post-login bare path lands in the reader's stored language. The cookie's name and attributes come from one module (`src/lib/locale-cookie.ts`) so a server write and a browser write land on one cookie rather than two.

**The client provider reads the locale, it never decides it.** The active locale is next-intl's URL locale; nothing derives it from the profile and nothing reconciles the cookie on render — either would mean a signed-in `fi` reader opening a shared `/fr/…` link sees the wrong language in the picker and has their stored preference silently rewritten by a link they clicked.

**Rule: Validate any incoming locale value before use.** Use `resolveLocale()`/`isSupportedLocale()` from `src/lib/constants/locales.ts` to narrow `unknown` (URL segment, profile column, request body, an OG handler's query param) to `SupportedLocale` — never trust a raw string or cast. The `[locale]` layout 404s on a segment that is not a supported locale rather than falling back to English: a second, uncanonical URL for the English page is worse than a 404.

## Routes: the pathnames map

`pathnames.ts` declares **every route in the app**, keyed by its internal pathname, with the slug each locale serves it under. Two systems read it and neither may be given a second map: the routing config (which rewrites incoming URLs and types every wrapped href against these keys, so a route missing here is a compile error at its call site rather than a silent 404) and the path normalizer.

**Translated slugs are for the public content routes only** — the shop and its children, the schools pages, privacy, terms, the anti-bullying policy, `/about` and `/attributions`. Dashboards, auth, voice, settings, preview, `/roblox` and `/docs` are app or partner surfaces rather than indexable content, so they keep their English segments in every locale and are declared as one plain string. **Klingon reuses the English slugs**: URLs are infrastructure, the easter egg is the content. Slugs are lowercase ASCII kebab with diacritics folded, and every child of a translated parent is translated too — a half-translated URL is a visible seam.

**Rule: name a route through the wrapped navigation module, never `next/link` / `next/navigation` — except where the pathname is being embedded in a URL.** The wrapped `usePathname` returns the *internal* pathname, which is exactly what pathname *comparison* wants (active states, dashboard-prefix detection) and exactly wrong for a value that becomes part of a URL: on a dynamic route it is the template, so a redirect param built from it passes every allowlist and then navigates to a literal bracketed segment, with no compile error anywhere. The split rule: **comparing → wrapped; embedding in a URL → raw, with a comment saying why.** Full-page navigations, server 303s and every server-built absolute link (email, WhatsApp, Discord, Stripe's success URL) stay on bare paths deliberately — they cost one proxy hop and land in the reader's stored locale, which is the designed behaviour for a flow re-entering the app.

**Hrefs are built in the `ROUTES` constants module, in two forms.** The object form (pathname plus its params and query) is canonical and keeps the builder's name, because a typed href for a dynamic route cannot be a built string — which is what makes the compiler surface a missed call site. A route with no params keeps its plain string: that is already a valid typed href *and* the string a route check compares against. Where a genuine string is needed — an absolute URL, a `window.location` assignment, a value matched against a route shape — a `Path`-suffixed sibling provides it. The Stripe success-URL builder is string-only forever: it embeds Stripe's literal checkout-session placeholder, which must never pass through a locale-aware path builder. A destination carried in an intermediate structure (a nav row, a fixture, a card's detail link) holds a typed href, not a string.

**Rule: every security check matches the locale-stripped, untranslated internal path**, through the normalizer in `src/lib/navigation/`. Unstripped, `/fi/admin` sails past the `/admin` role gate; unstripped and untranslated, `/fr/boutique` never matches the public-route list. Redirect params carry the **raw external** path the reader was actually on, so a bounce returns them to the URL they came from; normalization is applied wherever such a value is matched against route shapes — the proxy's own checks, and the post-auth allowlist deciding where a login may land.

## Metadata, cards and crawlers

**Titles and descriptions resolve at the URL's locale.** They come from the `metadata` namespace, so URL routing localizes them with no per-page work, and the shared page-metadata helper emits `og:locale` alongside. The two surfaces that used to resolve at a fixed locale no longer do, and the reason they did is exactly what the URL retired: a scraper carries no cookie, so a card had to be composed for the recipient the link was expected to reach. The programme card follows its URL like any other (today's French wording is simply the `fr` values), and a product card resolves the product's name and short description at the request locale through the translation resolver, degrading the way the page body does when a translation is missing. The picture on a product card is the product's own image and is not localized; only the text moves.

**Both social cards are route handlers taking a validated locale query parameter**, not Next's `opengraph-image` file convention: a file under the locale segment emits a redirecting URL into the meta tag, a file at the app root has no locale to render at, and file-convention metadata outranks config metadata either way, so the emitted URL could not be overridden. Pages emit the card's URL, alt and dimensions from their own `generateMetadata`; the paths, the caching and the reasoning live in `src/lib/og/`.

**`hreflang` alternates and canonicals are per-page, never layout-level** — a layout has no pathname, so it cannot compute a self-referencing canonical, and one layout-level canonical would cascade onto every page beneath it. Alternates, canonicals and the sitemap all build their URLs from the pathnames map rather than by joining a base to a hand-written slug, so a translated slug and its `hreflang` cannot disagree. `x-default` points at the bare URL, which is what the ladder makes it: a language detector that redirects.

Which pages are promoted to crawlers, which are reachable but not promoted, and which are gated — and why each surface sits where it does — is `docs/architecture/discoverability.md`; this section covers only the locale mechanics beneath that posture.

**Klingon is excluded from `hreflang` and the sitemap, and its pages serve `noindex` instead of a robots disallow.** An easter egg does not belong in search results or in an alternate-language annotation; a disallow would be the wrong tool because a URL that is never fetched never reads the tag and can still be indexed bare. Pages that are `noindex` for their own reasons — product pages, the schools pages, the programme pages, the API docs — emit no alternates at all. The robots disallow covers each gated prefix bare **and** under every locale, Klingon included: a prefixed dashboard URL is as real as a bare one.

**The analytics `route` dimension is supplied by the app, not computed by the framework's wrapper.** It is the internal template with the locale segment dropped, so every language of a page lands on one row while `request_path` keeps the per-language split (`docs/runbooks/vercel-analytics.md`).

## Usage patterns

- **Server components / `generateMetadata()`** — `await getTranslations("namespace")` from `next-intl/server`.
- **Client components** — `useTranslations("namespace")` from `next-intl` (file must be `"use client"`).
- **Email templates** (server-side, outside React) — `await getEmailTranslator(locale)` (built on `use-intl/core`, scoped to the email namespace). Operates on plain strings; it does **not** get the compile-time key safety the React APIs have.

Locale always comes from `useLocale()` (client) or `getLocale()` (server) — never hardcode it.

## Timezone for formatters

`DEFAULT_TIMEZONE` (`Europe/Helsinki`) in `src/lib/constants/locales.ts` is the server-side default for next-intl's date/time formatters (`useFormatter`). HTTP headers carry no timezone, so it can't be auto-detected. This affects only next-intl formatters — `date-fns-tz` handles its own timezone logic. Used in both the server request config and the client provider.

## Namespaces

Translation keys are organized into top-level namespaces in the JSON files. Two namespaces are **server-only** and stripped from the client bundle (in the `[locale]` layout) before reaching `NextIntlClientProvider`:

- `email` — email templates.
- `metadata` — page titles via `generateMetadata()`.

All other namespaces (role/feature pages, public pages, feature components, layout chrome, `common`) ship to the client.

**Rule: a client component must never read a server-only namespace, and rendered page copy must never live in one.** The strip is invisible from the call site — the same `useTranslations("metadata.pages")` line works in a server component and throws `MISSING_MESSAGE` in a client one — so the failure only shows up when a component crosses the boundary, which it does silently the day someone adds `"use client"` above it or renders it inside a client-side shell. Keep the two apart at the source: `metadata` names *documents* (`generateMetadata()` and nothing else). Anything painted into the page — including a visually-hidden `h1` that happens to say the same words as the page title — is content and belongs in a content namespace, so the server and client renderings of a body can read one key and stay in step.

## The locale config is the single point of control

`LOCALE_CONFIG` in `src/lib/constants/locales.ts` holds everything that varies per locale — English label, native label, flag country, and the locale to render Stripe's own chrome in. `SUPPORTED_LOCALES` beside it is the ordered list, and the config `satisfies` a record keyed by it, so a locale with no config (or a config entry for no locale) fails the build. A unit test pins that the two are in the same order.

**Rule: per-locale data belongs in `LOCALE_CONFIG`, never in a second map keyed by locale.** The Stripe Checkout and Billing Portal routes each used to hand-maintain their own app-locale → Stripe-locale map; a new locale meant remembering both, and forgetting one shipped a page in the wrong language. The Stripe mapping is now a config field (typed as the intersection of Stripe's Checkout and Billing Portal locale enums, so a value only one surface accepts fails to compile), read through the shared helper that falls back to Stripe's `auto` for anything unsupported.

**Rule: Klingon (`tlh`) is always the last entry.** It's a novelty easter egg and never sits among languages a user might actually need. The picker renders `SUPPORTED_LOCALES` in order, and a unit test pins the last entry.

**Rule: locale codes are bare language subtags** (`fr`, not `fr-FR`) — **and a bare code is never renamed.** The bare code is the generic variant of its language and serves every speaker with no closer match; a regional variant is added *beside* it, as lowercase `lang-region` (`/es-mx/` next to `/es/`): one entry in the locale list and one catalog, one column in every translated pathnames entry, and the `hreflang` set, sitemap and robots disallow iterate the list. Nothing is ever redirected or renamed to make room for a region, so a URL that worked keeps working — which is what makes adding one a locale addition rather than a migration. **Nothing may assume a locale segment is two letters**: the prefix matcher and the normalizer test membership in the locale list, never a shape. The header matcher already prefers an exact tag match over a language-subtag one. The tripwire comment lives at the locale list in `src/lib/constants/locales.ts`.

**Open, and smaller than a second English: the bare `en` tag also decides how `Intl` formats.** A bare `en` resolves to US conventions, so every date the app renders for English readers leans American — most visibly in timezone names, which come out as "GMT+3" and "GMT+1" where a Helsinki or UK reader expects "EEST" and "BST" (surfaced by the session-report mail, which always names the product's zone; `fi`, `sv` and `fr` are unaffected because their bare tags already resolve to European conventions). The fix that fits is a *formatting* locale per UI locale — a `LOCALE_CONFIG` field handed to `Intl` and next-intl, `en-GB` for `en` — which changes nothing about the `locale` column, the cookie or URLs and so does not trip the rule above. It is still a site-wide decision about every clock face and date the app shows, not something a single surface should decide for itself, which is why it is recorded here rather than patched where it was noticed.

## Adding a locale

1. Add the code to `SUPPORTED_LOCALES` and its entry to `LOCALE_CONFIG` in `src/lib/constants/locales.ts` — label, native label, flag country, Stripe locale (`"auto"` if Stripe doesn't speak it). Place it **before** `tlh` in both.
2. Register its flag in `src/components/ui/flags.ts` (a named per-country import — never the barrel). `country` is typed against that registry, so an unregistered flag fails the build.
3. Add its loader to the `messageLoaders` map in `messages.ts`.
4. Create `messages/<code>.json` by copying `en.json` and translating every value — including the `metadata` namespace, whose keys are what the page titles, the `hreflang`-annotated descriptions and both social cards render at the new locale.
5. **Give it a column in the pathnames map** (`pathnames.ts`) — a translated slug for each public content route; entries declared as a plain string serve their English segment in every locale and need no edit. The map is checked against the locale list, so a locale added without one fails the build rather than 404ing the public pages. Slugs are lowercase ASCII kebab with diacritics folded, and a translated parent's children are translated with it. Nothing else in the routing config changes: it derives its locales from `SUPPORTED_LOCALES`.
6. **Decide whether it is indexed.** A real language joins `hreflang` and the sitemap by being in the locale list, which both iterate; a novelty locale is excluded from both (as Klingon is) and its pages serve `noindex` from the locale layout. The robots disallow iterates the locale list too and needs no edit either way.
7. **Give it a matching spoken language** — a migration adding the code to the `spoken_language` enum, and its country in the spoken-language → flag map under `components/ui/`. Shipping a UI locale says we serve families who speak that language, so a club has to be offerable in it the same day, and `products.spoken_language_code` can only hold an enum value. **Novelty locales are exempt** (Klingon is an easter egg, not a language a club is delivered in). A unit test asserts this parity — the values reach TypeScript through codegen, so skipping the migration fails the fast suite rather than shipping a dead language option — and the flag map is keyed by the enum, so it fails to compile until it has an entry. This is a parity requirement between the two systems, not a merge: locale and spoken language stay distinct everywhere else, and the requirement runs one way only (a spoken language with no UI locale is perfectly ordinary).

   Two things about that migration are easy to get wrong. **Declaration order is what renders**: every picker and the shop's Language filter row read the values in the order the enum declares them — Finland's two national languages first, then the rest — and no call site sorts, so a new language lands last unless the migration says otherwise with `ALTER TYPE … ADD VALUE 'xx' BEFORE '…'` (or `AFTER '…'`). And **a value added by `ALTER TYPE … ADD VALUE` cannot be used in the same transaction that adds it** — `supabase db push` runs each migration file as one transaction, so a migration must not add the value and then write a row carrying it; that write is a second migration.
8. Decide separately whether the country belongs in `PHONE_COUNTRIES` (`src/lib/constants/phone.ts`). That list is **not** derived from locales and drifts on purpose — US is a phone country with no locale, Klingon a locale with no country.
9. CI translation validation picks the new file up automatically. No changes needed to `request.ts`, `routing.ts`, `types.ts`, `next.config.ts`, the check script, or provider code.
10. Produce the native-speaker review handoff for the new translation — see the
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
3. If it's server-only (email, metadata, cron), add it to the strip list in the `[locale]` layout so it stays out of the client bundle.

## Database

`profiles.locale` is a nullable `text` column; null means "auto-detect from browser." It's persisted via a PATCH endpoint using the admin client; existing profiles RLS covers it. Distinct from `profiles.spoken_languages` (see locale-vs-spoken-language above): `locale` controls the app translation and the language of Sogverse communications; `spoken_languages` is the user's preferred club/product languages for gamer↔gedu matching.

**A gamer a parent creates starts with the parent's stored `locale`.** The copy is part of the gamer-creation RPC, in the same transaction that makes the account a gamer, so the child exists in that locale from its first moment — before the welcome mail reads it. Copied once and never synced; the child changes it with the picker like anyone else. A parent's locale is stored when they register, so there is always a value to copy in practice.

## Known gaps

Client message payload is shipped whole per navigation rather than per-page scoped (could filter namespaces by role/page).
