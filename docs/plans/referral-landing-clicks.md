# Referral landing clicks

## SUSPENDED — 2026-08-26. Do not build this.

**Both of this plan's load-bearing premises have collapsed, and the feature it extends may
itself be renamed or retired.** The full investigation, with sources, is in
`ROBLOX-TODO.md` under *Attribution, cookie consent, and the Lynx data export*; read that
before touching anything here.

What changed:

- **"Device storage would require a consent banner" is not the test.** Under EDPB
  *Guidelines 2/2023* §3.1 ¶50–51, Art 5(3) is engaged by a tracking parameter in a URL
  regardless of what the site stores — storage *or* access, and the access limb catches the
  proxy read we already do server-side. So the rejected alternative that turned down a
  cookie was turned down on a reason that does not hold, and neither does the first of the
  six constraints in `src/lib/referral.ts` that this plan's *Constraints discovered* section
  affirms.
- **A banner is likely coming anyway, and not because of `?ref=`.** The Vercel Speed
  Insights and Web Analytics scripts engage Art 5(3) on their own, and Germany and Finland
  have no audience-measurement exemption to claim. So "the privacy policy's analytics
  paragraph already describes Vercel's analytics as cookieless and non-identifying, which
  this event is; no policy change is part of v1" is no longer a safe reading.
- **The denominator this plan exists to produce was never asked for.** Every reference to
  UTM in Lynx's document is about *registration records*, not traffic — a per-person export
  carrying one "utm parameter" field beside `parent email`. Nothing in it mentions clicks,
  impressions or a conversion rate. And this plan already concedes in its own *Constraints
  discovered* section that ad platforms count clicks better than we can.
- **The cheap alternative is no longer blocked.** Web Analytics Plus is $10/month per team
  and tracks UTM natively — so *"the owner does not want the add-on"* is a decision worth
  re-taking rather than a constraint, and it would delete every implementation step below.

**The likely end-state is deletion, not resumption** — `ROBLOX-TODO.md` now carries the
reasoning, and this file's remaining value is the one thing worth rescuing first:

> **The partner code prefix convention.** Codes issued to or for a partner are prefixed with
> the partner's slug and a hyphen (`lynx-summer-a`, `rblx-launch`). This cannot be
> retrofitted — the value is immutable on a profile once written — and it survives a rename
> to UTM unchanged, as a `utm_campaign` naming convention. **Settle it before the first Lynx
> campaign link goes out**, whatever happens to the rest of this plan.

Everything below is preserved as written on the day it was decided. It is a record of a
decision made on a premise now known to be false — not a specification. Nothing in it should
be built without the open decisions in `ROBLOX-TODO.md` being answered first.

---

Count how many people arrive on the site with a `?ref=` code, so the code becomes a
conversion *rate* (accounts created with the code ÷ arrivals carrying it) instead of only
an accounts count.

## Problem

Marketing links carry `?ref=<code>` (`/roblox?ref=paris-nord`). The proxy sanitises the
code, a root-layout provider holds it for the visit, and on registration it is written once
to `profiles.referral_code`. That answers "which link brought the families who made an
account". It cannot answer "how many families did that link bring to the site at all" —
there is no denominator, so a campaign that sent 800 people and produced 12 accounts looks
identical to one that sent 15.

Vercel Web Analytics is already on every page, but it cannot see the code: automatic page
views record the path with the query string stripped, so `/roblox?ref=paris-nord` and
`/roblox` are the same row. The code has to be handed to Vercel explicitly.

## Scale

Production does roughly 550 page views and 90 visitors a day (August 2026). Ref-bearing
landings are a small fraction of that today; the near-term driver is partners (Lynx, Roblox)
running ad campaigns with one code per campaign and wanting to know how each performed. A
campaign of 10,000 clicks costs about $0.30 in Vercel events.

## The decision

**One Vercel custom event, fired once per arrival, carrying only the code.**

- Event name `referral_landing`, one property `ref` holding the sanitised code. Nothing
  else travels with it — no user id, no email, no session — and nothing is written to the
  device. The landing page is not a property: every custom event already carries Vercel's
  own `request_path` and `route` dimensions, so "which page did the campaign land on" is
  answerable without spending a property on it.
- It fires from the referral provider's mount effect, only when the provider was seeded
  with a non-null code. The provider is a root-layout client component, so it mounts once
  per document load and never on client-side navigation: one event is one arrival. A
  reload or back-button onto the landing URL fires again, which is the correct page-view
  semantic; Vercel's `unique/visitor_id` aggregation de-duplicates on its side if uniques
  are wanted.
