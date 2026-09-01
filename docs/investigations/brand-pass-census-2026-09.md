# Brand design pass — census findings and working doctrine

**Status: research record, 2026-09-01.** The distilled findings of the six-territory
colour census and the typography sweep run during the brand design pass
(`docs/plans/brand-palette-and-type-design-pass.md`), plus the working doctrine they
stress-tested. Decisions live in the plan's numbered directions and on the three review
decks; this file is the *evidence and intelligence* behind them, written so a session
with no conversation context can execute the wiring phase without re-running the
exploration. Delete alongside the plan when the pass completes.

## The three review decks (all temp, deleted before merge, admin-gated, URL-only)

- `/admin/design-pass-typography` — 14 slides / 15 rulings
- `/admin/design-pass-home` — 6 slides / 5 rulings (the home page is parked into its own
  pass; the owner is comfortable with today's amber/violet hero)
- `/admin/design-pass-walkthrough` — "colour & grammar", 21 slides / 22 rulings

All obey the codified show-don't-tell rule (root `CLAUDE.md`, UI-reference section).

## Doctrine v2 — the working colour system (pending per-ruling sign-off on the decks)

**Rings** (per surface, by audience and stakes, not URL): **calm** — money, auth,
safety, legal: amber sole accent on the neutral ground, colour otherwise only as genuine
status. **family story** — parent everyday surfaces: amber for actions, grammar colours
where meaningful, at most one family as decoration. **full palette** — gamer, voice,
community, marketing: every family welcome, still grammar-consistent. The census
confirmed the ring model; ambiguous surfaces worth remembering: seat offers
(family-story face, money act), select-profile (auth act, family front door), the
add-gamer dialog (calm PIN gate swapping to family-story form).

**Function colours, fixed and ring-independent:** amber = act (buttons, links, the
mark); red = destructive only; warning = caution; muted = structure. Warning's hue is
4.5° from amber's (45.0° vs 40.48°) — inherited, owned by a deck ruling (warning marks
always carry a glyph, never sit inside amber-act containers).

