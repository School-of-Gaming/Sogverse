# Interactive chat preview scene — the chat system's design home

## Problem

The chat overhaul is decided (`docs/investigations/chat-overhaul.md`: persisted
DB-backed chat replacing the voice rooms' Daily app-message chat, with replies,
reactions, mentions, images, moderation). Its UI is to be designed **from scratch**
(owner decision) and needs a home to be designed *in* before any backend exists.

An admin-only live playground was planned first and retired by the owner's own
diagnosis (2026-08-31): it tried to be two things at once — a preview where an admin
acts as any role, and a live test of a backend whose whole job is to forbid exactly
that acting. The resolution assigns each purpose to the machinery this repo already
has: **design iteration happens in a fully client-side interactive preview scene**
(this plan); **transport truth** (latency, races, realtime plumbing) is shaken down in
a staging test group's real voice room during the wire-up; **security** is proven by
the CI authorization spine, never by clicking. A mock is ~95% honest about how the
feature looks and behaves under your fingers and 0% honest about the wire — so the
scene owns the first and claims nothing about the second.

## Scale

Developer/design-facing (admins via the existing scene gate). But the components built
here are the **production chat components** — the wire-up swaps fixtures for transport
and keeps the UI, per the scene doctrine ("sign the design off from fixtures first,
wire it once afterwards"). Nothing here is throwaway.

## The decision

### One scene, fully interactive, all features at once

A scene registered in the central registry (rendered at `/preview/chat/session`,
listed automatically on UI Previews). It renders the chat surface at voice-room-panel
geometry inside the real dashboard shell (chrome is composed, never simulated), driven
entirely by local fixture state. Unlike the wire-up — which lands text, then
reactions/replies/mentions/typing, then images, in phases — **the scene designs the
whole feature set at once**; that is the point of doing design in fixtures.

Interactive against local state:

- **Send / edit / delete-own** — edited marker, tombstone on delete.
- **Moderator hide** — tombstone for all, dimmed original for moderator viewers.
- **Lock chat** — lock a mock account, watch its composer die (the "locked by a
  moderator" state), unlock restores.
- **Inline quote-replies** — reply strip above the composer, quoted snippet on the
  bubble, tap scrolls to the parent.
- **Reactions** — one per emoji per person from a provisional approved set (the owner
  tunes the real set here; it is a constants edit).
- **Mentions** — chip in the text, highlight for the mentioned account.
- **Typing indicator** — simulated.
- **Images** — the staged composer queue (paste, drag, file-pick against fixture
  assets), fanning out on send into image-only messages plus one text message,
  thumbnails in a wrapping row, fullscreen viewer.

### The mock-account switcher — honest here, by construction

A fixture roster (a couple of gamers, a gedu, an admin, a parent — literal hardcoded
UUIDs per the identicon rule) with a switcher for who "you" are. Switching changes
attribution, avatar and the rendered capability set. This is the persona idea reborn
where it is truthful: there is no backend to bypass, so acting as a mock gamer is
exactly what a preview claims to be. **The capability derivation (role + lock state →
what the composer and menus offer) is written as a production module** driven here by
fixture state — the one piece of permission logic that genuinely is client-side in the
real system, exercised for real.

### Simulation controls

- **Scripted incoming activity** — a control emitting simulated messages from mock
  accounts, to feel auto-stick scrolling, arrivals while scrolled up, and grouping as
  a conversation actually flows.
- **Simulated latency toggle** — drives the optimistic-echo design's pending and
  retry states (the wire-up's most feel-defining behavior, designed here even though
  only the wire-up can prove it).

### Code homes and conventions

- Presentational components in `src/components/chat/` — message list, bubble,
  tombstone, composer, reply strip, reaction row, lock states — transport-free,
  props-driven. Standard-chat conventions (sender grouping, timestamps on group
  boundaries, auto-stick) carried as conventions; the old voice `ChatPanel` is a
  reference, not a base, and is untouched by this plan.
- Fixture state machinery beside the scene in `src/components/preview/` per scene
  conventions; the fixture roster with its literal UUIDs lives with it.
- **Strings are the production strings from day one**: a new `chat` namespace in
  `messages/`, all five locales, per the no-placeholder rule — churn during design
  costs translation upkeep, and that cost is accepted rather than carving a
  "not-user-facing-yet" loophole. Scene titles/descriptions stay literal English per
  the registry rules.
- No style-guide demo: one home. The scene is where chat's states live side by side.

## Rejected alternatives

- **The admin live playground** (a full reviewed plan existed — see git history for
  `docs/plans/admin-chat-playground.md`). Retired: preview and live-test wanted
  opposite things from the same mechanism — personas either bypass the security under
  test or require the backend to wink at them. Its reviewed *backend* design survives
  in the investigation for the wire-up plan.
- **Design directly in the voice rooms.** Production child-facing surface; forces the
  `voice/CLAUDE.md` amendments before the design settles.
- **A static (non-interactive) scene.** Chat is its interactions — composing,
  replying, a lock landing, reactions toggling; stills cannot sign that off.
- **English-only strings during iteration.** Tempting, but the components are
  production components and the no-placeholder rule has no "not shipped yet" carve-out
  worth inventing.

## Steps

1. **Components** in `src/components/chat/` + the capability-derivation module, unit
   tests beside them (grouping, capability derivation, composer fan-out staging).
2. **Fixtures + scene**: roster, seeded conversation, local-state store, simulation
   controls; register the scene; scenario metadata.
3. **Locales**: the `chat` namespace ×5.
4. **Docs**: colocated `CLAUDE.md` for `src/components/chat/` (capability module,
   transport-free contract, one-home note); update the investigation's status line.

No migration, no API routes, no realtime — nothing for the DB spine or the route
registry, and the checks prove it by not firing.

## Acceptance criteria

- The scene appears on UI Previews and renders the full feature set playably as
  described, including the switcher changing capabilities and the two simulation
  controls.
- Every interactive state is reachable: pending/retry bubbles (latency on), tombstone
  vs dimmed-original (mod vs non-mod viewer), locked composer, reply-scroll,
  reaction toggling, image fan-out.
- `npm run lint`, `npm run type-check`, `npm run test` clean; all five locales carry
  every `chat` key.

## Constraints discovered while deciding

- The scene doctrine: registry-only declaration, real chrome composed, one scenario
  for everything that can coexist in one render — the account switcher keeps viewer
  variants inside one scenario.
- Fixture ids feeding identicons must be real literal UUIDs (the roster).
- The log is a fixed-height scroll region; tombstones (not removals) keep readers'
  places; image boxes size from stored dimensions, never measurement.
- No emoji in `messages/` files; the reaction set lives in a constants module.
- Approved-set reactions render from constants, so the owner's final emoji pick is a
  code edit inside this surface, not a follow-up feature.

## Follow-ups (live and die with this plan unless the owner keeps them)

- **The wire-up plan** — written from `docs/investigations/chat-overhaul.md` once the
  design is signed off here: schema + RPCs + realtime into the *voice rooms* directly
  (membership-scoped guards from day one), staging-room shakedown, instant rooms drop
  chat, `voice/CLAUDE.md` amendments.
- **The admin Testing page email-preview-into-dialog rework** — orphaned from the
  retired playground plan but wanted on its own merits (the owner: the preview
  "hijacked most of the screen"); a small standalone task whenever the owner says go.
