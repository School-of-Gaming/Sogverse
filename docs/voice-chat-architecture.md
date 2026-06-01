# Voice Chat Architecture

Daily.co-powered spatial voice (and optional video) chat for v2 product groups, with screen sharing, per-participant volume control, and moderator controls.

> Looking for the on-the-fly voice rooms admins/gedus can spin up and share via short URL? See [instant-voice-rooms.md](./instant-voice-rooms.md). This document covers the schedule-driven, group-linked voice rooms.

## Overview

Voice rooms are linked 1:1 to **v2 product groups** (`product_groups_v2`) and a specific session window: each group + session combination gets a dedicated Daily.co room that opens/closes automatically based on the product's weekly schedule. Access control is membership-based: gamers can only join rooms for groups they have an active `participations_v2` row in; gedus can join any group on a product they're assigned to (cross-group voice mobility, per the redesign §4.10); admins pass through.

Gamers reach a session from the dashboard `NextSessionCard` — clicking "Join Voice" while the session window is open navigates to `/voice/group/{groupId}` and `VoiceSessionPage` auto-joins. Gedus reach the same room from their dashboard `GroupCard` for the group they're assigned to (sister-group access in the same product is authorized but only surfaced from the group detail page). The spatial canvas lets participants drag avatars into zones (breakout rooms, broadcast) for zone-based audio isolation.

`/voice/group/[id]` is shared across roles: the page reads the viewer's role to set the back link (gamer/gedu/admin → their dashboard), the proxy gates the prefix behind a session, and the token endpoint decides moderator rights (any non-gamer role gets `isOwner: true`). A copy-pasted URL works for whichever signed-in user opens it.

## Component Map

```
Pages
└── /voice/group/[id]  → VoiceSessionPage (auto-joins by product_groups_v2.id)

(Instant rooms — separate flow, see instant-voice-rooms.md
 /admin/voice and /gedu host CreateInstantRoomCard.)

Voice components (src/components/voice/)
├── VoiceSessionPage    — Standalone voice page: auto-joins by group ID, role-agnostic (backHref pattern)
├── VoiceRoomProvider   — React context orchestrator (composes internal hooks)
├── SpatialVoiceRoom    — In-session layout: screen share + canvas + controls + participants
├── SpatialCanvas       — Renders zones + draggable avatars on a 21:9 canvas
├── DraggableAvatar     — Pointer-drag avatar with speaking glow (rAF + AnalyserNode)
├── VoiceAvatar         — Presentational avatar (identicon/video, mic status, name label)
├── Zone                — Renders a named zone rectangle on the canvas
├── VoiceControls       — Mic/camera/screen-share toggles, lock indicators, mic level
├── ScreenShareDisplay  — Renders screen share video with sharer badge and stop button
├── ChatPanel           — Ephemeral in-call text chat (between voice room card and ParticipantList)
├── ParticipantList     — Always-visible list: speaking indicator, volume slider, mod controls
└── MicLevelIndicator   — Real-time mic input level bar (Web Audio API)

Internal hooks (src/components/voice/hooks/)
├── types.ts                  — Shared types (VoiceParticipant, LockState, ChatMessage, AppMessage, etc.)
├── use-audio-pipeline.ts     — Audio element playback, volume multipliers, AnalyserNodes, routing
├── use-spatial-positions.ts  — Spatial movement, zone detection, app messages, position sync
├── use-screen-share.ts       — Screen sharer detection, start/stop, auto-replace
├── use-moderator-controls.ts — Mute, lock/unlock, lock state sync, moderator app messages
└── use-chat.ts               — Ephemeral chat log + send over the app-message channel

API routes (src/app/api/voice/)
└── token/route.ts  — POST (access control + Daily.co meeting token)

Service layer (src/services/voice/)
├── voice.service.ts  — VoiceService class (POST /api/voice/token)
├── voice.queries.ts  — React Query hooks (useVoiceToken)
└── index.ts          — Barrel exports

Utilities
├── src/lib/session-schedule.ts   — computeSessionWindow() (shared server/client)
├── src/lib/constants/voice.ts    — SESSION_WINDOW_BEFORE/AFTER, TOKEN_EXPIRY, etc.
├── src/lib/daily.ts              — Daily.co REST API wrapper + room helpers (server-only)

Spatial config (src/lib/constants/)
├── spatial.ts        — Types, pure functions (zone detection, overlap, gain calc)
└── spatial.config.ts — Canvas dimensions, zone rects, avatar size, colors
```

