# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server
npm run dev:stripe       # Start dev server + Stripe webhook listener
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript check (tsc --noEmit)
npm run test             # Vitest unit tests
npm run test:ui          # Vitest with UI
npm run test:e2e         # Playwright E2E tests
npm run test:e2e:ui      # Playwright with UI
```

## Architecture

### Tech Stack
- **Next.js 16** (App Router) with React 19 and TypeScript
- **Supabase** for PostgreSQL database and authentication
- **React Query** for server state management
- **Tailwind CSS 4** with class-variance-authority for component variants
- **Stripe** for payments
- **Brevo** (formerly Sendinblue) for transactional email via SMTP (configured in Supabase dashboard)
- **Daily.co** for real-time voice/video chat
- **Vitest** + **Playwright** for testing

### Role-Based Access Control (RBAC)
Four user roles with separate dashboards:
- `admin` → `/admin` - System management
- `customer` → `/parent` - Parents who purchase products and manage linked gamers (the role identifier is `customer`; the URL is `/parent`)
- `gamer` → `/gamer` - Child accounts (email-first like every role; email is a synthetic `<token>@gamer.sogverse.internal` address; login is via account-switch from the parent, not a typed credential)
- `gedu` → `/gedu` - Game educators (self-register at `/register-gedu`; an account is unverified until an admin approves it — verification gates only group assignment, not platform access. See `src/services/gedu/`)

Proxy (`src/proxy.ts`) refreshes Supabase auth sessions, enforces role-based routing, and sets a per-request nonce-based Content Security Policy (Next.js 16 uses `proxy.ts` instead of `middleware.ts`). RLS policies protect data at the database level.

**Rule: user-facing copy calls a role's dashboard "My SOG" — "dashboard" is internal vocabulary.** The role dashboards (`/parent`, `/gamer`, `/gedu`) are named "My SOG" to the people using them, in page titles, back links, buttons and emails alike. "Dashboard" is what we call them among ourselves and in the code; a translated string that says it has leaked an implementation word into the product. The brand name itself stays "My SOG" rather than being translated wholesale — locales localise the surrounding words and the possessive, not the mark. The one exception is the **admin** dashboard, which is genuinely an admin panel and is called one: admin sidebar entries and admin page titles keep saying "Dashboard".

### Key Conventions
- App routes are grouped: `(auth)`, `(dashboard)`, `(public)`, plus `api/`
- Components are organized by role: `components/[role]/`, shared UI in `components/ui/`
- Supabase clients: `lib/supabase/` — `client.ts` (browser), `server.ts` (RSC), `admin.ts` (privileged)
- Auto-generated types in `types/database.types.ts`, convenience aliases in `types/index.ts`

### Service Layer Pattern
Each feature in `src/services/` follows a two-to-three-file pattern:
- `*.service.ts` — Class that takes a `SupabaseClient<Database>` in the constructor. Read methods use the injected client (`.from()` queries, `.rpc()` calls). Write methods that need server-side secrets (Stripe, Daily.co, admin client) use `fetch()` to call API routes instead — the injected client is unused by those methods, and this is intentional.
- `*.queries.ts` — React Query hooks. Each hook calls `getClient()`, instantiates the service, and returns `useQuery`/`useMutation`. Exports a `*Keys` factory object for cache key hierarchy (e.g., `groupKeys.all`, `groupKeys.byProduct(id)`).
- `*.contracts.ts` — zod schemas for the feature's wire shapes, shared by both ends: the API route parses its request body with the body schema (`parseJsonBody` / `parseBodyValue` from `src/lib/api/json-body.server.ts`), and the service parses the route's response with the response schema (`parseJsonResponse` / `readErrorMessage` from `src/lib/api/json-response.ts`). Json-returning RPC result schemas live here too. Derive enum values from the generated `Constants` object (`z.enum(Constants.public.Enums.…)`) or the `SUPPORTED_*` tuples so schemas follow codegen. The compiler checks each parse output at its use site (`.insert(parsed)` against the generated Insert type; a service method's return type against the schema), and the db tests parse real RPC output through these schemas in CI — but only for shapes a db test actually exercises, so add db coverage whenever you add an RPC-result schema.

**Rule: Mutations must invalidate related queries in `onSuccess`.** Use the key hierarchy so invalidating a parent key (e.g., `groupKeys.all`) cascades to children.

### Supabase Clients
- `createBrowserClient()` - Browser-side, singleton pattern. Used for data queries and auth operations (sign in, sign up, sign out).
- `createServerComponentClient()` - Server components (RSC)
- `createAdminClient()` - Service role key for privileged operations

### Auth Architecture
Proxy (`src/proxy.ts`) refreshes tokens server-side on every request and enforces role-based routing. The browser client also auto-refreshes tokens — standard `@supabase/ssr` dual-refresh model.

**Rule: After any auth state change (sign-in, sign-out, account switch), the browser must do a full-page navigation — `window.location.href`, a form POST that the server answers with a redirect, or any other nav that unloads the document. `router.push()` is not enough.** The browser Supabase client keeps its session in an in-memory singleton seeded from cookies at construction time. Cookies changed by a server response (the `/api/auth/signout` route, OAuth callback, `/api/auth/switch-account`, password reset completion) don't fire `onAuthStateChange`, so the singleton stays stale until the document reloads. A soft navigation leaves the stale singleton in place and the UI keeps thinking the user is signed in (or signed in as the wrong person). This is downstream of mutating auth on the server (POST routes, for CSRF safety): a client-side `supabase.auth.signOut()` would fire `onAuthStateChange` and let a `router.refresh()` suffice, but our routes change cookies the browser client never sees, so only a document reload rebuilds it.

The canonical sign-out shape is an HTML `<form method="post" action="/api/auth/signout">` — the route calls `supabase.auth.signOut()` server-side and returns a 303, the browser follows it as a full-page GET. No client-side fetch, no React state transition on the outgoing page, no intermediate "sidebar gone but still on dashboard" frame.

**Rule: Never make Supabase data queries inside `onAuthStateChange` callbacks.** Only do synchronous React state updates in the callback.

### Redirects & open-redirect safety

**Rule: Any caller-supplied redirect target (a `?redirect=`/`?next=`/`?back=` param, or anything else deciding where to navigate) must be resolved through `resolveInternalPath()` (`src/lib/navigation/internal-path.ts`) before navigating. Never hand-roll the check.** String matching like `startsWith("/")` + `!startsWith("//")` always loses to a variant you didn't think of (`/\evil.com`, `https:/evil.com`, a stripped leading tab) — an open redirect off a logged-in page is a clean phishing vector. `resolveInternalPath` resolves against a sentinel origin with the URL parser and rejects anything that escapes it, covering every variant at once.

**Rule: Any absolute URL built from an incoming request (especially links placed in emails) must derive its origin from `getOrigin(request)` (`src/lib/url.ts`) — never from `new URL(request.url).origin` or the raw `Host` header.** The browser-supplied `Host` is attacker-controllable on our deployment (Vercel forwards it into `request.url`), and an emailed link is the worst place for a wrong origin: the recipient trusts it and it carries a credential/session token, so a spoofed origin turns it into a phishing/account-takeover vector. `getOrigin` honours `Host` only when it matches a trusted source and otherwise falls back to the canonical `NEXT_PUBLIC_SITE_URL`. Pairs with the `resolveInternalPath` rule above — one governs relative redirect targets, the other absolute origins.

### Content Security Policy (CSP)

CSP is generated per-request in `src/proxy.ts` with a unique nonce (`crypto.randomUUID()`). In production, `script-src` uses `'nonce-{random}' 'strict-dynamic'` — only scripts tagged by Next.js's SSR pipeline execute. In development, it falls back to `'unsafe-inline' 'unsafe-eval'` for HMR compatibility. Static security headers (X-Frame-Options, HSTS, etc.) remain in `next.config.ts`.

**Rule: Never add inline `<script>` tags directly.** The nonce-based CSP blocks any inline script without the per-request nonce. Use Next.js `<Script>` component or ensure scripts go through the SSR pipeline. If you must add an inline script, read the nonce from the `x-nonce` request header in a server component.

### Layout & Scrolling

**Rule: Once a clickable or readable element is on screen, it must not move unless the user does something.** The promise is about *rendered* content — text the user is reading, buttons/links/inputs they're about to click. If something is already painted, no in-place shift may happen without a user interaction triggering it. Shifts make the UI feel janky and — worse — cause fast users to mis-click when buttons move out from under their cursor.

A skeleton with no rendered text or interactions (just animated placeholders) doesn't constrain anything — when the body renders, no element is "moving," the body simply appears for the first time. The rule kicks in *the moment* a real button/link/text is on the page; from there, no reflows around it without user input.

**Corollary: render what you safely can as early as possible.** If a piece of content doesn't depend on a network call — page chrome, hardcoded copy, headers, breadcrumbs, navigation, anything bundled with the route — render it in the loading state too. The user sees more of the page sooner, and they can start reading or clicking it before the data lands. The constraint is just that anything you render early must land in its final position: if data arriving will push it around, leave it for later (or pre-reserve its spot). The trap to avoid is "render as much as possible and figure out the layout later" — that's what produces the jank this rule exists to stop.

**Rule: Parent and gamer surfaces are designed mobile-first; gedu and admin surfaces are designed desktop-default.** Families meet the product on a phone between other things, so their pages are laid out for a narrow viewport first and widen from there. Gedus and admins work at a desk — a gedu is prepping a session or writing one up on a laptop, an admin is managing the platform on a monitor — so their pages assume a wide landscape viewport (roughly 16:9 to 16:10) and are allowed to *use* that width: a wider container, two- or three-column arrangements, a reference column beside the main one, tables that stay tables. Mobile on those surfaces is supported and must not break, but it is the secondary layout, and collapsing to a single stack is an acceptable answer there. This is a deliberate site-wide split, not a per-page judgment call — don't build a gedu or admin page that wastes two thirds of the screen because the phone layout came first, and don't push a desktop-shaped grid onto a parent or gamer page.

**Corollary: content revealed *above* what the reader is looking at must be paid for out of the scroll position, not out of their place on the page.** Some reveals genuinely have to insert above — a feed in date order cannot put tomorrow below today — and inserting there pushes everything already painted down the viewport. The fix is to measure a chosen anchor's viewport position before the state change (in the event handler, while the old layout is still up) and correct `window.scrollY` by however far it moved, in a layout effect, before the browser paints. Two things follow from that: **do not animate the geometry of such a reveal** — a correction fighting a transition has to re-run every frame and is the fragile half of the pattern, so an upward reveal is instant — and **a page cannot scroll above its own top**, so a collapse near the top of the document will not have the scroll to give back; the remainder is a real shift, and the right move is to name it rather than pretend it did not happen.

Layout changes on the same page *after* user interaction (clicking a button that reveals more content) are more acceptable but still not ideal — prefer an animated transition over a jump when you do need to reflow. Navigating to a new page is fine; this rule is about in-place shifts. If you're unsure how to reconcile the design with this rule, or hit a genuine edge case (e.g. a countdown timer that must update continuously — `tabular-nums` keeps digit columns from reflowing), check in with me. One reasonable escape hatch for unavoidable reflow is to place clickable elements somewhere the shifting region won't push them.

### Loading & Disabled State

**Rule: A button must not visually re-enable between the click and the action actually finishing.** A click promises one outcome; the disabled/loading state has to persist all the way through to it — across any redirect, route transition, or panel/view swap that the success path triggers. React Query's `mutation.isPending` is not enough on its own: it flips false the moment React Query dispatches the success state, but `onSuccess` runs after that and any navigation/view-swap is later still — so the button briefly re-enables and a fast user can fire the action twice.

The pattern that works: hold a local `committing` boolean, flip it true *synchronously before* `mutate()` runs, and only clear it on outcomes where the user needs to retry (a `'full'` race, a thrown error). On outcomes where the page unloads (`window.location.href = …`) or the panel swaps to a different view (a query refetch flips the visible component), leave the flag set — the unmount/swap takes care of the rest. OR `committing` into the button's `disabled` and use it (not `isPending`) for the spinner. For internal Next.js route transitions, `useTransition`'s `isPending` follows the same shape and can be ORed in alongside.

Setting the flag *inside* `onSuccess` (or via a hook that does so) is too late and does not close the gap. The flag has to be live before any render after the click.

**Rule: A loading skeleton stays invisible for its first ~250ms.** Skeletons are the right pattern for loads that genuinely take time — but most loads here resolve in well under 250ms (warm React Query cache, small scoped queries), and a skeleton that lives for a few frames reads as an ugly grey flash, not a loading state. Gate the skeleton's *visibility* (not its mount) on `useRevealAfter()` (`src/hooks/use-reveal-after.ts` — the delay is its default; don't pass a literal), inside a container that already has its final size per the layout rule: a fast load then shows calm nothing in a correctly-sized box, and a slow one still gets its skeleton. Pair the reveal with a ~200ms opacity fade so a load finishing just past the threshold sees a faint shimmer rather than a hard flash, and prefer structured ghosts (bars where rows will be) over one solid block when the skeleton does show.

### Date & Time Formatting

**Rule: Pick the right tool for the date/time operation, and never use UTC as a stand-in for someone's local date.**

- **Display formatting.** `Intl` APIs and `next-intl` formatters. Shared helpers (`formatDate`, `formatTime`, `formatCurrency*`) live in `src/lib/utils.ts`. For relative time, `useFormatter().relativeTime()` from `next-intl`. The locale always comes from `useLocale()` (client) or `getLocale()` (server).
- **Local-date strings** (calendar keys, "today" markers, anything `YYYY-MM-DD`-shaped that means *today in someone's zone*). Use `formatInTimeZone(new Date(), tz, "yyyy-MM-dd")` from `date-fns-tz`. Pick the timezone deliberately: usually the entity's zone (e.g. `product.timezone`) for entity-local rendering, or the viewer's local zone (no explicit `timeZone`) for personal data. Never both implicitly.
- **Zone-to-zone conversion.** `fromZonedTime` / `toZonedTime` from `date-fns-tz` (already a project dep — see `src/lib/utils.ts`, `effective-status.ts`).
- **Anti-pattern: never write `new Date().toISOString().slice(0, 10)`.** That's the date in UTC, not anyone's local date — for any non-UTC viewer it's off-by-one near midnight and silently wrong everywhere else without anyone noticing. If you find yourself reaching for it, you want `formatInTimeZone` with an explicit zone instead.

**Rule: Anything with a time of day renders in the *viewer's* timezone — never the runtime default, never the source/product zone.** A true instant (a timestamptz column) or a date+time (a session, an event, a recurring slot) is shown in the viewer's IANA zone — resolved from the viewer's profile/settings, paired with a request-stable "now" so SSR and the first client render agree. Make the viewer zone a required argument of the shared date/time formatters so a call can't silently fall back to the runtime default; a genuinely zoneless date goes through the date-only path instead. When the displayed zone differs from the source (products are authored in `Europe/Helsinki`), surface the viewer's short tz abbrev next to the time so the adjustment is visible — the abbrev is already locale-formatted by `Intl`, so it is not a translated string. A recurring wall-clock slot can't be converted without a concrete date (the offset is DST-dependent): resolve one (the next occurrence of that weekday), turn it into an absolute instant, then derive the weekday + clock face and **re-group in viewer space** — a Helsinki Mon/Wed pair can shift to different viewer weekdays. Compute end times by adding the duration to the *instant* and re-formatting — never string-add the viewer-local start, or a DST transition inside the session corrupts it.

**Rule: A pure calendar date with no time of day stays UTC-pinned — do not give it the viewer's zone.** A camp's start/end date range, a club term date, a legal "last updated" date — these are zoneless; parse the bare date at UTC midnight and render in UTC, because re-anchoring it to a viewer's zone shifts it off-by-one. Rule of thumb: **a value with a clock face converts; a bare date does not.** (An event's date *does* shift when it carries a slot time — that's a date+time instant; an event with no time stays date-only.)

### Locale vs. Spoken Language

**Rule: Use *locale* for the UI translation system and *spoken language* for human languages.** They are deliberately named differently because they are distinct concepts.

- **Locale** — which translation of the web app the user sees. Owned by `src/lib/constants/locales.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LocaleProvider`, `LocalePicker`), backed by `profiles.locale`. This is what next-intl's `useLocale()` returns.
- **Spoken language** — the human languages a user speaks / a club is delivered in. Owned by the `spoken_languages` reference table and `profiles.spoken_languages` array. UI lives in `src/components/ui/spoken-language-checkboxes.tsx` and `useSpokenLanguages()`.

A Finnish-speaking parent could have `locale = "fi"` (app in Finnish) and `spoken_languages = ["en"]` (wants their child placed in English clubs). Don't conflate them.

**Rule: User-facing strings must be translated for every locale message file in `messages/`. Never leave placeholder copy or skip a locale. Best-effort translation is expected. Klingon (`tlh`) is an easter egg — fun and quirky takes are welcome, accuracy is not the goal there.**

**Rule: No emoji in `messages/` files** — they're untranslatable copy that can't be themed or recolored. When a string needs a glyph (warning triangle, checkmark, arrow), render a `lucide-react` icon next to the translated text in the component instead.

### Styling
- Dark mode is default (class-based via next-themes)

**Rule: Never use hardcoded colors or raw Tailwind color classes (e.g. `text-sky-400`, `bg-red-500`).** All colors must come from CSS custom properties defined in `src/app/globals.css` and referenced via semantic Tailwind classes (`text-primary`, `bg-destructive`, etc.). For non-CSS contexts (email templates, canvas), use the hex constants in `src/lib/constants/colors.ts`. This ensures a single source of truth for colors and brand identity.

### Authored rich text

Some user-authored fields are stored as **markdown** rather than plain text, because markdown is the one format that renders in-app *and* converts cleanly into the email the same content is later sent as. Three rules govern it:

**Rule: markdown is rendered through the shared `Markdown` component (`src/components/ui/markdown.tsx`), never by converting it to an HTML string.** There is no `dangerouslySetInnerHTML` anywhere in `src/`, and adding one behind a field any user can type into is how a stored-XSS hole ships. The renderer produces React elements, refuses raw HTML in the source, and takes an **allow-list** of elements — anything outside it is unwrapped to its text rather than dropped, so an unsupported construct shows its words instead of silently deleting a paragraph of somebody's writing.

**Rule: the rendered subset and the editor's toolbar are the same subset.** Whatever the writer can produce is exactly what the reader can see styled — no more (an editor button whose output the renderer strips is a trap) and no less (a construct that renders but cannot be typed can only arrive by paste and will surprise whoever edits the field next). Widening one means widening the other in the same change. Levels of the same construct have to stay *visually* distinguishable in the rendered output too: three heading buttons that produce two visible sizes is a choice the writer cannot see themselves making.

**Rule: only the editor may be loaded on demand — the renderer is always in the page bundle.** They look like the same kind of dependency and are not. A rich editor is a large one (a document model, a parser and a serialiser) that the overwhelmingly common visit never opens, so splitting it out is a real saving and its placeholder can hold the exact box the editor will fill. A markdown *renderer* is small and every visit reads the field, so deferring it buys nothing and costs the thing that matters most: the body appears after the page around it, and any affordance that depends on it (an expand control, a clamp's fade) lands later still, shoving everything below down as it arrives. **Anything a reader's first paint depends on must be decidable without the browser, and must then stay decided** — a server cannot measure text, so a control gated on a measured height cannot exist in server HTML. Decide it from the source with arithmetic both ends run identically, and let no post-mount measurement revise it. Seeding from the source and correcting from a measurement is the tempting middle ground and is worse than either end: it puts the affordance on screen a hydration after the text it belongs to, on exactly the borderline content where the reader is least likely to expect the page to move. An estimate that is occasionally a line eager or a line late is the price, and it is the right one — pick the arithmetic so both kinds of error are small and local, and write down the tolerance you accepted next to it.

**Rule: markdown is edited as rich text, not as syntax.** The people writing these fields are not writing documentation; asking them to remember what `##` does is how a formatting feature ends up unused. The stored value stays markdown either way — the syntax is an implementation detail of the column, not something a writer should ever meet. The editor (`src/components/ui/rich-text-editor.tsx`) is headless and styled with semantic tokens like everything else, is loaded on demand, and is only instantiated once a field is actually opened: a page holding many collapsed editors must not construct one per field.

