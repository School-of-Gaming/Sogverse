# Voice Chat Architecture

Daily.co-powered spatial voice (and optional video) chat for gedus, admins, and gamers, with screen sharing, per-participant volume control, and moderator controls.

## Overview

Voice rooms are linked 1:1 to product groups — each group gets a dedicated room that opens/closes automatically based on the product's weekly schedule. Two always-open special rooms (Admin Lounge, Gedu Lounge) are seeded in the migration. Access control is enrollment-based: gamers can only see and join rooms for groups they're enrolled in, gedus see rooms for their assigned groups, and admins see everything.

Users access voice sessions from their groups page — clicking "Join" on a group card or lounge card navigates to `/{role}/voice/{roomId}`, which auto-joins the Daily.co room. The spatial canvas lets participants drag avatars into zones (breakout rooms, broadcast) for zone-based audio isolation.

## Component Map

```
Pages
├── /{role}/groups      → Groups list (see docs/shared-group-components.md)
├── /{role}/groups/[id] → Group detail with Join button
└── /{role}/voice/[id]  → VoiceSessionPage (auto-joins by room ID)

Voice components (src/components/voice/)
├── VoiceSessionPage    — Standalone voice page: auto-joins by room ID, role-agnostic (backHref pattern)
├── VoiceRoomProvider   — React context orchestrator (composes internal hooks)
├── SpatialVoiceRoom    — In-session layout: screen share + canvas + controls + participants
├── SpatialCanvas       — Renders zones + draggable avatars on a 21:9 canvas
├── DraggableAvatar     — Pointer-drag avatar with rAF position rendering and speaking glow
├── VoiceAvatar         — Presentational avatar (identicon/video, mic status, name label)
├── Zone                — Renders a named zone rectangle on the canvas
├── VoiceControls       — Mic/camera/screen-share toggles, lock indicators, mic level
├── ScreenShareDisplay  — Renders screen share video with sharer badge and stop button
├── ParticipantList     — Always-visible list: speaking indicator, volume slider, mod controls
└── MicLevelIndicator   — Real-time mic input level bar (Web Audio API)

Internal hooks (src/components/voice/hooks/)
├── types.ts                  — Shared types (VoiceParticipant, LockState, AppMessage, context shape)
├── use-audio-pipeline.ts     — Audio element playback, volume multipliers, AnalyserNodes, routing
├── use-spatial-positions.ts  — Spatial movement, zone detection, app messages, position sync
├── use-screen-share.ts       — Screen sharer detection, start/stop, auto-replace
└── use-moderator-controls.ts — Mute, lock/unlock, lock state sync, moderator app messages

API routes (src/app/api/voice/)
└── token/route.ts  — POST (access control + Daily.co meeting token)

Service layer (src/services/voice/)
├── voice.service.ts  — VoiceService class (RPC + session window computation)
├── voice.queries.ts  — React Query hooks (useAvailableVoiceRooms, useVoiceToken, useLoungeRoomId)
└── index.ts          — Barrel exports

Utilities
├── src/lib/session-schedule.ts   — computeSessionWindow() (shared server/client)
├── src/lib/constants/voice.ts  — SESSION_WINDOW_BEFORE/AFTER, TOKEN_EXPIRY, etc.
├── src/lib/daily.ts            — Daily.co REST API wrapper (server-only)

Spatial config (src/lib/constants/)
├── spatial.ts        — Types, pure functions (zone detection, overlap, gain calc)
└── spatial.config.ts — Canvas dimensions, zone rects, avatar size, colors
```

## Spatial Position Model

Positions are decoupled from React state. The provider owns a shared `positionsRef` (`Map<string, SpatialPosition>`) that the `use-spatial-positions` hook writes into. `VoiceParticipant` contains only identity/audio/video state — it has no `position` field.

### Two data paths

| Data | Storage | Rendering | Update trigger |
|---|---|---|---|
| Participant list, badges, controls | React state (`participants`) | Normal React re-renders | Daily.co SDK events |
| Positions, speaking glow | Refs (`positionsRef`, `AnalyserNode`) | `requestAnimationFrame` loops + direct DOM mutation | App messages, drag events |

This separation exists because position updates are high-frequency (drag events, ~30fps broadcasts) and must not trigger React re-renders. The canvas reads positions via `getPosition(sessionId)` — a stable callback that reads from `positionsRef` — and `DraggableAvatar` runs a rAF loop that sets `el.style.left/top` directly, same pattern as the speaking glow visualization.

### Position access

`getPosition(sessionId)` is exposed on the voice room context. It returns the current `SpatialPosition` from `positionsRef`. The return type is non-nullable — every participant in the list is guaranteed to have a position (enforced by the gate in `updateParticipants`).

### Participant materialization

