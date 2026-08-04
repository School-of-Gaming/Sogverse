# Sogverse TODO

## Cleanup

- [ ] **Convict the intermittent "content shifts down ~20-40px moments after load" bug, then remove the tripwire.** A dev-only diagnostic (`src/components/dev/layout-shift-tripwire.tsx`, mounted in the root layout) logs every browser-detected layout shift with attributed nodes and before/after rects (`[tripwire]` console lines; ring buffer on `window.__layoutShiftLog`), and separately logs any soft-nav landing with non-zero scrollY — the two suspect families from the 2026-08-04 investigation. Standing suspects, all live in prod code paths: (1) the spoken-languages filter row pops in (~38px) above the shop/schools product grids when an earlier page's failed server prefetch poisoned the shared query key — the row is rendered with no reserved box (`src/components/public/products/product-browse-filters.tsx`, unlike the Clear button right above it), and the global 60s `staleTime` defers the heal to a later mount/focus refetch, which is why reload-based repro can never show it; (2) the parent/gamer dashboard prefetches `catch { return [] }`, so a transient failure paints empty sections that heal the same delayed way (session cards ~200px, band labels ~40px — the SessionsSection comment claiming the labels can't arrive late assumes the prefetch succeeded); (3) Next.js soft navs preserve scroll offsets smaller than ~the header height (segment-visibility check), so pages land 20-40px high — the layout-shift API is blind to scroll, hence the landing channel. Related doc rot: ~10 comments claim seeded hooks "refetch on mount", which the global `staleTime` disables. When a sighting lands in the console, fix the named culprit, delete the tripwire, its layout.tsx mount, and this item.

- [ ] **Decide the theme story — the "dark mode via next-themes" claim is false and the `.light` tokens are dead.** `next-themes` is not a dependency (zero hits in `package.json`/lock), nothing ever applies a `light` class, and `<html className="dark">` is hardcoded in `src/app/layout.tsx` — yet root `CLAUDE.md`'s Styling section says "Dark mode is default (class-based via next-themes)" and `globals.css` carries ~49 lines of `.light` tokens nothing can activate. Either light mode is planned (then wire a real theme switch and keep the tokens) or it isn't (then delete the token block). Correct the `CLAUDE.md` sentence as part of whichever pass — today it misleads every session that reads it.

- [ ] **`DashboardSectionPill` hardcodes the header offset in three places, against the layout doc's own rule.** `sticky top-20` (`src/components/layout/dashboard-section-pill.tsx`), the `REFERENCE_OFFSET_PX = 144` scroll-spy constant, and every consuming section's `scroll-mt-32` all encode header-height-derived numbers as literals; the component's own comment admits the coupling ("keep these in sync"). The home pill and the product-detail sticky rail derive from `--header-height` correctly — converge this one on the same variable (`top-[var(--header-height)+...]`-style arbitrary values) so a header resize can't strand it.

- [ ] **Re-decide the ~14 pre-existing loading skeletons against the loading rule.** The ~250ms reveal gate is gone (root CLAUDE.md now picks the affordance from what the call *is*, not from a timer), and `useRevealAfter` went with it. Roughly fourteen files still paint an instant solid-pulse placeholder over reads nobody has classified: auth pages, admin users/product pages, parent gamer page, ProfileTiles, groups panel, gamer picker. Each needs the same one question asked — cached, small-and-indexed, or genuinely slow — and most will end up rendering nothing in a correctly-sized box, as the locations picker now does. This is a judgement pass, not a mechanical one; do it with the queries open, not the components.

- [ ] **Per-participant volume slider — wiring removed; would be desktop-only if revived.** The discrete-zone redesign dropped the per-participant volume slider; the `element.volume`/`base` multiplier plumbing was then removed entirely when audio routing switched to a binary `element.muted` (zone in/out is the only control; see `src/lib/voice/audio-routing.ts`). **A volume slider can't work on iPhone:** iOS Safari ignores `element.volume` *and* the Web Audio `GainNode` path for WebRTC (volume is hardware-buttons-only), so a true per-participant volume would be desktop/iPad-only — reconsider whether it's worth a platform-split control before reviving it. To restore: bring back a per-remote multiplier (`isAudible` → a volume number on non-iOS), a `setParticipantVolume` action, and the slider; gate it off mobile.

- [ ] **Restore per-action email notifications for group changes.** The apply route sends no emails (`src/app/api/admin/products/[id]/groups/apply/route.ts` has a comment saying so explicitly); the old groups flow notified affected gedus/gamers/parents. Now that each action auto-saves, wire notifications per action. This is the last parity gap with the old groups flow — a visible product with zero groups is fine (signups land in the Unassigned section, `participations.group_id` is nullable), so no zero-groups visibility warning or auto-hide is needed.
- [ ] **Build the Minecraft join-check session-gating against the current product system.** `src/app/api/minecraft/join-check/route.ts` is a shell: it checks the API key, validates the uuid, and answers 501 to everything. Its original gating queried the now-dropped legacy product/groups tables, so it has not authorized anyone since; the dead lookup was removed rather than left limping, because it had no consumers and had to be rewritten anyway. The URL, its auth contract, and the public `/docs/minecraft-api` page are all still live, so this is a body to fill in, not a route to invent. Build it against the current schema: a gamer is allowed when they hold an active `participations` row on a product whose session window is open right now (and the participation covers it); a gedu is allowed via a `gedu_group_assignments` row on such a product. The window math lives in `@/lib/session-schedule` but is shaped for a single-slot product — a product has multiple `schedule_slots`, so that helper needs reworking too. **`/docs/minecraft-api` already documents the response contract** (`allowed`, `role`, `firstName`, `endTime`, `reason`) — treat it as the spec, and correct it if the rebuild lands somewhere else.
  - **Write it as an entitlement question, not an identity one — a Minecraft UUID does not name a single Sogverse user.** The `UNIQUE` on `minecraft_accounts.minecraft_uuid` was dropped so siblings can share one Minecraft account across two Sogverse accounts, which means a reverse lookup by UUID returns a **set of rows**, not one. The question to answer is *"does anyone holding this UUID have access to this server right now?"* — gather every linked user and allow if any of them qualifies; a single-row read breaks the moment a shared account appears. This is not a regression the drop introduced: no constraint could ever have told the server *which* sibling is at the keyboard. If a future feature genuinely needs the individual (per-gamer progress, attendance credit), it needs its own mechanism — an in-game selection, or matching against who currently holds an open session — not a database constraint.