### UI Component Reference
A living style guide is available at `/admin/ui-components` (admin login required). It shows every component variant, composite patterns, and the color palette. **Reference this page before creating new UI patterns.** The source at `src/app/(dashboard)/admin/ui-components/page.tsx` serves as copy-paste examples.

**What the page is for (two functions):**
1. **Fast UI iteration.** It renders components with hand-built mock data, so you can see and tweak a component without manually recreating its state through the normal app flow (no logging in as the right role, seeding a DB row, joining a live call, etc.). Demos feed fixtures directly — including a full mock context where a component reads one (e.g. the voice room renders inside a fixture `VoiceRoomContext.Provider`).
2. **A separation-of-concerns check.** It's a UI-only surface, so a component that's cleanly demoable here is one whose business logic lives elsewhere (in a provider/hook/service) and that just consumes data + actions. If a component is *painful* to demo — needs real network calls, can't be driven by fixtures — that difficulty is the smell signal that UI and business logic are too coupled; fix the coupling rather than forcing the demo.

**When to add a demo here:** when you build or substantially restyle a reusable component or composite pattern, add (or update) its demo so the next person can iterate on it in isolation. **When not to:** one-off page-specific layouts, or anything that can't render without live side effects — if you can't construct a plausible fixture for it, treat that as a design smell first, not a reason to wire real logic into the page.

