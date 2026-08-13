# Locale-prefix routing with translated slugs

Move locale into the URL: `[locale]`-segment routing via next-intl's `defineRouting()`,
translated slugs for the public pages, and a localized root OG image. The URL becomes the
authoritative locale per request; the cookie/profile system stays as the redirect hint and
persistence layer.

## Problem

Locale is resolved from cookie → `Accept-Language` → default, with no locale signal in the
URL. Three concrete failures:

- **A link cannot pin a language.** A shared `sogverse.sog.gg/shop` renders in each
  *recipient's* detected locale — marketing cannot send "the French page" to anyone.
- **OG crawlers always see English.** Crawlers send no cookies, so every social embed —
  whatever the audience — gets the default-locale metadata, and the root OG image has
  English text baked into the PNG at build time.
- **No `hreflang`, no per-language sitemap, and the URL never identifies what's on it** for
  non-English viewers — search engines index one language and can't be told the others
  exist.

## Scale

All public surfaces × 5 locales (`en`, `fi`, `sv`, `fr`, `tlh`); every shared link and
social embed the marketing side produces. The platform's audience is Finland-first, so the
default-English crawler/link behaviour hits the majority of the actual audience.

## The decision

- **The whole app moves under `src/app/[locale]/`** — all route groups, pages, layouts,
  `select-profile`, `not-found`, and the root `opengraph-image` (63 pages, 6 layouts at
  time of writing). `api/`, `sitemap.ts`, `robots.ts`, `globals.css` and static icons stay
  at the app root.
- **`localePrefix: "as-needed"`** — English URLs are the bare URLs, identical to today.
  Nothing existing breaks: bookmarks, already-sent email links, indexed pages all keep
  working unchanged. Other locales get a prefix (`/fi/…`, `/sv/…`, `/fr/…`, `/tlh/…`).
- **The URL wins, always.** A prefixed request renders in the prefixed locale regardless of
  cookie, profile, or `Accept-Language`. This is the consensus web pattern (Wikipedia, MDN,
  Apple; Google's international-SEO guidance) and the property that makes links shareable
  and crawlable.
- **Bare paths redirect by today's ladder: `locale` cookie → `Accept-Language` → English**
  (English meaning: stay on the bare URL). The ladder applies to **every page route,
  dashboards included** — a Finnish-cookie user hitting bare `/parent` lands on
  `/fi/parent`; only English URLs are guaranteed byte-identical to today's. **`/api/*` is
  carved out of both the ladder and the intl rewrite entirely** — an API response has no
  locale, and a 307'd `fetch` would break every client-side API call for non-English
  users; API requests flow through the proxy exactly as today. Ordering inside the proxy:
  the ladder runs **first among the routing decisions**, so a bare path becomes its
  prefixed form in one dedicated hop and every later gate (PIN, auth, role) fires on the
  already-localized follow-up request — a locked-PIN Finnish customer requesting bare
  `/parent` gets `/fi/parent`, then `/fi/unlock?redirect=/fi/parent`. The extra hop
  happens only on bare entry; once inside, wrapped links emit prefixed hrefs.
  `profiles.locale` participates through the cookie — the picker keeps the two in sync —
  and the SSR path stays DB-free.
- **Visiting a prefixed URL does NOT persist that locale.** Only an explicit LocalePicker
  action writes the cookie (+ profile when signed in). Following a link is reading;
  touching the picker is choosing. next-intl's own locale cookie is disabled.
- **The picker navigates.** Switching locale persists the choice and re-issues the current
  route under the new prefix with the wrapped router's `replace` (not `push` — back should
  return to the previous page, not the previous language).