- It is read in the Vercel dashboard (Events panel → `referral_landing` → by `ref`) or with
  `vercel metrics` (recipe below). No route, no table, no migration, no admin UI in v1.
- The conversion rate is two anonymous aggregates divided: the event count (or unique
  visitors) for a code from Vercel, over `select count(*) from profiles where
  referral_code = <code>` from Postgres. No person is followed from click to signup — this
  is a *rate*, not conversion *tracking*, and that distinction is what keeps it inside the
  privacy position the `?ref=` design was chosen for.

**Code naming convention for partners, decided now because it cannot be retrofitted:**
codes issued to or for a partner are prefixed with the partner's slug and a hyphen
(`lynx-summer-a`, `rblx-launch`). A code is immutable on a profile and lives twelve months
in Vercel, so a partner's code minted without the prefix can only ever be attributed to
them by a hand-kept mapping. The convention is documentation only (the referral module's
header comment); there is still no registry of codes, and the sanitiser's pattern already
admits `-`.

## Rejected alternatives

- **UTM parameters (`utm_source`/`utm_campaign`…).** Vercel tracks them natively, but only
  on the Web Analytics Plus add-on, which the owner does not want; and the links would then
  carry two vocabularies (`ref` for the profile, `utm_*` for the clicks) that drift apart.
  UTMs were also turned down once before, on privacy grounds, when `?ref=` was chosen.
- **Counting in our own database** — a client beacon to a public route upserting a
  `(code, day, path) → hits` tally. It is a stronger privacy position still (no hashed
  identifier anywhere) and has no retention window, and it is the right shape *if* a
  partner-facing API or history beyond twelve months is ever required. It is not v1: it
  needs a public unauthenticated route with rate limiting, a `SECURITY DEFINER` function
  on the authorization spine, a migration, and the route-posture registration — all to
  produce a number the one-line event produces today. Build it the day a stated
  requirement forces it, not before.
- **Counting in the proxy.** It sees every `?ref=` request, but counting there puts a
  database write on the edge hot path and counts every WhatsApp/Slack/Discord link unfurl
  and crawler fetch as a click — and school parent groups are exactly where these links
  get pasted. A client-side event fires only in a real browser that ran our JavaScript.
- **A cookie, `localStorage` or `sessionStorage` to de-duplicate arrivals ourselves.**
  Forbidden by the first of the referral module's six constraints: any device storage of
  the code puts the processing into ePrivacy scope and requires a consent banner for every
  visitor.
- **A `path` property on the event.** Redundant with Vercel's built-in `request_path` and
  `route` dimensions on custom events (confirmed from the event schema via
  `vercel metrics schema vercel.analytics_event`).

## Constraints discovered while deciding

- **The six constraints in the referral module's header comment all still hold.** The event
  carries the code and nothing that identifies a person; it is never joined to a profile;
  nothing is stored on the device; the code still grants nothing. The privacy policy's
  analytics paragraph already describes Vercel's analytics as cookieless and
  non-identifying, which this event is; no policy change is part of v1.
- **Vercel's documented property cap is 2 per custom event on Pro, but it is not observed
  to truncate.** The existing `dashboard_nav` event sends three properties and all three
  arrive in full (checked 2026-08-22: `role`, `method` and `from` each total 776 over 30
  days). This plan needs one property, so the cap is moot either way — but do not read
  the docs' "2" as a reason to drop a property from `dashboard_nav`.
- **There is no cap on the number of custom event *names*.** `referral_landing` does not
  compete with `dashboard_nav` for anything; what is billed is the count of events sent.
- **Reporting window is twelve months on Pro.** Vercel may keep data longer but guarantees
  only that. A campaign comparison older than a year is not available without snapshotting,
  which is a follow-up, not v1.
- **The numbers are a floor.** The event fires only in a browser that ran our script and
  was not blocking `/_vercel/insights`; ad platforms count clicks on their side. Expect our
  figure to sit noticeably below a partner's. Say so whenever a figure is shared.
- **`track()` is safe to call from a mount effect.** `@vercel/analytics` queues calls on
  `window.va` before the Analytics script has loaded, and sends via `sendBeacon`, so the
  event survives any navigation that follows.
- **Development double-fires.** React Strict Mode runs mount effects twice in `npm run dev`,
  so the network tab shows two beacons per landing locally. Production builds fire once.
  Not a bug to fix.