**Rule: a fixture id that feeds an identicon-style avatar must be a real, generated UUID, hardcoded as a literal.** The identicon is a pattern derived from the id's hex bytes, so a readable stand-in like `"mock-gamer-aino"` doesn't render a different-looking avatar — it renders a degenerate one (the non-hex characters parse to nothing, and the grid collapses), which quietly makes every avatar-bearing demo a false picture of the real thing. Generate the UUIDs once (`node -e "console.log(crypto.randomUUID())"`) and paste them in; **never** call a UUID generator at module load or render time, because the same person would then get a different face on every reload, which destroys the stability a fixture exists to provide and makes screenshots unreproducible. Where a spec or scenario needs to refer to a fixture person, give the ids a named map so the readable name lives in the key and the UUID stays the value.

### Full-page preview scenes

The style guide demos components; a *page-level* change has to be judged as a page — real chrome, real viewport, real scrolling. That's what a **preview scene** is: one fixture-driven page at `/preview/{surface}/{scenario}`, served by a single dynamic route from a central scene registry (`src/components/preview/`), admin-gated in the proxy, noindex, and listed automatically on the admin **UI Previews** page (its own sidebar entry, directly below UI Components). Scenes make page-level iteration cheap: sign the design off from fixtures first, wire it once afterwards.

