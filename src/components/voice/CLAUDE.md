# Voice Chat (scheduled, group-linked rooms)

Daily.co-powered voice/video for **product groups**, bound to the product's weekly schedule. Participants move between **discrete zones**; audio is isolated by zone. Moderators create zones, run private/disciplinary "locked" zones, broadcast, and deafen. Plus screen sharing, in-call chat, and the usual moderator controls.

> This covers schedule-driven, group-linked rooms. The on-the-fly **instant voice rooms** (admin/gedu spin up a room, share a short URL) are a separate feature — see `./instant/CLAUDE.md`.

## Core model

A voice room is 1:1 with a `product_groups` row **and** a specific session window. Access is membership-based; the room name is content-addressable and rooms are created lazily by the first joiner.

**Rule: Daily.co owns room existence and live participant/presence state — there is no `voice_rooms` table, no `daily_room_name` column, no presence table, no scheduler that pre-creates rooms.** New groups need no provisioning; deleted groups need no room cleanup (rooms self-expire). Chat, lock state, and live presence are all deliberately ephemeral.

**The two voice DB tables persist *zone definitions and placement intent*, never room/presence.** `voice_zones` holds mod-created custom/locked zone definitions for a group (so next week's session has the same zones); `voice_locked_placements` records which gamer a moderator has confined to a locked zone this session window. Neither tracks "who is in the call" or "what room exists" — that's still Daily's job. Don't add presence/room persistence here without revisiting this principle.

**Rule: Room names are content-addressable, derived independently by every joiner with no coordination.** Format `g-{groupId}-{YYYYMMDDHHMM}`, where the timestamp is the window's open time formatted in the product's timezone. Same group + same window → same name; different week or different slot → distinct name. The full group UUID prevents cross-group collisions; the timestamp prevents cross-session collisions (a stale prior-session room with an already-passed `exp`). Keep both. Locked zones get their own room: `g-{groupId}-{YYYYMMDDHHMM}-z-{zoneId}` (`lockedVoiceRoomName`).

**Rule: Get-or-create the Daily room on demand, never pre-create.** First joiner creates it, everyone after reuses it: `GET /rooms/{name}`; on 404 `POST /rooms`; on a duplicate-name race re-`GET` the winner. Daily returns the duplicate as `400 invalid-request-error` ("already exists") — not 409 — so detect it with `isDailyDuplicateRoomError`, never by branching on HTTP status.

**Rule: Cleanup is delegated to Daily via the token's room `exp`.** The token endpoint sets `room.exp = windowClosesAt + grace`; Daily reaps the room and ejects stragglers when the window passes. No cleanup job, no client-side end-of-session polling.

## Schedule-driven windows

A group inherits its schedule from one or more `schedule_slots` on the linked product (each: `weekday`, `start_time`, `duration_minutes`, plus the product `timezone`). Each slot is a distinct session window → distinct room name. Window = `[sessionStart − BEFORE, sessionEnd + AFTER]` (constants in `src/lib/constants/voice.ts`).

**Rule: Client-side open/locked state is display-only; the token endpoint is the security boundary.** The dashboard cards compute open/locked to pick "Join Voice" vs "Opens at …", but the server independently recomputes the window over every slot and 403s if none is open right now. No role bypasses the window.

**Join surfaces** all render the shared `JoinVoiceButton` in this directory: parent/gamer `NextSessionCard`, gedu dashboard/session-details, and the admin product-details group cards.

## Access control

### Main room — `POST /api/voice/token`

Request `{ groupId }`. Gates, in order:

1. **Role** — `requireRole(["gedu","gamer","admin"])`; customers blocked.
2. **Group + remoteness** — group must exist and its product must be `is_remote = true`; else 404.
3. **Membership** — gamer: active `participations` row for `(group_id, gamer_id)`. Gedu: a `gedu_group_assignments` row on **product_id** (cross-group voice mobility). Admin: bypass.
4. **Session window** — at least one slot must currently be open; the first open slot drives the room name and token `exp`.
5. **Issuance** — `is_owner = role !== "gamer"`. `exp = windowClosesAt + grace`. The response also returns `sessionOpensAt` so the client can stamp locked-zone placement rows with the current window.

### Locked room — `POST /api/voice/token/locked`

Request `{ groupId, zoneId }`. Same group/remoteness/window gates, plus the zone must be an `is_locked` zone belonging to the group, plus the **locked gate**:

- **Moderator** (admin, or gedu assigned to the product) → authorized; mods enter/leave locked zones freely.
- **Gamer** → only if a `voice_locked_placements` row matches `(zone_id, gamer_id, session_opens_at = current window open)`. No matching row → 403.

**Rule: The locked-token endpoint is the real privacy boundary, independent of any client behavior.** Because placements are mod-only writes (RLS) and the token requires a matching placement for *this* session window, a gamer can neither self-enter a locked zone nor reload to escape one (the row persists for the window, so a reconnect lands them back). The matching `session_opens_at` is load-bearing: a prior week's placement doesn't grant access to this week's locked room.

| Capability | Admin | Gedu | Gamer |
|---|---|---|---|
| Join (in window) | any group | assigned product | active participation |
| Camera / mic | yes | yes | yes |
| Move self to a non-locked zone | yes | yes | yes |
| Screen share / broadcast / deafen | yes | yes | no |
| Create / edit / delete zones | yes | yes | no |
| Move others; place into a locked zone | yes | yes | no |
| Enter a locked zone | freely | freely | only when placed by a mod |

**Rule: Owner-only actions (screen share, mute, lock, broadcast, deafen, moving others, locked placement) are enforced server-side — by the Daily `is_owner` token flag for SFU actions, and by RLS (`is_voice_group_moderator`) for the DB writes. Hiding buttons client-side is cosmetic defense-in-depth only.**

## Zone model

There are four *kinds* of zone; only the custom/locked kind is persisted.

| Kind | Source | Removable | Audio isolation |
|---|---|---|---|
| **Lobby** | virtual (hardcoded `"lobby"`) | no | soft |
| **4 Yty elements** | virtual (`"yty-harmony\|glow\|valor\|wit"`) | no | soft |
| **Custom** | `voice_zones` (the UUID is the zoneId) | by mods | soft |
| **Locked** | `voice_zones`, `is_locked = true` | by mods | **hard (separate Daily room)** |

The virtual zones (lobby + 4 Yty) and the custom-zone icon/color palette live in `src/lib/constants/voice-zones.ts`. `composeZones` (`src/lib/voice/zone-composition.ts`) builds the ordered list the UI renders (lobby + Yty + custom). Instant rooms pass `groupId === null` → lobby + Yty only.

**The icon/color sets are app-owned, not DB enums.** `voice_zones.icon` / `.color` are plain `text` columns; the `VOICE_ZONE_ICON_KEYS` / `VOICE_ZONE_COLOR_KEYS` tuples in `voice-zones.ts` are the single source of truth (they drive both the derived `VoiceZoneIcon` / `VoiceZoneColor` types and the picker order). So adding/removing/renaming an icon or color is a pure code change — no migration. The renderer resolves a stored key through `zoneIconFor` / `zoneColorFor`, which fall back to a default glyph/color for any unknown or removed key, so an old row never breaks. (This deliberately departs from the "derive enums from generated `Constants`" convention in the root CLAUDE.md — the value set is presentational and mod-gated, not a security boundary.) Each icon/color key needs a label under `voice.zoneIcon.*` / `voice.zoneColor.*` in every `messages/` locale.

**A custom zone's name is optional** — `voice_zones.name` is nullable (the CHECK enforces 1–40 chars only when present), so a moderator can create a zone identified by its icon + color alone. `composeZones` maps a null name to `""`; the UI renders no label and falls back to a generic word only for the accessible (aria) label.

**Rule: Normal-zone membership syncs through Daily `userData`, not a custom handshake.** Each client stamps `{ zoneId, broadcasting }` onto its own participant via `setUserData`. Daily hands a new joiner everyone's `userData` the instant they connect and pushes later changes as `participant-updated`, so a late joiner sees everyone's zone with no request/reply and no timing window. This replaced the old peer-to-peer `posUpdate` position handshake and its recurring races — do not reintroduce a coordination protocol for membership. A moderator moving *another* participant can't set their `userData`, so it sends a targeted `moveUser` app-message; the target verifies the sender is an owner and sets its own `userData`.

### Soft vs hard isolation

- **Soft (lobby, Yty, custom):** *not* a privacy boundary. Every client still receives every track; cross-zone audio is silenced with `element.volume = 0`. **You still see other zones' video and speaking glow** — intentional and required (glow and video come from the still-received tracks). Good enough for breakout chatter; nobody is promised privacy.
- **Hard (locked):** a **separate Daily room**, so the audio data never reaches non-members at all. This is the only place we pay a reconnect cost — fine, because locked zones are rare and deliberate. (Daily's server-enforced `canReceive` permissions are a one-room alternative, but they need a per-move permission *matrix* with timing-sensitive correctness — exactly the race-bug class this refactor removed — so we use separate rooms. Documented so nobody "discovers" `canReceive` and rewrites it.)

### Locked-zone flow (separate room)

1. A mod **places** a gamer: client `.insert` into `voice_locked_placements` (RLS allows only mods) carrying `zone_id, gamer_id, placed_by, group_id, session_opens_at`.
2. The gamer's client is subscribed to `voice_locked_placements` (Supabase Realtime). On seeing its own row it **leaves the main room, requests a locked-room token, and joins the locked room**. A mod entering a locked zone is just a self-move that triggers the same room switch. The switch shows a "Securing your connection…" transition — the deliberate ~1–2s reconnect reframed as the privacy guarantee (a locked zone otherwise looks identical to an instant one).
3. **Outsiders never join the locked room**, so they can't see its members via Daily. Instead they render a **blurred roster from the `voice_locked_placements` rows** (the `lockedRoster` map) behind a `PrivacyScreen`. The blur is UI grammar; the real privacy is the room split.
4. **Removing** a placement (mod) → the gamer's client (realtime) leaves the locked room and rejoins the main room (lobby). Dragging a placed gamer onto a normal zone deletes the placement first, then moves them, so the auto-confine doesn't pull them back.

The placement's display name is **snapshotted** onto the row (`gamer_name`) at placement time — main-room names ride on the Daily token, but a placed gamer is in a separate room, so outsiders (incl. late joiners) have no other source. The placing mod has the name; it then reaches every group member via the SELECT RLS + realtime.

**Rule: Locked placements are cleaned up self-healingly on join, never by a cron.** A placement is valid only for its own session window (the locked-token endpoint matches on `session_opens_at`). The main token endpoint reaps the group's *prior-window* placements on every join (`session_opens_at < currentWindowOpen`); since someone joins every session and the table is in the realtime publication, those DELETEs propagate to every client's roster. Re-placing a gamer **deletes-then-inserts** (the table is insert/delete only — no UPDATE policy, so an upsert's DO UPDATE would be RLS-denied), overwriting any existing row for that `(group_id, gamer_id)`. Belt-and-suspenders on the client: the roster + the gamer auto-confine ignore any placement whose `session_opens_at` isn't the current window (`isCurrentSession`), so a stale row can never trap, flash, or phantom-render even before the prune lands. Net: if everyone in a locked room just closes their laptops, the rows are inert immediately and gone the next time anyone joins — no scheduled job.

**Rule: Realtime subscription callbacks only update state from the payload — never run a Supabase query inside the callback** (same deadlock risk as `onAuthStateChange`). `voice_zones` / `voice_locked_placements` are `REPLICA IDENTITY FULL` so DELETE payloads carry the full old row; that's what lets a `group_id`-filtered subscription receive deletions and update from the payload alone. See `use-zone-data.ts`.

## Audio pipeline (Chrome constraints)

Two **independent** pipelines per remote participant:

```
Playback:  <audio>.srcObject = MediaStream([track])     ← element.volume = zoneVolume(...)
Analysis:  createMediaStreamSource(MediaStream([track])) → AnalyserNode   ← speaking glow only
```

`element.volume` is the only audible control. The routing decision is the pure `zoneVolume` (`src/lib/voice/audio-routing.ts`): `deafened → 0`, else `remoteIsBroadcasting → base`, else `same zone → base`, else `0`. `base` is the per-participant multiplier — kept at `1.0` (the volume slider UI was dropped; see TODO.md), wiring retained.

**Rule: Drive remote audio volume only through `element.volume` (0–1.0); do not route WebRTC playback through the Web Audio graph.** Hard Chrome limitation, established across 9 approaches (full history in `docs/chrome-webrtc-volume-bug.md`): routing a `MediaStreamAudioSourceNode` to a destination kills WebRTC audio; `createMediaElementSource` on a MediaStream element silences the analyser and ignores GainNode boost. So: a separate `createMediaStreamSource` (not `createMediaElementSource`) for the analyser, never connected to `ctx.destination`; and `await ctx.resume()` before creating nodes.

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

- `VoiceRoom` — the in-session layout (header, screen-share viewport, zone list, control bar, chat, participant list).
- `ZoneList` / `ZoneCard` — the mobile-first vertical stack of zone cards. Tap a zone to move into it, or drag your avatar onto it (dnd-kit, `PointerSensor` + `TouchSensor` with a press-delay so touch-drag doesn't fight page scroll). Mods drag any avatar: onto a normal zone → move, onto a locked zone → place. Member tiles render live video in place when on; `PrivacyScreen` blurs the outsider roster of a locked zone.
- `ZoneDialog` / `ZoneIconPicker` / `ZoneColorPicker` — mod-only create/edit; `MicSettingsPopover` — device picker + permission hint + live level behind the mic button.
- `VoiceControls`, `ScreenShareDisplay`, `ParticipantList` / `ParticipantRow` (no volume slider), `ChatPanel`, `MicLevelIndicator`, `VoiceAvatar`, `JoinVoiceButton`.

**Rule: Don't violate the root CLAUDE.md layout rules** — no in-place shifts of already-rendered content; the room-switch transition keeps the surrounding chrome mounted; the `committing` pattern on dialog submits.

## Provider & hooks

- `VoiceRoomProvider` — context orchestrator; takes `groupId: string | null` (null = instant room → custom/locked features disabled). Owns the room-switch state machine (main ↔ locked) and routes Daily app-messages in `handleAppMessage`. Exports `VoiceRoomContext` for the style-guide mock.
- `hooks/` — `use-audio-pipeline` (playback + analyser), `use-zone-membership` (userData self-move + mod `moveUser`), `use-zone-data` (DB custom zones + placements + realtime), `use-mic-devices`, `use-screen-share`, `use-moderator-controls`, `use-chat`, `use-speaking-glow`, `use-local-stream-glow`, `use-wake-lock`. `hooks/types.ts` — shared types incl. the `VoiceRoomContextValue` contract.
- Outside this dir: `src/services/voice/` (token service + `VoiceZonesService` + React Query hook), `src/app/api/voice/token/{route,locked/route}.ts`, `src/lib/daily.ts` (Daily REST + room-name helpers), `src/lib/session-schedule.ts` + `src/lib/voice-window.ts`, `src/lib/voice/{user-name,audio-routing,zone-composition,glow}.ts`, `src/lib/constants/{voice,voice-zones}.ts`.

## Env

`DAILY_API_KEY` (server, REST auth), `NEXT_PUBLIC_DAILY_DOMAIN` (both, room URLs).

## Known follow-ups

Per-participant volume slider (wiring kept, UI dropped — see TODO.md); chat moderation/rate-limiting; persisted chat history; lock state surviving rejoins; participant presence persistence. All deferred — and in tension with the Daily-owns-presence rule, so weigh that before picking one up.
