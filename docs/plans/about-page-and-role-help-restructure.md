# About page and role-scoped help restructure

## Problem

Signed-in users are bounced off the home page (`src/proxy.ts` redirects `/` to the
role dashboard), which was intentional — parents kept getting lost on the way to
their dashboard. But the About and Yty content was consolidated *into* the home page
as anchored sections, so every customer we have is now unable to read who we are,
what our values are, how clubs work, or what Yty is. The `about` and `yty` message
namespaces are fully translated and invisible to the people they were written for.

Meanwhile help is scattered and partly wrong:

- The public `/help` page holds a 5-item FAQ, a contact card, and the feedback form
  (the form's only entry point in the product is scrolling to the bottom of that page
  while signed in).
- The parent dashboard's Help section duplicates the contact card and carries an
  **outdated Minecraft Java camp onboarding guide** — wrong edition (the platform
  runs Minecraft Education elsewhere), camp-only framing, and two server addresses
  hardcoded in the component. It gives families wrong instructions today.
- Gamers have no help surface at all. Gedus have none (their Tools section is
  operational cards only, and it is hidden until an admin certifies them — the
  waiting gedu, who most needs a contact channel, sees only an "awaiting
  certification" notice).
- The gamer dashboard renders a Yty section that is dead weight — the feature does
  nothing meaningful today (owner's ruling, 2026-08-31).

A third header nav link does not fit: at the 360px design floor the measured
three-link row (`About, Shop, Help`) overflows in every locale but English —
French by 41px (see Constraints). So the restructure has to solve navigation, not
just content placement.

## Scale

Every signed-in family (all customers), plus every deciding parent and prospective
gedu on the public pages. French is the widest locale and the binding constraint on
the header; parent/gamer surfaces are mobile-first, so the 360px arithmetic is
load-bearing, not cosmetic.

## The decision (owner, 2026-08-31)

**One public About page carries identity + the public FAQ; help becomes role-scoped
inside the dashboards; the header reads `About, Shop` for everyone.**

### 1. New public `/about` route

- Move the existing About section (with its Klingon easter-egg block, intact) and
  the Yty section from the home page body to a new `/about` page, and add a third
  section: a **FAQ accordion** of the public questions (see the question inventory
  at the end).
- In-page section nav (the home page's section-pill pattern) with three anchors:
  About / Yty / FAQ — visible from first paint on `/about`: the home pill's
  appear-on-scroll reveal guarded a hero this page doesn't have, and hiding the
  nav exactly when a reader arrives would defeat it.
- `/about` joins `PUBLIC_ROUTES` and the sitemap; the orphaned `metadata.pages.about`
  key ("About Us") gets its consumer back. Signed-in users reach it from the
  header — the proxy's home bounce is an exact match on `/` and must stay that
  way. A **locked** customer session gets the parent-PIN pad first, exactly as
  `/shop` behaves: `/about` is deliberately **not** added to the PIN exemption
  list (owner's ruling, 2026-08-31).

### 2. Home page

- Keep: hero, features, how-it-works, closing CTA — the headline big stuff with
  CTAs. The rule applied: **info a parent would still want after creating an account
  belongs on About, not Home.**
- Add a CTA/link from home to `/about` ("learn more about us" shaped; exact
  placement is the implementer's judgment).
- Delete the home page's floating section pill — with About and Yty gone it has a
  single anchor left and no job.

### 3. Header

- Nav links become `About, Shop` (About left of Shop), **identical in both auth
  states** — preserving the header's existing deliberate property that the nav does
  not change with auth.
- The Help link is removed. Signed-out visitors find help via the About FAQ and the
  footer's contact email; signed-in users have their dashboard section (below).
- Two links fit every locale at 360px. French is the tightest — "À propos" +
  "Boutique" leaves ~6px of slack — and it fits; the flag-only picker slimming in
  Follow-ups is shelved insurance if that margin ever needs widening. **Do not add
  a third nav link in the future without redoing the per-locale width
  arithmetic** — the measured three-link numbers are in Constraints.

### 4. `/help` is deleted

- The route is removed outright — **no redirect, no legacy support** (owner's
  ruling, 2026-08-31); the URL 404s like any other dead path. Its parts
  disperse: FAQ content into the About FAQ and the role sections (the five
  existing translated answers move across intact — see the inventory), the
  contact card into the parent and gedu dashboard sections only (the footer
  already shows the support email on every public page, `/about` included), and
  the feedback form into the dashboard sections. Remove `ROUTES.help` and every
  reference to it (the compiler finds them).
- Message keys are pruned once nothing consumes them (`/prune-message-keys`):
  `metadata.pages.help`, `header.nav.help`, and whatever of `help.*` did not
  migrate. **`header.nav.about` and `header.nav.yty` stay alive** — the section
  pill consumes them on `/about`; `header.nav.home` orphans only if the pill's
  aria-label is rekeyed.

### 5. Dashboard "Help & feedback" sections — parents, gamers, gedus

Each of the three roles gets a Help & feedback section in its dashboard. Admins
deliberately get none (they receive the submissions). Composition per role:

| | Contact email card | Help/feedback message form | Role FAQ |
|---|---|---|---|
| Parent | yes (`SUPPORT_EMAIL`) | yes | parent operating questions |
| Gamer | **no** | yes (child-facing copy; reply note that their Gedu may follow up) | gamer questions, child-facing |
| Gedu | yes (`SUPPORT_EMAIL`) | yes | gedu operating questions |

- **The form is framed as "ask for help or send feedback"** — same plumbing as
  today's feedback form (rate-limited RPC, email to all admins, reply-to resolves
  to the submitter, and for a gamer to their linked parent). The gamer reply-to
  path and its strings stay.
- **Parent**: the existing Help section is rebuilt as Help & feedback. The
  Minecraft Java guide is **deleted** — component block, hardcoded server list,
  and its `parent.help.minecraft.*` keys in all five locales. Accurate per-product
  setup instructions are a follow-up, not a rewrite here; wrong instructions are
  worse than none.
- **Gamer**: new Help section as the **last** pill chip. The Yty section is removed
  from the gamer dashboard entirely in the same change (dead feature; its content
  now lives on `/about`; the `yty` messages and constants stay — About consumes
  them). Result: at most four chips (up to three activity types + Help), which fits
  the 360px pill budget in every locale (see Constraints). No email link for
  gamers: a gamer has no real mailbox, and the form already routes replies to the
  parent.
- **Gedu**: a Help & feedback section of its own, with its own pill chip,
  **last, after Tools** (owner's ruling, 2026-09-01 — superseding the earlier
  card-inside-Tools shape). Being its own section it sits outside the
  certification gate by construction: an uncertified gedu sees it below the
  awaiting-certification notice, and the two operational tool cards stay gated
  as today. All three roles thus share one symmetric section shape. The mobile
  width cost is measured and **accepted** (see Constraints): the gedu surface is
  desktop-default, and the pill's internal scroll is the floor on phones.
- Section headings follow the "Help & feedback" framing; the pill chip label stays
  the short `dashboardSections.help` ("Help") — chips are width-constrained.

### 6. FAQ mechanics

- **Reuse the Roblox programme FAQ's UI** (owner's choice) — but share only the
  accordion list: a component taking ordered `{ key, question, answer }` items
  (the answer as already-rendered content) and drawing the divided card of
  native `<details>`/`<summary>` rows with the chevron — zero-JS, CSP-friendly.
  No namespace, key-array, or rich-text-tag plumbing in the shared layer: each
  caller resolves its own strings and owns its item order in a key array at its
  own call site, so every locale renders the same sequence.
- **`/roblox` is not touched in v1.** Its FAQ carries partner-signed-off copy
  plus page-specific parts (the tinted section band, two bespoke
  second-paragraph renderings, document-link tags); adopting the shared list
  there is a follow-up, not this change.
- **The FAQ starts small and grows** (owner's ruling, 2026-08-31): every FAQ
  surface must render cleanly at any item count, **including zero** — a caller
  with no items renders no FAQ block at all: no empty shell, no heading over
  nothing, no reserved space. v1 ships only real copy: the five migrated
  public-help answers on `/about` (real, translated in all five locales, the
  safety one mechanism-verified; the inventory below maps them), and **empty
  role FAQs**. As the team answers questions from the delivered inventory, each
  lands as message keys plus one line in the owning key array — no structural
  change, and no placeholder copy at any point.

### 7. Feedback API stays exactly as it is

- `POST /api/feedback` keeps its all-four-roles gate: the route names the four
  roles as its documented way of spelling "any authenticated caller" (the
  role-gated posture loads the profile and applies the parent-PIN gate, which
  the route needs). Admins lose access by having no UI entry point — which is
  all the admin-trust rule asks for. No route, registry, or test edits.

## Rejected alternatives, with the reason

- **Keeping a three-link header (`About, Shop, Help`)** — measured at 360px
  (Poppins 500 14px, real DOM layout): fr overflows by 41px, fi by 12px, sv by
  8px, tlh by 1px; only en fits (+6px). Every rescue was priced: French copy
  ("Infos") saves 29px but still overflows without further squeezes and reads as
  "news" more than "about us"; a flag-only mobile locale picker saves 26px; a
  hamburger is a header redesign; moving Help into the account menu only helps
  signed-in users (signed-out has no menu). Retiring the public Help page made all
  of them unnecessary — none should be resurrected to re-add a third link.
- **An auth-split nav** (signed-out `Shop, Help`, signed-in `About, Shop`) —
  superseded by the same move; it also sacrificed the nav's auth-invariance.
- **Yty as its own route, or staying on home** — its audience is the signed-in
  family who cannot reach home; About is the one page that answers "what is this
  Yty thing my child talks about".
- **Rewriting the Minecraft Java guide in place** — setup instructions are a
  property of what a family is enrolled in (per product), not generic dashboard
  content; and interim wrong copy fails the safety-copy standard (mechanisms must
  be verified true).
- **Feedback staying on the public `/help` page** — an auth-gated form at the
  bottom of a public page was its own only entry point; no role could find it.
- **A flat, always-expanded FAQ list** — at ~30 items it stops being scannable;
  the owner chose the existing Roblox accordion UI, which is already the house
  answer to exactly this (readable pre-hydration, no client JS).
- **Shipping the full question inventory with Latin placeholder answers** — the
  owner initially approved lorem-to-go-live, then superseded it (2026-08-31)
  with the empty-and-grow shape: a question ships only together with its real
  answer, since adding one later costs only message keys plus an array line.
  Nothing blocks release either way.
- **A `useCommittingMutation`-style shared abstraction for the three forms** —
  already tried and rejected repo-wide; each surface keeps its inline committing
  pattern.
- **Tightening the feedback route's roles to exclude admins** (challenge review,
  accepted) — contradicts the admin-trust rule ("an admin hand-crafting API
  calls is not a threat model") and the route's own documented all-four-roles
  idiom; the owner's "admins keep no access" is delivered by the absent UI entry
  point alone.
- **A generic FAQ component owning namespaces, key arrays, and rich-text-tag
  plumbing** (challenge review, accepted) — the Roblox FAQ's page-specific parts
  would force all of that into the shared API, dissolving it into per-call-site
  configuration, the failure mode this repo has already written a rule about.
  The shared piece is the accordion list only.
- **A contact card on `/about`** (challenge review, accepted) — the footer
  already renders the support email on every public page; the dashboard sections
  carry cards precisely because dashboards have no footer.

## Steps

1. **Shared FAQ accordion list**: build the shared list component — ordered
   `{ key, question, answer }` items rendered as the divided card of
   `<details>`/`<summary>` rows with the chevron, matching the Roblox FAQ's row
   markup; given zero items it renders nothing. `/roblox` itself is untouched.
   As a reused component it earns one UI-components demo (populated states; the
   zero-item case renders nothing, so it is asserted in a unit test, not
   demoed).
2. **`/about`**: new public route rendering the moved About section (easter egg
   included), the moved Yty section, and the About FAQ seeded with only the five
   migrated Q&As. Section pill with About / Yty / FAQ anchors. Add to
   `PUBLIC_ROUTES` and the sitemap; title from `metadata.pages.about`.
3. **Home**: remove the two moved sections and the floating section pill; add the
   About CTA/link.
4. **Header**: nav links become About + Shop; remove the Help entry.
5. **`/help`**: delete the route and `ROUTES.help`; fix every referencing call
   site the compiler surfaces.
6. **Shared section pieces**: one contact-card component used identically by the
   parent and gedu sections (the gamer section simply doesn't render it — no
   variant prop), and the help/feedback form component relocated from the public
   page (unchanged plumbing; copy reframed as help-or-feedback). The surviving
   contact copy is the **public page's generic wording** (rehomed under the
   shared component's namespace); the camp-framed parent copy is pruned with the
   guide. Parent and gedu copy is identical; only the gamer's form strings get a
   child-facing variant. **The form reaches every page body through the same
   seam the gedu tools cards already use** (passed in from the shell / split
   presentational), so the three dashboard preview scenes render it inert — a
   scene must never gain a live submit that emails every admin.
7. **Parent dashboard**: rebuild the Help section as Help & feedback (contact
   card + form + parent FAQ slot, empty at launch). Delete the Minecraft Java
   guide component block and its `parent.help.minecraft.*` keys in all five
   locales.
8. **Gamer dashboard**: remove the Yty section; add the Help section as the last
   chip (child-facing heading/copy, form with the Gedu-may-follow-up note, gamer
   FAQ slot empty at launch, no email link).
9. **Gedu dashboard**: add a Help & feedback section with its own chip, last
   after Tools, outside the `certified` gate (contact card + form + gedu FAQ
   slot empty at launch).
10. **Message hygiene**: all new strings in all five locales (tlh in character;
    sentence-case headings; no emoji); prune orphaned keys with the
    compiler-verified prune flow — `metadata.pages.help`, `header.nav.help`,
    `dashboardSections.yty` (its only consumer was the removed gamer section),
    the camp-framed parent contact copy, and whatever of `help.*` did not
    migrate. `header.nav.about` and `header.nav.yty` stay alive (the pill
    consumes them on `/about`); `header.nav.home` orphans only if the pill's
    aria-label is rekeyed.
11. **Verify at 360px in fr, fi, sv**: no horizontal document scroll on any page;
    header fits signed-in and signed-out; gamer pill fits with three activity
    types + Help; `npm run lint`, `type-check`, `test` clean; push branch for CI
    (db tests, smoke).

## Acceptance criteria

- A signed-in user of every role can open `/about` from the header and read
  About, Yty, and the FAQ; signed-out visitors see the same page; `/help` is gone
  (404).
- The header shows About + Shop in both auth states; at 360px width no locale
  overflows the viewport (no horizontal document scroll).
- Parent, gamer, and gedu dashboards each show a Help & feedback section, last
  on the page with its own pill chip (the gedu's after Tools), with a working
  message form (rate-limit and success/failure states intact); parent and gedu
  show the support email, gamer does not; an **uncertified** gedu sees the
  section.
- The gamer dashboard has no Yty section and at most four pill chips.
- The Minecraft Java guide and its message keys are gone.
- The five migrated FAQ answers render on `/about` with their real translated
  copy (the mechanism-verified safety answer included); no placeholder copy
  exists anywhere in `messages/`.
- A FAQ slot with zero items renders nothing — no heading, no empty shell — and
  adding one item requires only message keys plus one line in that surface's key
  array.
- `/roblox` is untouched by the change (no diff under its route or components).
- Lint, type-check, unit/integration tests pass locally; CI (db tests, smoke)
  green on the branch.

## Constraints discovered while deciding

- **Header width at 360px** (measured in real DOM layout, Poppins 500 14px,
  matching the live classes): fixed strip ≈ 196px (container padding + logo badge
  + gaps + locale picker + avatar). Three links: en 354px, fi 372px, sv 368px,
  fr 401px, tlh 361px against 360 available. With the decided two-link nav
  (`About, Shop`) the widest row is French at ~354px (À propos ~79px + Boutique
  ~79px of link width) — it fits with ~6px slack. Treat that as the tightest
  fixed strip in the app: re-measure per locale before touching any header
  geometry or nav label, and rely on the nav links' `whitespace-nowrap` to make
  any future overrun visible rather than silently wrapped.
- **Pill width budget at 360px is 312px** — the dashboard layout's `p-6` gutter
  takes 48px. Gamer: a five-chip row overflowed (fi −12, fr −31, sv −37); the
  four-chip row (three activity types + Help) fits in every locale, worst ~303px
  (sv). Gedu (measured 2026-09-01, worst-case type pairings): one activity type
  + Tools + Help fits everywhere with 70–119px slack; two types fits in en/fr
  and sits on the line in fi (+2) / sv (−4) / tlh (−10) — only when Events, the
  wide word, is in the pair (clubs+camps fits everywhere with ~35–50px room);
  all three types + Tools + Help overflows every locale (en −11 … sv −65).
  **Accepted**: most gedus hold one or two types, the surface is desktop-default,
  and the bar's own horizontal scroll is the floor. The `px-2` mobile
  chip-padding squeeze (−4px/chip) is the shelved lever that turns every
  two-type case positive if the borderline ever bites.
- **The proxy's home bounce is exact-match on `/`** — nothing to change for
  `/about`, but it must be added to `PUBLIC_ROUTES`.
- **The gedu Tools section is certification-gated as a whole today and stays
  that way**; the new Help & feedback section is a sibling section after it,
  outside the gate by construction.
- **Feedback plumbing to keep intact**: DB-side rate limit (6/rolling hour →
  route answers 429), email to every admin, reply-to = submitter with the
  gamer→linked-parent resolution, no service layer (route calls the RPC
  directly).
- **The account menu and dashboards render no footer** — the dashboard sections
  are the only place signed-in users see the support email; that is why parent
  and gedu cards carry it.
- **tlh**: the easter-egg block moves with the About section untouched (its keys
  exist only in `tlh.json` behind locale checks); legal-page fallback behaviour
  is unaffected.
- **Layout rules bind the new sections**: chips and section footers must be
  settled at render (no late-arriving entries), and the FAQ accordion's
  expand-pushes-content is permitted because it is the reader's own tap.
- **All three roles share one section shape** — a Help & feedback section with
  its own pill chip, last on the page. On the gamer and gedu dashboards it
  becomes the page's last section and inherits the final-section minimum height
  the pill's scrollspy relies on.
- **No placeholder copy ships anywhere** — the empty-and-grow FAQ shape exists
  precisely so the never-leave-placeholder-copy rule needs no exception. The
  corollary that makes it work: an empty FAQ slot is *absent*, not an empty
  shell (the layout rules' no-dead-reserved-space principle).

## FAQ question inventory and placement

Questions were delivered to the team 2026-08-31 for answering; placement below is
the plan's proposal (implementer may shuffle edge cases with the owner's team).
**A = About FAQ (public), P/G/E = parent/gamer/gedu dashboard FAQ.**

| # | Question | Home |
|---|---|---|
| 1 | What is Sogverse, and is School of Gaming a school? | A |
| 2 | What ages is this for? | A |
| 3 | Which games do you run clubs in; does my child need to own the game? | A |
| 4 | What equipment does my child need? | A |
| 5 | Club vs camp vs event? | A |
| 6 | What does it cost; how does billing work? | A |
| 7 | Can I cancel a club subscription; refund policy? | A |
| 8 | Several children — how do accounts and payments work? | A |
| 9 | What languages are sessions run in (vs app language)? | A |
| 10 | Can my child's friend be in the same group? | A |
| 11 | Municipality clubs — what are they, how to join via school? | A |
| 12 | Who are the Gedus and how are they vetted? | A |
| 13 | Voice chat — can strangers talk to my child; is anything recorded? | A |
| 14 | Why doesn't my child have their own email/password; how do they sign in? | A |
| 15 | What is the parent PIN; what if I forget it? | P |
| 16 | What happens if my child is bullied — or behaves badly? | A |
| 17 | What data do you store about my child; how do I get it deleted? | A |
| 18 | Will I hear how sessions went? | P |
| 19 | Missed a session / joining a club mid-term? | P |
| 20 | What time do sessions happen in our timezone? | P |
| 21 | Something broke right before a session — what do we do? | P |
| 22 | How do I join my session when it starts? | G |
| 23 | Nobody can hear me / I can't hear anyone — what do I check? | G |
| 24 | Yty-Points, Quests, Achievement Badges — what and how? | G |
| 25 | What is the gamer's oath? | G |
| 26 | Can I keep playing with my club friends outside sessions? | G |
| 27 | What if someone is mean to me in a session? | G |
| 28 | How do I become a Gedu; what happens after I register? | A |
| 29 | What does certification mean; what can't I do until approved? | E |
| 30 | How do I get assigned to a group? | E |
| 31 | Safeguarding concern mid-session — what do I do? | E |
| 32 | A gamer can't connect and the session has started — escalation path? | E |
| 33 | Who do I contact about schedule, pay, or contract? | E |

(Yty answers on the gamer side stay short and link nowhere — `/about` explains Yty
in full, and gamers can reach it from the header.)

**Five Q&As migrate from the public help page verbatim — question text and
answer unchanged in every locale.** They cover roughly rows 1, 5, and 12
directly, a get-started item whose answer covers row 14's sign-in ground, and
the mechanism-verified safety answer spanning rows 13/16/17. Do **not** re-word
their questions to match the inventory's phrasing — that is five locales of new
public copy (the safety title especially is precision-sensitive), and the team's
eventual answers will absorb or supersede the migrated items anyway; the
overlapped inventory rows stay open for the team. **Nothing else in the table
ships at launch**: the inventory is the fill roadmap, and each question lands
only once the team's answer for it exists.

## Implementer's-judgment notes (deliberately left free)

The cold-read raised these; each is the implementer's call, listed only so
review expects them rather than discovers them: generalising the home section
pill to take a sections array (adding a FAQ nav key); an `sr-only` page `h1` on
`/about` with the moved sections' internal heading levels untouched; stripping
the form's own internal heading where a dashboard section already provides one;
component homes (moved sections to an about directory, accordion to the shared
UI kit, card + form to a help directory retiring the feedback one); `/about`
metadata description and sitemap entry details.

## Implementation notes (steps 6–10, as built)

Judgment calls taken while building, recorded so review expects them:

- **The form's internal heading is stripped**, as the plan's judgment note
  allowed: every section already heads it, and the card leads with its
  description instead. The icon-plus-lead-text row matches the contact card's
  grammar so the two read as a pair.
- **The 429 is worded in the reader's language.** The form previously displayed
  the route's own English error sentence; it now maps `429` to a translated
  "you have sent several already" line and every other failure to a translated
  generic one. The request/response plumbing is untouched — only which string
  is painted — and the alternative was shipping an untranslated English
  sentence to three dashboards in five locales.
- **`helpSection.form` splits into shared keys plus an `adult`/`gamer` pair**
  rather than two sibling namespaces, so the audience composes into the key
  path (`t(\`${audience}.placeholder\`)`) and stays compiler-checked.
- **The role FAQ key arrays are `as const` and their composed keys carry an
  `as const` too.** That assertion is load-bearing precisely while an array is
  empty: without it the template literal widens to `string`, which the
  translator's key parameter rejects once there are no entries to narrow it.
- **The gedu skeleton gained a third ghost section** so the loading page is the
  length of the loaded one; a real Help section there would outlive the swap
  and be pushed down by the sections landing above it.
- **The help/feedback card earns one style-guide section**, since three
  surfaces render it and its submitting/succeeded/refused states are reachable
  from no preview scene.
- **Two unit tests were added**: the gedu Help section surviving the
  certification gate, and the gamer page's Yty removal plus its four-chip pill
  budget.

## Follow-ups

Cut from this plan on purpose; they live and die with this file unless the owner
names one for `TODO.md` at completion:

- Per-product game-setup instructions on the family product page (the real
  replacement for the deleted Minecraft Java guide).
- A gedu-recruiting FAQ on the public gedu registration page (question 28 could
  move there from the About FAQ).
- Flag-only mobile locale picker (−26px of header slack; not needed by this
  design, priced and shelved).
- Re-title the admin-bound submission email now that the form is help + feedback
  (today it is framed as "Feedback").
- An admin UI for reading submissions (email-only today).
- Adopt the shared FAQ accordion list on `/roblox` — composing its rich answers
  and second paragraphs at its own call site, keeping its own section wrapper.
