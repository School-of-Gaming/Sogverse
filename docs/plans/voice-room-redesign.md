# Voice room redesign

**Status (2026-11-05):** the design is decided and built as a draft over fixtures on
`feat/voice-room-redesign`, previewed at `/preview/voice-room-redesign/gamer` and `/gedu`.
Nothing is live yet. This plan carries the owner's rulings and what is left to take the
draft live. Delete it when the redesign lands.

## Problem

The voice room was one mobile-first stack inside the site chrome: zone cards, then chat,
then participants. Users said participant video was far too small (a 44 px tile on every
screen), Gedus and gamers want gamers to be able to share their screen, and the room has
to work for a 7-year-old's first call, a parent in a webinar who isn't confident with
technology, and a 17-year-old used to Discord.

A walkthrough of the old room found the worst trap: tapping a zone silently changes who
you can hear. People were drawn as map markers, and chat and participants sat a screen or
more below the zones.

## The decision

**Your zone is the stage.** The people in your zone are big tiles; other zones shrink to a
list. All existing features stay; only their presentation changes.

- **Two native layouts, not one responsive one.** Desktop from `lg` (1024 px), phone below.
  The room fills the viewport with no document scroll.
- **Header:** the real site header, same component and logic. A `navSlot` replaces the nav
  links with the current zone's icon and name, at every width. Below `lg` the lockup's
  word ("My SOG" / "Dashboard" signed in, "School of Gaming" signed out) hides to make
  room for the zone; the logo keeps its accessible name. The logo, language picker and
  account menu behave exactly as on any page, and **no "this will leave the call"
  confirmation** (owner ruling). No phone tab bar in the room.
- **Desktop:** left zone rail and right Chat/People panel, **both 320 px, 384 px from
  1280 px**; stage between. Controls sit at the foot of the zone rail, labelled: a gamer's
  Mic, Camera, Share, Leave on one row; a moderator's six controls on two rows.
- **Phone:** stage, then a control row of **Mic, Camera, Zones, Chat, Leave**, plus More for
  moderators and trainees. Chat opens one sheet with Chat and People tabs. Tapping the
  zone in the header also opens the Zones sheet.
- **Current zone:** marked by the zone's own colour glow only. No amber border, no "You're
  in this zone" line.
- **Show, don't tell.** The owner's governing rule: space is scarce, a packed UI
  overwhelms, the UI is for someone who already knows it, and learning it should be quick
  by trying. So none of: first-time tutorials or hints, "N people can hear you", a "you
  moved zone" notice (including the moderator-moved one), people counts on zones, the
  zone instruction line, or zone-sheet hints.
- **No Gedu or admin mark anywhere.** A Gedu in your zone is simply always the first tile
  and listed first in People. To a gamer a trainee is a Gedu; no special handling.