- **The locale provider's client-side authority inverts.** Today the provider derives the
  active locale with `profiles.locale` taking priority and runs a reconcile effect that
  rewrites the cookie and refreshes whenever the profile loads. Both contradict "the URL
  wins": a signed-in `fi`-profile user on a shared `/fr/…` link must see FR in the picker,
  and the visit must not rewrite their cookie. The provider becomes a consumer of the URL
  locale (next-intl's context); the profile-priority derivation and the reconcile effect's
  cookie-write-plus-refresh are removed. Persistence flows one way: picker → cookie +
  profile — with **one deliberate exception: signing in (and switching account) writes
  the locale cookie from the signed-in profile's locale**, so on a fresh device the
  post-login navigation to the bare dashboard path lands prefixed via the normal ladder.
  Mechanism per flow — password sign-in is client-side in this repo (browser
  `signInWithPassword` followed by a full-page navigation), so the login form writes the
  cookie client-side from the freshly fetched profile before navigating; the OAuth
  callback and the switch-account route are server-side and set it alongside the cookies
  they already write. The locale cookie is a preference, not a credential — a client-side
  write is fine. The profile read happens in the auth flow, not the per-request SSR path,
  which stays DB-free — and the two server routes already select from `profiles`, so
  `locale` joins an existing select rather than adding a query; only the login form gains
  a fetch, once per device, which is accepted. These three flows are the whole scope:
  registration needs nothing (a new profile is created from the UI locale the person
  registered in, so cookie and profile already agree), and reset-password completion
  changes no locale. `profiles.locale` is nullable (null = "auto-detect"): skip the write
  on null. The login form awaits the fetch before navigating (one indexed row;
  fire-and-forget would race the document unload and lose the write). This preserves
  today's "your language follows you to a new device" without ever overriding a URL.
- **Translated slugs are in scope**, for the public content routes only (see the pathnames
  section below). Dashboard, auth, voice, settings and preview segments keep their English
  segments in every locale — they are app surfaces, not indexable content.
- **The root OG image is localized** — per-locale text pulled from the message catalogs.
  **No new per-route OG images** in this scope (explicitly deferred; Next.js supports a
  per-segment `opengraph-image` whenever that's picked up later).
- **`hreflang` alternates and per-locale sitemap entries** for the public pages. **Klingon
  is excluded from both** — it gets working URLs (`/tlh/…`) like any locale, but an easter
  egg does not belong in search results or alternate-language annotations.
- **Caching / static rendering is out of scope.** No `setRequestLocale`, no
  `generateStaticParams`, CSP untouched, pages stay dynamically rendered. Locale-in-URL
  removes the *cookie* blocker to static rendering, but the per-request-nonce CSP is a
  second, independent blocker (a cached page's inline scripts carry no fresh nonce, so the
  proxy's CSP header would block them) — enabling caching is a separate project with its
  own CSP decision, and nothing in this plan precludes it later.

## Rejected alternatives

- **Prefix only the public routes, keep dashboards on cookie resolution.** Two resolution
  systems in one app, a root-layout split, and the picker behaving differently per surface.
  Rejected: move everything; `as-needed` keeps dashboard URLs unchanged for English anyway.
- **`localePrefix: "always"` (`/en/shop`).** Breaks every existing URL, email link, and
  indexed page for a cosmetic gain. Rejected.
- **Persisting locale from URL visits** (next-intl's middleware default). One click on a
  shared French link would silently rewrite a user's chosen preference. Rejected —
  persistence is picker-only.
- **Letting stored preference override the URL** (redirecting `/fr/…` to `/fi/…` for a
  Finnish-cookie user). The forced-redirect anti-pattern: breaks link sharing outright and
  is what Google's guidance explicitly warns against. If a mismatch nudge is ever wanted,
  it's a non-blocking "switch to Finnish?" banner — out of scope here.
- **Deferring translated slugs to a later phase.** Considered (they're separable);
  owner decided they ship with this work.
- **Bundling cache enablement into this scope.** The payoff is tens of milliseconds of
  TTFB on content pages that do no DB work, and the cost is a permanent second CSP posture.
  Deferred indefinitely; revisit on real signals (traffic spikes, field CWV).

## Constraints discovered while deciding

- **next-intl v4 is already installed** (`^4.9.0`) — `defineRouting`, `createNavigation`,
  and the `requestLocale` request-config API are current-major APIs, no upgrade needed.
- **The proxy is the security-sensitive part.** Every pathname check in `src/proxy.ts` —
  the public-route list, auth-route list, the role-dashboard prefix loop, the PIN-exempt
  list, the home-page check, the `/preview/` gate — must run against the **locale-stripped,
  untranslated internal pathname**. Unstripped, `/fi/admin` sails past the `/admin` role
  gate. With translated slugs the strip alone isn't enough: `/fr/boutique` must normalize
  to `/shop` before matching. This needs its own unit tests, including the bypass cases.
- **The proxy's matcher exclusions stay bare-path-only, and that is fine** — with the OG
  image on a root-level route (see below) and `sitemap.xml`/`robots.txt` already at the
  root, no metadata route lives under `[locale]`, so no locale-prefixed metadata path
  exists to fall through into the proxy.
- **Proxy-issued redirects should carry the request's locale** (an `/fi/…` request that
  bounces to login goes straight to `/fi/kirjaudu`-equivalent), or every bounce costs a
  second redirect hop through the locale middleware. Server routes that 303 to bare paths
  (sign-out, OAuth callback, switch-account) and the `window.location.href` sites may stay
  bare — those are full-page navigations already, and one extra hop there is acceptable.
- **Resolution stays ours, not next-intl's.** Configure the routing with locale detection
  and the locale cookie disabled; implement the bare-path redirect (cookie →
  `Accept-Language` → stay) as a proxy pre-step using the existing helpers in
  `src/lib/constants/locales.ts`. This is what keeps persistence picker-only and the
  ladder identical to today's. The prefixing direction needs route-template matching, not
  string concatenation — bare `/shop/abc` must become `/fi/kauppa/abc` — so the shared
  helper is bidirectional, derived from the pathnames map, matches segment-wise against
  the declared templates, preserves the query string, and redirects with a 307. A path
  matching no template is prefixed anyway (`/fi/nonexistent`), so a Finnish visitor gets
  a Finnish 404 rather than an English one.
- **Accepted SEO tension: the Accept-Language leg redirects bare URLs, so under
  `as-needed` no URL pins English for a non-English-preferring agent** — the header leg
  of the ladder is precisely the auto-redirection Google's guidance frowns at, and a
  crawler sending `Accept-Language: fi` cannot fetch the English canonical. Accepted as
  written: Googlebot overwhelmingly crawls with English or no language preference, the
  `x-default`/`hreflang` set tells crawlers the structure regardless, and the escape
  hatch if it ever measurably matters is skipping the header leg for verified crawler
  user-agents — a follow-up, not part of this plan.
- **`SUPPORTED_LOCALES` stays the single source of truth** — the routing config derives its
  `locales` from it. The pathnames map is keyed by route (with per-locale values inside
  next-intl's required structure), which is the framework's shape, not a violation of the
  "no second map keyed by locale" rule; a locale added to `SUPPORTED_LOCALES` must fail the
  build until the routing config knows it, not silently 404.
- **Slugs are lowercase ASCII kebab** — diacritics folded (`/ecoles`, `/kayttoehdot`), no
  apostrophes. Klingon reuses the English slugs: URLs are infrastructure; the easter egg is
  the content. Slug translations are best-effort like all copy (native review later; the
  Finnish skill applies for `fi`).
- **The wrapped `usePathname` returns the internal pathname without the locale prefix** —
  so pathname-comparing components (the header's dashboard-prefix detection, active-state
  logic) keep working after the import swap. Verify this against next-intl v4 docs during
  implementation before relying on it. That same property makes it **wrong for the
  handful of sites that embed the pathname in a URL** — building `?redirect=`/`?back=`
  values, or a `router.replace` with a query string appended — because on a dynamic route
  the internal pathname is the *template* (`/shop/[id]`), and a redirect param of
  `/shop/[id]` passes the allowlist and then navigates to it literally, with no compile
  error anywhere. Those sites (the product detail page's login redirect, the voice join
  button's back-link, the shop and schools filter hooks) deliberately stay on
  `next/navigation`'s raw `usePathname`/router. The split rule: *comparing* a pathname →
  wrapped; *embedding one in a URL* → raw, with a comment saying why.
- **The `redirect=`/`?next=` params carry the raw external (localized) path** — what was
  actually in the address bar — so a user bounced off `/fi/kauppa` to unlock or log in
  returns to `/fi/kauppa`, not English `/shop`. Normalization to the internal pathname is
  applied wherever a value is *matched against route shapes* — the proxy's security
  checks, and the one consumer beyond the proxy: the post-auth allowlist that gates where
  a login may land (its prefix checks would silently drop `/fi/kauppa/<id>` and strand a
  buyer on their dashboard). The normalizer is pure data derived from the pathnames map,
  so it is importable on both sides. Navigation always uses the raw value; consumers keep
  resolving through `resolveInternalPath()`, which accepts a locale-prefixed internal path
  like any other.
- **All server-built absolute links stay bare**, not just email: the WhatsApp service, the
  Discord bot, and Stripe's `success_url` all build absolute URLs, and each stays on bare
  paths (one middleware hop on click is fine for all of them). Stripe's `success_url`
  additionally embeds the literal `{CHECKOUT_SESSION_ID}` placeholder, which must never be
  routed through a locale-aware path builder. Accepted consequence: the hop re-runs the
  cookie-first ladder, so these flows land in the *stored* locale, not the URL locale the
  user may have been browsing in — a `fi`-cookie user reading `/fr/…` who completes a
  checkout returns to `/fi/…`. That is the stored preference reasserting itself on a bare
  entry, which is the designed behaviour, not a bug. Same acceptance for Stripe's own
  chrome and transactional emails, which resolve from profile/cookie (`/api/*` is outside
  the intl system): the URL governs pages, not money flows or mail.
- **Klingon pages serve `noindex`, not a robots.txt disallow.** `/tlh/…` stays crawlable
  URL-space excluded from sitemap and `hreflang`, which search engines treat as orphaned
  duplicates — so the root layout emits `robots: { index: false }` when the locale is
  `tlh`. (Disallow would be the wrong tool for the same reason documented on the Roblox
  page: a disallowed URL is never fetched, so `noindex` is never read, and the URL can
  still be indexed bare.)
- **`robots.ts` must cover prefixed variants** — its disallow list (`/admin`, `/parent`,
  `/gamer`, `/gedu`, `/settings`) is bare-path-only today, and `/fi/admin` etc. become real
  crawlable URLs.
- **The OG image leaves the file convention and becomes a root-level route handler.** Two
  repo facts kill the obvious "move `opengraph-image.tsx` under `[locale]`" shape: the
  proxy's matcher exclusion means bare `/opengraph-image` would never be rewritten into
  the `[locale]` tree (a 404), while the file convention would emit `/en/opengraph-image`
  in the meta tag (a 308 — a crawler chasing a redirecting OG URL is the failure class
  this plan exists to fix), and file-convention metadata outranks config metadata, so the
  emitted URL cannot be overridden while the file exists. Instead: the image is served by
  a route handler at the app root — outside `[locale]`, reached by its bare URL, excluded
  from the proxy exactly as today, which also preserves the "publicly cacheable responses
  never pass through the proxy" invariant — taking the locale as a validated query
  parameter. The handler serves the same bare `/opengraph-image` path (a directory route
  replacing today's file convention — anything under `/api/` would land it inside the
  proxy matcher; verify Next accepts the reserved name as an ordinary segment, and if it
  collides, a different name means one matcher-exclusion edit), validates the `locale`
  query param before use, and sets its own long immutable `Cache-Control` (the file
  convention's free caching does not carry over — an uncached per-request `ImageResponse`
  is a poor thing to hand crawlers). The three font files the current image fetches from
  GitHub/gstatic at build time are **vendored into the repo** in the same step — a
  request-time fetch to a third party is a failed OG image whenever that third party
  hiccups. Pages emit
  `openGraph.images` (and the twitter image) explicitly from `generateMetadata` with the
  locale-correct URL, alt, and dimensions. Alt and text are localized via the `metadata`
  namespace (that's what lets the literal-string lint suppression go away).
- **Dynamic params are locale-invariant.** A municipality page's `[municipalityName]` slug
  is the same value in every locale's URL; the pre-existing Swedish-exonym question
  (`helsinki`/`helsingfors` both resolving) and its canonical-URL implications are out of
  scope — alternates simply reuse the current params.
- **Blast radius, measured:** 35 files import `next/link`, 9 use `useRouter`, 6
  `usePathname`, 25 import from `next/navigation`, 18 `window.location.href` sites, 33
  files with `generateMetadata`. Note the counts are of *import sites* — the href
  reshaping required by the navigation-typing decision (see the pathnames section) is
  additional to them.
- **Email links need no change** (bare links redirect by the recipient's cookie on click).
  Prefixing emailed links with the recipient's `profiles.locale` is a cheap later
  improvement, out of scope here.

## Pathnames (translated-slug scope)

Translated: the public content routes and their children —

| Internal | fi | sv | fr |
|---|---|---|---|
| `/shop`, `/shop/[id]` | `/kauppa` | `/butik` | `/boutique` |
| `/schools`, `/schools/[slug]` | `/koulut` | `/skolor` | `/ecoles` |
| `/help` | `/ohjeet` | `/hjalp` | `/aide` |
| `/privacy` | `/tietosuoja` | `/integritet` | `/confidentialite` |
| `/terms-and-conditions` | `/kayttoehdot` | `/villkor` | `/conditions-generales` |
| `/anti-bullying-and-discipline` | *(translate)* | *(translate)* | *(translate)* |

The table's non-English values are the author's best effort — the implementer owns final
wording under the normal translation rules. `/docs`, `/roblox` (brand/partner surfaces),
auth routes, and everything behind a login keep English segments in all locales.

Every child segment of a translated parent is declared and translated too (`/shop`'s
`confirmation` child becomes `/kauppa/vahvistus` and so on) — a half-translated URL is a
visible seam, and each child is one more map entry.

**Navigation typing (decided):** the pathnames map declares **every route in the app** —
untranslated routes map to themselves — because next-intl types the wrapped `Link`'s
`href` against the map's keys, and a dynamic route must be passed as
`{ pathname, params }`, never a built string. The `ROUTES` constants module keeps its
role as the single place hrefs are built, with a concrete dual-form convention:

- The **object form is canonical and keeps the existing names** — builders return
  `{ pathname, params }`, and builders that today bake a query string into their return
  value carry it as the href object's separate `query` field instead.
- **String variants get a `Path` suffix** and exist only where a string is genuinely
  needed; the current string consumers (the proxy's matching, the role-dashboard map,
  `window.location` sites, analytics) migrate to those.
- **The Stripe success-URL builder stays string-only forever** — it embeds Stripe's
  literal `{CHECKOUT_SESSION_ID}` placeholder and must never pass through a path builder.
- **Hash targets** (`/#yty`-style anchors) don't fit the typed href shape and are handled
  at their call sites, like the preview-scene href helper's template strings.

This is deliberate: the compiler then catches every missed call site in the sweep, and
adding a locale stays a one-map edit.

## Steps

1. **Routing module.** `src/i18n/routing.ts`: `defineRouting()` with `locales` derived
   from `SUPPORTED_LOCALES`, `defaultLocale` from the shared default-locale constant,
   `localePrefix: "as-needed"`, detection and locale cookie disabled, alternate-links
   header disabled (metadata owns `hreflang`), and the pathnames map above.
   `src/i18n/navigation.ts`: `createNavigation(routing)` exporting the wrapped `Link`,
   `redirect`, `usePathname`, `useRouter`, `getPathname`.
2. **File move.** Everything except `api/`, `sitemap.ts`, `robots.ts`, `globals.css` and
   icons moves under `src/app/[locale]/`. The root layout (html/body, providers, the
   server-only namespace strip) becomes the `[locale]` layout taking `params.locale` and
   setting `<html lang>`; add the minimal root not-found handling per next-intl's recipe.
   The existing translated not-found page moves under `[locale]` with everything else; the
   root-level fallback (which catches paths matching no locale, like `/xx/whatever`)
   renders in the default locale. A stub root layout (pass-through children) stays at the
   app root to own the fallback document; Next 16 also ships a `global-not-found`
   convention — follow whichever shape the installed next-intl documents for this Next
   version.
3. **Request config.** `src/i18n/request.ts` derives locale from `requestLocale`
   (validated with `isSupportedLocale`), keeping cookie/header as the fallback for
   contexts with no URL locale.
4. **Proxy rework** (the careful step — see constraints): a shared "strip prefix +
   untranslate slug" normalizer used by every check; the bare-path locale redirect;
   compose next-intl's middleware for the rewrite; locale-aware redirect targets; CSP +
   Supabase cookie handling preserved on every response shape (pass-through, rewrite,
   redirect). `/api/*` bypasses both the ladder and the intl rewrite (see the decision
   section). Ordering: run the bare-path redirect *after* the claims/refresh step but
   *before* the PIN/auth/role gates (so every gate fires on an already-localized
   request), issue it through the existing cookie-preserving redirect helper, so
   refreshed auth cookies are never dropped; and invoke the intl middleware with the
   nonce-stamped
   request (re-applying the CSP header to its response) — otherwise production pages
   render with a nonce the SSR pipeline never saw and `strict-dynamic` blocks every
   script, a total outage only the smoke suite would catch. Whether next-intl's rewrite
   response forwards the mutated request headers is a property of its implementation:
   **verify it first**, and if composition drops the header, hand-roll the rewrite in the
   proxy instead of composing `createMiddleware`.
5. **Navigation sweep.** Reshape the `ROUTES` builders to return `{ pathname, params }`
   href objects (see the navigation-typing decision), then swap `next/link` /
   `next/navigation` imports for the wrapped ones across the counted call sites — the
   typed `href` surfaces every site the reshaping missed as a compile error.
   `window.location.href` sites and server 303s stay bare deliberately, and the
   pathname-as-URL sites stay on raw `next/navigation` (see the `usePathname`
   constraint).
6. **LocalePicker + sign-in sync.** Picker: on change, persist (cookie + profile, as
   today), then navigate with the wrapped router —
   `router.replace({ pathname, params, query }, { locale })`, where `pathname` is the
   wrapped `usePathname`'s value (the internal template on dynamic routes), `params`
   comes from `useParams()` (omitting it would navigate to a literal `/shop/[id]`), and
   `query` carries `useSearchParams()` — dropping it would strand a language switch on
   `/shop?category=camps` or a `?session_id=` confirmation page. Preserve any hash at the
   call site.
   Sign-in: per the mechanism in the decision section — client-side cookie write in the
   login form, server-side in the OAuth callback and switch-account routes.
7. **OG image.** Becomes a root-level route handler taking a validated `locale` query
   param (see the OG constraint for why the file convention doesn't survive the move),
   rendering its text and alt from the `metadata` namespace via `getTranslations` — new
   keys in all five catalogs (Klingon: have fun). The `[locale]` layout's
   `generateMetadata` emits `openGraph.images` and the twitter image explicitly with the
   locale-correct URL and dimensions. The build-time-baked English strings and their lint
   suppression go away.
8. **Metadata alternates.** Alternates are **per-page, never layout-level** — a layout
   cannot compute a self-referencing canonical (it has no pathname), and Next's metadata
   merge would cascade one layout-level canonical onto all 63 pages. A shared helper
   builds the `alternates` object (languages via `getPathname` — every locale except
   `tlh`, plus `x-default` → the bare URL — and a self-referencing canonical) from a
   page's pathnames key + locale; each page in scope calls it from its own
   `generateMetadata`, adding one where missing (the home page exports no metadata
   today). In scope: the static indexable pages — home, `/shop`, `/schools`, `/help`,
   `/privacy`, `/terms-and-conditions`, `/anti-bullying-and-discipline`, `/login`,
   `/register`. (`/help` and `/schools` emit alternates even though today's sitemap
   omits them — indexable is the bar, sitemap membership is not.) Note Next merges
   metadata shallowly: a page declaring its own `openGraph` (login and register both do)
   replaces the parent's object and loses the layout-emitted image, so the shared helper
   re-emits `openGraph.images` for pages that override `openGraph`. Excluded: noindex
   pages (`/roblox`, the API docs page) — no alternates on a page telling crawlers to
   leave — and dynamic detail pages (`/shop/[id]`, the municipality pages): the shop
   detail page is a client component that cannot export `generateMetadata`, and
   converting it is real work that belongs to the SEO-metadata item in `TODO.md`, not
   this plan.
9. **Sitemap + robots.** Sitemap: keep the current route set (which includes `/login` and
   `/register` — they're indexable), per-locale entries with `alternates.languages`, `tlh`
   excluded, slugs from the pathnames map (never hand-built). Index pages only — no
   DB-backed per-product/per-municipality entries in this scope. Robots: extend the
   disallow list to cover locale-prefixed variants of the gated prefixes.
10. **Tests.** The proxy's tests are **integration** tests (per `tests/CLAUDE.md`, where
    the existing proxy suite lives) — cover the normalizer and proxy decisions there: at
    minimum, prefixed dashboard paths still role-gate (`/fi/admin` as a gamer redirects
    out), translated slugs resolve to public routes, bare-path redirect follows cookie →
    header → stay, prefixed visit writes no cookie. The global `next/navigation` mock in
    the jsdom test setup needs a parallel mock for the wrapped navigation module
    (`@/i18n/navigation`), or every component test that renders a link breaks. The
    integration suite's filesystem drift guard walks the `(public)` directory to assert
    every public page is reachable unauthenticated — re-point it to the moved directory,
    special-case the `[locale]` segment (assert bare and under one real prefix;
    substituting a sample value there would test a nonexistent locale), and resolve each
    walked page through the pathnames map to its **external** per-locale URL — the
    filesystem yields internal segments (`shop`), and asserting `/fi/shop` would
    green-light a path no user ever hits. The setup mock must also export `useParams`
    (the picker's new replace call reads it). Update any tests asserting unprefixed
    paths.
11. **Docs.** Rewrite the locale-resolution section of `src/i18n/CLAUDE.md` (URL first;
    bare-path ladder; picker-only persistence; the pathnames map as part of "adding a
    locale"), note the slug-translation step in the adding-a-locale checklist, and check
    `src/components/layout/` docs for pathname assumptions. Delete this plan file.

## Acceptance criteria

- `/fr/boutique` renders French for a visitor with a Finnish cookie and Swedish
  `Accept-Language`, and their cookie is unchanged afterwards.
- Bare `/shop`: Finnish cookie → redirected to `/fi/kauppa`; no cookie + Swedish
  `Accept-Language` → `/sv/butik`; neither → stays `/shop` in English. English URLs are
  byte-identical to today's.
- The picker on any `/fr/…` page shows FR — including for a signed-in user whose profile
  says FI — and switching to FI lands on the `/fi/…` translated equivalent via
  history-replace and persists cookie + profile.
- Signing in on a cookie-less device with `profiles.locale = "fi"` lands on `/fi/parent`
  (the sign-in cookie sync feeding the bare-path ladder).
- `/fi/admin` as a non-admin redirects to that role's dashboard; `/fi/parent` as a gamer
  likewise — the role gate holds under every prefix and translated slug.
- Scraping `/fi/kauppa` (no cookies) yields the Finnish OG image and Finnish metadata;
  scraping `/shop` yields English.
- Public pages emit `hreflang` alternates (en/fi/sv/fr + x-default, no tlh); the sitemap
  lists per-locale URLs with alternates, no tlh; `/tlh/…` pages serve `noindex`;
  `/fi/admin` and friends are covered by the robots disallow list.
- English pages emit the bare (non-redirecting) OG image URL; a bounced user returns to
  the localized URL they were on (`/fi/kauppa` → unlock → `/fi/kauppa`).
- `npm run lint`, `npm run type-check`, `npm run test` green; translation-completeness CI
  green (new OG/metadata keys in all five catalogs); smoke suite green on the built app.
