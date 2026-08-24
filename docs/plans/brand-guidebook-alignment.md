# Brand Guidebook alignment — copy and mechanical fixes

Bring Sogverse into compliance with the **School of Gaming Brand Voice & Identity Guidebook
v2.0** (Jul 21, 2026) — the definitive brand authority, per the owner's ruling — and codify
every decision this work produces in the repo so the alignment survives without the
conversation that made it.

This is the first of **two companion plans**. This one carries the copy and mechanical
fixes and lands as one branch. The visual work — Yty palette on dark, buttons, display
faces — is `docs/plans/brand-palette-and-type-design-pass.md`, which branches off `dev`
**after this plan merges** (both touch `globals.css`, the root `CLAUDE.md`, and the message
files) and runs UI-first-then-wiring through owner review gates.

The Guidebook is not in the repo (owner's copy:
`~/Downloads/SOG/SoG_Brand_Voice_Guidebook_v2_0.md`). Every rule this plan relies on is
quoted or restated here self-containedly; the implementer does not need the source
document. A set of open questions has been escalated to the Guidebook's author in
`~/Downloads/SOG/Sogverse_Guidebook_Clarifications_Aug_2026.md` (the owner uploads it for
review); **everything escalated there is out of this plan's scope** and returns as new
small work when answered.

## Problem

A five-agent audit (2026-08-24) compared the app against the Guidebook and found:

- The anti-bullying page tells parents, in four locales, that discipline includes losing
  "our Discord" — conceding, on the safeguarding page, a safety claim the brand is built on
  ("we do not have a Discord"; families never touch it).
- The Terms page offers a **2-day** refund window for clubs; the real policy is a
  **30-day** money-back guarantee, and it appears nowhere a purchasing parent would see it.
- The About page attributes the brand proverb to "The Principal of the School of Gaming" —
  the exact string the Guidebook names as a known live bug (the character is the
  **Princi-Pal**; the hyphen is the joke).
- Safety copy states intentions ("we take privacy very seriously") where the Guidebook
  demands checkable mechanisms ("there are no private messages").
- Marketing copy presents Minecraft as the whole offer (site-wide meta description, home
  hero, About hero, FAQ) while the product already ships Roblox, Fortnite, Pokémon GO and
  Rocket League topics — the Guidebook's named "most costly" drift.
- Banned vocabulary ships in high-traffic strings: "World-class" (home hero), "kids" (×6),
  "Skills for the future", "More Than a Coding Class", "curriculum", "course".
- The Yty page miscases nearly every term it uses (Yty points, quests, achievement badges,
  Yty level) and drifts two element definitions.
- The amber/violet tokens have drifted (hand-rounded HSL): the app renders
  ≈#F7AE02/#8700E0 where the brand is #FAA901/#8F00E2. Poppins — the Guidebook's workhorse
  face — is not loaded; the app runs on fallback stacks, and OG cards render Inter.
- No ® on the registered logo anywhere; the Guidebook directs one on the website footer.
- The vision statement ships in five inconsistent forms; none of the five brand slogans is
  used anywhere.
- Marketing headings are pervasively Title Case against the Guidebook's sentence-case rule.

## Scale

Every public marketing surface, all five locale files (`messages/*.json`, ~3,300 lines
each), the two brand colour tokens, the app font stack, and the gedu staff docs. The
Discord and refund findings sit on safeguarding and money surfaces — the two categories
this repo's own rules treat as highest-stakes.

## The decision

The owner (Kyle, CTO) ruled on every audit finding (2026-08-24, two rounds — the second
after a challenge review). The rulings, which the implementer must not relitigate:

1. **The Guidebook is the definitive brand authority.** Where the app diverges without a
   recorded ruling below, the Guidebook wins.
2. **Discord**: parents and gamers do not use Discord, at all. Strip every family-facing
   reference. Discord survives only as an internal, Gedu-only legacy tool being phased out
   (the in-repo Discord bot is that tool and stays). The gedu handbook is updated to match —
   there are no gamers on Discord any more.
3. **Refunds**: the 30-day money-back guarantee is real **for clubs**. Fix the Terms clubs
   clause, surface the guarantee on paid *club* product pages. Whether it extends to camps
   and events (paid upfront, fixed seats/capacity — the Terms carry a separate camp refund
   ladder) is **escalated**; camp/event pages and the camp ladder are untouched by this
   plan. There is no automated refund mechanism: copy directs the parent to support, where
   an admin refunds manually per policy.
