# Voice Chat (scheduled, group-linked rooms)

Daily.co-powered voice/video for **product groups**, bound to the product's weekly schedule. Participants move between **discrete zones**; audio is isolated by zone. Moderators create zones, run private/disciplinary "locked" zones, broadcast, and deafen. Plus screen sharing, in-call chat, and the usual moderator controls.

> This covers schedule-driven, group-linked rooms. The on-the-fly **instant voice rooms** (admin/gedu spin up a room, share a short URL) are a separate feature — see `./instant/CLAUDE.md`.

## Core model

A voice room is 1:1 with a `product_groups` row **and** a specific session window. Access is membership-based; the room name is content-addressable and rooms are created lazily by the first joiner.

**Rule: Daily.co owns room existence and live participant/presence state — there is no `voice_rooms` table, no `daily_room_name` column, no presence table, no scheduler that pre-creates rooms.** New groups need no provisioning; deleted groups need no room cleanup (rooms self-expire). Chat, lock state, and live presence are all deliberately ephemeral.

**The two voice DB tables persist *zone definitions and the private-zone privacy boundary*, never general room/presence.** `voice_zones` holds mod-created custom/locked zone definitions for a group (so next week's session has the same zones); `voice_private_zone_occupants` records who is in a private (locked) zone this session window — the one piece of state that *must* be server-readable to enforce privacy at token-mint (see the private-zone section). Normal-zone membership, names, and "who's in the call" are **not** here — that's Daily's job. Don't add general presence/room persistence here without revisiting this principle.

**Rule: Room names are content-addressable, derived independently by every joiner with no coordination.** Format `g-{groupId}-{YYYYMMDDHHMM}`, where the timestamp is the window's open time formatted in the product's timezone. Same group + same window → same name; different week or different slot → distinct name. The full group UUID prevents cross-group collisions; the timestamp prevents cross-session collisions (a stale prior-session room with an already-passed `exp`). Keep both. **There is one room per group session — private/locked zones are *not* separate rooms** (they used to be; privacy now rides on `canReceive`, see the private-zone section).

**Rule: Get-or-create the Daily room on demand, never pre-create.** First joiner creates it, everyone after reuses it: `GET /rooms/{name}`; on 404 `POST /rooms`; on a duplicate-name race re-`GET` the winner. Daily returns the duplicate as `400 invalid-request-error` ("already exists") — not 409 — so detect it with `isDailyDuplicateRoomError`, never by branching on HTTP status.

**Rule: Cleanup is delegated to Daily via the token's room `exp`.** The token endpoint sets `room.exp = windowClosesAt + grace`; Daily reaps the room and ejects stragglers when the window passes. No cleanup job, no client-side end-of-session polling.

## Schedule-driven windows

A group inherits its schedule from one or more `schedule_slots` on the linked product (each: `weekday`, `start_time`, `duration_minutes`, plus the product `timezone`). Each slot is a distinct session window → distinct room name. Window = `[sessionStart − BEFORE, sessionEnd + AFTER]` (constants in `src/lib/constants/voice.ts`).

**Rule: Client-side open/locked state is display-only; the token endpoint is the security boundary.** The dashboard cards compute open/locked to pick "Join Voice" vs "Opens at …", but the server independently recomputes the window over every slot and 403s if none is open right now. No role bypasses the window.

**Join surfaces** all render the shared `JoinVoiceButton` in this directory: the family enrollment cards and club pages, gedu dashboard/session-details, and the admin product-details group cards.

## Access control

### Main room — `POST /api/voice/token`

Request `{ groupId }`. Gates, in order:

1. **Role** — `requireRole(["gedu","gamer","admin"])`; customers blocked.
2. **Group + remoteness** — group must exist and its product must be `is_remote = true`; else 404.
3. **Membership** — gamer: active `participations` row for `(group_id, participant_id)`. Gedu: a `gedu_group_assignments` row on **product_id** (cross-group voice mobility). Admin: bypass.
4. **Session window** — at least one slot must currently be open; the first open slot drives the room name and token `exp`.
5. **Private-zone `canReceive` bake** — the route reads the current window's `voice_private_zone_occupants` and bakes the joiner's `canReceive` (see the private-zone section) so the SFU won't forward a private member's media to them before they even connect.
6. **Issuance** — `is_owner = role !== "gamer"`. The Daily token also sets `user_id = profiles.id` (so peers' `participant.user_id` matches what `canReceive.byUserId` keys on). `exp = windowClosesAt + grace`. The response returns `sessionOpensAt` so the client can stamp occupancy rows with the current window.

There is **no separate locked-room endpoint** — one room per session, so this is the only token route.

| Capability | Admin | Gedu | Gamer |
|---|---|---|---|
| Join (in window) | any group | assigned product | active participation |
| Camera / mic | yes | yes | yes |
| Move self to a non-locked zone | yes | yes | yes |
| Screen share / broadcast / deafen | yes | yes | no |
| Create / edit / delete zones | yes | yes | no |
| Move others (any zone); place into a private zone | yes | yes | no |
| Enter a private zone | freely (self), or placed by another mod | freely (self), or placed by another mod | only when placed by a mod |
| Self-leave a private zone | yes | yes | no (mod-only) |

**Rule: Owner-only actions (screen share, mute, lock, broadcast, deafen, moving others, private-zone occupancy writes) are enforced server-side — by the Daily `is_owner` token flag for SFU actions (including setting another participant's `canReceive`), and by RLS (`is_voice_group_moderator`) for the DB writes. Hiding buttons client-side is cosmetic defense-in-depth only.**

## Zone model

There are four *kinds* of zone; only the custom/locked kind is persisted.

| Kind | Source | Removable | Audio isolation |
|---|---|---|---|
| **Lobby** | virtual (hardcoded `"lobby"`) | no | soft |
| **4 Yty elements** | virtual (`"yty-harmony\|glow\|valor\|wit"`) | no | soft |
| **Custom** | `voice_zones` (the UUID is the zoneId) | by mods | soft |
| **Locked** | `voice_zones`, `is_locked = true` | by mods | **hard (SFU `canReceive`)** |

The virtual zones (lobby + 4 Yty) and the custom-zone icon/color palette live in `src/lib/constants/voice-zones.ts`. `composeZones` (`src/lib/voice/zone-composition.ts`) builds the ordered list the UI renders (lobby + Yty + custom). Instant rooms pass `groupId === null` → lobby + Yty only.

**The icon/color sets are app-owned, not DB enums.** `voice_zones.icon` / `.color` are plain `text` columns; the `VOICE_ZONE_ICON_KEYS` / `VOICE_ZONE_COLOR_KEYS` tuples in `voice-zones.ts` are the single source of truth (they drive both the derived `VoiceZoneIcon` / `VoiceZoneColor` types and the picker order). So adding/removing/renaming an icon or color is a pure code change — no migration. The renderer resolves a stored key through `zoneIconFor` / `zoneColorFor`, which fall back to a default glyph/color for any unknown or removed key, so an old row never breaks. (This deliberately departs from the "derive enums from generated `Constants`" convention in the root CLAUDE.md — the value set is presentational and mod-gated, not a security boundary.) Each icon/color key needs a label under `voice.zoneIcon.*` / `voice.zoneColor.*` in every `messages/` locale.

**A custom zone's name is optional** — `voice_zones.name` is nullable (the CHECK enforces 1–40 chars only when present), so a moderator can create a zone identified by its icon + color alone. `composeZones` maps a null name to `""`; the UI renders no label and falls back to a generic word only for the accessible (aria) label.

**Rule: Normal-zone membership syncs through Daily `userData`, not a custom handshake.** Each client stamps `{ zoneId, broadcasting }` onto its own participant via `setUserData`. Daily hands a new joiner everyone's `userData` the instant they connect and pushes later changes as `participant-updated`, so a late joiner sees everyone's zone with no request/reply and no timing window. This replaced the old peer-to-peer `posUpdate` position handshake and its recurring races — do not reintroduce a coordination protocol for membership. A moderator moving *another* participant can't set their `userData`, so it sends a targeted `moveUser` app-message; the target verifies the sender is an owner and sets its own `userData`.

**Rule: `moveUser` is the single channel for an owner to move *anyone* to *any* zone — normal or private, placing or freeing.** Moving someone into a locked zone is the same `moveUser` (the target sets its own position) plus a mod-side occupancy write; moving them out is `moveUser` plus the occupancy clear. **Position (where you stand, for audio + rendering) and privacy (occupancy → `canReceive`) ride separate channels and never race** — that separation is the core of the model. A placed *moderator* therefore moves exactly like a placed gamer (and can self-leave, since they have move agency); there's no special case for "mod placed by another mod."

### Soft vs hard isolation

- **Soft (lobby, Yty, custom):** *not* a privacy boundary. Every client still receives every track; cross-zone audio is silenced with `element.muted = true`. **You still see other zones' video and speaking glow** — intentional and required (glow and video come from the still-received tracks). Good enough for breakout chatter; nobody is promised privacy.
- **Hard (locked):** **one room, SFU-enforced `canReceive`.** Outsiders are simply not *sent* a private-zone occupant's audio/video by the SFU — the data never reaches their client (a structural guarantee, not a client-side mute). The reverse direction is deliberately **permissive**: an occupant still *receives* every other zone's tracks (per-zone `muted` silences the audio client-side), so a moderator in a private zone keeps everyone's video + speaking glow. One-directional is all the privacy requirement needs ("outsiders don't receive private members"), and it's what makes the reverse cheap.

> **Why not separate Daily rooms (the old design)?** Two rooms in one UI means Daily stops being the source of truth and the DB has to reconstruct names/presence both ways — which was lossy (a moderator who walked into a locked zone had no name source for outsiders, and the split was one-directional). The old objection to `canReceive` was "a per-move permission *matrix* with race conditions" — but that dissolves if you stop thinking in incremental pairwise deltas and instead recompute the **full** `canReceive` from current occupancy and apply it idempotently (token bake at join, owner re-projection on change). Full-state writes converge regardless of ordering. See `src/lib/voice/receive-permissions.ts`.

### Private-zone flow (one room, `canReceive`)

1. A mod **places** a member (or records **their own** entry): client `.insert` into `voice_private_zone_occupants` (RLS allows only mods) carrying `zone_id, user_id, placed_by, group_id, session_opens_at`. `user_id` is the placed member for a placement, or the mod themselves for a self-entry — both are "a moderator writes a row". A placement also sends the target a `moveUser` so their position follows (a self-entry is just a local move). The INSERT policy authorizes the actor (mod of `group_id`), pins `placed_by` to the caller, and verifies the zone is a *locked* zone of that group — but it deliberately does **not** verify the placed `user_id` is a member of the group. That's intentional, not a gap: the actor is already a trusted moderator, a non-member can't mint a token to join anyway, and a spurious occupancy row only ever *over*-blocks `canReceive` (fail-safe), never leaks. Adding a membership `EXISTS` check would be redundant defense-in-depth with no failure mode it prevents.
2. **Privacy is `canReceive`, set by owners + baked into tokens.** The pure projection (`blockedUserIdsFor`): a viewer may receive everyone *except* a private occupant whose zone they aren't in. New joiners get it baked into their token server-side (airtight — no connect window). Live changes are applied by owner clients via `updateParticipants` from the **raw** occupancy ledger (only owners may set others' permissions; placements are mod-only, so the actor is always a connected owner) — see `use-receive-permissions.ts`. The occupancy row, not `userData`, is the boundary: `userData` is client-authored, so a gamer can't be trusted to report it; the mod-authored, server-readable row is.
3. **The placed member's position follows the `moveUser`** (synchronous, like any move), and on join it's seeded once from the occupancy ledger (the provider's one-shot confinement seed) so confinement survives a rejoin. This is just rendering/audio-routing honesty — even if a gamer edits their `userData`, outsiders still don't receive them (owner-set `canReceive` is unaffected). What they *hear* isn't protected; what others *receive* is. The UI bars a gamer from self-leaving a locked zone (checked against their synchronous zone, not the occupancy echo).
4. **Outsiders stay in the same room**, so they still see the occupant as a real Daily participant (name, avatar, presence) — just with no media (SFU-blocked → no audio/video/glow) — rendered blurred behind a `PrivacyScreen`. Bucketing prefers the occupancy row over `userData`, so a *confined* member can't cosmetically fake their way *out* of a private zone (the row pins them); a non-occupant claiming a locked zone via `userData` only self-exposes (no `canReceive` block protects them), which is harmless. No DB roster, no name snapshot: Daily carries names again.
5. **Removing** occupancy (mod) → `moveUser` moves the member to the destination and the occupancy clear re-projects `canReceive` to un-block. Position and privacy are separate channels, so there's no free-then-move race to guard: the member's position is driven by the `moveUser`, never by reacting to the occupancy DELETE, so a lingering echo can't yank them.

**Rule: Private-zone occupancy is cleaned up self-healingly on join, never by a cron.** A row is valid only for its own session window. The token endpoint reaps the group's *prior-window* rows on every join (`session_opens_at < currentWindowOpen`); since someone joins every session and the table is in the realtime publication, those DELETEs propagate to every client. This is also what cleans up **a user who never left** (closed their laptop mid-session): their row is reaped the next session a window rolls. Re-occupying **deletes-then-inserts** (insert/delete only — no UPDATE policy, so an upsert's DO UPDATE would be RLS-denied), overwriting any existing row for that `(group_id, user_id)`. A stale row makes a joiner's token *over-block* (fail-safe) rather than under-block (leak), and the live projection corrects it. The client also ignores any row whose `session_opens_at` isn't the current window (`isCurrentSessionPlacement`).

**Rule: Realtime subscription callbacks only update state from the payload — never run a Supabase query inside the callback** (same deadlock risk as `onAuthStateChange`). `voice_zones` / `voice_private_zone_occupants` are `REPLICA IDENTITY FULL` so DELETE payloads carry the full old row; that's what lets a `group_id`-filtered subscription receive deletions and update from the payload alone. See `use-zone-data.ts`.

**Rule: The local user's *own* position is synchronous truth (`localZoneIdRef` + `membership.currentZoneId`), never derived from an echo.** The echo channels (Daily `userData`, the Supabase Realtime occupancy stream) are for observing *other* peers; your own position you already know the instant you act. It's set by exactly three synchronous things — your own self-move, an owner's `moveUser`, and the **one-shot join seed** (read once from the occupancy ledger when you join already-placed) — and read for audio routing, your `currentZoneId`, and your own tile's bucket. An echo lags or drops on mobile Safari, so anything that reads your own state back from it shows you somewhere you no longer are. This bit repeatedly — routing audio against your own SFU-echoed zone; pinning a moderator in a private zone they'd left because the occupancy DELETE echo never came; a mod placed by another mod whose own client dropped the row because it "wasn't standing in a locked zone." All were the same mistake (reconciling your own position against an echo) and the same fix (one synchronous source of truth, echo demoted to "where everyone else is").

**Corollary: don't reconcile your own position against the occupancy ledger continuously — seed it once.** A previous design reacted to the realtime occupancy stream to pin/release a gamer's position, which raced a moderator's `moveUser` on free-then-move and needed a per-zone one-shot guard to tame. The clean model drops that entirely: occupancy is the **privacy** ledger (→ `canReceive`) only; position rides `moveUser` + self-move, with a single pull-in seed at join for the already-placed case. A dropped `moveUser` to an *online* member leaves only *their own view* stale until they rejoin — privacy (canReceive) holds throughout — which is the accepted trade for deleting the whole reconcile-and-guard apparatus.

**Corollary: a member leaving a private zone briefly over-blocks, and that's fine.** Clearing occupancy is a server write that fires regardless of echo; until the DELETE propagates, owners still project the stale row, so outsiders are briefly blocked from a member who already left (fail-safe, self-healing). We accept that over locally "correcting" our own row out of the projection — the correction is what created the placed-by-another-mod bug.

## Audio pipeline (Chrome + iOS constraints)

Two **independent** pipelines per remote participant:

```
Playback:  <audio>.srcObject = MediaStream([track])     ← element.muted = !isAudible(...)
Analysis:  createMediaStreamSource(MediaStream([track])) → AnalyserNode   ← speaking glow only
```

`element.muted` is the only audible control. The routing decision is the pure, binary `isAudible` (`src/lib/voice/audio-routing.ts`): `deafened → false`, else `remoteIsBroadcasting → true`, else `same zone → true`, else `false`. `computeZoneAudibility` projects it over every remote; the pipeline sets `element.muted = !audible`.

**Rule: Silence remote audio with `element.muted`, NOT `element.volume` — and never route WebRTC playback through the Web Audio graph.** Two stacked platform limits force this:
- **iOS Safari (iPhone) ignores `element.volume` entirely** — it's not settable in JS and always reads `1` (Apple's "Safari HTML5 Audio and Video Guide"; works on desktop + iPad, *not* iPhone). So the old `volume = 0` silencing was a no-op on iPhone and *every soft zone leaked audio there*. `element.muted` **is** honored on iOS, so it's the one cross-platform control. The routing is binary anyway (the volume-slider UI was dropped), so a mute maps cleanly — see TODO.md if a per-participant volume is ever revived (it can't work on iPhone via the web audio APIs, so it'd be desktop-only).
- **Chrome** (full history in `docs/chrome-webrtc-volume-bug.md`): routing a `MediaStreamAudioSourceNode` to a destination kills WebRTC audio; `createMediaElementSource` on a MediaStream element silences the analyser and ignores GainNode boost. So: a separate `createMediaStreamSource` (not `createMediaElementSource`) for the analyser, never connected to `ctx.destination`; and `await ctx.resume()` before creating nodes.

## Moderator controls

- **Broadcast** (`userData.broadcasting`) — while on, the mod is heard in every zone but stays in their current zone. Not a zone.
- **Deafen** (local-only state) — the mod hears no one (all remote volumes → 0). Pairs with broadcast. Moderators only (a 7-year-old who deafens themselves can't hear anyone and won't know why).
- **Zone management** — create / edit (name, icon, color) / delete custom zones (`VoiceZonesService`, RLS-gated direct writes). Deleting a zone moves its occupants to the lobby (`participantsByZone` remaps orphaned zoneIds; the local user's own `userData` resets if their zone vanishes).
- **Mute** — one-shot `updateParticipant(sid, { setAudio: false })`; the target can re-enable.
- **Lock** — persistent: also revokes the `canSend` SFU permission so the target physically can't send until unlocked. Lock state syncs via a self-reported `lockSync` app-message (sender-keyed — a peer can only assert its own).

## In-call chat

Ephemeral text over the Daily app-message channel. **Rule: Chat is sender-trusted only by identity, never persisted.** Only `text` rides in the payload; the display name is resolved at receive time from the Daily-verified `fromId`. Messages trim to 500 chars, log caps at the latest 200. Shared by scheduled and instant rooms.

## Daily token `user_name` encoding

`user_name` is a pipe-delimited `userId|role|displayName` (group rooms append `|minecraftUsername|minecraftUuid`). Build and parse only through `src/lib/voice/user-name.ts`.

**Rule: Strip `|` from every dynamic slot when building `user_name`.** The client splits on `|`; an unstripped name could spoof the role slot. Cosmetic only (server-side `is_owner` is the authority), but it matters on instant rooms where guests pick names.

## UI

**Rule: The UI is a pure consumer of the `VoiceRoomProvider` context.** All state and actions live in the provider + hooks; components only render what they're given and call actions. This is why the voice room demos in `/admin/ui-components` with a hand-built mock context (see the root CLAUDE.md note on that page) — and why the *visual* design is freely tweakable with zero risk to the logic.

- `VoiceRoom` — the in-session layout (title row, screen-share viewport, zone list, control bar, chat, participant list). Its `titleAccessory` slot renders a caller-supplied control at the right of the title row and is empty unless passed — instant rooms put their room-link chip there; scheduled rooms have no shareable link and pass nothing, so the row stays a bare heading with no gap held open.
- `ZoneList` / `ZoneCard` — the mobile-first vertical stack of zone cards. Tap a zone to move into it, or drag your avatar onto it (dnd-kit, `PointerSensor` + `TouchSensor` with a press-delay so touch-drag doesn't fight page scroll). Mods drag any avatar: onto a normal zone → move, onto a private zone → place. A private zone is also tappable for mods (they self-enter, writing their own occupancy). Member tiles render live video in place when on; `PrivacyScreen` blurs a private zone's occupants for an outsider (they're real participants, just SFU-blocked of media).
- `ZoneDialog` / `ZoneIconPicker` / `ZoneColorPicker` — mod-only create/edit; `MicSettingsPopover` — device picker + permission hint + live level behind the mic button.
- `VoiceControls`, `ScreenShareDisplay`, `ParticipantList` / `ParticipantRow` (no volume slider), `ChatPanel`, `MicLevelIndicator`, `VoiceAvatar`, `JoinVoiceButton`.

**Rule: Don't violate the root CLAUDE.md layout rules** — no in-place shifts of already-rendered content; the `committing` pattern on dialog submits. (Entering a private zone is now an in-place `userData` change, not a reconnect, so there's no transition screen to keep chrome mounted through.)

## Provider & hooks

- `VoiceRoomProvider` — context orchestrator; takes `groupId: string | null` (null = instant room → custom/private features disabled). Composes the hooks, derives `participantsByZone` (bucketing private-zone occupants by their authoritative occupancy row, self by synchronous membership zone), owns the unified `moveParticipantToZone` (moveUser + occupancy write/clear) and the one-shot confinement seed, and routes Daily app-messages in `handleAppMessage`. Exports `VoiceRoomContext` for the style-guide mock.
- `hooks/` — `use-audio-pipeline` (playback + analyser; mutes cross-zone via `element.muted`), `use-zone-membership` (userData self-move + mod `moveUser`; sole writer of `localZoneIdRef`), `use-zone-data` (DB custom zones + occupancy + realtime), `use-receive-permissions` (owner-side live `canReceive` projection over raw occupancy), `use-mic-devices`, `use-screen-share`, `use-moderator-controls`, `use-chat`, `use-speaking-glow`, `use-local-stream-glow`, `use-wake-lock`. `hooks/types.ts` — shared types incl. the `VoiceRoomContextValue` contract.
- Outside this dir: `src/services/voice/` (token service + `VoiceZonesService` + React Query hook), `src/app/api/voice/token/route.ts`, `src/lib/daily.ts` (Daily REST + room-name helpers + token `canReceive`/`user_id`), `src/lib/voice/receive-permissions.ts` (the pure `canReceive` projection, shared by the route + the hook), `src/lib/session-schedule.ts` + `src/lib/voice-window.ts`, `src/lib/voice/{user-name,audio-routing,zone-composition,glow,locked-session}.ts`, `src/lib/constants/{voice,voice-zones}.ts`.

## Env

`DAILY_API_KEY` (server, REST auth), `NEXT_PUBLIC_DAILY_DOMAIN` (both, room URLs).

## Known follow-ups

Per-participant volume slider (wiring kept, UI dropped — see TODO.md); chat moderation/rate-limiting; persisted chat history; lock state surviving rejoins; participant presence persistence. All deferred — and in tension with the Daily-owns-presence rule, so weigh that before picking one up.