**Rule: the registry is the only place a scene is declared.** The UI Previews page enumerates it, so adding a scene or a scenario surfaces its links with no edit to that page and no hand-maintained index anywhere. Scene titles, descriptions and scenario labels are literal English on purpose: they are developer-facing metadata on an admin-only page, never shown to a user, so they do not belong in the message files.

**Rule: a scene never owns a layout — one body, two shells.** It renders the same presentational page body the live route renders: either the *live* body (a showcase that cannot drift) or the *draft* body that is going to replace it. Promotion means the draft body becomes the route's body and the data shell swaps fixtures for service calls; the layout does not change in that step. A scene that becomes a permanent third fork of a page is the rot this rule exists to prevent.

**Rule: chrome is composed, never simulated,** and never inherited by accident — each scene names the shell it wants and gets the real components (a dashboard scene renders the header plus the dashboard layout with no sidebar). **Rule: a scene mocks the whole page as the role meets it** — every section present, with backend-touching actions inert but rendering their real states, and pure-UI interactions working against local state. Faking or omitting a section because it's awkward to feed is the same separation-of-concerns smell the style guide exists to catch: fix the coupling (give the section a presentational core that takes rows/props), don't fake the section.

### Customer Enrollment & Billing

See `docs/products-architecture.md` for the purchase / participation flow, the billing model (monthly family subscriptions for clubs, single upfront payments for camps/events), and refund windows.