`updateParticipants()` skips any participant whose session ID is not yet in `positionsRef`. A participant appears on the canvas only after their position data has arrived via `posUpdate` app message (or local placement on join). This guarantees that every rendered avatar has a valid position — no fallbacks, no nullable fields.

## Database Schema

```sql
voice_rooms (
  id              UUID PK,
  group_id        UUID FK → product_groups(id) ON DELETE CASCADE,  -- nullable for special rooms
  room_type       TEXT ('group' | 'admin_only' | 'gedu_only'),
  name            TEXT,
  daily_room_name TEXT UNIQUE,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

**Key constraints:**
- `UNIQUE(group_id) WHERE group_id IS NOT NULL` — 1:1 mapping between groups and rooms
- `UNIQUE(room_type) WHERE room_type = 'admin_only'` — only one admin lounge
- `UNIQUE(room_type) WHERE room_type = 'gedu_only'` — only one gedu lounge

**RLS policies:** Admin has full access. Gedu can SELECT gedu lounge + rooms for their assigned groups. Gamer can SELECT rooms for groups where they have an active enrollment.

**Realtime:** Table has `REPLICA IDENTITY FULL` so UPDATE/DELETE events are delivered through RLS.

**RPC:** `get_available_voice_rooms()` (SECURITY DEFINER) returns role-filtered rooms with schedule data joined from products. Used by `VoiceSessionPage` to look up room metadata when joining a session. Admins see all rooms, gedus see gedu lounge + own group rooms, gamers see enrolled group rooms only. For gamers, the RPC also returns `enrolled_at` (from `group_enrollments.created_at`) so the client can determine whether a mid-session enrollment should display as "Upcoming" instead of "Live".

## Schedule-Driven Room Windows

Voice rooms don't have an "open/closed" status column. Instead, each group room inherits its schedule from the linked product (`day_of_week`, `start_time`, `timezone`, `duration_minutes`).

**Session window** = `[sessionStart - BEFORE, sessionEnd + AFTER]` (configurable in `src/lib/constants/voice.ts`)

The `computeSessionWindow()` utility (in `src/lib/session-schedule.ts`) determines if a room is currently open. It reuses `getNextSessionStart()` from `src/lib/enrollment.ts` and also checks the previous week's occurrence to handle "currently in session" state.

**Client-side:** The groups page enrichment hook (`useGroupsWithVoice`) maps each group through `computeSessionWindow()` to get `isOpen` and `voiceNextSessionStart` for UI display (Live/Upcoming badges, countdown). `VoiceSessionPage` also uses it for auto-leave detection.

**Server-side:** The token endpoint independently computes the session window and rejects with 403 if the room isn't open for the requesting user. This is the security boundary — client-side `isOpen` is display-only.

**Always-open rooms** (admin_only, gedu_only) are always considered open and have no schedule.

## Access Control Model

### Token Endpoint (`POST /api/voice/token`)

1. **Role gate:** `requireRole(["gedu", "gamer", "admin"])` — customers are blocked.

2. **Room type checks:**
   - `admin_only` → must be admin
   - `gedu_only` → must be admin or gedu
   - `group` → membership check (below)

3. **Group room membership:**
   - Admin → allowed (bypass all checks)
   - Gedu → must be the group's assigned gedu (`product_groups.gedu_id`)
   - Gamer → must have an active enrollment in the group

4. **Mid-session enrollment gate (gamers only):**
   - If a gamer's `enrollment.created_at` is at or after the current session's start time, they cannot join — their enrollment starts next session.
   - This prevents mid-session freeloading: the first charge covers the next session (via `getNextSessionStart()`), not the in-progress one.
   - The same check is applied client-side (room shows as "Upcoming" instead of "Live") via `enrolled_at` returned from the `get_available_voice_rooms` RPC.

5. **Session window (group rooms only):**
   - All roles must be within the session window (session start - before buffer to session end + after buffer)
   - No role bypasses — admins and gedus follow the same window as gamers
   - Buffer values are configurable in `src/lib/constants/voice.ts` (`SESSION_WINDOW_BEFORE_MINUTES`, `SESSION_WINDOW_AFTER_MINUTES`)

6. **Token expiry = session window close:** For group rooms, the meeting token's `exp` is set to `windowClosesAt` for all roles. When it expires, Daily.co auto-disconnects the participant. For always-open rooms, the default 2.5-hour expiry applies.

### RPC Permissions

| What | Admin | Gedu | Gamer |
|---|---|---|---|
| See admin lounge | Yes | No | No |
| See gedu lounge | Yes | Yes | No |
| See group rooms | All | Own groups | Enrolled groups |
| Join admin lounge | Yes | No | No |
| Join gedu lounge | Yes | Yes | No |
| Join group room | In window | Own groups + in window | Enrolled + in window |
| Camera & Mic | Yes | Yes | Yes |
| Screen share | Yes | Yes | No |
| Drag other avatars | Yes | Yes | Own only |
| Enter broadcast zone | Yes | Yes | No |
| Mute participants | Yes | Yes | No |
| Lock participant mic/cam | Yes | Yes | No |

## Daily.co Room Lifecycle

### Group rooms
- **Created** when a product group is added via `POST /api/admin/products/[id]/groups`. After the `commit_group_changes` RPC succeeds, the handler creates Daily.co rooms and inserts `voice_rooms` rows for new groups.
- **Deleted** when a group is removed. Before the RPC, the handler looks up `daily_room_name` for groups being deleted. After the RPC succeeds (CASCADE deletes the `voice_rooms` row), it deletes the Daily.co room (best-effort).
- **Naming:** `group-{groupId.slice(0, 8)}`

### Special rooms (admin-lounge, gedu-lounge)
- **Seeded** by the migration (`INSERT INTO voice_rooms`).
- **Daily.co room lazily created** on first join — the token endpoint checks `getDailyRoom()` and calls `createDailyRoom()` if needed.

### Self-healing
The token endpoint lazily creates any missing Daily.co room before issuing a token. This covers edge cases where Daily.co room creation failed during group management.

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
Lock states are synced via app messages (`moderatorLock`). For late joiners, lock states are included in the `positionSync` reply alongside spatial positions.

### UI
- **VoiceControls:** Lock indicator (lock icon) overlays mic/camera buttons when locally locked. Buttons are disabled.
- **ParticipantList:** Shows mute/lock buttons for non-owner, non-local participants (visible to owners only). Lock badges shown on locked participants.

## Data Flow

### Joining a voice session

1. User clicks Join on a group card or lounge card on the groups page
2. Browser navigates to `/{role}/voice/{roomId}` (with optional `?groupId` for back navigation)
3. `VoiceSessionPage` mounts inside `VoiceRoomProvider`
4. Auto-join: `useVoiceToken().mutateAsync(roomId)` → `POST /api/voice/token`
5. Token endpoint validates role, membership, and session window
6. Lazy-creates Daily.co room if needed
7. Issues a meeting token with `isOwner` (which also controls `enable_screenshare`) and `exp`
8. `VoiceRoomProvider.join()` connects to the Daily.co room
9. Local avatar is placed at a random non-overlapping position in the general zone; a `requestPositions` broadcast asks existing participants for their positions
10. Existing participants reply with `positionSync` (positions + lock states); positions are written into `positionsRef` and each avatar's rAF loop picks them up on the next frame
11. `SpatialVoiceRoom` renders the spatial canvas with avatars

### Auto-leave triggers
1. **Session window expires** → periodic `computeSessionWindow()` check in `VoiceSessionPage` → graceful leave + "Session has ended" message
2. **Token expires** → Daily.co hard disconnect (backup if client-side check misses it)
3. **User clicks Leave** → `leave()` + navigate to `backHref`

## Token userName Encoding

The `userName` field in Daily.co tokens encodes `userId|role|displayName` for client-side role extraction without extra DB lookups.

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `DAILY_API_KEY` | Server | Daily.co REST API authentication |
| `NEXT_PUBLIC_DAILY_DOMAIN` | Both | Daily.co subdomain for room URLs |

## Future Improvements

### Persistent lock state across rejoins
Currently lock state is ephemeral — if a locked gamer disconnects and rejoins, they get a fresh token with full permissions. A server-side lock store (e.g., in Supabase or Redis) + restricted token issuance would make locks survive reconnects.

### Add participant tracking to the database
Currently participant presence is only tracked in Daily.co's runtime. Persisting join/leave events to a `voice_room_participants` table would enable session history, analytics, and participant count display without joining the call.

### Volume amplification above 100%
Currently capped at 100% due to a Chrome limitation with WebRTC MediaStream sources (see `docs/chrome-webrtc-volume-bug.md`). If Chrome fixes [the underlying bug](https://issues.chromium.org/issues/40184923), a GainNode could be re-introduced in the analyser pipeline for amplification — but note that the analyser pipeline is intentionally separate from playback (see "Audio Pipeline" above), so a GainNode-based approach would require re-evaluating the architecture. Alternatively, if Daily.co adds per-subscriber server-side audio processing to their SFU, that would bypass the client-side limitation entirely.

### Sanitize pipe delimiter from display names in token userName
The token endpoint encodes `userId|role|displayName` as a pipe-delimited string in Daily.co's `user_name` field. If a user's `display_name` contains `|`, the client-side parser (`mapParticipant`) handles it correctly by re-joining slots 2+. However, a user could set their display name to e.g. `fakeId|admin|Admin` and the parser would extract a spoofed `role` and `userId`. This is cosmetic-only — the Daily.co token's `is_owner` flag (set server-side) is the real authority for drag permissions and `moveUser` validation — but it could cause incorrect role badges or identicons. Fix by stripping `|` from `displayName` before encoding, or switching to JSON encoding.