**Grammar families** (each one meaning, derived from the elements): harmony pink =
people; glow green = growth — and **liveness** ("happening now" is growth happening);
wit blue = knowledge — and **time-ahead** (the feeds' future system) and **eligibility**
("is this for me?", today asked in three different colours); valor orange = adventure
(events/camps; used with care, it neighbours amber); violet = the brand's second lead,
narrowed to display/identity moments — it retires from everyday UI grammar duty.

**The strength axis** (the doctrine's second dimension; admin census finding): solid
fill = act; tint + coloured text = state/label; edge + faint wash = selection/container.
Same hue, three grammatical functions. "You are here / this is you / this is on" is NOT
act and leaves amber (foreground-strength treatment recommended). This answers: the 14
amber form-selection cards, the sidebar active item, the voice dock's five amber
toggles, the WhatsApp outbound bubbles (the largest amber area in the product).

**Lifecycles are one hue, stepped strengths — never a family per step.** Admin's colour
is mostly ordinal (product status ×5, participation ×4, fees ×4, WhatsApp delivery ×5,
attendance ×3) and families can't express "further along". Visible symptom: completed
and expired products render byte-identical grey.

**The ensemble rule** (owner): amber+violet stay the leads; the four tertiaries read as
equally represented. Semantics are trimmed where they'd flood — mechanical
acknowledgements (copied/saved/sent) stop being green; glow is reserved for domain
facts — and free colour (decoration, identity, marketing) is spent on the family the
surface hears least.

**"The fact owns its tone":** a fact's colour is decided once, in a shared constant at
the fact, never per surface. The drifts this ends: a missing gedu fee is muted on the
admin dashboard, destructive on the product list and details, colourless in the form
that sets it; "absent" is neutral in the open attendance register and warning once
saved; "Live" is four sites in two colours (below).

**Gradients:** brand-hue blends are retired ("they smear colours"); single-hue
fade-to-transparent washes are washes, not smears, and survive. The one candidate
gradient still arguing (dusk-sky hero) lives on the home deck. The gedu role badge's
amber→violet gradient is the canonical banned construct.

**Settled by owner ruling (in the plan's directions):** product-type palette
(cyan/magenta/lime/indigo) stays exactly as is, admin-only — its hues were placed
25–30° clear of the function colours and every proposed family lands 7–21° from a
function colour it must sit beside; the identicon (every avatar = amber+violet+white
from `src/lib/identicon.ts`) is out of scope, its own future pass, owner-named
follow-up in the plan.

## Typography doctrine — face = voice (owner ruling: Press Start 2P retires app-wide)

Poppins = the app speaking (trust register; all UI and marketing). Space Mono =
Sogverse-the-world speaking (in-platform display moments only; the Guidebook fences it
out of parent-facing marketing copy). Crimson Pro = editorial voice (pull quotes;
never long body text; not currently loaded — the deck loads it page-locally). Plain
mono = the machine (copy-affordance or compared-character-by-character strings).
Dancing Script = signature only (unlogged deviation; log-or-drop ruling on the deck).
Campaign faces (Lazydog/Shlop/True Typewriter) are campaign-only, no files in repo;
Work Sans retired; Plus Jakarta dropped.

**The six Press Start 2P sites and their settled replacements** (deck rulings pending):
home hero → Poppins H1 (marketing); call-ended tagline → Poppins (renders
`home.hero.title` verbatim); /roblox hero → Poppins **through its partner gate** (sits
above the approved Roblox lockup — owner's explicit go + partner review; its responsive
scale is arithmetic that assumes PS2P's exact 1em advance and must be re-derived);
gamer greeting → Space Mono (drafted, `GREETING_FACE` map in the gamer body);
profile-select "SOG" → replaced by the real mark (badge `sog-logo-simple.svg` +
`SogWordmark`), removing a PS2P site outright; admin all-clear → Space Mono beside its
PixelSprite, or cut both together. Wiring retires the face site by site and then
unloads it — **never by repointing `--font-display`**.

**The world's entire actual reach** (sweep census): the voice-room zone-list names
(Clubhouse + the four elements — the only gamer-facing render of the element names),
select-profile's "Who is entering Sogverse?", the admin all-clear's in-fiction line,
and the greeting. Everything else that looks in-fiction is public parent-facing lore
and stays Poppins. **Crimson's one real case:** the Princi-Pal blockquote on /about —
the product's only blockquote, currently italic Poppins faking the serif.

**Scale findings:** `button.tsx` line ~6 is `text-sm font-medium` (14/500) vs the
Guidebook CTA spec 16/600 — one line, every CTA. Headings: 71 of 111 weighted h1–h3
use bold-700 where the scale says semibold-600; the OG pipeline and markdown renderer
already draw 600 (one systematic ruling). Body line length: public prose uses
`max-w-3xl` (~85–96ch) vs the 70ch cap; `max-w-prose` appears 5×. `tracking-tight` on
30 of 137 headings; the scale names no negative tracking, and pixel faces must never
be tracked tight (two sites do today).

## Wiring landmines (defects to fix before or during recolouring — no rulings needed)

- **The Live badge is four sites in two colours**, and the gedu assignment card's green
  copy is hardcoded byte-identical to the tone map **without reading it** — it will
  silently miss any palette switch. Converge onto the tone map first.
- **Attendance "absent" renders two colours on one card**: `AttendanceRoster`'s pressed
  pills don't read the shared `ATTENDANCE_TONE` map the summary chips read. And
  `src/components/session-feed/CLAUDE.md` still documents absent as "muted neutral",
  stale against the 2026-08-25 owner ruling (warning) — fix the doc with the code.
- **`YTY_ELEMENT` in `src/lib/constants/colors.ts` is dead** (zero importers) and holds
  the four wrong stand-in hexes; update or delete in the token-landing commit.
- **The email hero wash** (`GRADIENT` in colors.ts → `HERO_GRADIENT` in
  email `layout.ts` + both OG images) is the amber+violet blend behind every mail,
  password resets included. ~4-line fix; the house-style test's palette allowlist
  derives from the constants and self-updates; keep `pinnedFill`'s flat-gradient
  mechanism (Gmail dark-theme armour) — only the stops change. Outlook already renders
  the mails washless and complete.
- **Machine-text gaps** (7, rule: copy-affordance or character-comparison ⇒ mono):
  Minecraft-Education UPN (`tools/minecraft-password-reset-card-view.tsx` — copies
  `${username}: ${password}` as one string in two faces), game usernames
  (`game-username-row.tsx`, nine consuming surfaces, + the editable row), product
  public URL (`product-details-page.tsx`), roster contact-email copy button
  (`ParticipantRosterRow.tsx`), WhatsApp E.164 numbers, admin/testing provider message
  id, consent-document slugs (`signup-panel-view.tsx` — public-facing, deliberate per
  comment, re-judge). Boundary: emails as labels, PIN pad, names, dates stay sans.
  Inverse: the about easter egg spends `font-mono` on Klingon prose.
- **Italics**: one violation (`legal/policy-page.tsx` warning notice), one borderline
  (`roblox/programme-faq.tsx` aside). Five sites use italic as a "ghost content" state
  marker (TwoAudienceNotesPanel ×2, SitePanel, ChatView typing, ChatTombstone,
  browse-card ended note) — a load-bearing unruled convention; sweeping italics needs a
  replacement cue there. `messages/` contains zero italic markup in any locale.
- **`ProfileTiles.tsx` raw colours**: `bg-black/60` + `text-white` scrim — the only
  hardcoded colours outside sanctioned spots; needs a token decision for scrims.
- **`--ring` = amber everywhere** including login/payment focus — a ruling, not a bug.
- **Select-profile's `UnknownAvatar`** is a solid amber disc on every signed-out page —
  decoration in the act colour.

## Mechanisms for the wiring phase (correctness-by-mechanism, per the root CLAUDE.md)

- **`Badge`** is the cheapest single point of control: default is an amber fill that 22
  of ~26 call sites paint over. Change default to neutral, add named grammar variants;
  then delete the scattered per-surface tone maps.
- **Violet's retirement is one atomic cross-ring change**, not many edits:
  `ROLE_BADGE_STYLES` (6 consumers, 3 rings, incl. voice's child-facing "Parent"
  safeguarding badge and the shared group-workspace roster barred from admin-only
  variants) + `Button`/`Badge` `variant="secondary"` + `JoinVoiceButton` locked state +
  WhatsApp read-tick + participation `completed` + the seat-offer email's violet Accept
  (its CLAUDE.md says the row *may* carry emphasis — conflict needs the replacement).
  Ship the replacement emphasis ("filled but not the primary CTA" — foreground-fill
  recommended) BEFORE retiring, or the gedu send-report and locked-Join lose their
  weight; and the gedu badge gradient can't drop before role families land (it is the
  only thing distinguishing gedu from gamer on a users row).
- **CI guards to add at wiring**: `variant="secondary"` becomes un-typeable (lint rule
  or variant removal); greps for brand-hue gradient class pairs; the tone-map-at-the-
  fact pattern gets a single greppable call-site shape.
- **Zone rainbow** (16 hues): measured collisions — zone-sky ΔE 3.4 from wit-soft,
  zone-red 4.7 from destructive, zone-pink 5.7 from harmony-strong, zone-amber 6.8 from
  primary; nine of sixteen within ΔE 13 of fixed meaning, `pickRandomZoneAppearance()`
  lands on them by dice. `voice-zones.ts` documents the overlap as intentional — a
  written ruling the grammar overturns. Options: shrink to ~8 clear hues / move the
  ring to a pastel chroma-lightness band (recommended) / accept with glyph reliance.
- **Contrast numbers** (script `scripts/yty-contrast.mjs`, card ground #1a1a1a is
  binding): softs 7.15–8.21 body-safe; wit-strong 3.81 (glyph pass, body fail) — the
  soft-carries-text / strong-carries-fills split follows; zone labels worst 6.32.

## The review model agreed for the app-wide change ("layer" model)

Layer 1: rule on the system once (the grammar deck). Layer 2: prove on the extreme
screens (admin users list, groups panel, voice participant row — the densest collision
screens — plus one page per ring) as scenes after layer-1 rulings. Layer 3: the long
tail is enforced by the mechanisms above, then reviewed by the owner **living on the
branch's preview server** with a punch list — never page-by-page.

## Standing session facts

Branch `feat/brand-palette-design-pass`, rebased onto dev's About/help restructures
(home no longer hosts the Yty section — it's on `/about`; the gamer Yty grid is deleted
— that page's draft scope is enrollment-card grammar + greeting face). Preview server:
worktree dev server on port 3002 (the owner's own dev server holds 3000). The wiring
phase begins only after the owner's deck rulings; nothing merges without explicit
instruction, and the plan's step 5 gate still governs. Review pages show, never tell
(codified). Review cadence: branch-level code review before merge covers the wiring
phase; the UI phase was reviewed 2026-08-31 (all findings applied).