### Voice Chat (Daily.co)

The full voice architecture auto-loads from colocated `CLAUDE.md` files when you work under `src/components/voice/` (scheduled group rooms) and `src/components/voice/instant/` (instant rooms). The 9-approach Web Audio investigation behind the volume workaround remains in `docs/chrome-webrtc-volume-bug.md` as history.

**Rule: Realtime hooks must only invalidate queries — never make Supabase data queries in callbacks.** Same deadlock risk as `onAuthStateChange`.

### Documentation

System architecture lives in **colocated `CLAUDE.md` files** next to the code they describe. They auto-load when you (or a future session) work in that directory — no pointer needed here — and are owned like code: update them in the same change that touches their system. Current homes:

| System | Location |
|---|---|
| Layout & scrolling | `src/components/layout/` |
| Billing portal | `src/services/billing/` |
| Parent PIN | `src/services/pin/` |
| i18n | `src/i18n/` |
| Email templates | `src/lib/email-templates/` |
| Locations | `src/services/locations/` |
| WhatsApp | `src/services/whatsapp/` |
| Voice — scheduled group rooms | `src/components/voice/` |
| Voice — instant rooms | `src/components/voice/instant/` |
| Discord bot | `src/app/api/discord/` |
| Database / migrations | `supabase/` |
| Testing conventions | `tests/` |