## Spatial Position Model

`position: SpatialPosition` is a required field on `VoiceParticipant`. A participant is not added to the `participants` list until their position data has arrived via `posUpdate` app message (or local placement on join). If a participant is in the list, it has a valid position — no fallbacks, no nullable fields.

The provider owns positions in a shared `positionsRef` (`Map<string, SpatialPosition>`). When `updateParticipants()` builds the participant list from Daily.co's participant map, it skips any participant whose session ID is not yet in `positionsRef`. The `use-spatial-positions` hook writes into this ref; the provider calls `updateParticipants` directly in `handleAppMessage` after processing position-related messages (`posUpdate`, `moveUser`).

**Why position is part of the participant, not a separate data channel:** Position data and Daily.co participant data arrive via independent event sources (app messages vs. Daily.co SDK events). Keeping them as separate React state creates a window where a participant renders without a position. Making position a precondition for participant existence eliminates this class of bug structurally.

**Position exchange on join — per-peer `posUpdate` handshake.** The new joiner does NOT broadcast their position on `joined-meeting` — `sendAppMessage("*")` immediately after joining is unreliable under high latency because the SFU's app-message route to existing peers may not be established yet. (This unreliability is specific to the join moment; once the session is established, broadcast via `sendAppMessage("*")` works normally and is used for ongoing position updates like `moveLocal`.) Instead, each existing participant handles `participant-joined` (which only fires once the SFU route to the new peer is established) and sends a targeted `posUpdate` containing only their own position. The new joiner replies with their own `posUpdate`, completing a bidirectional exchange per peer pair. A `sentPositionToRef` set prevents redundant replies: the existing peer records the new peer's session ID when it initiates the exchange, so it skips the reply logic when the new peer's `posUpdate` arrives. Each peer also self-reports their own lock state via a `lockSync` message if they are currently locked — the provider keys the received lock state by `fromId` (Daily.co-verified sender), so a peer can only set their own lock state.

## No Database Table — Daily.co Is Sole Source of Truth

v2 voice rooms are not persisted to Postgres. There is no `voice_rooms_v2` table, no `daily_room_name` column on `product_groups_v2`, and no scheduler that pre-creates rooms. Everything the token endpoint needs to decide "is this room open, and what's its name" comes from `product_groups_v2`, `schedule_slots_v2`, and the current wall clock:

- **Room name** is content-addressable via `groupVoiceRoomName({groupId, windowOpensAt, timezone})` in `src/lib/daily.ts`. Format: `g-{groupId}-{YYYYMMDDHHMM}` where the timestamp is the window's open time formatted in the product's timezone. Same group + same session window → same room name, derived independently by every joiner with no coordination. Different weeks or different slots produce distinct names. Both pieces are load-bearing: the full UUID rules out cross-group collisions under `getOrCreateDailyRoom` (two groups sharing a name would silently land in each other's call), and the timestamp rules out cross-session collisions (a stale prior-session room could otherwise be returned to a new joiner with its already-passed `exp`).
- **Room existence** is checked at join time via Daily.co's GET endpoint. If the room doesn't exist yet, the helper creates it on demand — see "Daily.co Room Lifecycle" below.
- **Room cleanup** is delegated to Daily.co. The token endpoint sets the room's `exp` property to `windowClosesAt + grace` so Daily reaps the room (and ejects late joiners) when the session window passes.

This means new product groups don't need any voice-room provisioning step. Likewise, deleting a group doesn't require us to delete a Daily room — by the time the group is gone, any rooms that ever existed for it have already self-expired.

## Schedule-Driven Room Windows

Each group inherits its schedule from one or more `schedule_slots_v2` rows on the linked product (each slot has `weekday`, `start_time`, `duration_minutes`, plus the product's `timezone`). A group with two slots in a week (e.g. Mon 11 PM and Tue 5 AM) has two distinct session windows — and therefore two distinct Daily room names — per week.

**Session window** = `[sessionStart - BEFORE, sessionEnd + AFTER]` (configurable in `src/lib/constants/voice.ts`).

The `computeSessionWindow()` utility (in `src/lib/session-schedule.ts`) determines if a slot is currently open. It checks both the upcoming session and the previous week's occurrence to handle "currently in session" state.

**Client-side:** The dashboard `NextSessionCard` calls `computeSessionWindow()` to decide between "Join Voice" (open) and "Opens at …" (locked). A 30-second `useNow()` tick keeps the countdown / state flip live without polling.

**Server-side:** The token endpoint independently computes the session window over every slot and rejects with 403 if no slot is open right now. This is the security boundary — client-side `isOpen` is display-only.

## Access Control Model

### Token Endpoint (`POST /api/voice/token`)

Request: `{ groupId: product_groups_v2.id }`. Gates run in this order:

1. **Role gate.** `requireRole(["gedu", "gamer", "admin"])` — customers are blocked.

2. **Group existence + remoteness.** The group must exist and its product must be `is_remote = true`. In-person products have no voice room; the route returns 404 (matching the dashboard's "no destination" stance).

3. **Membership gate.**
   - **Gamer** — must have an active row in `participations_v2` for this `(group_id, gamer_id)`.
   - **Gedu** — must have a row in `gedu_group_assignments_v2` for this `(product_id, gedu_id)`. The check is on `product_id`, not `group_id`, per the redesign's cross-group voice mobility rule (§4.10): a gedu assigned to a product can drop into any of its groups' rooms.
   - **Admin** — bypass.

4. **Session window gate.** Iterate all slots; at least one must currently be inside its open window. The first open slot's `windowOpensAt` / `windowClosesAt` drives the room name and the token's `exp`. No role bypasses the window — admins/gedus follow the same calendar as gamers.

5. **Token issuance.** `is_owner = role !== 'gamer'` (admins and gedus are moderators; gamers are not). Token `exp = windowClosesAt + TOKEN_EXPIRY_GRACE_SECONDS`. When the token expires Daily.co auto-disconnects the participant.

### What v2 deliberately does **not** check

- **No mid-session enrollment gate.** v1 blocked gamers whose `enrollment.created_at` was after the current session started — load-bearing for the sorg-token billing model where the first charge had to land on the next session, not the in-progress one. v2's credit-based billing has no equivalent dependency, so the gate is gone. Active membership is the binary access predicate; a gamer who joined 30s ago gets in just like one who joined a week ago.
- **No always-open "lounge" rooms.** v1's Admin Lounge and Gedu Lounge are gone. If you need an ad-hoc room outside a scheduled session, use the instant-rooms flow (see `instant-voice-rooms.md`).

### RPC Permissions

| What | Admin | Gedu | Gamer |
|---|---|---|---|
| Join any group room | In window | Assigned product + in window | Active participation + in window |
| Camera & Mic | Yes | Yes | Yes |
| Screen share | Yes | Yes | No |
| Drag other avatars | Yes | Yes | Own only |
| Enter broadcast zone | Yes | Yes | No |
| Mute participants | Yes | Yes | No |
| Lock participant mic/cam | Yes | Yes | No |

## Daily.co Room Lifecycle

### Get-or-create on demand

There is no provisioning step when a product group is added. The first joiner to a session triggers room creation, every subsequent joiner reuses it. The logic lives in `getOrCreateDailyRoom(config)` in `src/lib/daily.ts`:

1. `GET /rooms/{name}` — if Daily returns the room, use it.
2. Otherwise `POST /rooms` — if Daily creates it, use it.
3. If the POST loses a duplicate-name race (two simultaneous first-joiners both saw "not found" before either POST landed), re-GET and use the winner's room.

Daily.co returns the duplicate-name error as `400 invalid-request-error` with the literal info string `a room named X already exists` — not the 409 you'd expect — so callers must use the `isDailyDuplicateRoomError(err)` helper rather than branching on status alone. This was a bug in v1 (and briefly in v2 before being fixed): the swallow checked `status === 409`, never matched, and every non-first joiner hit a 500.

**Why get-or-create and not pre-create-on-window-open:** the pre-create path needs a cron/scheduler, gives no user-visible benefit (Daily room creation is sub-second), and the first-joiner latency cost of an extra GET is negligible. v1 had a related pattern (rooms created when a group was added via `commit_group_changes`); it was leftover infrastructure with no remaining users by the v2 cutover and was ripped out in migration 00060.

### Cleanup

Delegated to Daily.co. The token endpoint sets `room.exp = windowClosesAt + grace` so Daily destroys the room (and ejects everyone still in it) when the session ends. Our side has no cleanup job.

### Instant rooms — different flow

Instant rooms (random short codes generated by admin/gedu) use **strict create-only with collision retry**, not get-or-create. The reason is security: instant-room codes are not authorization-pre-gated, so silently joining the existing room on a code collision would let a guesser into someone else's room. See `src/app/api/voice/instant/create/route.ts` and `instant-voice-rooms.md`.

## Screen Sharing

### Permissions (three-layer security model)
1. **Daily.co room level:** `enable_screenshare: true` — room allows screen sharing (all rooms).
2. **Daily.co token level:** `enable_screenshare` derived from `is_owner` — only owners (admin/gedu) get tokens that allow screen sharing. Gamers get `enable_screenshare: false`; Daily.co rejects `startScreenShare()` calls from their client.
3. **Client-side:** Screen share button only shown when `canScreenShare` (i.e., non-gamer role). Defense-in-depth; Layer 2 is the real enforcement.

### One-at-a-time with auto-replace
Only one participant can share at a time. If a second owner starts sharing while someone else is already sharing, the `startScreenShare()` function first stops the existing sharer via `updateParticipant(sharerSid, { setScreenShare: false })` (requires owner token), then starts the new share.

### Track handling
Screen share video is detected via `p.tracks.screenVideo?.state === "playable"` in `mapParticipant()`. The `ScreenShareDisplay` component renders the track in a `<video>` element above the spatial canvas when active.

## Audio Pipeline

### Two independent pipelines per remote participant

```
Playback:  <audio>.srcObject = MediaStream([track])       ← element.volume for volume/muting
Analysis:  createMediaStreamSource(MediaStream([track])) → AnalyserNode  ← speaking glow
```

The `<audio>` element handles WebRTC playback. A separate `createMediaStreamSource` from the same track feeds the `AnalyserNode` for speaking-glow visualization. The two pipelines are completely independent.

**Do NOT use `createMediaElementSource` for the analyser.** Chrome doesn't reliably route MediaStream-backed element audio through a `MediaElementAudioSourceNode` — the AnalyserNode gets silence. See `docs/chrome-webrtc-volume-bug.md` for the full investigation.

**Do NOT connect the analyser to `ctx.destination`.** Chrome kills WebRTC audio when a `MediaStreamAudioSourceNode` is routed to `ctx.destination`. Leaving the analyser disconnected is safe because Chrome's `MediaStreamAudioSourceNode` is a push source that feeds connected nodes without needing a pull from the destination.

### AudioContext lifecycle
Browsers create AudioContext in a suspended state until a user gesture resumes it. `manageAudioNodes()` always `await ctx.resume()` before creating nodes. Without this, nodes would be created against a still-suspended context and produce no data.

### Zone-based routing
`updateAudioRouting()` uses `element.volume` for zone isolation. `canHearZone(localZone, remoteZone)` returns true (same zone or broadcast) or false (different zones). When false, `element.volume` is set to 0 (silent). Otherwise it's set to the user's chosen volume multiplier.

### Volume control
Each remote participant has a local-only volume multiplier (0.1–1.0, default 1.0) controlled via a 10–100% slider in the `ParticipantList`. Volume is applied via `element.volume`. Amplification above 100% is not possible for WebRTC MediaStream sources in Chrome — see `docs/chrome-webrtc-volume-bug.md` for the full investigation (9 approaches evaluated, none viable without major trade-offs).

## Moderator Controls

### Security model (three layers)

1. **Daily.co token (`is_owner`):** Only owners can call `updateParticipant()` to remotely mute or change `canSend` permissions. Gamers have `is_owner: false`; Daily.co rejects their `updateParticipant()` calls.
2. **Daily.co `updateParticipant` (server-enforced):** `canSend` permissions revoke a participant's ability to send audio/video at the infrastructure level. A locked participant physically cannot send that track type regardless of client manipulation.
3. **Client-side (cosmetic, defense-in-depth):** App messages communicate lock state for UI indicators. Bypassable, but Layer 2 prevents the actual action.

### Mute vs Lock

- **Mute** (`muteParticipant`): One-time force-off via `updateParticipant(sid, { setAudio: false })`. The participant can re-enable their mic afterward.
- **Lock** (`lockParticipant`): Persistent restriction via `updateParticipant(sid, { setAudio: false, updatePermissions: { canSend: [...] } })`. Revokes the `canSend` permission for that track type. The participant's toggle is disabled and they physically cannot send the track. Unlock restores the permission.

### Lock state sync
Lock states are synced via app messages (`moderatorLock`). When a new peer joins, each locked participant self-reports their own lock state via a targeted `lockSync` message containing a single `LockState` value. The receiver trusts only the sender's own state — enforcement is at the SFU level via `canSend` permissions.

### UI
- **VoiceControls:** Lock indicator (lock icon) overlays mic/camera buttons when locally locked. Buttons are disabled.
- **ParticipantList:** Shows mute/lock buttons for non-owner, non-local participants (visible to owners only). Lock badges shown on locked participants.

## In-Call Chat

Ephemeral text chat over the same Daily.co app-message channel as positions and moderation. `ChatPanel` (`src/components/voice/ChatPanel.tsx`) renders between the voice room card and `ParticipantList`; `use-chat.ts` owns the log and send logic; the provider routes the `chatMessage` app message into the hook from `handleAppMessage`.

- **No persistence.** Messages live only in React state for the session and are cleared on `resetState()` (leave/disconnect). This matches the voice-wide "Daily.co is the sole source of truth — no DB table" model. Consequence: late joiners see no history.
- **Sender identity is server-trusted.** Only `text` rides in the `chatMessage` payload. The display name is resolved from the sender's Daily-verified `fromId` (the `user_name` token field) at receive time, so a peer can't spoof another participant's name.
- **Local echo.** Daily doesn't loop `sendAppMessage` back to the sender, so the hook appends the local user's own message on send.
- **Caps.** Messages are trimmed to 500 chars and the in-memory log to the latest 200 entries, bounding a flooding client.
- **Shared across room types.** Because `SpatialVoiceRoom` backs both scheduled group rooms and instant rooms, chat appears in both — including for unauthenticated guests on instant rooms.
- **Layout.** The message log is a fixed-height scroll area so new messages never push `ParticipantList` (rendered below it) out from under the user — see CLAUDE.md § "Layout & Scrolling".
- **No moderation (v1).** No profanity filter, no mod "clear/disable chat", no audit trail — a deliberate v1 scope choice. See Future improvements.

## Data Flow

### Joining a voice session

1. A gamer (or gedu) clicks "Join Voice" on their dashboard's session card while the session window is open.
2. Browser navigates to `/voice/group/{groupId}`.
3. `VoiceSessionPage` mounts inside `VoiceRoomProvider`.
4. Auto-join: `useVoiceToken().mutateAsync(groupId)` → `POST /api/voice/token`.
5. Token endpoint runs the membership + session-window gates.
6. `getOrCreateDailyRoom` ensures the Daily room exists (creating it if this is the first joiner).
7. Token endpoint issues a meeting token with `is_owner` (which also controls `enable_screenshare`) and `exp = windowClosesAt + grace`.
8. `VoiceRoomProvider.join()` connects to the Daily.co room.
9. Local avatar is placed at a random non-overlapping position in the general zone (no broadcast — see position exchange paragraph above).
10. Each existing participant sends their own `posUpdate` (triggered by `participant-joined`); the new joiner replies with their own `posUpdate`, completing a bidirectional handshake per peer. Locked peers also send a `lockSync` with their own lock state.
11. `SpatialVoiceRoom` renders the spatial canvas with avatars.

### Auto-leave triggers
1. **Token expires** → Daily.co hard disconnect at `windowClosesAt + grace`. This is the authoritative session-end signal; there's no client-side polling that mirrors it.
2. **User clicks Leave** → `leave()` + navigate to `backHref` (the viewer's role-specific dashboard).

## Token userName Encoding

The `userName` field in Daily.co tokens encodes `userId|role|displayName` for client-side role extraction without extra DB lookups. The `buildUserName()` helper in `src/lib/daily.ts` strips pipe characters from the display name so a guest can't spoof the role slot — cosmetic only (the server-side `is_owner` flag is the actual permission authority), but worth preventing on instant rooms where guests pick their own names.

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `DAILY_API_KEY` | Server | Daily.co REST API authentication |
| `NEXT_PUBLIC_DAILY_DOMAIN` | Both | Daily.co subdomain for room URLs |

## Future Improvements

### Chat moderation & safety
v1 chat ships with no moderation (see "In-Call Chat"). Because gamers are children, the likely follow-ups are: a profanity filter, a gedu/admin "clear chat" / "disable chat" control, and an audit trail for after-the-fact review. The first two are awkward on a pure broadcast channel (there's no central record to clear and no chokepoint to filter at) — they'd most naturally come with a server relay or the persisted message model below.

**Message rate limiting.** Outgoing/incoming chat has no rate limit. An authorized member (chat needs a valid meeting token, so this is an in-room participant, not an anonymous attacker) running a scripted `daily-js` client could flood many small messages. Per-message *size* is already bounded (Daily's transport cap + our receive-side `slice(0, 500)`) and the in-memory log is capped (`MAX_MESSAGES = 200`), so memory is safe — but high message *rate* causes render churn and a wall of spam on every other client. The effective fix follows the same "don't trust the sender, enforce on receipt" principle as the length cap: a receive-side limiter in `use-chat.ts` that drops/coalesces messages from any `fromId` exceeding N/sec, which bounds the churn on every victim regardless of the attacker's client. (Today the only backstop is Daily's own per-connection limits.)

### Persisted chat history
Chat is currently ephemeral app-messages, so late joiners see nothing and there's no record. A `voice_messages_v2` table + Supabase Realtime would add scrollback, late-join backfill, and the audit trail moderation wants — at the cost of breaking the "no voice DB table" principle (new table, RLS, subscription). Deferred as out of scope for v1.

### Gedu UI for scheduled rooms
The token API already accepts gedus on v2 scheduled rooms (gated by `gedu_group_assignments_v2`), but the gedu dashboard has no join link for an upcoming session — a gedu has to know the URL to join. Surfacing this needs a "your sessions" list on the gedu dashboard analogous to the gamer's `NextSessionCard`.

### Persistent lock state across rejoins
Currently lock state is ephemeral — if a locked gamer disconnects and rejoins, they get a fresh token with full permissions. A server-side lock store (e.g., in Supabase or Redis) + restricted token issuance would make locks survive reconnects.

### Add participant tracking to the database
Currently participant presence is only tracked in Daily.co's runtime. Persisting join/leave events to a `voice_participations_v2` table would enable session history, analytics, and participant count display without joining the call.

### Volume amplification above 100%
Currently capped at 100% due to a Chrome limitation with WebRTC MediaStream sources (see `docs/chrome-webrtc-volume-bug.md`). If Chrome fixes [the underlying bug](https://issues.chromium.org/issues/40184923), a GainNode could be re-introduced in the analyser pipeline for amplification — but note that the analyser pipeline is intentionally separate from playback (see "Audio Pipeline" above), so a GainNode-based approach would require re-evaluating the architecture. Alternatively, if Daily.co adds per-subscriber server-side audio processing to their SFU, that would bypass the client-side limitation entirely.

### State machine extraction for protocol testing
The position exchange protocol (per-peer `posUpdate` handshake, `lockSync`, `sentPositionToRef` dedup) is timing-sensitive — bugs manifest as invisible participants under specific event orderings. If regressions recur, extract the protocol logic into a pure state machine (`voice-protocol.ts`, ~50 lines) that takes `(state, event) → actions[]`. State: `{ positions, sentPositionTo, joined, localSessionId, localLocks }`. Events: `joined-meeting`, `participant-joined`, `received-posUpdate`, `received-lockSync`, `participant-left`. Actions: `send-posUpdate-to-X`, `store-position`, `store-lock`, etc. The hooks become thin adapters that map Daily.co events to protocol events and execute the returned actions. Then write permutation tests (~150 lines) with a multi-peer simulator that feeds every plausible event ordering into the state machines and asserts the invariant: after all events settle, every peer pair has exchanged positions. This is the industry-standard approach for testing timing-sensitive protocols without needing a real network.