4. **"the Sogverse"** (definite article) is retired — swept from copy, from the root
   `CLAUDE.md`'s "third sense" paragraph that authorises it, and from staff docs. The
   article stays only where it belongs to the following noun ("the Sogverse team/shop/
   community"). The **account possessive stays with the brand** ("your School of Gaming
   account") — recently reviewed and codified; escalated to the Guidebook's author as a
   proposed Guidebook change, not swept here.
5. **Typography**: Poppins becomes the app face now; Space Mono is loaded but *placed* only
   in the design-pass plan; Crimson Pro deferred. **Press Start 2P is approved, but only
   for rare, specialized uses** — its placements are reviewed in the design pass; the rule
   is codified now.
6. **Princi-Pal** is an untranslated brand-name in all five locales (like "Sogverse").
7. **The monogram-only logo mark** (badge without the "SCHOOL OF GAMING" line) was
   intentionally designed and approved — the sanctioned small mark. No change; codify.
8. **®** is added to the footer logo, once. (Not legally required; the Guidebook directs
   it: "website footer… at least on first or most prominent appearance. Once per page is
   enough.")
9. **All of the Guidebook's §9 formatting rules are escalated** — including the zero-cent
   price rule, the 12-hour clock, date/range forms, and duration abbreviation (the owner's
   question: did the author have the countdown clock in mind?). **This plan changes no
   date, time, duration, or price formatting.**
10. **Email content questions are escalated** (named signer for automated mail, the visible
    reach-a-human line, the first-session date in the enrolment confirmation). This plan
    changes no email copy; it only codifies the hard-moment *rules* (step 15).
11. **Safety copy moves from intentions to mechanisms** — but only mechanisms verified
    true. Unsupported mechanisms become TODO.md feature items (owner pre-approved,
    2026-08-24, exactly three — nothing else is added to TODO.md).
12. **Missing world-model features** (Yty-Points balances, Achievement Badges, Quests,
    Seasons/Episodes, Sogo/store, Gedu Academy surfaces, a Princi-Pal voice surface) are
    roadmap, not defects. They go to `ROADMAP.md`.
13. **Every deviation from, expansion of, or rejection of the Guidebook gets a logged
    entry** in a transitional log (created by this plan): entries are removed as they are
    approved and codified in their permanent homes (the Guidebook's own decision log, or a
    repo `CLAUDE.md` rule), and the file is deleted once empty. Git history is the record.
14. **The Claude memory file holding these rulings is temporary.** This plan folds its
    content into repo docs; the companion plan deletes it as the final step of the whole
    effort.

## Rejected alternatives

- **A light theme, or per-surface light mode** — rejected. Owner preference for
  light-on-dark is firm; the Guidebook's Appendix A itself concedes its visual rules are
  "the most defensible reading of the assets rather than a designer's ruling" and yields to
  a future visual manual. The dark interpretation of the palette *is* that work (companion
  plan).
- **Adopting §9's literal formats** — escalated wholesale, including the zero-cent rule an
  earlier draft carved out (the challenge review correctly flagged the carve-out as the
  plan overriding the owner's deferral, on money display, with admin-surface blast radius).
- **Renaming "session" → "lesson" product-wide** — out of scope; escalated. The Guidebook
  demands "lesson" but uses "session" freely in its own examples, and the rename touches
  DB/service/email layers.
- **Renaming the Roblox "Programme"** despite the ban on "program" — rejected; formally
  named joint offering with legal documents bearing the name. Escalated for ratification.
- **An automated refund mechanism** — rejected for now. Manual, via support, per policy.
- **Sweeping "your School of Gaming account" → "your Sogverse account"** — rejected; the
  brand-possessive sweep is recently codified, and the reasoning is escalated *into* the
  Guidebook.
- **Two branches for this plan** — rejected after the challenge review. The design pass
  (whose owner-gated iteration forced the split) is its own plan; this plan is the default
  one branch, one merge, one whole review, one release.
- **Adding a deadline to the duplicate-payment confirmation copy** (the Guidebook's §7.3
  fourth element) — rejected by the owner. Under our Stripe integration a duplicate payment
  is nearly impossible; elaborating that state — in the page copy or any mail — implies a
  fault in the tech and sets a low expectation. The existing minimal string stands.
- **Writing follow-up ideas into TODO.md wholesale** — no. Only the three owner-approved
  mechanism features; everything else lives in Follow-ups and dies with this file unless
  the owner names it.

## Constraints discovered while deciding

- **Colour conversions are computed with code, never estimated** (owner instruction). The
  drift being fixed was itself caused by hand-rounded HSL. Exact values, verified with a
  script: `#FAA901` = `hsl(40.48 99.20% 49.22%)`, `#8F00E2` = `hsl(277.96 100% 44.31%)`.
  `src/lib/constants/colors.ts` already carries the exact hexes — `globals.css` is the
  drifted half; fix it, not colors.ts.
- **`messages/` rules bind**: every user-facing string change lands in all five locales
  (best-effort translation; `tlh` is an easter egg and omits legal namespaces — the Discord
  string does not exist there). No emoji in messages files.
- **The Klingon easter-egg table on the About page** deliberately renders quirky
  translations (including a "Learn More" row) — it documents jokes; do not "fix" it.
- **`Gamer`/`Parent` capitalised in the Roblox safeguarding policy is correct** — the
  Guidebook blesses capitalised roles in compliance documents defining parties with rights
  and obligations. Do not lowercase those.
- **The gedu docs feed an AI assistant**: `src/data/gedu-docs/*.md` is the knowledge base
  for the staff Discord bot's answers, so stale claims there (gamers on Discord) surface in
  generated prose to staff.
- **Roblox partner rule**: any new surface carrying the Roblox mark needs fresh partner
  approval; this plan adds none. "In collaboration with" phrasing is already correct — do
  not touch it.
- **DB tests run in CI only** (no local stack): exercise them by pushing the branch. The
  email house-style and palette-contrast suites cover any email-constant change.

## Steps

One branch off latest `dev`, `feat/brand-guidebook-alignment`.

### Mechanical fixes

1. **Princi-Pal**: `about.quote.attribution` becomes `— The Princi-Pal` in all five locales
   (untranslated; the current fi/sv/fr render a generic "headmaster" word and are replaced
   by the mark).
2. **Discord strip**: remove "our Discord" (and rework the sentence) in the discipline
   page's step-5 string in en/fi/sv/fr — name what removal actually means: their clubs and
   Sogverse. Update `src/data/gedu-docs/` (notably the Perusopas and the Minecraft guide)
   to remove gamer-Discord workflows and mark Discord as internal-only legacy tooling.
   **Scale note:** the Perusopas describes consumer clubs running on Discord in
   operational detail (a gedu Discord-profile section, substitution tickets and task
   patches in Discord channels, attendance sorted by Discord username) — the owner
   confirmed (2026-08-24) all of that is outdated: **all clubs now run in Sogverse; no
   gamers are on Discord.** The rewrite proceeds on that basis, in Finnish, and feeds the
   staff AI assistant. Where a Discord workflow's Sogverse replacement is not derivable
   from the repo (e.g. how substitutions are ticketed now), mark the section for ops to
   fill rather than inventing a procedure.
3. **Refunds (clubs only)**: the Terms clubs-cancellation clause becomes the 30-day
   guarantee. Add the guarantee to paid **club** product detail pages (pricing/signup panel
   area) in the Guidebook's register — plain, unhedged, warm: "30-day money-back guarantee.
   If it is not right for your child, we refund you — no awkward conversation required."
   plus a contact-support line. Camps, events, and free/municipality products don't show
   it; the camps refund ladder in Terms is untouched (escalated). **Two Terms strings
   change, not one**: the clubs-cancellation clause *and* the Terms intro line that
   currently promises "a money-back guarantee on your child's first session" — both must
   state the same policy (en/fi/sv/fr; `terms` is tlh-omitted). The surface is the
   **public shop product detail page** (`src/components/public/products/` — the owner's
   words: "our shop product details page"), not the family product page; the owner reviews
   it by extending the existing product-detail preview scene's fixtures so a paid-club
   scenario shows the guarantee. **The 30-day anchor is decided (owner ruling,
   2026-08-24): 30 days from the child's first session** — the most generous reading for
   parents (the window starts at the later event, and you can only learn "it is not right
   for your child" by attending). Terms wording and badge copy both state it that way.
4. **"the Sogverse" sweep**: the five real occurrences in `en.json` ("the Sogverse team" is
   the permitted exception and stays), the minecraft-api docs page description, and
   staff-doc occurrences → bare "Sogverse". Rewrite the root `CLAUDE.md` "third sense"
   paragraph: the article is retired; universe and platform are one thing named Sogverse;
   the team/shop/community exception stands. (This is the only CLAUDE.md edit for this
   rule — step 17 lists the others.)
5. **Token exactness**: every occurrence of the drifted values in `globals.css` moves to
   the exact brand values (constraint above) — `42 98% 49%` appears on `--primary`,
   `--ring`, and `--sidebar-primary`; `276 100% 44%` on `--secondary`; all four move.
   Verify by converting back with a script.
6. **®**: footer logo gains the symbol, once, sized/positioned not to crowd the mark.
7. **Fonts**: load Poppins via `next/font` and define the sans stack so body and headings
   render in it (fallback `system-ui, sans-serif`); swap the OG-card font fetch from Inter
   to Poppins. Load Space Mono (placement is the design-pass plan's). Press Start 2P
   remains loaded and placed as-is for now. Details that matter: "headings" means headings
   not set in `--font-display` (the Press Start 2P sites keep their face for now);
   `globals.css` documents a previous Inter attempt that never applied because its
   variable lived on `<body>` while the theme block resolves at `:root` — wire the
   variable where the block can see it, and verify by computed style, not by eyeball; the
   OG swap keeps the two-weight shape (Poppins has 400/600 on Google Fonts) and replaces
   the hashed Inter URLs in the OG fonts module. **The Space Mono load is deliberately
   unused in this plan** — the design-pass plan places it; do not let a review remove it
   (leave a code comment saying so).

### Copy sweep (all five locales)

8. **Banned terms**: "World-class" → "Professional" (home hero); "kids" → children/gamers
   (×6 family-facing strings + the layout `keywords` array); "Skills for the future" →
   "Human Skills" and "More Than a Coding Class" reworded (Roblox page); "curriculum" and
   "course" out of the Roblox privacy strings; "out in the real world" → "in everyday
   life" (About). The Minecraft Education description drops "teachers"/"instructor" by
   describing the role, not the title: "…plus extra tools for the adult leading the
   session, designed for guided activities rather than solo play" (it describes Microsoft's
   product, so "Gedu" would be wrong there).
9. **Mechanism verification, then safety copy**: before writing, verify against schema and
   flows what is true: what is stored for a gamer (real name? birth date?), whether the
   gedu→parent paths (incl. WhatsApp) expose parent contact details, whether "a Gedu is
   always present" holds for every session type. Then replace the ~8 intention-style
   sentences (terms/privacy/discipline intros, both PIN descriptions, the About value, the
   Roblox safeguarding intro) with verified mechanism sentences. Mechanisms known true and
   available: no DMs — communication is group-based with a Gedu present; gamer accounts
   carry synthetic internal emails (nothing to leak); gamers sign in only by parent
   account-switch (no child-held credential); every gamer is linked to a verified parent
   account; purchases require the parent PIN. Reuse the already-written mechanism block in
   the Roblox privacy policy as the pattern, and surface a version of it in the public
   help/FAQ safety answer.
10. **TODO.md** (owner-approved, exactly these three; the constructs are Guidebook terms,
    defined here so the entries can be written in TODO's problem-and-fix style):
    - **Display-Name/Age-Bracket data minimization** — hold only a display name and an
      age bracket for a gamer: no real name, no birth date, no real email — so there is
      nothing about a child to lose, leak, or sell. Today parents type a gamer name at
      creation and the audit could not confirm what else is held; the feature is auditing
      and minimizing that to the two fields.
    - **A formalized Educator Privacy Shield** — the guarantee that a gedu can reach a
      family through the platform without ever seeing the parent's email or phone number.
      Report mail is already server-sent (shield-shaped); the feature is making the
      guarantee hold across every contact path and stating it.
    - **A parent-facing Accountability Loop explanation** — every gamer is linked to a
      verified parent account, so a conflict can be finished rather than merely blocked:
      resolved between the gamers with the Gedu as referee first, reaching parents through
      the platform only if needed, without exposing either parent's contact details. The
      mechanism exists; nothing explains it to parents anywhere.
11. **Multi-game copy**: site meta description, home hero subtitle, home features card,
    home how-it-works, About hero, and the "What is Sogverse?" FAQ answer reframed so games
    are dimensions of Sogverse, never the definition — name several titles or none; never
    "Minecraft clubs" as the offer. (The FAQ's "School of Gaming's platform" gloss is
    retained per the codified brand-vs-platform rules — logged as a deviation, escalated
    for ratification.)
12. **Yty content**: casing to the fixed forms — Yty-Points, Quests, Achievement Badges
    (metal levels stay lowercase), Yty-Level, "The Four Yty-Elements"; Valor's definition
    "with society", Wit's "with technology"; tighten the intro toward the canonical
    register ("Yty is the force that keeps Sogverse in balance…"). The definitions live in
    **two homes**: the `messages/` Yty namespace *and* hardcoded English in
    `src/lib/constants/yty.ts` (which feeds the gamer dashboard cards and, via the voice
    zones, the room tiles) — both move. Exact replacements: Valor "Your relationship with
    society", Wit "Your relationship with technology"; the longer element `detail`
    paragraphs and the section subheading that restate "the world" move consistently
    (implementer's wording, definitions fixed).
13. **Vision statement and slogans**. One canonical vision-statement wording — "Where
    Screen Time Becomes Quality Time." — everywhere it appears in prose. The styled home
    hero keeps its current line-broken presentation without the full stop (owner deviation,
    escalated). The meta/OG description leads with the statement properly capitalized, then
    the multi-game descriptor from step 11. The duplicate rendering in the features card is
    retired; that card gets a different heading. Slogans — the brand has five; each placed
    at most once per page, never two in one piece, capitalization and full stops exactly as
    written: **"Learning by Gaming."** as the home how-it-works section heading (the
    Guidebook's own sanctioned vision+slogan page shape: vision in the hero, this slogan
    lower and smaller); **"Scouts of the Online Age"** on the gedu registration page;
    **"Children first. Always."** on the anti-bullying page — weight-bearing, once. The
    remaining two are deliberately unplaced: **"Ambassadors of Positive Gaming."** (its
    audiences — gamers about who they are, Gedus about the work — have no fitting surface
    yet) and **"By playing, a better world and better people."** (funders/mission surfaces
    don't exist). **Owner reviews placements.** Two details: the **OG image** draws the
    vision statement as a styled two-line graphic — it follows the styled-hero treatment
    (canonical capitalization, no full stop), and its sub-line follows step 11's
    multi-game rule; and replacing "How It Works" with the slogan deliberately gives up
    the functional section label — the Guidebook's own sanctioned page shape — with the
    section's subheading keeping the functional job (that subheading is also a step-11
    target).
14. **Heading case** (owner-confirmed 2026-08-24): the Guidebook's Appendix A.3
    (typography, which the owner adopted — not the escalated §9):
    "Headings are sentence case. Never ALL CAPS, never Title Case Every Word. This is a
    house rule with teeth." Sweep the ~34 Title-Case headings in `en.json` to sentence case
    (proper nouns keep their capitals) and remove CSS uppercase from true heading elements
    (~9 sites). Small uppercase eyebrow/label elements are permitted (the Guidebook's own
    topic-pill spec is bold caps) and stay.
15. **Codify email rules**: `src/lib/email-templates/CLAUDE.md` gains the hard-moment
    rules — admissions lead ("we charged you twice. That was our error." shape), one
    remedy + one deadline + one escalation path, no apology inflation ("we sincerely regret
    any inconvenience" never ships), and Level-0 money copy carries no lore. Rules only; no
    template copy changes (escalated). The four-element register (deadline included)
    governs hard-moment mail written in the future; it does not retrofit existing copy —
    in particular the duplicate-payment confirmation state stays minimal (owner ruling,
    see Rejected alternatives). No contradiction: one is a rule for new writing, the other
    a ruling about one existing string.

### Codification

16. **Create `docs/brand-guidebook-deviations.md`** — the transitional reconciliation
    queue. Columns: what · ruling (expansion / exception / rejection / escalation) ·
    justification · date · permanent home when resolved. An entry is **removed** when its
    ruling is approved and codified in its permanent home (the Guidebook's decision log or
    a repo `CLAUDE.md`); the file is **deleted once empty**. Seed it from the escalation
    memo already sent to the Guidebook's author
    (`~/Downloads/SOG/Sogverse_Guidebook_Clarifications_Aug_2026.md`): the §9 escalation
    bundle (clock, dates, ranges, durations/countdown, zero-cent prices), camps/events
    refund scope, email content questions, session/lesson, vision-statement full stop in
    the styled hero, Princi-Pal untranslated, "Programme" + the 8–17 age band, the
    dark-theme palette, account possessive, the platform gloss, Press Start 2P, the
    monogram mark, Arial in email, the uppercase-label reading — plus the expansions
    proposed for upstreaming (the lockup, partner vocabulary, the PIN and switch-only-login
    mechanisms). Rulings and justifications for the entries not stated elsewhere in this
    plan, so the log can be written without the escalation memo: **Arial in email** —
    exception; webfonts don't load reliably in mail clients (already ruled permanent in
    the email templates' CLAUDE.md). **Uppercase labels** — interpretation; the Guidebook
    bans caps for headings while its own topic-pill spec is bold caps, so label-shaped
    elements may be caps. **8–17 age band** — escalation; the Roblox programme's stated
    audience vs the Guidebook's settled 7–15. **Monogram mark** — exception to the
    Guidebook's logo rule that the "SOG" monogram and the "SCHOOL OF GAMING" line "travel
    together"; a designer-made, owner-approved small mark. **Platform gloss** — exception
    to the Guidebook's "never explain the name"; permitted on introduction surfaces only.
    **Press Start 2P** — exception; not among the Guidebook's sanctioned faces;
    owner-approved for rare, specialized uses.
17. **CLAUDE.md updates**: the rewritten Sogverse paragraph (step 4); Press Start 2P's
    rare-use rule in the Styling section; the safety-copy rule (mechanisms, never
    intentions) as a house rule; a pointer to the deviations log from the Brand section.
18. **ROADMAP.md**: add the world-model features (Yty-Points balances, Achievement Badges,
    Quests, Seasons/Episodes, Sogo + store, Gedu Academy / Gedu Path surfaces, a Princi-Pal
    voice surface, the gamer dashboard's Level-3 world) in that file's existing style.

## Acceptance criteria

- Greps return zero across `messages/` and user-facing `src/` strings (excluding the
  Klingon easter-egg table): `World-class`, `our Discord`, `Principal of the School of
  Gaming`, `Skills for the future`, `we take .* seriously`-shaped safety sentences, and
  `kids` in family-facing strings (the admin-only preview fixtures and code comments are
  out of scope). For `the Sogverse` the rule, not the grep, is the criterion: the article
  goes except where it belongs to the following noun — survivors like "the Sogverse team",
  "the Sogverse Discord bot", "the Sogverse row/catalogue/system" are correct; staff-doc
  lore uses ("parts of the Sogverse", "the history of the Sogverse") are swept. The
  fi/sv/fr/tlh counterparts of swept en strings carry no article and need no change for
  this rule.
- The five locale files stay key-complete (`check-translations` passes); `tlh` legal
  omissions preserved.
- `npm run lint`, `npm run type-check`, `npm run test` clean locally; DB tests green in CI
  on the pushed branch.
- No date, time, duration, or price rendering changed anywhere (escalated wholesale).
- Poppins visibly renders as the app face; OG images render Poppins.
- Footer shows ® with the logo, once.
- Owner has signed off: the club-guarantee placement (step 3) and the slogan placements
  (step 13).
- `docs/brand-guidebook-deviations.md` exists with the seed entries; CLAUDE.md, ROADMAP.md
  and TODO.md carry their additions.
- This plan file is deleted at completion (follow-ups proposed to the owner by headline
  first). The Claude memory file is deleted by the companion plan, not this one.

## Owner-decision escalations during implementation

Beyond the standing list (money, auth, safeguarding, data deletion): any mechanism
sentence whose verification (step 9) comes back ambiguous; the final wording of the Terms
30-day clause (money + legal — the anchor is decided, the sentence still gets the owner's
eyes).

## Follow-ups (live and die with this plan unless the owner names them)

- A dedicated public "How we keep this safe" section (the full mechanism block as its own
  surface, beyond the FAQ answer in step 9).
- Gedu word-mark ™/® guidance once the autumn 2026 filing lands.
- Confirm partner approval exists for the Roblox OG image (repo rule: each placement needs
  its own approval; the hero is the one documented approval).
- Everything escalated to the Guidebook's author returns as new small work when answered —
  tracked by the deviations log, not by this list.