- `docs/` holds the docs a human deliberately maintains and that don't map to one directory: cross-cutting architecture spanning many systems (products, db-authorization, performance), point-in-time records (security audit, bug/fix write-ups, gap analyses), and ops runbooks (slack, admin quota, stripe testing). When a topic is in neither a colocated `CLAUDE.md` nor `docs/`, treat the code as the source of truth.
- `docs/plans/` holds decided, ready-to-build implementation plans, each self-contained enough for a fresh session to execute without prior context. A plan is **deleted** when its work lands — a file sitting there means the work is still open. See its own `CLAUDE.md`.
- `TODO.md` is the running list of cross-cutting work we know we want to come back to. Distinct from `docs/`. **When an item is fully done with nothing left to discuss, delete it — don't check it off (`[x]`).** `TODO.md` tracks open work, not a changelog; the record of what was done lives in git history and in the docs/code the work produced. Leave `[ ]`/`[x]` only for partially-done items where the checked sub-points still give context for the open ones.

**Rule: Docs state their rules self-containedly — never cite a specific code symbol as an illustration.** A pointer like "see `getParticipationsForGamers` in `participations.service.ts`" rots silently: the function gets renamed, moved, or deleted, and the doc goes on citing something that no longer exists or no longer makes the point. Describe the *shape* of the code instead, so the rule stands on its own. Two things stay fair game: naming an API the rule mandates (a rule like "resolve redirect targets through `resolveInternalPath()`" *is* that name — it cannot be stated without it), and directory or module references used for navigation, which are stable.

