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
npm run test:smoke       # Build + smoke check (serves a production build, asserts headers/CSP)
```

## Branching

**Rule: branch off the latest `dev`, unless told otherwise.** `dev` is the
integration branch; `main` is the release branch and trails it by hundreds of
commits, so anything cut from `main` — or from a `dev` that hasn't been fetched —
starts life missing work it will later collide with. Fetch and fast-forward
first, then branch. This holds however the branch is created, including tooling
that offers to pick a base for you: the default is usually `origin/<default
branch>`, which is `main` here and is the wrong answer.

Branches are named `feat/<kebab-summary>`; feature work merges back into `dev`
with a real merge commit (`--no-ff`) whose subject reads `Merge the <thing> into
dev`. Releases go `dev` → `main` through the `/pr-dev-to-main` command.

For work that wants its own worktree — the usual shape when several things are in
flight at once — `/worktree-flow` runs the whole lifecycle, from cutting the
branch to tearing the worktree down after the merge.

## Architecture

### Tech Stack
- **Next.js 16** (App Router) with React 19 and TypeScript
- **Supabase** for PostgreSQL database and authentication
- **React Query** for server state management
- **Tailwind CSS 4** with class-variance-authority for component variants
- **Stripe** for payments
- **Brevo** (formerly Sendinblue) for transactional email — every mail is composed in-repo and sent through Brevo's REST API (`src/lib/email-templates/`, sent via the single `sendTransactionalEmail()` wrapper). **Supabase Auth sends no email**: confirmations are off, and reset/verification links are minted with `generateLink` and sent by our own templates — so GoTrue's SMTP/mailer dashboard config (and its email rate limits) is unused and gates nothing. See `src/lib/email-templates/CLAUDE.md`.
- **Daily.co** for real-time voice/video chat
- **Vitest** + **Playwright** for testing

### Role-Based Access Control (RBAC)
Four user roles with separate dashboards:
- `admin` → `/admin` - System management
- `customer` → `/parent` - Parents who purchase products and manage linked gamers — and who can hold a seat themselves on a product whose audience admits adults (the role identifier is `customer`; the URL is `/parent`)
- `gamer` → `/gamer` - Child accounts (email-first like every role; email is a synthetic `<token>@gamer.sogverse.internal` address; login is via account-switch from the parent, not a typed credential)
- `gedu` → `/gedu` - Game educators (self-register at `/register-gedu`; an account is unverified until an admin approves it — verification gates only group assignment, not platform access. See `src/services/gedu/`)

Proxy (`src/proxy.ts`) refreshes Supabase auth sessions, enforces role-based routing, and sets a per-request nonce-based Content Security Policy (Next.js 16 uses `proxy.ts` instead of `middleware.ts`). RLS policies protect data at the database level.

**Rule: admins are trusted — including trusted to act only through the admin UI.** An admin hand-crafting API or RPC calls is neither a threat model nor a supported workflow, so "an admin could reach an invalid state via the raw API" is not a defect worth building UI or validation for. The database's own guarantees (CHECKs, constraints, grants) still stand behind everything — a state the UI cannot produce must fail loudly at the schema if it somehow arises, never corrupt silently — but the loud failure *is* the accepted handling, not a gap.

**Rule: an admin must be able to see every stored product property on the product details page — opening the edit form is not the read path.** The edit form is a write surface; making an admin open it to answer "is this flag set?" means a read costs a form that can be accidentally submitted, and a property nobody can see on the details page is a property nobody audits.

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

**Rule: Password changes go through the emailed reset flow.** Supabase dashboard config (not in this repo) sets `security_update_password_require_reauthentication = true`, and the gate keys on the session row's age, not token freshness — so a direct `updateUser({ password })` passes fresh-session testing and fails in production for any long-lived session. A completed reset also revokes every other session.

### Redirects & open-redirect safety

**Rule: Any caller-supplied redirect target (a `?redirect=`/`?next=`/`?back=` param, or anything else deciding where to navigate) must be resolved through `resolveInternalPath()` (`src/lib/navigation/internal-path.ts`) before navigating. Never hand-roll the check.** String matching like `startsWith("/")` + `!startsWith("//")` always loses to a variant you didn't think of (`/\evil.com`, `https:/evil.com`, a stripped leading tab) — an open redirect off a logged-in page is a clean phishing vector. `resolveInternalPath` resolves against a sentinel origin with the URL parser and rejects anything that escapes it, covering every variant at once.

**Rule: Any absolute URL built from an incoming request (especially links placed in emails) must derive its origin from `getOrigin(request)` (`src/lib/url.ts`) — never from `new URL(request.url).origin` or the raw `Host` header.** The browser-supplied `Host` is attacker-controllable on our deployment (Vercel forwards it into `request.url`), and an emailed link is the worst place for a wrong origin: the recipient trusts it and it carries a credential/session token, so a spoofed origin turns it into a phishing/account-takeover vector. `getOrigin` honours `Host` only when it matches a trusted source and otherwise falls back to the canonical `NEXT_PUBLIC_SITE_URL`. Pairs with the `resolveInternalPath` rule above — one governs relative redirect targets, the other absolute origins.

### Content Security Policy (CSP)

CSP is generated per-request in `src/proxy.ts` with a unique nonce (`crypto.randomUUID()`). In production, `script-src` uses `'nonce-{random}' 'strict-dynamic'` — only scripts tagged by Next.js's SSR pipeline execute. In development, it falls back to `'unsafe-inline' 'unsafe-eval'` for HMR compatibility. Static security headers (X-Frame-Options, HSTS, etc.) remain in `next.config.ts`.

**Rule: Never add inline `<script>` tags directly.** The nonce-based CSP blocks any inline script without the per-request nonce. Use Next.js `<Script>` component or ensure scripts go through the SSR pipeline. If you must add an inline script, read the nonce from the `x-nonce` request header in a server component.

### Layout & Scrolling

**Rule: An element on screen before a change and still on screen after it must not change position.** The harm is specific — a target moving out from under a cursor mid-click, and a reader losing their place — and both require the element to *survive* the change. Survival, not geometry, is what makes this rule bind.

The test: **is there something here a user could be pointing at or reading that outlives this change and lands somewhere else?** If yes, it must not move. If nothing outlives it — a placeholder line replaced by the value it stood for, animated skeleton bars giving way to the body, a panel swapped for a different panel — then nothing moved. Something different is simply there now, and the rule has nothing to say about it.

**Reserving space has its own cost, and reserving it for something that can never coexist with what is there now is itself a defect.** A slot held open beside content it will never sit next to is dead space, and it reads as a rendering fault: a hover fill stopping short of its own border, a label truncated with room to spare beside it. "Reserve it just in case" is not the safe default — it is the other way to get this wrong. Weigh the shift you would prevent against the hole you would leave, and when nothing survives the change, leave no hole.

**What counts as the user doing something:** a change that is the direct, expected result of an action they just took — confirming in a dialog, expanding a section, submitting a form. Causal distance doesn't matter, and neither does whether the change lands in the surface they touched; committing a value inside a dialog may freely rewrite the field underneath it. What is *not* allowed is a change on data's own schedule — a query resolving, a subscription firing, an image finally measuring. The user didn't ask for it and isn't braced for it.

**Corollary: content revealed *above* what the reader is looking at must be paid for out of the scroll position, not out of their place on the page.** Some reveals genuinely have to insert above — a feed in date order cannot put tomorrow below today — and inserting there pushes everything already painted down the viewport. The fix is to measure a chosen anchor's viewport position before the state change (in the event handler, while the old layout is still up) and correct `window.scrollY` by however far it moved, in a layout effect, before the browser paints. Two things follow from that: **do not animate the geometry of such a reveal** — a correction fighting a transition has to re-run every frame and is the fragile half of the pattern, so an upward reveal is instant — and **a page cannot scroll above its own top**, so a collapse near the top of the document will not have the scroll to give back; the remainder is a real shift, and the right move is to name it rather than pretend it did not happen.

**Corollary: a mark that arrives after first paint belongs at the end of the run it joins, never in the middle of it.** Some data lands a round trip after the page does — a staff-only overlay on a roster, a badge, a count — and *where* it is inserted decides whether this rule is broken or never engaged at all. Inserted between things already on screen, it moves everything after it. Inserted at the end of the run, where the layout's slack already sits, its arrival is paid for out of that slack and nothing painted moves. The same trick handles a row's trailing controls: keep them as one right-packed group, and a control that appears late grows the group leftward into the slack while every control after it holds its position to the pixel.

This is the third option beside reserving the space and accepting the shift, and it is usually the cheapest of the three — it holds no space open for something that may never come, and it needs no guarantee about *when* the data lands, which means no fetch has to be hoisted ahead of a paint to make the layout honest. What it costs is that the order becomes load-bearing: **say so where you rely on it**, because a later tidy-up that reorders on aesthetic grounds reintroduces the shift silently, and the reordering will look like an improvement.

Even permitted reflows are worth softening: prefer an animated transition over a jump. Navigating to a new page is fine; this rule is about in-place shifts. If you hit a genuine edge case (a countdown timer that must update continuously — `tabular-nums` keeps digit columns from reflowing), check in with me. One reasonable escape hatch for unavoidable reflow is to place clickable elements somewhere the shifting region won't push them.

**Rule: Render what you safely can as early as possible.** Anything not waiting on a network call — page chrome, hardcoded copy, headers, breadcrumbs, navigation, anything bundled with the route — belongs in the loading state too, so the user can read and click it before the data lands. The one constraint is the rule above, and here it does bind: what you render early *will* still be there when the data arrives, so it has to land in its final position. If incoming data would push it around, reserve its spot or leave it for later. The trap is "render as much as possible and sort the layout out afterwards" — that is precisely how you manufacture the shifts the first rule exists to prevent.

**Rule: Parent and gamer surfaces are designed mobile-first; gedu and admin surfaces are designed desktop-default.** Families meet the product on a phone between other things, so their pages are laid out for a narrow viewport first and widen from there. Gedus and admins work at a desk — a gedu is prepping a session or writing one up on a laptop, an admin is managing the platform on a monitor — so their pages assume a wide landscape viewport (roughly 16:9 to 16:10) and are allowed to *use* that width: a wider container, two- or three-column arrangements, a reference column beside the main one, tables that stay tables. Mobile on those surfaces is supported and must not break, but it is the secondary layout, and collapsing to a single stack is an acceptable answer there. This is a deliberate site-wide split, not a per-page judgment call — don't build a gedu or admin page that wastes two thirds of the screen because the phone layout came first, and don't push a desktop-shaped grid onto a parent or gamer page.

**Rule: 360px is the mobile design floor — a narrow layout is designed and judged at 360, and anything narrower only has to degrade gracefully.** 360 CSS px is the Android baseline: it is what nearly every Samsung and mid-range Android reports at default scaling, and that is the archetypal family phone in our markets; the iPhone floor sits above it at 375 (the SE 2nd/3rd gen body). What lives below 360 is not a design audience: 320px is 2013–2016 iPhone hardware whose Safari stopped updating years ago, plus Android's display-zoom accessibility setting, which shrinks a 360 phone's effective viewport toward 320. Those must not *break* — no horizontal document scroll, nothing clipped into uselessness — but no layout decision is weighed against them, and "it overflows at 320" is not a defect on its own. Two habits make the floor real: judge tight layouts in the widest locale, because French routinely sets the longest words where English sets the shortest ("Boutique" vs "Shop"), and when a fixed strip has to share 360px — the header is the canonical case — do the width arithmetic per locale rather than eyeballing one of them.

### Loading & Disabled State

**Rule: A button must not visually re-enable between the click and the action actually finishing.** A click promises one outcome; the disabled/loading state has to persist all the way through to it — across any redirect, route transition, or panel/view swap that the success path triggers. React Query's `mutation.isPending` is not enough on its own: it flips false the moment React Query dispatches the success state, but `onSuccess` runs after that and any navigation/view-swap is later still — so the button briefly re-enables and a fast user can fire the action twice.

The pattern that works: hold a local `committing` boolean, flip it true *synchronously before* `mutate()` runs, and only clear it on outcomes where the user needs to retry (a `'full'` race, a thrown error). On outcomes where the page unloads (`window.location.href = …`) or the panel swaps to a different view (a query refetch flips the visible component), leave the flag set — the unmount/swap takes care of the rest. OR `committing` into the button's `disabled` and use it (not `isPending`) for the spinner. For internal Next.js route transitions, `useTransition`'s `isPending` follows the same shape and can be ORed in alongside.

Setting the flag *inside* `onSuccess` (or via a hook that does so) is too late and does not close the gap. The flag has to be live before any render after the click.

The pattern stays inline per screen — **do not extract it into a shared `useCommittingMutation`-style hook.** That was tried and failed: screens differ in how they leave (full unload vs. view swap vs. `useTransition`), in which outcomes clear the flag, and in what other pending states compose in, so the abstraction dissolved into per-call-site configuration. This prose rule exists *because* the hook didn't work.

**Rule: the loading affordance is a property of the call, chosen when you write it — never something discovered at runtime.** You are the one writing the query. You know whether it is a cached read, an indexed lookup of a bounded set, or a heavy aggregate over a third party. That knowledge picks the affordance; a timer that waits to find out does not. There are three categories and nothing else:

1. **Already cached, or resolvable synchronously** → **no loading state at all**, ever. React Query knows this for you, and it is the strongest signal available because it costs nothing.
2. **A near-instant call that still needs a network hop** — a small, indexed, bounded read: one node's children, a top-N search, a row by id. It lands in a frame or two. Render **nothing**, inside a container that already has its final size. No skeleton, no spinner, no delay, no fade. If such a call is ever slow that is an anomaly to investigate, not the case to design for.
3. **A perceptibly slow call** — a large payload, a heavy aggregate, a third-party round trip. Render a structured skeleton **immediately**, with no delay, because you already know it is coming. Prefer ghosts shaped like the content (bars where rows will be) over one solid block.

**Corollary: if you cannot tell which category a call falls into, you do not yet understand the query — go and find out.** Hedging with a timer is what that uncertainty used to buy, and it bought a loading state that was wrong in both directions: a flash on the fast path, and dead air on the slow one. The container keeping its final size across loading and loaded is what the layout rule needs; the skeleton was never the part doing that work.

### Button Order

**Rule: where two buttons answer one question — one affirmatively, one negatively — the affirmative sits on the RIGHT in a row and on TOP in a stack.** Confirm/Cancel, Save/Discard, Accept/Decline. The **affirmative** is the action the surface exists to ask about, *including* a destructive one — a red Remove in a confirm dialog is still the answer to the dialog's question — and Cancel, Back, Close and Decline are the negative. One order everywhere is the whole point: whoever confirmed the last dialog already knows where this one's confirm button is, and muscle memory that is right most of the time is worse than none at all. Right-in-a-row is the desktop convention; top-in-a-stack is the platform one (Apple HIG stacked alerts, Material stacked dialogs).

**The geometry is not limited to a literal yes and no: any two-action row with one clear primary and one secondary alternative takes the same positions** — a keep-browsing beside a go-to-my-SOG, an explore-the-shop beside a create-an-account. The primary is the one the surface is steering toward, it goes right and on top, and the alternative sits beside it exactly where a Cancel would.

**One DOM order satisfies both, so there is one authoring shape: children in `[negative, affirmative]` order inside `flex flex-col-reverse gap-* sm:flex-row` — plus `sm:justify-end` where the row is a footer.** Last-in-DOM is rightmost in a row and, reversed, topmost in a stack, so the affirmative is always the last child and nobody has to re-derive the reading order per surface. Plain `flex-col` is the bug this replaces: same DOM, and the affirmative lands at the bottom. `DialogFooter` and `ConfirmDialog` bake the shape in — a dialog gets it by using them; a hand-rolled row states the classes itself. **A run of three or more follows the same spine: negative first, affirmative last, everything else between** — a leave-confirmation reading Cancel, End for everyone, Leave has its two ends in the right places and its middle action wherever it reads best. Describe that middle one by what it does, never as "the secondary": under `col-reverse` it is neither second from the left nor second from the top, so a position word will be wrong in one layout or the other.

**The accepted cost is that on mobile, visual order and DOM order disagree:** tab focus runs negative→affirmative while the eye reads affirmative→negative. That is inherent to `col-reverse` and it is taken deliberately — the alternative is a per-breakpoint DOM, which no static markup can give us — so it is not a bug to rediscover and re-fix. Both orders still start or end on the affirmative, and a keyboard user reaches every button either way.

**Because the affirmative is last in the DOM, a late-arriving footer child lands on TOP of the stack and pushes the rest down** — the exact shift the Layout & Scrolling rule forbids, and the reverse of where an appended item normally lands. So a footer's children must be settled before the dialog opens: a conditional button decided by a query that resolves after first paint is not allowed, and the answer is to have it before opening rather than to reserve a slot. A dialog opening is a user action, so whatever the footer holds at that moment is free to be anything; what it may not do is change afterwards.

**A button followed by a muted text link is not a pair, and must not be col-reversed.** A submit button with a quiet "Back to login" beneath it is one primary action plus an escape hatch — the link is typographically subordinate, not the other half of a choice — so it stays DOM `[affirmative, link]` under plain `flex-col` with the link below, which is where a reader expects the way out. The rule engages when both halves are *buttons*; a future sweep that flips these on pattern alone would be reversing them wrongly.

**In an emailed button row the *position* carries over unconditionally; the emphasis is decided per mail, inside what the row's type allows.** A mail's two-button row is a fixed 50/50 table that is a row at every width, so there is nothing for `col-reverse` to do and the affirmative goes in the right-hand cell, reading the way the app has already taught. What the type forbids is the *primary* brand button, so a row can never hold two brand-filled cells competing for the same click — but the right-hand half may still carry the emphasis the row does allow, wherever one of the two actions is genuinely the thing being asked for: the seat-offer mail fills Accept and outlines Decline. Where the halves are equal alternatives with no ask between them — the welcome mail's shop-or-My-SOG pair — both stay outlined and neither is weighted. Position is settled by the convention; emphasis is settled by whether the mail is asking a question.

### Date & Time Formatting

**Rule: Pick the right tool for the date/time operation, and never use UTC as a stand-in for someone's local date.**

- **Display formatting.** `Intl` APIs and `next-intl` formatters. Shared helpers (`formatDate`, `formatTime`, `formatCurrency*`) live in `src/lib/utils.ts`. For relative time, `useFormatter().relativeTime()` from `next-intl`. The locale always comes from `useLocale()` (client) or `getLocale()` (server).
- **Local-date strings** (calendar keys, "today" markers, anything `YYYY-MM-DD`-shaped that means *today in someone's zone*). Use `formatInTimeZone(new Date(), tz, "yyyy-MM-dd")` from `date-fns-tz`. Pick the timezone deliberately: usually the entity's zone (e.g. `product.timezone`) for entity-local rendering, or the viewer's local zone (no explicit `timeZone`) for personal data. Never both implicitly.
- **Zone-to-zone conversion.** `fromZonedTime` / `toZonedTime` from `date-fns-tz` (already a project dep — see `src/lib/utils.ts`, `effective-status.ts`).
- **Anti-pattern: never write `new Date().toISOString().slice(0, 10)`.** That's the date in UTC, not anyone's local date — for any non-UTC viewer it's off-by-one near midnight and silently wrong everywhere else without anyone noticing. If you find yourself reaching for it, you want `formatInTimeZone` with an explicit zone instead.
- **Anti-pattern: never do day/week arithmetic on a Date that carries a zoned wall clock** — stepping a `toZonedTime` result by `± n × 86_400_000` (a local day is 24 hours except on the two DST transition days, so instant stepping repeats or skips a calendar date once a year), or mutating one with `setDate()` (it is a runtime-local Date, and a wall clock landing in the *runtime* zone's DST gap silently normalizes an hour away). Both misfire only when the runtime zone crosses a transition, so UTC CI can't catch either. The safe shape has three steps: read the wall clock from the zoned Date's **local** fields (never `getUTC*` — those agree only on a UTC runtime, and in any non-UTC browser they land on the wrong weekday once the runtime offset crosses midnight); do the day-stepping as UTC-pinned calendar arithmetic (`Date.UTC(y, m, d ± n)` read back via `getUTC*` — UTC has no DST, so day arithmetic there is exact; a `T12:00:00Z`-anchored date walk is the same trick); convert back to an instant with `fromZonedTime` at the end. Dates that are UTC-pinned end to end (built from `Date.UTC`/`...Z` strings and read only via `getUTC*`) are outside this rule — arithmetic on those is exact.

**Rule: Anything with a time of day renders in the *viewer's* timezone — never the runtime default, never the source/product zone.** A true instant (a timestamptz column) or a date+time (a session, an event, a recurring slot) is shown in the viewer's IANA zone — resolved from the viewer's profile/settings, paired with a request-stable "now" so SSR and the first client render agree. Make the viewer zone a required argument of the shared date/time formatters so a call can't silently fall back to the runtime default; a genuinely zoneless date goes through the date-only path instead. When the displayed zone differs from the source (products are authored in `Europe/Helsinki`), surface the viewer's short tz abbrev next to the time so the adjustment is visible — the abbrev is already locale-formatted by `Intl`, so it is not a translated string. A recurring wall-clock slot can't be converted without a concrete date (the offset is DST-dependent): resolve one (the next occurrence of that weekday), turn it into an absolute instant, then derive the weekday + clock face and **re-group in viewer space** — a Helsinki Mon/Wed pair can shift to different viewer weekdays. Compute end times by adding the duration to the *instant* and re-formatting — never string-add the viewer-local start, or a DST transition inside the session corrupts it.

**Rule: A pure calendar date with no time of day stays UTC-pinned — do not give it the viewer's zone.** A camp's start/end date range, a club term date, a legal "last updated" date — these are zoneless; parse the bare date at UTC midnight and render in UTC, because re-anchoring it to a viewer's zone shifts it off-by-one. Rule of thumb: **a value with a clock face converts; a bare date does not.** (An event's date *does* shift when it carries a slot time — that's a date+time instant; an event with no time stays date-only.)

### Brand vs. Platform: "School of Gaming" and "Sogverse"

**Rule: "School of Gaming" is the brand, "Sogverse" is the platform, and outward-facing copy leads with the brand.** They are two names for two things, and which one a string reaches for is a real decision:

- **School of Gaming** — who we are: the brand, the company, the identity. It is the name a parent recognises, the one they were told by a school or another parent, and the one that has to be legible in a crowded inbox list or a browser tab. Anything a customer meets cold — a sender name, a page title, an OG image, marketing copy — leads with it.
- **Sogverse** — the name of the platform, the thing that does the technical work: the app families log in to, the codebase, the database and every internal conversation. A parent who has an account knows it; a parent who does not has no reason to.

**Rule: Sogverse takes no article — "the Sogverse" is retired.** There is no third sense: the single connected universe our Minecraft servers share, the stories told inside it and the app a family logs into are one thing with one name, so the lore says "Sogverse" in exactly the words the product does. A place in a fiction and the platform that hosts it do not need two spellings, and the article was the seam between them. It survives only where it belongs to the **following** noun — "the Sogverse team", "the Sogverse shop", "the Sogverse community", "the Sogverse row" — where "the" is doing its ordinary work on *team*, *shop*, *community*. A bare "the Sogverse" is the error this rule exists to catch, in copy, in staff docs and in prose here.

**Rule: the two names are a progression, and it runs the same way `Game Educator` → `Gedu` does — the platform name is never used cold, and is learned by being inside the product.** A family who has not met us is told "School of Gaming", because that is the only one of the two names that means anything to them yet; the product is what teaches them the other one, on the page they log into, in the mail that welcomes them, in the switcher that asks who is entering it. "Sogverse" is not internal-only vocabulary and not a secret — it is the second word a reader learns, and it costs one sentence of introduction to teach, which is precisely why a stranger is never handed it first. (`src/i18n/CLAUDE.md` states the role name's half of the same shape, and the two rules are meant to be read together.)

**Corollary: the platform name may appear cold only where the copy is introducing it.** The gloss is a real construct and it belongs on the surfaces whose job is to explain us: a public FAQ entry that asks what Sogverse is and answers that Sogverse is School of Gaming's platform is the pattern, and a welcome mail naming the platform the reader has just been given an account on is the same move a paragraph long. What the rule forbids is the word arriving *before* its own gloss. The public About page is the pattern in place: it opens with the brand, and its first FAQ item is the one that asks what Sogverse is and answers with the gloss — so the word is introduced at the first moment a reader meets it, rather than several items after.

**Corollary: which name a sentence takes follows what the sentence is about, not who is reading it.** Inside the product, copy about *us* still says School of Gaming — a promise that a child's safety is at the heart of everything we do, a note that we invoice the municipality directly, a copyright line naming who holds the copyright. Copy about the *thing* still says Sogverse wherever the reader has met it — what a family logs into, what stores an account, what answers a Minecraft server's join check. A signed-in reader does not turn every sentence into platform copy, and a stranger does not turn every sentence into brand copy; the subject of the sentence decides, and the reader only decides whether the word needs introducing.

**The combined lockup is `School of Gaming – Sogverse`: brand first, platform second, separated by a spaced en dash (`–`, U+2013) — never a hyphen and never an em dash.** Use it wherever a string has to carry both names; the transactional email *header* and the site's `metadata.title` are the canonical uses. Leading with "Sogverse" puts the word that needs the most explanation in the position that survives truncation, and naming the character is the point of writing this down — the separator was previously left to whoever typed the string, which is how the codebase ended up with three different dashes in one lockup.

**Where the room runs out, the brand goes alone — which is why the email *sender* name is "School of Gaming" and not the lockup.** An inbox list truncates the sender column hard and unpredictably, so a lockup there is a coin flip between the whole thing and "School of Gaming – Sogv…", and the mangled version is worse than the short name that always fits. The mail's own header is where there is room, so that is where the lockup lives. The general rule: state both names where the reader can see both, and where only a few characters survive, spend them on the one they already recognise.

**An em dash between the two names is a different construct, not a variant of the lockup.** Prose that reads "Sogverse — School of Gaming — runs clubs" is an appositive asserting the two names are the same thing, which is exactly what this rule says they are not. Copy that needs to relate them states the relationship instead: Sogverse is School of Gaming's platform.

This is a deliberate shift, and it has now landed. Four parts are finished:

- **The *lockups*** — every string carrying both names leads with the brand.
- **The cold uses in `messages/`**, which have been swept. Everything a stranger could meet with the platform word un-introduced now says the brand instead: the public About page's opening line, the contact-card copy under the `helpSection` namespace (the public help page it was written for is gone; the wording survives verbatim on the dashboards' contact card), the public Gedu registration title, and the transactional-email copyright footer, which names the company that holds the copyright and so matches the site footer exactly.
- **Every document title and `og:site_name`.** The sub-page template (`src/app/layout.tsx`) is `"%s | School of Gaming"` and the site name on a shared link is the brand, on every page, signed in or not. A tab title is read while scanning a row of tabs, and what a parent is scanning for is the name they were given by a school or another parent — a recognition context even when the page behind the tab is their own dashboard. The root title keeps the lockup, because that is the one title with room for both. This also retires the product pages' hand-built absolute `… | School of Gaming` title: it existed only to step around a template that said something else, and the template now says the same words, so a product page passes a plain name and inherits it.
- **The account possessive: it is with the brand.** "Your School of Gaming account", "your School of Gaming password", "your School of Gaming parent PIN" — the account is a relationship with the company, and the platform is what the account lets you into. That is what settles the pair: a possessive on an account artifact names who you have the relationship with, so the credential belongs to the brand and Sogverse is the door it opens. The company is also who *acts* on an account — we received the request, we will send the link, we will not change your password — which is the same sentence-subject test the corollary above already applies. The verification mail, the password- and PIN-reset mails and the auth pages' descriptions now all read the same way, in all five locales; the sweep is complete, so a new account/credential string follows the brand without a fresh decision. **The login card is the shape in miniature:** it welcomes you on behalf of the brand ("Welcome to School of Gaming") and puts the form directly under it. It used to carry a sub-line reading "Sign in to your account" beneath that title; the key is gone, because a heading over an email field, a password field and a Sign in button does not need a second line restating what the form plainly is.

Nothing is left open. The shift is complete except where prose is decided case by case by the subject-of-the-sentence corollary — and everything still naming the platform in `messages/` is exactly that kind of prose: a legal page defining who runs Sogverse, a switcher asking who is entering it, the lore naming the world it is set in. Weigh each against the subject of its own sentence as you touch it, rather than sweeping.

**One locale translates the brand, on purpose.** `tlh` renders "School of Gaming" as its Klingon calque and keeps "Sogverse" as-is, and the about-page easter egg puts that pair in a table as one of its jokes — so the easter egg is the documentation. A brand-name rule applied mechanically would "fix" it and delete the joke; the general prohibition on translating a mark is aimed at `fi`/`sv`/`fr`, where a family reads the name as a name.

**The brand authority above all of this is the School of Gaming Brand Voice & Identity Guidebook, and every place we knowingly diverge from it is logged in `docs/brand-guidebook-deviations.md`** — a transitional queue of our expansions, exceptions, rejections and open escalations, each cleared as it is codified in its permanent home and the file deleted once empty. Where the app diverges from the Guidebook with no entry there and no rule here, the Guidebook wins; a new divergence earns an entry in the change that makes it.

### Brand vocabulary and fixed forms

**Rule: some words are banned from family-facing copy, and each ban is about what the word claims we are.** Say **children** or **gamers**, never "kids" — the register is the one a parent is addressed in, not the one a child is. We run **clubs, camps, events and sessions**: "course", "curriculum" and "class" describe school, and a family choosing us is choosing something school is not. "World-class" and "Skills for the future" are superlatives with nothing behind them a reader can check. **"Program"/"programme" is banned as a generic word**, with one exception — the Roblox **Programme** is a formally named joint offering whose legal documents bear the name, so it keeps it; nothing else may borrow the word from it.

**Rule: games are dimensions of Sogverse, never the definition of the offer — name several titles or name none.** "Minecraft clubs" tells a family the product *is* one game, and that is the costly drift: it is learned in one sentence and un-learned only by contradicting ourselves. "Clubs in Minecraft, Roblox, Fortnite and more" — or simply "clubs" — is the shape.

**Rule: "The Princi-Pal" is a mark and stays untranslated in every locale, exactly like "Sogverse".** The hyphen carries the joke; a locale substituting its own word for a headmaster deletes both the joke and the character.

**Rule: the vision statement is "Where Screen Time Becomes Quality Time." — those words, that capitalisation, that full stop, wherever prose states it.** The home hero and the OG image draw it line-broken and stopless; that is a display treatment of the same sentence, and the only logged deviation, not licence to re-punctuate the line anywhere else.

**Rule: five slogans exist; each appears at most once per page, never two in one piece, capitalisation and full stops exactly as written.** Placed: "Learning by Gaming." (the home page's how-it-works section), "Scouts of the Online Age" (gedu registration), "Children first. Always." (anti-bullying). Deliberately unplaced: "Ambassadors of Positive Gaming." and "By playing, a better world and better people." — placing one is a decision to raise, not a gap to fill. Two slogans in one piece leaves neither of them meaning anything.

**Rule: the Yty vocabulary has fixed forms — Yty-Points, Quests, Achievement Badges (the metal tier names lowercase: bronze, silver, gold, platinum, diamond), Yty-Level, and "The Four Yty-Elements".** Valor is the relationship with **society** and Wit the relationship with **technology**; those two are the pair that gets swapped. The element definitions live in two places — the `yty` messages namespace and the Yty constants module — and a change to either is unfinished until the other matches, because the constants are the canonical English and the messages are what a reader sees.

### Partner brands: Roblox and Lynx Educate

**Rule: every placement of a partner's logo needs that partner's sign-off, and an approval covers the placement it was given for — not the mark.** Roblox has approved the three-way lockup in the `/roblox` hero; that placement is the whole of what is approved. Any *new* surface carrying the Roblox mark — another page, an email, an OG image, a social card, a deck — is a fresh request that has to be flagged and reviewed before it ships, however small the addition looks. Meeting the mark's own usage constraints (clearspace, minimum size, no recolouring, the required trademark notice — all in `src/assets/partners/CLAUDE.md`) is not approval and does not substitute for it.

**Rule: School of Gaming *collaborates with* Roblox and *partners with* Lynx Educate — the two words name two different relationships and are never swapped.** "In collaboration with" is what Roblox asked for and the only phrasing their name may appear in; "in partnership with" is Lynx's. Getting this backwards is not a style slip, it is a claim about a legal relationship neither party has agreed to. It binds every locale — `en` "in collaboration with" / "a collaboration between", `fr` "en collaboration avec" / "une collaboration entre", `fi` "yhteistyössä", `sv` "i samarbete med" — so a new Roblox string is not done until all of them read that way. Klingon builds both senses on the one root `boq` and cannot draw the distinction, so `tlh` is exempt.

This is Roblox's constraint on their own name, not a house-style ban on the word: copy about municipalities, schools and every other partner is unaffected and goes on saying "partnership". **It also binds internal vocabulary here** — component names, code comments, route notes — which is the one place this rule departs from "dashboard" vs "My SOG" above. There the internal word is a *different*, more precise word; here it is the forbidden one, sitting one copy-paste away from a string.

### Safety copy: mechanisms, never intentions

**Rule: a sentence about a child's safety states a checkable mechanism, never an intention.** "A gamer account carries an internal Sogverse address, not your child's real email, and your child signs in through your parent account rather than a password of their own" is something a parent can test and hold us to. "We take your child's privacy very seriously" is a statement about our feelings, and every company that has ever lost a database said it first. The test is whether the sentence names something the product *does* — a mechanism, a constraint, a thing that cannot happen; a sentence that would still be true if we did nothing at all is not safety copy, however reassuring it sounds. This binds every safety, privacy and safeguarding surface: the legal pages, the PIN descriptions, the FAQ's safety answers, the values on the About page.

**Corollary: only mechanisms verified true.** A mechanism sentence is a promise put in the reader's hands, so before writing one, check it against the schema and the flows it describes rather than against what the feature was meant to do — what is stored about a gamer, what a given contact path actually exposes, whether "a Gedu is always present" holds for *every* session type. A mechanism we want but do not have is a `TODO.md` feature item, never a sentence, and the weaker copy stays up until the mechanism is real. Overstating a safeguard is worse than the vague sentence it replaced, because a parent acts on it.

### Locale vs. Spoken Language

**Rule: Use *locale* for the UI translation system and *spoken language* for human languages.** They are deliberately named differently because they are distinct concepts.

- **Locale** — which translation of the web app the user sees. Owned by `src/lib/constants/locales.ts` (`SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LocaleProvider`, `LocalePicker`), backed by `profiles.locale`. This is what next-intl's `useLocale()` returns.
- **Spoken language** — the human languages a user speaks / a club is delivered in. The `spoken_language` Postgres enum, owned by `src/lib/constants/spoken-languages.ts` (`SPOKEN_LANGUAGES`, `isSpokenLanguageCode`, both derived from codegen), backed by `products.spoken_language_code` and the `profiles.spoken_languages` array. UI lives in `src/components/ui/spoken-language-checkboxes.tsx`.

A Finnish-speaking parent could have `locale = "fi"` (app in Finnish) and `spoken_languages = ["en"]` (wants their child placed in English clubs). Don't conflate them.

**Rule: User-facing strings must be translated for every locale message file in `messages/`. Never leave placeholder copy or skip a locale. Best-effort translation is expected. Klingon (`tlh`) is an easter egg — fun and quirky takes are welcome, accuracy is not the goal there. The exception is legal pages (privacy, terms, safeguarding and their programme-specific siblings, plus the attributions page): `tlh` **omits** those keys and the request config falls back to English for that locale alone — binding copy is never in-character, and English stays its single source of truth. See `src/i18n/CLAUDE.md`.**

**Rule: No emoji in `messages/` files** — they're untranslatable copy that can't be themed or recolored. When a string needs a glyph (warning triangle, checkmark, arrow), render a `lucide-react` icon next to the translated text in the component instead.

### Styling

**Rule: there is exactly one theme and it is dark — never write a light-mode fallback.** Tokens are defined once on `:root` in `src/app/globals.css`; there is no theme provider, no theme switcher, no `.dark` or `.light` selector, and no `dark:` variants anywhere in the codebase. So a `dark:` class never activates, a second palette can never be selected, and a comment reasoning about how something reads "in both themes" is describing a situation that cannot arise. All three are dead weight that still has to be maintained and still misleads the next reader into tuning a value nobody will see. If a light theme is ever wanted it is a project, not a fallback bolted onto one component: `color-scheme: dark` on `:root`, the email templates' `supported-color-schemes`, and every token's tuning all assume the dark ground.

**Rule: Never use hardcoded colors or raw Tailwind color classes (e.g. `text-sky-400`, `bg-red-500`).** All colors must come from CSS custom properties defined in `src/app/globals.css` and referenced via semantic Tailwind classes (`text-primary`, `bg-destructive`, etc.). For non-CSS contexts (email templates, canvas), use the hex constants in `src/lib/constants/colors.ts`. This ensures a single source of truth for colors and brand identity.

**Rule: Poppins is the app face — body copy and every heading not claimed by the display-font variable — and every face is loaded through `next/font`.** Space Mono is a sanctioned brand face loaded the same way and placed nowhere yet, pending the design pass; it is intentionally unused, not dead weight to tidy away.

**Rule: a `next/font` variable class goes on `<html>`, never on `<body>`.** The Tailwind theme block emits its font tokens at `:root`, so a face variable defined one element lower is invisible there and the hand-written body `font-family` collapses to the UA stack — while the `font-*` utility classes keep working, because those inline their `var()` at the use site where `<body>` is an ancestor. That asymmetry is the whole danger: the page still looks styled, so nobody notices. An earlier Inter wiring shipped this way and never applied for as long as it was live.

**Rule: Press Start 2P is approved for rare, specialized uses only — never as a face a surface reaches for on its own.** It is not among the brand Guidebook's sanctioned faces; it is an owner-approved exception, kept because the arcade glyphs are occasionally exactly right and no other face in the stack says that. What makes it work is scarcity: a display face used wherever a heading wants personality stops being a special effect and becomes the brand, which is a change nobody decided to make. So placements are reviewed in the design pass rather than added by whoever likes it, and a new one is a decision to raise, not a class to apply. (Logged as a deviation — see the brand section's pointer.)

**Rule: headings are sentence case — never Title Case Every Word, never ALL CAPS.** Proper nouns keep their capitals and nothing else does; this is the brand Guidebook's Appendix A.3 typography rule, owner-adopted 2026-08-24, and it is a house rule with teeth because inconsistent heading case is the one typographic slip a reader notices on every page at once. It binds the heading text in `messages/` and the CSS on the element alike, so `uppercase` on a real heading is the same defect as a Title-Cased string.

**The test is voice versus furniture, and the HTML tag does not decide it.** Sentence case wherever the brand is *speaking* — a page title, a card heading, a section heading a reader reads as a sentence; caps are institutional costume there. Caps are permitted on *furniture*: the small, muted, tracked markers a reader scans as structure rather than reads as prose — eyebrows, pills, field labels, table headers, the micro-heading over a list. The Guidebook's own topic-pill spec is bold caps, which is what settles it. An `h2` can be furniture and often is: the tag is there for the accessibility outline, and a `text-[11px]` muted marker over a rail card is a label whether it is an `h2`, a `p` or a `span`. **The corollary that catches the real mistakes: a furniture element and its identically-styled siblings case together** — de-capping an `h2` label while the `span` beside it keeps its caps is the defect, not the fix. And **caps and letterspacing travel as a pair**: a heading that goes sentence case drops its `tracking-wide`/`tracking-wider` in the same edit, because tracked lowercase reads as a rendering fault.

### Authored rich text

Some user-authored fields are stored as **markdown** rather than plain text, because markdown is the one format that renders in-app *and* converts cleanly into the email the same content is later sent as. The rules that govern it:

**Rule: markdown is rendered through the shared `Markdown` component (`src/components/ui/markdown.tsx`), never by converting it to an HTML string.** There is no `dangerouslySetInnerHTML` anywhere in `src/`, and adding one behind a field any user can type into is how a stored-XSS hole ships. The renderer produces React elements, refuses raw HTML in the source, and takes an **allow-list** of elements — anything outside it is unwrapped to its text rather than dropped, so an unsupported construct shows its words instead of silently deleting a paragraph of somebody's writing.

**Rule: whether an authored field carries links is a property of the field — of who writes it and who reads it — and never of who is looking.** The two halves of the line:

- **Staff-authored copy written to one family carries no links.** A session report is written by a gedu and read by a child's parent, so a link in one is this platform pointing a family somewhere it does not control. That is a safeguarding decision, not a rendering limitation, and it has not moved: the allow-list for such a field excludes `a`, the editor offers no link control, and a markdown link in a stored value unwraps to its plain label wherever it is rendered.
- **Admin-authored marketing copy on our own public pages does carry them.** A product page that cannot point at the game's own store, or back at our policies, is withholding the thing the copy exists to say; the reader is a stranger browsing a shop rather than a family being written to, and an admin is trusted with what they publish.

**The choice is made once, where the field is rendered, as a named variant that the renderer and the editor both take.** Keying it to the viewer, their role or the surface would let one stored value appear as a live link in one place and a dead label in another — the same sentence, meaning two different things depending on where you met it. So a field picks its variant and every surface showing that field passes the same one, and the conservative half is the default so a caller that has not thought about it gets no links rather than accidental ones.

**A link the renderer will not trust degrades to its own label rather than to an anchor with nowhere to go.** The markdown library already blanks any href outside its scheme allow-list (`javascript:`, `data:` and every character-reference spelling of them), but a blank href is not inert — it resolves to the current page — so an anchor with no destination must not be rendered at all. That is the same shape the no-links half produces, which is what makes it the right fallback.

**Rule: the rendered subset and the editor's toolbar are the same subset — and a variant is that matched pair, never one half of it.** Whatever the writer can produce is exactly what the reader can see styled — no more (an editor button whose output the renderer strips is a trap) and no less (a construct that renders but cannot be typed can only arrive by paste and will surprise whoever edits the field next). Widening one means widening the other **of the same variant** in the same change; adding a variant means adding both ends at once, and the two ends must carry the same names so no call site can pair a toolbar with the wrong allow-list. Levels of the same construct have to stay *visually* distinguishable in the rendered output too: three heading buttons that produce two visible sizes is a choice the writer cannot see themselves making. What a variant may legitimately change beyond the element set is *scale* — a note rendered in a card in a column and a page's own body copy need different heading sizes for the same markdown — and the editor's writing surface has to restate that scale, or a heading looks like a section title while being typed and like body copy once saved.

**Rule: only the editor may be loaded on demand — the renderer is always in the page bundle.** They look like the same kind of dependency and are not. A rich editor is a large one (a document model, a parser and a serialiser) that the overwhelmingly common visit never opens, so splitting it out is a real saving and its placeholder can hold the exact box the editor will fill. A markdown *renderer* is small and every visit reads the field, so deferring it buys nothing and costs the thing that matters most: the body appears after the page around it, and any affordance that depends on it (an expand control, a clamp's fade) lands later still, shoving everything below down as it arrives. **Anything a reader's first paint depends on must be decidable without the browser, and must then stay decided** — a server cannot measure text, so a control gated on a measured height cannot exist in server HTML. Decide it from the source with arithmetic both ends run identically, and let no post-mount measurement revise it. Seeding from the source and correcting from a measurement is the tempting middle ground and is worse than either end: it puts the affordance on screen a hydration after the text it belongs to, on exactly the borderline content where the reader is least likely to expect the page to move. An estimate that is occasionally a line eager or a line late is the price, and it is the right one — pick the arithmetic so both kinds of error are small and local, and write down the tolerance you accepted next to it.

**Rule: markdown is edited as rich text, not as syntax.** The people writing these fields are not writing documentation; asking them to remember what `##` does is how a formatting feature ends up unused. The stored value stays markdown either way — the syntax is an implementation detail of the column, not something a writer should ever meet. The editor (`src/components/ui/rich-text-editor.tsx`) is headless and styled with semantic tokens like everything else, is loaded on demand, and is only instantiated once a field is actually opened: a page holding many collapsed editors must not construct one per field.

