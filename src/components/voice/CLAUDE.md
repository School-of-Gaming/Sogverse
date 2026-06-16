# Voice Chat (scheduled, group-linked rooms)

Daily.co-powered spatial voice/video for **product groups**, bound to the product's weekly schedule. Spatial canvas with draggable avatars, zone-based audio isolation, screen sharing, per-participant volume, in-call chat, and moderator controls.

> This covers schedule-driven, group-linked rooms. The on-the-fly **instant voice rooms** (admin/gedu spin up a room, share a short URL) are a separate feature — see `./instant/CLAUDE.md`.

## Core model

A voice room is 1:1 with a `product_groups` row **and** a specific session window. Access is membership-based; the room name is content-addressable and rooms are created lazily by the first joiner.

**Rule: There is no voice DB table.** No `voice_rooms` table, no `daily_room_name` column, no scheduler that pre-creates rooms. Daily.co is the sole source of truth for room/participant state. Everything the token endpoint needs comes from `product_groups`, `schedule_slots`, and the wall clock. New groups need no provisioning; deleted groups need no room cleanup (rooms self-expire). Do not add persistence here without explicitly revisiting this principle — chat, lock state, and participant presence are all deliberately ephemeral.

**Rule: Room names are content-addressable, derived independently by every joiner with no coordination.** Format `g-{groupId}-{YYYYMMDDHHMM}`, where the timestamp is the window's open time formatted in the product's timezone. Same group + same window → same name; different week or different slot → distinct name. Both halves are load-bearing: the full group UUID prevents cross-group collisions (two groups sharing a name would land in each other's call), and the timestamp prevents cross-session collisions (a stale prior-session room could be returned with an already-passed `exp`). Keep both.

**Rule: Get-or-create the Daily room on demand, never pre-create.** First joiner creates it, everyone after reuses it: `GET /rooms/{name}`; on 404 `POST /rooms`; on a duplicate-name race re-`GET` the winner. Pre-creation needs a scheduler and buys nothing (room creation is sub-second). Daily returns the duplicate-name error as `400 invalid-request-error` with an "already exists" info string — **not** 409 — so detect it with the dedicated helper, never by branching on HTTP status. (A prior `status === 409` check never matched and 500'd every non-first joiner.)

**Rule: Cleanup is delegated to Daily via the token's room `exp`.** The token endpoint sets `room.exp = windowClosesAt + grace`; Daily reaps the room and ejects stragglers when the window passes. We run no cleanup job and no client-side end-of-session polling. Token expiry is the authoritative session-end signal.

## Schedule-driven windows

A group inherits its schedule from one or more `schedule_slots` on the linked product (each: `weekday`, `start_time`, `duration_minutes`, plus the product `timezone`). Each slot is a distinct session window → distinct room name. Window = `[sessionStart − BEFORE, sessionEnd + AFTER]` (constants in `src/lib/constants/voice.ts`).

**Rule: Client-side open/locked state is display-only; the token endpoint is the security boundary.** The dashboard cards compute open/locked to pick "Join Voice" vs "Opens at …", but the server independently recomputes the window over every slot and 403s if none is open right now. No role bypasses the window — admins/gedus follow the same calendar as gamers.

**Join surfaces** all render the shared `JoinVoiceButton` in this directory: parent/gamer `NextSessionCard`, gedu dashboard/session-details, and the admin product-details group cards. Group-card surfaces resolve state once per product and gate the button on `hasUpcomingSession` (a completed product has no future session, so nothing to join); dashboard cards never hit that case because they only list future sessions.

## Access control (`POST /api/voice/token`)

Request `{ groupId }`. Gates, in order:

1. **Role** — `requireRole(["gedu","gamer","admin"])`; customers blocked.
2. **Group + remoteness** — group must exist and its product must be `is_remote = true`; otherwise 404 (in-person products have no room).
3. **Membership** — gamer: active `participations` row for `(group_id, gamer_id)`. Gedu: a `gedu_group_assignments` row for `(product_id, gedu_id)` — checked on **product_id**, not group_id (cross-group voice mobility: a gedu assigned to a product can drop into any of its groups). Admin: bypass.
4. **Session window** — at least one slot must currently be open; the first open slot drives the room name and token `exp`.
5. **Issuance** — `is_owner = role !== "gamer"` (admins/gedus are moderators, gamers are not). `enable_screenshare` derives from `is_owner`. `exp = windowClosesAt + grace`.

Deliberately **not** checked: no mid-session enrollment gate (active membership is the whole predicate — a gamer who joined 30s ago gets in), and no always-open "lounge" rooms (use the instant-rooms flow instead — `./instant/CLAUDE.md`).

| Capability | Admin | Gedu | Gamer |
|---|---|---|---|
| Join (in window) | any group | assigned product | active participation |
| Camera / mic | yes | yes | yes |
| Screen share | yes | yes | no |
| Drag other avatars | yes | yes | own only |
| Enter broadcast zone | yes | yes | no |
| Mute / lock others | yes | yes | no |

**Rule: Owner-only actions (screen share, mute, lock, drag others) are enforced by the Daily `is_owner` token flag, not the client.** Daily rejects `startScreenShare()` / `updateParticipant()` from non-owner tokens at the SFU. Hiding the buttons client-side is cosmetic defense-in-depth only — never the real enforcement.

## Spatial position model

`position` is a **required** field on every `VoiceParticipant`. A participant is not added to the list until their position has arrived. The provider owns positions in a shared ref (`Map<sessionId, SpatialPosition>`); when it rebuilds the participant list from Daily's participant map it skips anyone not yet in that map.

**Rule: Position is a precondition for participant existence — never a separate nullable field.** Position and Daily participant data arrive from independent event sources (app messages vs SDK events); modeling them as separate state opens a window where a participant renders without a position. Gating list membership on a known position closes that bug class structurally. If it's in the list, it has a valid position — no fallbacks.

**Rule: On join, exchange positions via a per-peer targeted `posUpdate` handshake — do NOT broadcast on `joined-meeting`.** A `sendAppMessage("*")` fired immediately after joining is unreliable: the SFU's app-message route to existing peers may not be established yet. Instead, each existing peer handles `participant-joined` (which only fires once the route to the new peer exists) and sends a targeted `posUpdate` with its own position; the new joiner replies with its own. A dedup set prevents redundant replies. (This unreliability is specific to the join moment — once established, `sendAppMessage("*")` broadcast works fine and is used for ongoing moves.) Each peer also self-reports its own lock state via a targeted `lockSync` if currently locked; the receiver keys lock state by the Daily-verified sender id, so a peer can only set its own.

## Audio pipeline (Chrome constraints)

Two **independent** pipelines per remote participant:

```
Playback:  <audio>.srcObject = MediaStream([track])     ← element.volume = volume + zone muting
Analysis:  createMediaStreamSource(MediaStream([track])) → AnalyserNode   ← speaking glow only
```

`element.volume` does everything audible: the 10–100% volume multiplier and zone muting (set to 0 when `canHearZone` is false). The analyser pipeline only drives the speaking glow.

**Rule: Drive remote audio volume only through `element.volume` (0–1.0); do not route WebRTC playback through the Web Audio graph.** This is a hard Chrome limitation with WebRTC MediaStream sources, established after evaluating 9 approaches (full history in `docs/chrome-webrtc-volume-bug.md`):
- Routing a `MediaStreamAudioSourceNode` to `ctx.destination` (or to a `createMediaStreamDestination`) **kills all WebRTC audio** in Chrome.
- `createMediaElementSource` on a MediaStream-backed element makes the AnalyserNode receive **silence** (breaks the glow) *and* ignores GainNode amplification above 1.0 — Chrome applies `element.volume` outside the graph but won't honor graph gain for MediaStream elements.
- Insertable Streams, multiple `<audio>` elements, and AudioWorklet entry points all hit the same family of restrictions.
- Sender-side gain works only on mesh topologies; Daily is an SFU (one track fanned out to all), so per-listener gain is impossible, and uniform pre-amplification trades AGC normalization for clipping/noise.

Consequences to preserve:
1. **The volume slider is capped at 10–100%.** Above-100% amplification is not achievable here. Do not reintroduce a GainNode for boost.
2. **Use a separate `createMediaStreamSource` (not `createMediaElementSource`) for the analyser**, fed by an independent `MediaStream` built from the same track.
3. **Never connect the analyser to `ctx.destination`.** A `MediaStreamAudioSourceNode` is a push source — it feeds the AnalyserNode without any pull from the destination, so leaving it disconnected is both correct and necessary.

**Rule: Always `await ctx.resume()` before creating audio nodes.** Browsers start an AudioContext suspended until a user gesture; nodes created against a suspended context produce no data.

## Moderator controls

- **Mute** — one-time `updateParticipant(sid, { setAudio: false })`; the target can re-enable their mic.
- **Lock** — persistent: also revokes the `canSend` permission for that track type, so the target physically cannot send it at the SFU until unlocked. Their toggle is disabled client-side, but the SFU permission is the real enforcement.
- Lock state syncs via app messages; a newly-joined peer learns existing locks from each locked peer's self-reported `lockSync` (sender-keyed — a peer can only assert its own lock).

## In-call chat

Ephemeral text over the same Daily app-message channel as positions/moderation. `ChatPanel` renders between the room card and `ParticipantList`; `use-chat.ts` owns the log; the provider routes the `chatMessage` app message into the hook.

**Rule: Chat is sender-trusted only by identity, never persisted.** Only `text` rides in the payload; the display name is resolved at receive time from the sender's Daily-verified token field (`fromId`), so a peer can't spoof another's name. Local echo is appended on send (Daily doesn't loop messages back). Messages trim to 500 chars, log caps at the latest 200 — bounding a flooding client's memory. No history for late joiners; no profanity filter / clear-chat / audit trail in v1. Shared by both scheduled and instant rooms (`SpatialVoiceRoom` backs both), so it appears for instant-room guests too.

## Daily token `user_name` encoding

`user_name` is a pipe-delimited `userId|role|displayName` (group rooms append `|minecraftUsername|minecraftUuid`), letting the client decode identity/role/Minecraft badge without DB lookups. Build and parse it only through the shared helpers in `src/lib/voice/user-name.ts` — one source of truth for the slot layout, pure and safe to import on both server and client.

**Rule: Strip `|` from every dynamic slot when building `user_name`.** The client splits on `|`; an unstripped name could spoof the role slot. Cosmetic only (server-side `is_owner` is the permission authority), but it matters on instant rooms where guests pick their own names. The Minecraft slots carry the joiner's *own* identity, read server-side where a self-read is always allowed — peers can't query each other's `minecraft_accounts` rows under RLS. Slot *presence* gates the badge: absent (instant rooms) → no badge; present-but-empty → "(Unknown)".

## Layout

**Rule: The chat log is a fixed-height scroll area so new messages never push `ParticipantList` (below it) under the user's cursor.** Same reason as the root CLAUDE.md "Layout & Scrolling" rule.

## Files

- `VoiceSessionPage` — standalone `/voice/group/[id]`; auto-joins by group id, role-agnostic via a `backHref` set from the viewer's role.
- `VoiceRoomProvider` — context orchestrator; composes the `hooks/` (audio pipeline, spatial positions, screen share, moderator controls, chat) and routes Daily app messages in `handleAppMessage`.
- `SpatialVoiceRoom` / `SpatialCanvas` / `DraggableAvatar` / `VoiceAvatar` / `Zone` — in-session layout and spatial canvas.
- `VoiceControls`, `ScreenShareDisplay`, `ParticipantList` / `ParticipantRow`, `ChatPanel`, `MicLevelIndicator`, `JoinVoiceButton`.
- `hooks/types.ts` — shared types (`VoiceParticipant`, `LockState`, `ChatMessage`, …).
- Outside this dir: `src/services/voice/` (token service + React Query hook), `src/app/api/voice/token/route.ts`, `src/lib/daily.ts` (server-only Daily REST + room helpers), `src/lib/session-schedule.ts` + `src/lib/voice-window.ts` (window math), `src/lib/voice/user-name.ts`, `src/lib/constants/{voice,spatial,spatial.config}.ts`.

## Env

`DAILY_API_KEY` (server, REST auth), `NEXT_PUBLIC_DAILY_DOMAIN` (both, room URLs).

## Known follow-ups

Chat moderation/rate-limiting (receive-side limiter per `fromId`, same "enforce on receipt" principle as the length cap); persisted chat history; a gedu "your sessions" join list; lock state surviving rejoins; participant presence persistence. All deferred — and all in tension with the no-DB-table rule, so weigh that before picking one up.