- **Screen sharing:** gamers can share. **Any share is shown to everyone in every zone**,
  whoever shares, except a share from a private zone you're outside (the existing privacy
  boundary). **No limit** on simultaneous shares. The first share goes big; a new one
  never takes over; others are previews in the tile strip, clicked to swap. No Share
  button on phones (phone browsers can't share, to be confirmed with Daily).
- **Moderators** get per-person **Stop screen share** (one-shot, like mute) and **Lock
  screen share** (persistent, like the mic/camera locks) in the row menu, beside the
  existing mute and locks.
- **People list:** two-line rows following the panel's width, not the viewport's; avatar
  with its speaking glow kept; mic and camera icons kept; no "Participants" heading row.
- **Speaking glow:** white for everyone.

## Rejected alternatives

- **Tweaking the old stack** — no change of wording fixes a 44 px video tile or chat
  below the fold.
- **A webinar view or scenario** — a webinar is a situation in the same room, so it lives
  in the simulation ("Moderator presents", 50 people), not as a layout.
- **Zone-scoped shares**, and a Gedu-everyone / gamer-zone split — rejected for one
  simple rule: every share reaches everyone.
- **A share limit (3 per zone was proposed)** — the owner wants none.
- **Gedu marks** (crown, green certified shield, green outline, green speaking glow, a
  "Gedu" word, a "Sanna (Gedu) is in Valor" header line) — all tried and removed.
- **Dropping the People avatar and glowing the mic instead** — tried; the owner found the
  avatar more recognisable and the two-line rows had already solved the width.
- **A separate custom top bar** — the room must reuse the site header.
- **Hiding the account menu's links in a call / a leave confirmation** — not wanted.

## Constraints discovered

- **One token flag is the whole moderator surface today:** the voice token route feeds
  the owner flag to both Daily's owner and screen-share permissions. Gamer sharing must
  separate them, or gamers get moderation too (`src/components/voice/CLAUDE.md`, "moderator
  rights come from a positive allow-list").
- **The live screen-share hook tracks one sharer**, and starting a share stops whoever is
  sharing, which needs owner rights a gamer lacks.
- **Soft zones are not private:** limiting anything by zone hides it on screen only, as
  every track still reaches every client. Shares going to everyone makes this moot for
  shares, but a gamer's share now reaches the whole room, so the moderator controls and
  the safeguarding check matter.
- **Phone browsers can't share a screen**, as far as we know; unconfirmed with Daily.
- **Both live routes draw their own header** (`(voice)/voice/[code]` and
  `(dashboard)/voice/group/[id]`); the joined room must drop it, because only the room
  knows the zone. Pre-join screens keep theirs.
- **The People row's moderation menu is now portalled** and opens downward where the space
  above can't hold it. That change is already in the shared row on the branch.

## What's built (on the branch)

- Draft room under `src/components/voice/redesign/`, mounted by the scene
  `src/components/preview/scenes/voice-room-redesign-scene.tsx`, with a scene-only
  simulation (speaking, moves, fake cameras and shares, chat typing, 3–50 people,
  Automatic shares, Add a share, Moderator presents, Your share locked).
- Shared changes: the header's `navSlot` (`src/components/layout/header.tsx`, with its
  measured width table), panel and share-moderation options on the People row and list,
  the portalled row menu, a fullscreen preview chrome.
- Gates pass on the branch tip; no code review has run yet.

## Steps to land

1. **Owner decisions** (below) before the live wiring that depends on them.
2. **Separate screen-share permission from moderation in the token**, granting it to
   gamers too, with the route's tests.
3. **Live multi-share:** the screen-share hook tracks every sharer, never stops someone
   else's share, and exposes per-person state the draft already reads from participants.
4. **Live share moderation:** a moderator's stop (the mute pattern: SFU call plus an
   owner-verified message) and a persistent share lock (the existing lock pattern on
   screen tracks, with its lock sync).
5. **Promote the draft body:** both live routes render the redesigned room and drop
   their own header once joined; instant rooms pass their link chip and no chat.
6. **Retire the old room** (`VoiceRoom`, `ZoneList`, `VoiceControls`, the old scene and
   style-guide demo) and remove options on shared components nothing uses any more.
   Keep the redesign scene as the room's preview; the simulation may stay with it.
7. **Docs:** update `src/components/voice/CLAUDE.md` and `instant/CLAUDE.md` for the new
   layout, sharing and share moderation.
8. **Review:** one `code-reviewer` pass on the whole branch, then `npm run gates`.
9. **Before release:** a real session with a Gedu and a few gamers, and the fake-media bot
   test (`docs/investigations/voice-room-scale.md`) including several shares on an older
   laptop and phone. No one on the team has an iPhone; find one for a check.

## Acceptance criteria

- A gamer in a live room sees big tiles, can share from a desktop browser, and everyone
  sees the share; a moderator can stop or lock any person's share, enforced server-side.
- Desktop and phone match the preview scene; no document scroll; the header is the site
  header with the zone in it; `/shop` and other pages are unchanged.
- The old room is gone, and the docs describe the new one.

## Owner decisions still open

- **"Moderator presents" for real:** the presenter takeover exists only in the
  simulation. Whether it ships, and its trigger (Broadcast, or a separate Present control),
  is undecided. Gedus may use Broadcast for quick announcements, which a takeover would
  disrupt.
- **Two shortened labels** made to fit the 360 px phone bar: French chat "Discussion" →
  "Chat" (also the desktop tab) and Swedish "Mikrofon på/av" → "Mick på/av". Not yet
  approved.
- **Safeguarding sign-off** for gamers sharing to the whole room.
- **Camera locks** show on the row again; fine as is unless the owner says otherwise.

## Follow-ups (cut, not part of v1)

- Sound effects for joins, leaves and similar — split into their own discussion.
- Keyboard shortcuts for experienced users.
- Announcing a moderator's move to screen-reader users (lost with the move notice).
- Per-IP rate limiting and other instant-room hardening already listed in
  `instant/CLAUDE.md`.