## Environment Variables

All env vars are in `.env.local`. Keys for Supabase, Stripe, and Daily.co — including `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_REF` used by CLI commands below.

## Database

Migrations in `supabase/migrations/`. The migration workflow (push → regenerate types —
`schema.sql` is CI-maintained and must not be dumped or edited by hand), the "read
current state from `schema.sql`/`database.types.ts`, not migrations" rule, the
generated-nullability fix patterns, and the access-control rules
all live in **`supabase/CLAUDE.md`** (auto-loads when you work under `supabase/`). The
always-on tripwires:

- **`database.types.ts` is purely auto-generated — never hand-edit it.** Push the
  migration first, then regenerate. Convenience aliases (`Profile`, `UserRole`, …) live
  in `src/types/index.ts`; after regenerating, add aliases for any new tables/enums.
- **A migration that adds/modifies functions or tables must be pushed and types
  regenerated before committing** — DB tests and type-check depend on
  `database.types.ts` matching the schema.
- **Every new object (table, view, sequence, function) needs an explicit `GRANT`** — no
  Data API access by default, not even for `service_role`. Grant per role. A function
  exposed to `authenticated`/`anon` additionally has to be **classified in the DB test
  suite's authorization spine** — role-gated (guard-first body + its permitted roles) or
  self-scoping (named to a scope test) — and a table that gains a write grant needs a
  write-IDOR case. The spine's completeness checks fail the build otherwise.