- **The root layout re-executes on a locale switch** (the locale provider calls
  `router.refresh()`), but that re-renders the server component without unmounting the
  client provider, so the mount effect does not re-run. The provider's existing rule —
  seed state once, never sync the prop back in — is what keeps that true; the effect must
  read the state value, not the prop.
- **Querying needs Vercel CLI ≥ 59** (`vercel metrics` is absent in 50.x). The machine's
  global CLI was bumped to 59.4.0 on 2026-08-22; team slug is `school-of-gaming`, project
  name is `sogverse`.

## Steps

1. **Typed helper.** In `src/lib/analytics.ts`, export the event name as a constant and a
   `trackReferralLanding({ ref })` function beside `trackDashboardNav`, with a doc comment
   that states what it fires, why it carries only the code, that it fires once per arrival,
   and the read recipe:

   ```
   vercel metrics vercel.analytics_event.count \
     --filter "event_name eq 'referral_landing'" \
     --group-by event_data/ref --since 30d --project sogverse --prod
   ```
   and, for uniques, `--aggregation unique/visitor_id`. Pair it with the one-line SQL for
   the numerator. The constant exists so anything that later reads the event builds its
   filter from the same string the sender uses.

2. **Fire it.** In `src/providers/referral-provider.tsx`, add a mount effect that calls the
   helper when the state value is non-null. Comment it in the provider's voice: why once per
   document load is the right unit, why it reads state not prop, and that it writes nothing
   to the device. Keep the existing header comment's storage rule intact — this does not
   weaken it.

3. **Unit test.** `tests/unit/providers/referral-provider.test.tsx`, alongside the locale
   provider's test and in its style. Mock `@vercel/analytics` with a `vi.fn()` `track`.
   Cases: seeded with a code → `track` called exactly once with the event name and
   `{ ref }`; seeded with null → never called; re-rendered with a *different* prop after
   mount → still exactly one call with the original code (the prop-is-not-synced rule, and
   the locale-refresh case in one). Add the mock to `tests/mocks/` if a second test ever
   needs it; for one consumer an inline `vi.mock` is fine.

4. **Document.** In `src/lib/referral.ts`'s header comment: add the click event to the
   description of the flow (one sentence — it exists, it carries only the code, it is never
   joined to the profile), and the partner prefix convention. In the email/CLAUDE-style
   docs nothing changes; the analytics helper's own comment is the reading guide.

5. **Verify on the branch's preview deployment** before merging. Open
   `<preview-url>/?ref=plan-check`, navigate around client-side, reload once, then:

   ```
   vercel metrics vercel.analytics_event.count \
     --filter "event_name eq 'referral_landing'" --filter "environment eq 'preview'" \
     --group-by event_data/ref --since 1h --project sogverse
   ```
   Expect `plan-check` with a count of 2 (landing + reload) and nothing from the
   client-side navigations. Vercel's ingestion lags a minute or two.

6. Lint, type-check, `npx vitest run tests/unit/providers`, merge to `dev` with the usual
   `--no-ff` merge, delete this file.

## Acceptance criteria

- Landing on any route with a valid `?ref=` produces exactly one `referral_landing` event
  per document load, with `ref` equal to the sanitised code.
- Landing without `?ref=`, with an invalid one, or with a repeated one (`?ref=a&ref=b`)
  produces no event.
- Client-side navigation after landing produces no further events; a locale switch
  produces none.
- The event payload contains the code and nothing else; no cookie, `localStorage` or
  `sessionStorage` write is introduced anywhere.
- `npm run lint`, `npm run type-check` and the unit suite are clean.
- The referral module's header comment describes the event and the partner prefix
  convention.

## Review

No schema change, one surface: no agent review. The author reads this back cold and builds.

## Follow-ups (cut from v1; proposed to the owner by headline when this plan is deleted)

- **Partner-facing read API** — token per partner, scoped to their code prefix, returning
  clicks/day and accounts per code. Composes Vercel's `events/aggregate` endpoint with the
  Postgres count; needs a team access token as a sensitive env var.
- **Admin report** — the same numbers on an admin page (clicks, uniques, accounts,
  rate per code), so nobody needs the CLI.
- **Own-database tally / snapshotting** — if the twelve-month window or a partner API makes
  permanence necessary, the client-beacon-to-public-route design described under rejected
  alternatives, or a scheduled job copying daily aggregates out of Vercel.
- **Privacy-policy wording** — a sentence naming campaign-arrival counting, if whoever
  owns the policy wants the event listed rather than covered by the existing analytics
  paragraph.