### UI Component Reference
A living style guide is available at `/admin/ui-components` (admin login required). It shows every component variant, composite patterns, and the color palette. **Reference this page before creating new UI patterns.** The source at `src/app/(dashboard)/admin/ui-components/page.tsx` serves as copy-paste examples.

**What the page is for (two functions):**
1. **Fast UI iteration.** It renders components with hand-built mock data, so you can see and tweak a component without manually recreating its state through the normal app flow (no logging in as the right role, seeding a DB row, joining a live call, etc.). Demos feed fixtures directly — including a full mock context where a component reads one (e.g. the voice room renders inside a fixture `VoiceRoomContext.Provider`).
2. **A separation-of-concerns check.** It's a UI-only surface, so a component that's cleanly demoable here is one whose business logic lives elsewhere (in a provider/hook/service) and that just consumes data + actions. If a component is *painful* to demo — needs real network calls, can't be driven by fixtures — that difficulty is the smell signal that UI and business logic are too coupled; fix the coupling rather than forcing the demo.

**When to add a demo here — a piece earns one for exactly two reasons, and needs at least one of them:** it is *reused* (a component or composite pattern more than one surface renders, where the demo is the one place to see all its states side by side), or it *needs iteration* (the design isn't settled and refining it wants fast feedback cycles against fixtures rather than round-trips through the live app). **When not to:** anything with neither property — a one-off confirm dialog with settled copy, a page-specific layout — however component-shaped it looks. Also anything that can't render without live side effects — if you can't construct a plausible fixture for it, treat that as a design smell first, not a reason to wire real logic into the page. And a piece that earns a demo earns exactly **one**: its states render side by side inside that one section, because adjacent states compare themselves while states split across separate demos must be compared from memory — the exact slow round-trip a demo exists to eliminate. A caption that has to narrate which state the reader is looking at is the demo failing at its one job, showing it; fix the demo or its title rather than writing around it.

**Rule: for a piece that earns a demo, its home is decided by whether it needs the page around it to be judged.** The style guide is for anything that can be looked at on its own — which includes every overlay (a dialog, popover, sheet or toast opens above whatever summoned it, so the page contributes nothing to how it reads). A preview scene is for anything that can only be assessed against what sits near it — a feed, a card in a column, a panel in a rail are judged by how they sit against their neighbours, at that page's width, with that page's scrolling, and a demo card that isolates them throws away the only thing you needed to see. Ask what you would be unable to tell from a demo card; if the answer is "nothing", it belongs in the style guide, however large the thing is.

**Corollary: one home, not two.** When a scene renders something in context, the style guide does not also carry it — two homes for one thing is worse than either alone, and it is the style guide's copy that goes stale, because the scene is what gets opened when the design is actually reviewed. A component reused across surfaces still earns its section: no single page owns it, and the style guide is the only place to see all its states side by side. Let the style guide keep the reusable pieces and the self-contained overlays, and let scenes keep the page-shaped compositions built from them.

**Rule: a fixture id that feeds an identicon-style avatar must be a real, generated UUID, hardcoded as a literal.** The identicon is a pattern derived from the id's hex bytes, so a readable stand-in like `"mock-gamer-aino"` doesn't render a different-looking avatar — it renders a degenerate one (the non-hex characters parse to nothing, and the grid collapses), which quietly makes every avatar-bearing demo a false picture of the real thing. Generate the UUIDs once (`node -e "console.log(crypto.randomUUID())"`) and paste them in; **never** call a UUID generator at module load or render time, because the same person would then get a different face on every reload, which destroys the stability a fixture exists to provide and makes screenshots unreproducible. Where a spec or scenario needs to refer to a fixture person, give the ids a named map so the readable name lives in the key and the UUID stays the value.

### Full-page preview scenes

The style guide demos components; a *page-level* change has to be judged as a page — real chrome, real viewport, real scrolling. That's what a **preview scene** is: one fixture-driven page at `/preview/{surface}/{scenario}`, served by a single dynamic route from a central scene registry (`src/components/preview/`), admin-gated in the proxy, noindex, and listed automatically on the admin **UI Previews** page (its own sidebar entry, directly below UI Components). Scenes make page-level iteration cheap: sign the design off from fixtures first, wire it once afterwards.

**Rule: the registry is the only place a scene is declared.** The UI Previews page enumerates it, so adding a scene or a scenario surfaces its links with no edit to that page and no hand-maintained index anywhere. Scene titles, descriptions and scenario labels are literal English on purpose: they are developer-facing metadata on an admin-only page, never shown to a user, so they do not belong in the message files. They are also held to a budget: the title and the render carry the meaning, so a description that narrates the state the reader should be able to see is the scenario failing to show it — one line of why the scenario exists, or nothing.

**Rule: a scene never owns a layout — one body, two shells.** It renders the same presentational page body the live route renders: either the *live* body (a showcase that cannot drift) or the *draft* body that is going to replace it. Promotion means the draft body becomes the route's body and the data shell swaps fixtures for service calls; the layout does not change in that step. A scene that becomes a permanent third fork of a page is the rot this rule exists to prevent.

**Rule: chrome is composed, never simulated,** and never inherited by accident — each scene names the shell it wants and gets the real components (a dashboard scene renders the header plus the dashboard layout with no sidebar). **Rule: a scene mocks the whole page as the role meets it** — every section present, with backend-touching actions inert but rendering their real states, and pure-UI interactions working against local state. Faking or omitting a section because it's awkward to feed is the same separation-of-concerns smell the style guide exists to catch: fix the coupling (give the section a presentational core that takes rows/props), don't fake the section. The same boundary runs the other way: one scenario holds everything that can coexist in one render, and only a state the page cannot show alongside it — a different viewer, a different auth state, another value of whatever state the page keys on — earns a second scenario. The goal is the fewest scenarios that still cover the mutually exclusive states: states sharing a render compare themselves side by side, states behind separate links get compared from memory, and every extra scenario is another page to open, name, and keep from rotting.

### Customer Enrollment & Billing

See `docs/architecture/products.md` for the purchase / participation flow and the billing model (monthly family subscriptions for clubs, single upfront payments for camps/events).

### Voice Chat (Daily.co)

The full voice architecture auto-loads from colocated `CLAUDE.md` files when you work under `src/components/voice/` (scheduled group rooms) and `src/components/voice/instant/` (instant rooms). The 9-approach Web Audio investigation behind the volume workaround remains in `docs/records/chrome-webrtc-volume-bug.md` as history.

**Rule: Realtime hooks must only invalidate queries — never make Supabase data queries in callbacks.** Same deadlock risk as `onAuthStateChange`.

### Documentation

System architecture lives in **colocated `CLAUDE.md` files** next to the code they describe. They auto-load when you (or a future session) work in that directory — no pointer needed here — and are owned like code: update them in the same change that touches their system. Current homes:

| System | Location |
|---|---|
| Layout & scrolling | `src/components/layout/` |
| Game accounts (Minecraft, Roblox) | `src/components/game-account/` |
| Partner brand assets (Roblox, Lynx marks) | `src/assets/partners/` |
| Billing portal | `src/services/billing/` |
| Parent PIN | `src/services/pin/` |
| i18n | `src/i18n/` |
| Email templates | `src/lib/email-templates/` |
| Supabase clients & paged list reads | `src/lib/supabase/` |
| Locations | `src/services/locations/` |
| Product image catalogue | `src/services/product-images/` |
| WhatsApp | `src/services/whatsapp/` |
| Session feeds — shared gedu/family machinery | `src/components/session-feed/` |
| Group workspace — shared gedu/admin group page body | `src/components/group-workspace/` |
| Family product page (a family's club/camp/event page) | `src/components/family/product-page/` |
| Chat components | `src/components/chat/` |
| Voice — scheduled group rooms | `src/components/voice/` |
| Voice — instant rooms | `src/components/voice/instant/` |
| Discord bot | `src/app/api/discord/` |
| SOG-UI — the UI language package and its demo | `packages/sog-ui/` |
| Database / migrations | `supabase/` |
| Testing conventions | `tests/` |

- `docs/` holds the docs a human deliberately maintains and that don't map to one directory, organized by doc *type* — each subdirectory owns its rules in its own `CLAUDE.md`: `architecture/` (living cross-cutting systems and repo-wide topics), `investigations/` (researched, nothing decided), `plans/` (decided and ready to build; **deleted** when the work lands), `runbooks/` (procedures run against live systems), `records/` (frozen stories behind how something got the way it is), `feedback/` (outside input — things to consider, not to do). `docs/CLAUDE.md` carries the category map and house style; a doc fitting no category sits at `docs/` top level. When a topic is in neither a colocated `CLAUDE.md` nor `docs/`, treat the code as the source of truth.
- `TODO.md` is the running list of cross-cutting work we know we want to come back to. Distinct from `docs/`. **When an item is fully done with nothing left to discuss, delete it — don't check it off (`[x]`).** `TODO.md` tracks open work, not a changelog; the record of what was done lives in git history and in the docs/code the work produced. Leave `[ ]`/`[x]` only for partially-done items where the checked sub-points still give context for the open ones. **Additions need the owner's explicit approval**: TODO.md is the owner's backlog — a statement of where the project's attention goes — so on finding something worth tracking, propose it with its justification and write it in only once approved. A mention in a work summary is not approval. (Items an approved plan or the owner's own instruction already names are fine.)

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

Tests are in `tests/`, split into `unit/`, `integration/`, `db/`, and `smoke/`. The
classification rules and the per-category conventions (DB test helpers, integration-test
route-handler mocking, unit setup) live in **`tests/CLAUDE.md`** (auto-loads when you
work under `tests/`). Two things worth knowing from anywhere:

- **`npm run test` runs `unit/` + `integration/`** (jsdom). DB tests need a real Postgres
  and run in **CI only** — we have no local stack — so exercise them by pushing your
  branch, not locally.
- **Shared mock factories live in `tests/mocks/`** — add new mocks there rather than
  duplicating across files.
- **`smoke/` is the only CI job that builds the app**, and it asserts security headers
  and the per-request CSP against a served production build over plain HTTP. No browser
  is launched there; a test that needs one does not belong in that directory.
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

### Convert recurring bug classes to correctness-by-mechanism

**Rule: when the same class of bug keeps recurring on a surface — or a single instance would be expensive (money, auth, children's data) — and the rules for doing it right exist only as convention (docs, comments, review culture), the fix is the *class*, not the instance: convert the surface to correctness-by-mechanism.** Four steps, in order:

1. **Enumerate the surface as a regeneration command** (a grep, a glob, a catalog query) — never a frozen list; snapshots drift, commands don't.
2. **Classify every element by intent, machine-readably** — annotations a test can consume. The classification answers one question: *what would a missing guard mean here — a bug, or the design?* An element that can't be classified is the first finding.
3. **Build the CI completeness check**: every element carries exactly one classification, and every classification names its verifier. This is the load-bearing step — allowlist growth is the failure mode of every allowlist design, and the completeness check is what polices it.
4. **Ship the primitive that makes conforming the cheapest path** — a guard function, a wrapper, a canonical template, giving step 3 a single greppable call site to require.

The first two without the last two is an audit, not a fix: prose decays, a failing test doesn't, and fixing instances leaves the class alive. Keep the scope to one surface and one bug class per pass. Three standing instances show the shape: DB grants + RLS presence (the access-control DB test), DB function bodies (the authorization spine — `docs/architecture/db-authorization.md`), and the HTTP route layer (the posture registry — `docs/architecture/route-boundary.md`).