- **All new tables must enable RLS**, and **RLS INSERT/UPDATE policies must authorize
  both the actor AND the target** (checking only `column = auth.uid()` is an IDOR hole).

## Testing

Tests are in `tests/`, split into `unit/`, `integration/`, `db/`, and `e2e/`. The
classification rules and the per-category conventions (DB test helpers, integration-test
route-handler mocking, unit setup) live in **`tests/CLAUDE.md`** (auto-loads when you
work under `tests/`). Two things worth knowing from anywhere:

- **`npm run test` runs `unit/` + `integration/`** (jsdom). DB tests need a real Postgres
  and run in **CI only** — we have no local stack — so exercise them by pushing your
  branch, not locally.
- **Shared mock factories live in `tests/mocks/`** — add new mocks there rather than
  duplicating across files.
- **A new API route has to be classified in the integration suite's route posture
  registry** — its auth posture (with a written reason for anything that is not
  role-gated), how it takes its body, and the test that exercises it. The registry's
  completeness checks fail the build otherwise, and they also fail on an undeclared
  handler method, an unjustified service-role import, and a named test that does not
  exist or does not reference the route.

## Code Style

### Lint must be clean — treat warnings as design signals

**Rule: `npm run lint` must produce zero errors and zero warnings.** Our lint config is strict on purpose. When lint flags a line, resist the urge to silence it with a one-line patch (a cast, a disable comment, a throwaway rename). Stop and ask: *why* is the linter unhappy? The flagged line is usually a symptom — the real problem is often a design issue one or two levels up (wrong type at the boundary, a function doing two things, state living in the wrong place, a missing abstraction). Fix the underlying cause so the warning goes away naturally.

**Rule: Suppressing a lint rule (`eslint-disable`, `// @ts-expect-error`, etc.) requires strong justification and an inline `--` description explaining it.** Suppression is a last resort, not a shortcut. Only suppress when you've concluded the rule genuinely does not apply to this specific case — and write *why* directly next to the disable comment in the form `// eslint-disable-next-line some-rule -- reason here`. "Lint was noisy" is not a justification. This is mechanically enforced by `@eslint-community/eslint-comments/require-description` — an undescribed disable will fail lint.