- [ ] **Pill clicks don't reflect the section in the URL — add a hash push (outbound only).** Both `src/components/layout/dashboard-section-pill.tsx` and `src/components/home/section-pill.tsx` intercept clicks with `e.preventDefault()` + `scrollIntoView({behavior:"smooth"})` and never push the hash, so the URL stays at `/parent` regardless of which pill is active and the position isn't shareable/bookmarkable.
  - **Desired behavior (two distinct cases — must be handled separately):**
    - *Click a pill:* smooth scroll **and** the URL updates to `#id`. (Keep the smooth scroll — that's the whole reason the handler intercepts the click.)
    - *Direct load of `/parent#billing` (or any `#section`):* land at the section instantly on first paint — no animated scroll, no jump.
  - **Inbound is already solved — do NOT add code for it.** Native browser fragment scrolling already lands direct loads at the section instantly, because these sections are server-rendered with `id` + `scroll-mt-*`. This is exactly why returning from the Stripe portal to `/parent#billing` (return URL hardcoded in `src/app/api/parent/billing-portal/route.ts`) scrolls correctly today, with zero pill involvement. The admin UI Components page (`AnchorHeading` in `src/app/(dashboard)/admin/ui-components/page.tsx:84`) leans on this same native mechanism with plain `<a href="#id">` anchors. **Adding a `scrollIntoView` on mount would reintroduce an animated scroll-from-top on load — the exact jump we don't want.**
  - **Why we can't just copy the admin page's plain-anchor approach:** native anchors scroll *instantly* on click (there's no `scroll-behavior: smooth` anywhere — not in `globals.css` or any CSS), which would lose the pills' smooth scroll. CSS can't rescue this: a global `scroll-behavior: smooth` would also animate the inbound load case, violating "instant on direct load." Smooth-on-click vs. instant-on-load genuinely requires the JS split — keep the click handler, let native handle load.
  - **Fix:** add `history.replaceState(null, "", \`#${id}\`)` to each pill's `handleClick`, after the existing smooth `scrollIntoView`. `replaceState` (not `pushState`) so clicking pills doesn't stack back-button history entries. One line per pill; no mount/inbound code. Apply to both pills.
  - **Known residual (out of scope, note only):** on direct load, if a client-loaded section *above* the target grows taller after first paint (e.g. `MyGamersGrid` populating above `#billing`), native scroll lands before the growth and the target gets shoved down afterward. Doesn't bite billing today. The real remedy is stable-height skeletons for above-the-fold sections, not anything in the pills.
- [ ] **`NextSessionCard` shows a "Live" Join button that does nothing for in-person products and unassigned participations.** `src/lib/upcoming-sessions.ts:63-66` collapses `voiceHref` to `"#"` when `!product.isRemote || !row.groupId` (the latter is an unassigned participation — no voice room, see `products-architecture.md`), but `voiceIsOpen` is still flipped to true purely on the window math at line 109. Result: the gamer dashboard renders `<Link href="#">` and the parent dashboard's `onJoinClick` no-ops via `if (session.voiceHref === "#") return;` — a button that looks indistinguishable from a working live join. Fix is small: fold the destination into `voiceIsOpen` (`liveWindow && voiceHref !== "#"`) so these rows render in their locked state, or hide the button when `voiceHref === "#"`. Only matters for the two cases above; remote+assigned rows are fine.
- [ ] **Parents/gamers lose access to padlet + session notes after the final session.** The parent/gamer dashboards drop "past" sessions from their lists (`expandUpcomingSessions` filters by `end + SESSION_WINDOW_AFTER < now`), so the Padlet link and any session-level notes are unreachable after the run ends, even though the product isn't deleted. The notes UX question is now decided: notes are **per-session** (a public note per session, forming a blog-like chronological feed of the group's story — the gedu-side session feed ships first and defines the data). The open work here is the parent/gamer phase: a read-only feed of their group's session reports (gedu notes and attendance never shown), reachable for finished products too — which means deciding how ended products surface on their dashboards (greyed "Ended {date}" cards, a Past section, or links from somewhere else). The gedu side has shipped, so the data exists: reports are markdown on the session row, keyed `(group, product-local date)`, and links are blocked by policy in the renderer — the parent read inherits both.

  **Session reports replace the Padlet entirely** — the gedu surfaces already dropped the link. Once the parent/gamer phase consumes reports, retire the Padlet in one pass: drop `products.padlet_url`, its admin form field and details-page fact, and the parent/gamer render sites. Two things go with it — the `padletUrl` field on the gedu assigned-product session row type (`src/services/assignments/`), which nothing has rendered since the gedu surfaces dropped the link and which is dead already, and the `padlet_url` parameters on `create_product` / `update_product`.
- [ ] **`@vercel/analytics`'s optional Svelte peer can force `npm install --force` — but only in one narrow scenario, which the committed lock already neutralizes.** Adding `@vercel/analytics` (commit `994a4cf`) made that *one* `npm install` fail with `ERESOLVE`. The chain: `@vercel/analytics@2` declares `peerOptional @sveltejs/kit@"^1 || ^2"`; that drags in `@sveltejs/kit` → its peer `@sveltejs/vite-plugin-svelte@7` → which hard-peers `vite@^8`, conflicting with the project's `vite@7.3.x` (held by `@vitejs/plugin-react` ← `vitest`). We don't use SvelteKit — it's purely the optional-peer resolver reaching for a framework we don't have.
  - **Root cause (verified empirically 2026-06-09, registry time-travel via `npm install --before=…`):** three things stack up. (1) In npm, `peerOptional` only suppresses the *missing-peer warning* — it does **not** stop npm from *trying* to install the peer. (2) npm's two resolvers handle the unsatisfiable optional peer differently: a **fresh resolve** (`npm ci`, or any install with no lock) builds the whole tree at once and **silently prunes** it (no Svelte, no error); an **incremental `npm install <pkg>`** realizes the *new* package's full peer set on top of the frozen lock and surfaces the `vite@7`-vs-`vite@8` collision as a hard `ERESOLVE` instead of pruning. (3) The collision only materializes when `vite@7` is firmly pinned — it takes **`vitest` + `@vitejs/plugin-react` together** to peg it immovably; neither alone triggers it. Net: the trigger is *exactly* "add `@vercel/analytics` to a lock that already pins `vite@7` without it" — i.e. the one-time 994a4cf operation.
  - **It is NOT a live footgun for day-to-day work.** Verified: against the committed lock, `npm install <any-new-dep>` resolves clean (exit 0), and a full no-lock reinstall (`rm package-lock.json && npm install`) resolves clean. The earlier "the next person to run `npm install` hits `ERESOLVE`" framing was wrong. The `--force` lock (commit `6e4109a`) froze `@vercel/analytics` resolved *without* the Svelte subtree, so every subsequent `npm ci` / `npm install` / `npm install <dep>` reuses that resolution and never re-enters the failing path. It was never npm, the registry, or upstream that "fixed" it — the conflict is still live in the registry today; the committed lock is what keeps it dormant.
  - **Do NOT use `--legacy-peer-deps`.** It appears to work but strips *real* peer deps too — it silently dropped `date-fns` (the peer of `date-fns-tz`) and produced an out-of-sync lock that broke CI (the failure fixed in `6e4109a`). If you ever genuinely need to re-add analytics from a vite@7-pinned lock, `--force` is the correct flag.
  - **To kill it permanently (both verified clean against the real manifest):**
    - **(A) Surgical band-aid — one `overrides` entry:** add `"@sveltejs/vite-plugin-svelte": "^6"` to the existing `overrides` block in `package.json` (v6 accepts `vite@^7`, so the optional chain becomes resolvable and npm prunes it cleanly — **no Svelte packages get installed**). Needs a comment explaining why a non-Svelte repo pins a Svelte plugin, or the next dev will be baffled. Low risk, no behaviour change.
    - **(B) Root fix — move to `vite@8`:** this dissolves the conflict at the source (analytics' `vite@^8` peer is then satisfied). It's a coordinated bump: `@vitejs/plugin-react@6` *requires* `vite@8`, and `vitest@4` accepts `vite 6/7/8`, so it's **`vitest 3→4` + `plugin-react 5→6` + `vite 7→8` together**. Bonus: `vitest@4` also unblocks `vitest-mock-extended@4`. **Caution:** we already tried and rolled this exact combo back once — commit `b35234e` (2026-04-23) "Downgrade vitest 4 → 3 and plugin-react 6 → 5 to end lockfile drift" — so budget time to resolve whatever that drift was.
- [ ] Add CHECK constraints to `profiles.locale` (`IN ('en', 'fi', 'sv', 'tlh')`) and `profiles.currency` (`IN ('EUR', 'SEK', 'USD', 'GBP')`) — both are plain text columns with app-level validation only
- [ ] **Enforce required `last_name` on the parent register API and `profiles.last_name` column.** `RegisterForm` now marks last name `required` (UX-only), but `supabase.auth.signUp` accepts any `options.data` payload and the `profiles.last_name` column is nullable — a scripted/API caller can still create a parent account with no last name. Tighten the server side to match: add a NOT NULL + length check on `profiles.last_name` (after backfilling any existing nulls — check whether the trigger that creates the profile row from `auth.users.raw_user_meta_data` needs adjusting too), and validate the field in whatever server-side path handles parent signup.
- [ ] **No rate-limiting / bot protection on the public gedu endpoints — accepted for now, don't let it get lost.** Self-registration added two unauthenticated surfaces: `POST /api/gedu/register` (creates an auth user + profile + `gedu_profiles` row per call — a bulk account-creation / resource-exhaustion vector) and `GET /api/minecraft/verify` (was role-gated, now public because `/register-gedu` calls it before any account exists — an open, unauthenticated proxy to Mojang's username→UUID API; hammering it can exhaust Mojang's per-IP rate limit and break Minecraft verification for *all* users). Both are read/write-light and the registration shape mirrors the existing public parent `/register`, so the risk is accepted today. Mitigations when revisited: an IP rate-limit (and/or a CAPTCHA on registration) in front of both routes; a short-TTL cache on the Mojang lookup so repeated probes don't fan out to Mojang.
  - **`GET /api/roblox/verify` is now a third such surface, and it is the sharpest of them — treat it first when this is revisited.** It is the same shape as the Minecraft one (public because a username is checked before any account exists) but it is worse in three specific ways. One inbound request fans out to **three** upstream calls — username→id, then id→bust *and* id→headshot (the compact figure's render, added when the row grew a `head` variant; the two thumbnails are issued in parallel, so this costs latency once but budget twice) — so it amplifies 3×. The thumbnail hops are rate-limited to **60 requests per minute per IP**, and a serverless fleet shares its egress IPs, so our whole deployment draws on one bucket that a modest script can drain; the route deliberately keeps the browser off that hop, which means we absorb all of it. And there is no cache, so probing one username repeatedly fans out every time. The consequence of exhausting it is degraded rather than broken — the avatar resolver returns `null` and verification still succeeds without a picture — but a short-TTL cache keyed on the username buys more here than anywhere else on this list. Unverified gedus can't reach any child data (access keys off `gedu_group_assignments`, which the verification gate blocks), so the registration spam is a resource/cleanup concern, not a data-exposure one.
  - **`GET /api/roblox/avatars` is a second amplifier on the same bucket, and it is the one that runs on every page view.** It draws from the identical 60-per-minute-per-IP thumbnail budget as the verify route above, so the two contend: exhausting one degrades the other. It is *milder* per call — one upstream request per figure asked for (the default is the full figure alone), and the cost is independent of how many ids are in the batch, so a hundred-row roster still costs one — and it requires a session, so a stranger cannot reach it at all. But it is the one on the hot path: every settings, gamer-detail and admin-user view resolves a render. **Intended shape when this is picked up:** the in-repo precedent is the feedback route's atomic RPC limiter (a counter incremented and checked in one statement, so two concurrent requests cannot both pass), applied per user rather than per IP here since the route is authenticated.
  - **The likely next move is caching the resolved URLs on our end, and it is worth more than the limiter.** The thumbnail JSON is `no-cache` upstream, but the CDN URLs it *names* are effectively immutable — they change only when someone redesigns their avatar — so a server-side cache keyed on `roblox_user_id`, holding the resolved URL with a generous TTL, collapses repeat views to zero upstream calls. **Cache the URL, not the image bytes**: proxying images would put our egress in front of a CDN already doing that job. It is independent of the limiter and helps the commoner case (the same accounts viewed again and again), so it is worth doing first.
- [ ] **A gedu can fix a roster member's Minecraft username but not their Roblox one.** Every other surface treats the two platforms identically; the gedu session roster is the one gap. Two halves to it, and they are separable:
  - **The write.** The gedu path goes through `set_group_member_minecraft`, which names Minecraft columns — so closing this means a Roblox sibling (or a platform-parameterised replacement) with the same authorization shape: the RPC re-derives from `auth.uid()` and refuses any gamer not actively participating in a group that gedu is assigned to, so the target check stays in the database rather than in a route. Plus its contracts, its route, and the write-IDOR/db coverage the existing one has.
  - **The display.** The roster does not draw Roblox figures at all today. It must not resolve them per row — that is N requests against a per-IP thumbnail budget the whole fleet shares, which one roster can drain. The by-id avatars route already takes a batch and answers in one request per figure regardless of id count, so the roster collects the ids it needs, asks once, and hands each row its URL. A roster wants the `head` figure, which is the second figure and therefore a second upstream request; see the rate-limit item above.

- [ ] **Stop logging expected conditions at `error` level — they drown out real errors in Vercel's `level:error` view.** A two-week sweep of prod/staging `level:error` logs (2026-06-30) was 20-for-20 benign, all routine conditions emitted as errors. Signal-to-noise only; nothing here is a reliability problem. The offenders:
  - **Daily.co "room not found" 404s.** `dailyFetch` (`src/lib/daily.ts:51`) does a blanket `console.error` on *any* non-OK response, before throwing — even when the caller expects the 404 and handles it. `getDailyRoom` (`daily.ts:109`) catches the throw and returns null, so the 404 is fully absorbed, but the error line already fired. This fires for `/api/voice/instant/exists` (the existence check itself — returns 404 by design) and for `/api/voice/token` (the GET half of `getOrCreateDailyRoom`'s get-or-create — room doesn't exist yet, gets created, route returns 200). Fix: don't `console.error` inside `dailyFetch` for statuses the caller branches on (esp. 404); let the caller decide, or pass a flag to suppress.
  - **`AuthApiError: Invalid Refresh Token: Refresh Token Not Found`** from `serverless-middleware` (the proxy) on `/`, `/reset-password`, `/select-profile`. Routine `@supabase/ssr` dual-refresh: a visitor arrives with a stale/expired refresh-token cookie, the server refresh fails, they're treated as logged-out (responses are 200/307). Also its sibling `Too many concurrent token refresh requests` (409 conflict) — the browser/middleware refresh race. Drop both to `warn`/`info` where the proxy catches them.
  - **`generateLink error: User with this email not found`** on `/api/auth/forgot-password` — a reset requested for an unregistered email. The route correctly returns 200 (anti-enumeration); the log is the only noise. Drop to `info` or don't log.
- [ ] **Consolidate hand-rolled badge pills onto the shared `<Badge>`.** ~11 places render a small status/label pill as a raw `<span>`/`<div>` (`rounded-full` + `px-` + `text-xs` + a bg tint) instead of `src/components/ui/badge.tsx`. **Root cause:** `<Badge>` only offers *solid* fills (`default/secondary/destructive/outline`) — no soft tints (`bg-primary/10`, `bg-destructive/20`) and no semantic `success`/`warning`/`info` tones, which is exactly what every hand-rolled one reaches for. So the high-leverage fix is **add soft/semantic variants to `<Badge>`** (e.g. a `tone` prop or `soft-*` variants, plus an `/admin/ui-components` demo), then fold the bespoke spans in. Strongest candidates, in order:
  - **Product lifecycle status badge** — the `STATUS_STYLE` color map is duplicated *verbatim* across `src/components/admin/products/product-rows.tsx` (lines ~29-36, ~168) and `product-details-page.tsx` (lines ~49-56, ~238). Extract one map + a `<ProductStatusBadge>`. (Note: `product-details-page.tsx`'s visible/hidden pill was already migrated to `<Badge>` — the status pill sitting right next to it is the leftover.)
  - **Gedu person chip** (avatar + first name) — identical markup duplicated in `src/components/gedu/session-details/PeerGroupCard.tsx:67` and `AssignedGroupCard.tsx:78`. Embeds an `<Avatar>`, so it wants a shared composite, not a plain `<Badge>`.
  - **Soft-tint semantic pills** — `schools-browse.tsx` `StatusPill` (`:257`, `bg-primary/10`) and the HTTP status-code badges in `docs/minecraft-api/page.tsx` (~6 spans wanting success/warning/destructive tints). These unblock once `<Badge>` grows tinted variants.
  - **Lower priority / bespoke** (icons or `text-[10px]`/uppercase sizing — case-by-case): `product-rows.tsx:176` hidden flag, `location-picker.tsx` type label on the selected-location card, `schools-browse.tsx` count pill, `voice/ZoneList.tsx:333` private-zone lock, `whatsapp/page.tsx:209` date divider. Also note a *good* existing pattern to consider folding into instead: `src/components/public/products/status-chip.tsx` (`StatusChip`, already has tones + sizes + optional icon). Own branch — bigger than a mechanical swap.
- [ ] **Split subsystem-specific rules out of root `CLAUDE.md` into nested CLAUDE.md files.** Root CLAUDE.md is ~9k tokens and loaded on every turn. Claude Code lazily loads `CLAUDE.md` from any ancestor directory of a file being read/edited, so subsystem rules can live next to the code they govern — they cost zero tokens until that subtree is touched, and become *more* prominent (loaded alongside the code) when it is. Candidates, in rough ROI order:

  - **`src/components/voice/CLAUDE.md`** — done: the scheduled-room voice architecture now lives here (instant rooms in `src/components/voice/instant/CLAUDE.md`), with the Web Audio volume workaround folded in as a self-contained rule. The realtime-hook invalidation rule still lives at root under "Voice Chat". (Shipped via the docs→colocated-CLAUDE.md effort, which also moved layout, PIN, i18n, email, locations, whatsapp, and discord docs next to their code.)
  - **`src/services/groups/CLAUDE.md`** — only worth adding if a standalone `src/services/groups/` module survives; group management currently lives under the product surfaces.
  - **`supabase/migrations/CLAUDE.md`** — function/table access control rules (REVOKE EXECUTE default, RLS required on new tables, INSERT/UPDATE policies must authorize both actor and target, `SELECT ... FOR UPDATE` for financial reads) and the RPC nullability fix pattern (`Omit` + intersection in `src/types/index.ts`). These only matter when authoring migrations.
  - **`tests/db/CLAUDE.md`** — the DB Test Conventions table (helpers, `TEST_IDS`, `TEST_CREDENTIALS`, `SEED` constants).
  - **`tests/integration/CLAUDE.md`** — the Integration Test Conventions code example (`vi.mock` shape, `requireRole` mock pattern).
  - **`supabase/CLAUDE.md`** (borderline) — the 5-step migration workflow (write SQL → push → regen types → check `index.ts` aliases → commit together). Currently at root because it's procedural and useful to know; could move since it only fires when actually running a migration.

  **Stays at root** (genuinely cross-cutting): RBAC overview, auth/CSP rules, Layout & Scrolling, Loading & Disabled State, Date/Time, Locale vs Spoken Language, Styling/colors, Lint discipline, tech-stack overview, Service Layer Pattern (it's a navigation aid for new contributors more than a rule).

  **Why this matters beyond token cost:** the bigger win is *relevance routing* — when I'm working on tokens code, the token rules load alongside the file and are the first thing I see; when I'm not, they're not in my way. Today every rule is mixed together at root and competes for attention. Estimated drop in always-on context: ~1.5–2k tokens.

  **How to verify after splitting:** open a file in each target subtree, check that `/context` shows the nested CLAUDE.md as loaded and the root file is correspondingly leaner. Confirm a sample rule (e.g., the `apply_group_changes` RPC rule) no longer appears in a fresh-session context dump until a `src/services/groups/*` file is touched.

### Session calendar dropped from the product detail page — component preserved

The product detail page no longer renders the session calendar: `CalendarCard`
was removed from `src/components/public/products/product-detail-page-body.tsx`
because we're not ready to go live with it. The reusable pieces were **kept, not
deleted** — `src/components/calendar/session-calendar-view.tsx` (the
presentational month/session grid) and
`src/components/calendar/compute-product-sessions.ts` (expands a product's slots
+ holidays into dated sessions), plus their `productDetail.calendar.*` and
`productDetail.sections.calendar` message keys. With the detail page no longer
mounting them, they have **no remaining consumer**, so a dead-code sweep (cf. the
knip note above) would flag them, and there's no `/admin/ui-components` demo
keeping them visible.

The one thing the calendar uniquely surfaced — a club's term date range — is now
shown without it: `ProductOverviewCard` folds the range into its Schedule cell
(keeping the 2×2 fact grid) via the shared `formatClubTermDates`
(`src/components/public/products/format-product-term-dates.ts`), which the admin
details page now uses too. Camps/events already carry their dates in the schedule
line, so the helper returns null for them.

- [ ] Decide: wire the calendar back into the detail page (and add a standalone
  `/admin/ui-components` demo so it stops being invisible and rotting), or delete
  `session-calendar-view.tsx` + `compute-product-sessions.ts` and their message
  keys for good.

### Locations: one seeded table, browsed and searched on the server

Both countries are seeded complete and admins never hand-type a place name: everything above a `site` is seed data, and a site is the only row the app creates (see `src/services/locations/CLAUDE.md`). Follow-ups:

- [ ] **`useUpdateLocation` + the `PATCH /api/admin/locations/[id]` route have no caller.** Nothing in the UI renames a location — the naming dialog is only ever opened in "add a site" mode — so the route, the hook and the dialog's edit mode (`src/services/locations/`, `src/components/admin/location-form-dialog.tsx`) are dead. Remove them, or repurpose if we add a site-rename affordance to the venue picker.
- [ ] **Consider enforcing site-only creation server-side.** `POST /api/admin/locations/create` is the only route that inserts a location, and `createLocationBody` (`src/services/locations/locations.contracts.ts`) still accepts any `location_type` — the site-only restriction is UI-only, so a scripted admin call could still create a region or a municipality by hand and put an unofficial row in seeded reference data. Tighten the contract to `type === 'site'` if we want the invariant enforced at the API.
- [ ] **Dead i18n keys in `admin.locations.*`.** `title`, `description`, `searchPlaceholder`, `noLocationsYet` and `noLocationsMatchSearch` have no consumer; the naming dialog still uses the rest of the namespace. `noLocationsYet` is also wrong on its face ("Add a country to get started" — you cannot). Prune them across all five `messages/*.json` when convenient.
- [ ] **The "every site" whole-list read lost its last UI caller.** The product form's venue field now reaches sites through the tree dialog (search, or a municipality's venue list), so nothing renders a flat list of every venue any more and the hook wrapping that read has no consumer. It was left in place deliberately rather than deleted in that change: the service read behind it is the vehicle three test suites use for things nothing else covers as well — the shared paged walk end to end, the deepest (four-level) ancestor embed, and the same chain against a real database — so removing it means re-homing those onto the keyed read and the municipality read first, including a DB test that can only be exercised in CI. Do that, then delete the read, the hook and its re-export; or give the flat list a surface (an admin "all our venues" page) and the question goes away.

### Unbounded list reads silently truncate at PostgREST's `max_rows`

`max_rows = 1000` (`supabase/config.toml`) is enforced by **truncating** the response, not by erroring, so an unbounded select is indistinguishable from a complete one. Confirmed against the hosted staging project on 2026-07-30: an anon select on `locations` (~35k rows) returns exactly 1000 rows and no error. `src/services/locations/` is the only place that pages — its `walkPages` primitive walks `.range()` until a page comes back short and cross-checks what it collected against `count: "exact"`. Every other list read across `src/services/` is unbounded, so each one has a silent correctness cliff at 1000 rows. The two that matter, worst first:

- [ ] **`/admin/users` starts answering *wrongly* past 1000 profiles, and prod was at 482 on 2026-07-30.** `getAllUsers` / `getUsersByRole` (`src/services/users/users.service.ts`) select every `profiles` row with no paging, ordered `created_at DESC`, so past the cap the **oldest** users silently disappear. That's worse than a short list: the page builds its id map and its parent↔gamer link maps from the same truncated array, so a gamer whose parent registered before the cutoff renders as unlinked — a wrong answer, not a missing row. The truncation is actively masked, because search is a separate query: an admin can find a user the list claims does not exist. (That search path has its own quiet cap — `.limit(20)` with no "more results" indicator.) `profiles` only grows; parents, gamers and gedus all live there and nothing deletes them. Page both reads through the locations `walkPages` primitive, and give the page real pagination or server-side search.
- [ ] **The `/schools` product fetch is unbounded, and its row budget is consumed by clubs that have already ended.** `listVisibleByTypes` (`src/services/products/products.service.ts`) fetches every visible municipality club with no paging; both `/schools` and `/schools/<slug>` use it and narrow client-side. Past 1000 the oldest clubs vanish from their municipality's page, the index stops flagging that municipality, and the municipality page's `notFound()` gate can fire. This arrives sooner than live-club count suggests: the SQL filter keeps `status in ('pending','running')` while the "this club has ended" judgement runs in JS *after* the fetch (nothing flips stored status), so every past term's clubs keep occupying rows of the 1000 while contributing nothing to the render. Push the ended-club predicate into the query, and page the read. Staging was at 50 visible muni clubs and prod at 20 on 2026-07-30, so this is the less urgent of the two.
- [ ] **`/schools/<slug>` ships every municipality club in the country to render one municipality's cards.** The per-municipality page deliberately prefetches *all* visible muni clubs — that is what lets `initialProducts` seed the `["municipality_club"]` React Query cache exactly and keeps the client refetch flicker-free — then narrows in the browser. Measured on 2026-07-30: 50 clubs = 92.6 KB of JSON (~1.85 KB/club) inside a 249 KB page. Fine at that size, and 500 clubs would still only be ~925 KB, so this is waste rather than danger. But 1.85 KB/club is a floor: `product_translations(*)` pulls `long_description` for every locale, and only 3 of 130 translations have one today, so real marketing copy across five locales inflates it severalfold. Scope the fetch to the one municipality server-side (it then needs its own query key — the shared all-clubs key is exactly what the current approach buys) and stop selecting `long_description`, which no browse card renders.

### Deferred billing for future-start clubs

Now unlocked by the one-Stripe-sub-per-participation model (each consumer-club signup is its own sub — see `docs/products-architecture.md`, "Billing"). Because every sub stands alone, a signup for a club whose `start_date` is in the future can defer its **first charge** to that date without affecting any of the family's other clubs — set `subscription_data.billing_cycle_anchor` (or `trial_end`) to the product's start moment on the Checkout Session in `src/app/api/checkout/products/create/route.ts`. €0 today, first full charge on the start date. This was impossible on the old shared family sub (one anchor for the whole family). Not built yet — deliberately deferred.

- [ ] Decide the rule for **threshold-start** clubs (no fixed `start_date`): simplest is to charge immediately as today (there's no date to anchor to); deferring those would need a job that anchors the sub when the product flips to `running`. See the AskUserQuestion discussion that scoped this.
- [ ] Parent-facing checkout copy must make "you won't be charged until {date}" explicit.

### Localize the subscription line-item name on the Stripe Checkout page

**Core problem:** a parent should see their subscription named in the locale they expect, whenever the club has a translation for it. Today they don't — on the Stripe Checkout page for a *subscription*, the headline **line item** shows the cached Stripe Product's name, which `pickTranslationName` (`src/lib/stripe/participation-prices.ts`) resolves English-first (`en → fi → translations[0]`) with **no viewer step**. So a Finnish parent who saw "Minecraft-kerho" throughout the app — and now gets Finnish Checkout chrome and a Finnish subscription *description* (both shipped on `feat/checkout-locale`) — still sees the **line item** in English. Two languages for the same club, stacked on one page.

**Scope: subscriptions only.** Camps/events build their line item inline via `price_data.product_data.name` from the locale-aware `pickProductName`, so they already match the parent's locale. This seam exists *because* Stripe subscriptions must reference a persistent Price → Product, and we cache **one shared Stripe Product per club** (`ensureStripeProductForProduct`, found by `metadata.product_id`). That single Product carries one name, shared across all locales, frozen at first sub.

**Hard limitation that caps the value of any fix:** a live subscription's line item is bound to its Price → Product, which is **immutable**. So any fix only makes the name match **at signup**; if the parent later switches their app language, the existing sub's line item stays in the language they bought in. Stripe cannot retranslate a live sub.

**Two ways to fix, if/when picked up:**
- **A1 — per-locale cached Products/Prices.** Migrate `product_subscription_prices` PK `(product, currency)` → `(product, currency, locale)` (+ `locale` column, backfill `'en'`); thread the parent's resolved locale through `getOrCreateSubscriptionPrice` / `ensureStripeProductForProduct` (name via `pickTranslationName(translations, locale)`); route passes locale. Keeps **Stripe Product ≈ club**, so native Dashboard "revenue by Product" club reporting still works. Cost: a migration + Stripe objects multiply by `locale × currency` (lazy).
- **A2 — inline `price_data` per checkout (no migration).** In the sub branch, replace `line_items: [{ price: cachedPriceId }]` with inline `price_data` (currency + `unit_amount` + `recurring: {interval:'month'}` + `product_data:{ name: localizedName }`), mirroring the single-payment branch. Stripe mints a fresh Product+Price per checkout, named in the parent's resolved locale. Contained to the route + tests. **Cost: every subscription becomes its own Stripe Product** (Products scale with subscribers, not clubs) — which *removes Stripe's native per-club Product reporting* (Dashboard "by Product" becomes one row per subscriber; club rollups would need Stripe Sigma grouping by metadata `productId`, or our own DB).

**Stripe limits checked (not a blocker):** Stripe imposes **no cap** on the number of Products/Prices; only rate limits (25 req/s endpoint, 20/s Search — A2 actually *drops* the per-checkout `products.search` call) and a 20-items-**per-subscription** cap (irrelevant — our subs are single-item). So A2's object proliferation won't break anything; its only real cost is the reporting one above.

**Reporting prerequisite for A2 (also a standalone bug):** subscription **renewal** payments (`handleInvoicePaid`) write metadata `{ stripeSubscriptionId, billingReason }` with **no `productId`** — club attribution relies on joining `stripe_subscription_id → family_subscriptions → participation_id → participations.product_id`, a chain that's **hard-deleted on cancellation**. So renewals of cancelled subs are already un-attributable to a club from our DB. A2 removes the Stripe-native fallback, so before adopting it we'd need to stamp `productId` (+ `gamerId`) onto renewal payment metadata. Worth doing regardless of the locale decision.

**Deferred deliberately** — current customer base is small enough that the English line item is an acceptable edge for now. Recorded so the tradeoff (A1 keeps club-level reporting; A2 is less code but trades it away) is captured when someone revisits.

### Re-enabling non-EUR currencies

The platform is deliberately locked to EUR. Admins author prices in EUR, customers see EUR, and our records (`payments`, `family_subscriptions`) are in EUR. Stripe Checkout's **Adaptive Pricing** (enabled in `src/app/api/checkout/products/create/route.ts`) already presents each customer their local currency and settles us in EUR at the price we set — so "buy in another currency" works today without us modelling other currencies internally.

The **data model was kept currency-agnostic on purpose** so this is reversible: `product_prices`, `payments`, `family_subscriptions`, and `product_subscription_prices` are all still keyed/columned by `currency` (the `IN ('eur','gbp','usd')` CHECKs were left in place), and the service/data layer (`buildPricingOption`, `formatProductPrice`, `getMyFamilySub`, `getOrCreateSubscriptionPrice`, `computeSinglePaymentAmount`, the checkout route, the webhook) all still take/thread a `currency`. What was deleted is only the **selection/authoring layer**.

The seam is `SUPPORTED_CURRENCIES` in `src/lib/constants/currency.ts`. To turn currencies back on:

1. **Widen the constant.** `SUPPORTED_CURRENCIES = ["eur", "gbp", "usd", …]` and add matching `CURRENCY_CONFIG` entries (symbol + label). This alone re-activates the validate/build loops in `product-build.ts` (they iterate `SUPPORTED_CURRENCIES`) and the per-currency `family_subscriptions` lookups.
2. **Restore the customer currency selector.** The picker + provider were deleted — recover them from git (the EUR-only-checkout branch / its merge commit): `src/providers/currency-provider.tsx`, `src/hooks/use-currency.ts`, `src/components/layout/currency-picker.tsx`, plus the `CurrencyProvider` wrapper/export in `src/providers/index.tsx`. Re-point `signup-panel.tsx` and `product-browse-card.tsx` from the `DEFAULT_CURRENCY` constant back to `useCurrency()`, and re-add `<CurrencyPickerRow />` in `pricing-panel-view.tsx`.
3. **Restore persistence + detection (optional).** `src/app/api/user/currency/route.ts` (writes `profiles.currency` — the column was kept, still unused), the `"currency"` cookie logic, and `detectCurrencyFromLocale()` in `currency.ts`. Only needed if you want the chosen currency to stick across sessions/devices.
4. **Restore the admin per-currency UI + FX suggestion.** Re-add the currency tabs, `manualEdits`/`activeCurrency`/`focusCurrency` to `FormState` + `product-build.ts`, and the FX auto-fill trio: `src/components/admin/products/pricing-block-fx.ts`, `src/app/api/admin/fx-rates/route.ts`, `src/services/products/fx.queries.ts`. All recoverable from git.
5. **Restore i18n keys:** `common.selectCurrency`, `admin.products.pricing.{currencyPickerLabel,fxSuggested}`, `productDetail.pricing.pricesIn` across `messages/{en,fi,sv,tlh}.json`.
6. **Decide on Adaptive Pricing.** Once you present multiple currencies *yourself*, decide whether to keep Adaptive Pricing on (it can still convert into currencies you don't list) or turn it off and rely solely on your authored per-currency prices.

**Gotchas / things that did NOT change (so re-enabling stays safe):**
- We do **not** record the customer's presentment currency. `payments`/`family_subscriptions` store EUR (our settlement currency) because, under single-currency settlement, Adaptive Pricing settles us the exact EUR price we set. If you later want "what the customer actually paid", it's in `session.presentment_details` (`presentment_amount` + `presentment_currency`) on the webhook event — capture it then; it needs a small schema add.
- Stripe `Price` objects are immutable. `getOrCreateSubscriptionPrice` lazily creates one EUR Price per product and **replaces** it when the admin changes the amount, so new checkouts follow the catalogue. Existing subscribers keep the Price they bought on — nothing migrates a live subscription to the new amount, so a club can be advertised at one price while some parents keep paying an older one indefinitely.
- Legacy `product_prices` rows in non-EUR currencies (from before the lockdown) are harmless and ignored — `existingFormState` only loads the `eur` row.

### E2E Tests with Local Supabase

**There is no E2E suite right now.** The old one was deleted in August 2026: it asserted on marketing copy and unauthenticated redirects, so it churned on every copy edit while catching nothing. What survived is a build + smoke job — it builds the app, serves the production build, and asserts security headers and the per-request CSP over plain HTTP with no browser involved. This section is the plan for adding a *meaningful* browser suite back, from scratch; it is not a hardening of anything that exists.

The coverage worth having is the authenticated half — admin-only pages, role-based routing, CRUD flows. That needs real Supabase Auth + Postgres, and shouldn't depend on the remote instance.

**Approach:** Run `supabase start` in CI to spin up a local Supabase stack (Postgres, Auth, Storage) in Docker. Existing migration files are applied automatically, giving an identical schema. Test accounts are created via `supabase/seed.sql`.

Setup tasks:
- [ ] Add `supabase/seed.sql` with test accounts (admin, customer, gedu, gamer) using known passwords
- [ ] Add `.env.test.local` with local Supabase URL/keys (`supabase start` prints these)
- [ ] Add a `tests/e2e/` directory and a Playwright project for it — the smoke config is deliberately browserless (one project, no device emulation, no retries, no browser install in CI), so browser tests need their own project rather than being folded into that one
- [ ] Create a Playwright auth setup project that logs in via the UI and saves `storageState` per role
- [ ] Add a CI job (separate from build + smoke, which must stay cheap): `supabase start` → build/serve with test env → run the browser projects, installing only the engines that job actually uses

Test cases to add:
- [ ] Admin can view `/admin/products` (sees "Products" heading)
- [ ] Non-admin roles (customer, gedu, gamer) are redirected away from `/admin/*` to their own dashboard
- [ ] Admin can create a product via the add form
- [ ] Admin can edit an existing product
- [ ] Real auth flows (register, login, logout)
- [ ] Customer adding a gamer
- [ ] Core purchase flow

**Why:** RLS policies and role-based routing are complex enough that testing against a real DB catches integration bugs that mocked tests miss. Local Supabase keeps tests fast, deterministic, and free from network flakiness — and Docker is available by default in GitHub Actions runners.

### Shared `<Select>` UI Component

Several files define inline `selectClassName` strings that duplicate `<Input>` styling for native `<select>` elements. Extract a `components/ui/select.tsx` wrapper and replace the inline patterns.

- [ ] Create `src/components/ui/select.tsx` wrapping a native `<select>` with Input-matching styles
- [ ] Replace inline select styling wherever a local `selectClassName` string duplicates `<Input>`'s classes — today the add-gamer dialog, plus any other occurrences

### Optimize Product Images via `next/image`

Product images currently render with `unoptimized` everywhere, so the original bucket file is served at every viewport. If the catalogue grows or pages get heavier, switching to the Next image optimizer would give us automatic WebP/AVIF conversion, viewport-appropriate resizing, and CDN caching. The cost is a bit of complexity per call site (`sizes` attribute) and a one-line `images.remotePatterns` entry in `next.config.ts`.

- [ ] Add the Supabase Storage host to `next.config.ts` `images.remotePatterns`
- [ ] Drop `unoptimized` from product image `<Image>` components and add a `sizes` prop matching each layout
- [ ] Skipped during the PR 2 self-hosted images migration to keep the change minimal

### Parent-Managed Gamer Profile Fields (DOB, Gender)

Customers (parents) will set `date_of_birth` and `gender` on their linked gamers. When implemented, add a "Parents can update linked gamer profiles" UPDATE policy on `gamer_profiles` using `is_parent_of(user_id)` and consider restricting the current "Gamers can update own gamer_profile" policy. Age should be derived from `date_of_birth`, never stored directly.

### WhatsApp Service Layer Extraction

The send route (`src/app/api/admin/whatsapp/send/route.ts`) and webhook handler (`src/app/api/webhooks/whatsapp/route.ts`) perform direct Supabase inserts/upserts instead of delegating to `WhatsAppService`. The webhook also contains business logic (message parsing, error code mapping, status transformation) that belongs in a service or utility layer.

- [ ] Add server-side methods to `WhatsAppService` (e.g., `storeOutboundMessage()`, `upsertInboundMessage()`, `updateMessageStatus()`)
- [ ] Extract `extractMessageContent()` and error-code mapping from the webhook into `src/lib/whatsapp.ts`
- [ ] Update both route handlers to delegate persistence to the service

### Audit setState-in-effect violations from eslint-plugin-react-hooks@7

A few files trip the new `react-hooks/set-state-in-effect` rule with the "set state once on mount" shape (currently suppressed inline pointing here). The clean, safe cases have been migrated; the ones below remain because each has a wrinkle that makes the rewrite non-trivial or risky.

Already done (no action needed):
- `src/app/(dashboard)/admin/ui-components/page.tsx` — migrated to `useNow()`; no suppression left.
- `src/components/pin/unlock-gate.tsx` — the `?redirect=` read moved into a lazy, SSR-guarded `useState` initializer. Safe because `redirectTo` is read only in the post-unlock navigation, never in rendered markup, so the server default and the client-resolved value can't mismatch.

Remaining — the risky/non-trivial tier:
- `src/components/auth/reset-password-form.tsx` — parses `window.location.hash` once on mount, then makes an **async** `supabase.auth.setSession()` call and sets several pieces of state across its `.then()`. The synchronous no-hash → `setSessionReady(true)` path could move to an initializer, but the async session work legitimately belongs in an effect/handler. Auth-critical (recovery link) and hard to exercise locally — verify carefully before touching.
- `src/components/family/FamilyProfileSelector.tsx` — reads a URL marker on mount but also calls `window.history.replaceState` (a real side effect that doesn't belong in a `useState` initializer), and `pendingAddGamerIntent` drives rendered output — so a client-only initializer would risk a hydration mismatch. The effect is the right home; satisfying the rule here needs more than a lazy initializer.

The rule's preferred patterns: derive from props/`useMemo`, use `useSyncExternalStore` for SSR-safe mount detection, or move the one-shot logic into an initializer / event handler. None of these rewrites are urgent — the current code works and the rule's concern (cascading renders) is mild for one-shot mount setup — but they should be revisited when touching these files.

- [ ] Move `window.location.hash` parsing in the auth forms out of `useEffect` where it's the synchronous path (e.g., a `typeof window`-guarded `useState` initializer), keeping only the async `setSession` work in the effect.
- [ ] Decide whether `FamilyProfileSelector`'s URL-marker read can be restructured to avoid the in-effect setState without losing the `replaceState` cleanup.
- [ ] Once each is rewritten, drop its `eslint-disable-next-line` comment.

### Adopt `useTimezone()` + `useNow()` across the app

The dashboard Sessions cards (`NextSessionCard`, `UpcomingSessionCard`) are the reference implementation for the new pattern that lets a date/time render correctly during SSR — no hydration-mismatch dodge via null states, no "skeleton until post-mount" gating.

**The pattern:**

- `useTimezone()` (from `@/providers`) returns the viewer's IANA zone, resolved from the `timezone` cookie server-side and reconciled with `Intl.DateTimeFormat().resolvedOptions().timeZone` after mount. Cookie-only, environmental (no profile column) — see `src/providers/timezone-provider.tsx`.
- `getServerTimezone()` (from `@/lib/timezone.server`) is the server-side equivalent: same cookie, same fallback. Use it in any Server Component or server helper that needs the viewer's zone — SSR and the first client render then read the same value through different accessors.
- `useNow()` returns a `Date` seeded from the server's request-time wall clock and ticked client-side every 30s. SSR HTML and the first client render match because both consume the same prop — see `src/providers/now-provider.tsx`.
- Date/time formatting: `formatDate` / `formatTime` (`src/lib/utils.ts`) now *require* an explicit `timeZone` (the viewer's) so the rendered string can't fall back to the runtime default; a genuinely zoneless calendar date uses `formatDateOnly` instead.
- Age computation: `computeAge(dob, timeZone)` requires the zone — there's no default. Client callers pass `useTimezone()`, server callers pass `await getServerTimezone()`.
- Server prefetch: pages that need first-paint data should fetch in the server component and pass it as `initialData` into the consuming React Query hook (see `useMyUpcomingSessions`). The cache seeds without a `<HydrationBoundary>` and mutation-driven invalidation keeps working unchanged.

- [ ] For components that compute "is this live right now?" / "starts in N minutes" with a per-component `useState + setInterval`, swap to `useNow()`. (`countdown-clock.tsx` is the only remaining candidate and deliberately ticks at 1s for sub-second perception — `useNow()`'s 30s cadence is too coarse, so it likely stays as-is.)
- [ ] Once the bulk of UI surfaces consume `useTimezone()`, flip `NextIntlClientProvider`'s `timeZone` prop in `src/providers/index.tsx` from `DEFAULT_TIMEZONE` to the live value so `useFormatter().dateTime()` follows the same source of truth (today it still hardcodes `Europe/Helsinki`; the comment in the file flags this).
- [ ] Consider pages that would benefit from the server-prefetch + `initialData` pattern (`MyGamersGrid`, billing, anything else where the section currently shows a client-side React Query skeleton on load) and adopt page-by-page. Drop the per-page skeleton at the same time so the win is visible.

### Enable next-intl typed messages + locale-parity test

We have no compile-time safety on translation keys today. A dead-key audit during the products browse review deleted `admin.products.hints.{free,paid}Detail` because the heuristic missed that `billing-section.tsx:76` references them via `t(\`hints.${mode}Detail\`)`. The bug only surfaced as a runtime `IntlError: MISSING_MESSAGE` in the browser — no test, lint, or type-check caught it.

Two layers worth setting up together:

**1. next-intl typed messages augmentation.** Add a `global.d.ts` (or `next-intl.d.ts`) declaring the `IntlMessages` interface from the canonical `en.json` shape. Once in place, every `t('foo.bar')` and every well-typed dynamic template (`t(\`hints.${mode}Detail\`)` where `mode` is a literal union, not `string`) is checked against the actual bundle. The exact `freeDetail`/`paidDetail` deletion above would have failed `tsc --noEmit` and gone red in CI before merge.

Caveats to be honest about:
  - Only catches dynamic templates when the variable is typed as a literal union. If someone widens to `string`, the check silently degrades. Worth pairing with a lint rule that disallows raw `string` template parts in `t(\`...\`)` calls.
  - Only the canonical bundle (en.json) is type-checked. Drift between en/fi/sv/tlh is not caught — see (2).

**2. Locale-parity unit test.** Small Vitest test (`tests/unit/i18n/locale-parity.test.ts` or similar) that:
  - Loads all four bundles
  - Flattens each to its set of leaf key paths
  - Asserts every non-en bundle's key set equals en's
  - Fails CI if any locale is missing a key (or has an extra one)

Catches the case where en.json gets a new key but a translation file is forgotten — common when adding features.

- [ ] Set up next-intl typed messages augmentation (one-liner global.d.ts referencing en.json)
- [ ] Verify `npm run type-check` flags a deliberately-mistyped key in a sandbox before committing
- [ ] Add `tests/unit/i18n/locale-parity.test.ts` comparing flat key sets across all four bundles
- [ ] Optionally: lint rule rejecting `t(\`...${someVar}...\`)` where `someVar` is `string` rather than a literal union

### Dead-code detection (knip) — reconsider

We keep circling back to wanting an automated dead-code check (unused exports/files/deps). Knip has been evaluated several times before for various reasons and not adopted; parking the latest analysis here so the next pass starts from it rather than re-deriving.

**The goal is dead-code detection, and `import/no-unused-modules` (eslint-plugin-import) is the wrong tool for it in this repo.** Measured 2026-06-22 by running the rule standalone with `{ unusedExports: true }` + the TS resolver over `src/ tests/ services/` (540 files): **299 flagged**. That number is not trustworthy:
- **~95 are Next.js framework entry points** — `export default` pages, route `GET`/`POST`, `metadata`/`generateMetadata`/`generateStaticParams` under `src/app/`. The framework invokes these by file convention, never by `import`, so the rule calls them unused. They're load-bearing; unexporting them breaks the route/page. Pure false positives that you'd have to allowlist forever.
- **Barrel + dynamic-import blind spots** — the rule mis-follows `export *` re-export chains (we have 6 in `src/lib/constants/index.ts`), so a constant consumed via `@/lib/constants` looks unused at its source file; and variable-path dynamic `import()` (e.g. `src/i18n/messages.ts` lazy-loading message JSON) isn't traced. These are *false negatives that look like findings* — removing them breaks real importers.
- **Mechanical removal is not safe** — separate from the above, turning `export const X` into `const X` leaves an unused module-local that trips our `@typescript-eslint/no-unused-vars` (error), so the real operation is *delete the declaration*, which raises the bar on certainty. After discounting framework + the intentional `types/` barrel aliases (53), only ~150 are even plausible dead leaves, each needing a human glance.

**Knip is the better-fit tool** if/when we pick this up: its Next.js plugin auto-treats app-dir pages/routes/metadata as entry points (kills the ~95), it follows barrels and dynamic imports properly (kills the blind spots), and it finds more in one pass — unused *files*, unused exports, and unused/unlisted `package.json` deps. It reports, never auto-deletes. Tradeoffs vs. ESLint: it's a separate CI step (`npx knip`), no live editor squiggles, and another tool in the chain — likely part of why prior passes didn't land.

**Strategy regardless of tool: ratchet, don't boil the ocean.** Don't clear ~150 historical hits in one risky PR. Mark intentional-but-unimported exports as deliberate (knip honors a `// @public` JSDoc tag, or config `ignore` — this is where the `types/` aliases go), drive it to a true zero, then make CI fail on any *new* finding. The value isn't the one-time cleanup, it's preventing the next orphan export from landing. (Knip is accurate enough that a real zero is reachable; the noisy ESLint rule basically never gets there.)

If we ever specifically want it *inside* ESLint for editor feedback: `import/no-unused-modules` set to `warn`, **exclude `src/app/**`**, never auto-delete from its output (barrel blind spot), ratchet the same way. Weaker, but single-toolchain.

### Multi-Parent Gamer Linking

Currently the only way to link a parent to a gamer is when the parent creates the gamer via `POST /api/gamers/create`. To support a second parent linking to an existing gamer:

- [ ] Choose an authorization mechanism (invite code, existing parent approval, or admin-only)
- [ ] Create a server-side API route (e.g., `POST /api/gamers/link`) that validates authorization before inserting into `parent_gamer` using the admin client
- [ ] Add UI for the chosen flow (e.g., "Share invite code" button for existing parent, "Enter code" form for second parent)

## Waitlist — the parent/gamer side

The `WaitlistCard` (`src/components/parent/`) now renders on both dashboards and
its leave affordance has a backend. Two open questions remain:

- [ ] **The waitlist copy promises an email nobody sends.** `parent.waitlist.reassurance*`
  and the confirmation page's `next1` both say we'll email the moment a seat opens.
  There is no waitlist email template and promotion is a manual admin drag that
  notifies nobody. Emails + promotion are handled by hand for now (deliberate), so
  this is a note, not a bug — but if manual sending ever slips, soften the copy
  rather than leave the promise standing.
- [ ] **Decide what promotion looks like to a parent.** `promote_from_waitlist`
  flips the row to `active` with no payment step, so for a paid club it grants a free
  seat, and from the parent's side the card silently disappears from the waitlist band
  and reappears as a session card. If the answer is ever "a seat opened — claim it by
  {date}" rather than "you're in", that's a new card state (offer + expiry +
  accept/decline) and it's much cheaper to design before the card hardens.

## Event seat caps + waitlist: re-locked until the shop surface can express fullness

The admin product form briefly unlocked the seat cap and the waitlist toggle for **free**
events, then re-locked them (`src/components/admin/products/form-locks.ts`; events keep
their `registrationTiming` unlock). The seat gate was never the blocker — a free signup
validates the cap and writes its `active` row in one locked transaction, never touching
Stripe Checkout, exactly like a municipality registration. The blocker is the
**parent-facing shop**: nothing on the browse card or the pre-open panel can say a
non-muni product is full, so an admin capping an event would publish a page that fills up
and still reads as open. Unlocking again is a shop change first and a one-line form change
second.

- [ ] **A fullness affordance on the browse card for capped non-muni products.** Today the
  seat bar is muni-only, and the `full_waitlist` state renders the same generic "View" CTA
  an open product does — a full event with a waitlist is visually identical to one with
  seats left. Whether that becomes the seat bar generalised, a state-aware CTA, or a
  fullness pill is the open design question. **Constraint from the owner: the card must
  *not* carry a "waitlist available" line for products that aren't capped** — the
  affordance is for the full state, not an always-on advertisement of the waitlist.
- [ ] **The card's seat hint shows capacity, not seats left.** "{count} seats" prints the
  cap, so on a full product it prints a number that is exactly wrong. It has to be
  seats-remaining (and say something else at zero).
- [ ] **The pre-open → open panel swap mounts the seat bar above the CTA, late.** The
  panel's open/pre-open decision rides a 30-second `useNow` tick, so up to 30s after
  registration opens the seat bar appears *above* the Join button that just went live,
  shoving it down under the cursor. That is a data-schedule shift, which the layout rule
  in `CLAUDE.md` forbids outright — the seat bar's box has to be settled before the button
  becomes clickable, not inserted after it.
- [ ] **Waitlist purchase-confirmation copy is club-shaped.** It tells the parent their
  gamer is queued "for the whole term", which is nonsense for a single-date event. Key it
  by product type like the panel's other action strings, in all five locales.
- [ ] **No capped / full / waitlist event fixtures exist in the style guide**, so none of
  the above can be signed off visually before it is wired. Add the states (capped with
  seats left, full with a waitlist, full without one) to the card and panel demos.
- [ ] **Optional hardening, raised in review, both cheap and both currently unreachable:**
  a lifecycle/billing-mode guard on `join_waitlist` (a migration — nothing stops a row
  joining the queue of a product that can no longer honour it), and a visible error on the
  `'full'` race outcome (the signup path can lose the last seat between the gate and the
  write, and the panel currently just re-enables the button saying nothing).
- [ ] **The form-side change, once the above lands.** Give `formLocksFor` back its
  free/paid parameter so the lock can track the money instead of the type, unlock
  `seatCount`/`waitlist` for free events only, and restore the free→paid handler that
  clears a cap the flip is about to lock away. Both were deleted in the re-lock rather than
  left inert; their unit tests are in `tests/unit/components/products-form-locks.test.ts`
  and git history has the originals. Also re-decide `promote_from_waitlist`'s missing
  billing-mode guard at that point: with a cappable type whose billing mode can change
  under a live queue, promoting a stranded row would grant an unpaid seat on a paid
  product (see the seat-gate section of `docs/products-architecture.md`).
