# Voice Chat Architecture

Daily.co-powered spatial voice (and optional video) chat for gedus, admins, and gamers, with screen sharing, per-participant volume control, and moderator controls.

## Overview

Voice rooms are linked 1:1 to product groups — each group gets a dedicated room that opens/closes automatically based on the product's weekly schedule. Two always-open special rooms (Admin Lounge, Gedu Lounge) are seeded in the migration. Access control is enrollment-based: gamers can only see and join rooms for groups they're enrolled in, gedus see rooms for their assigned groups, and admins see everything.

The spatial canvas lets participants drag avatars into zones (breakout rooms, broadcast) for zone-based audio isolation.

## Component Map

```
Pages
├── /admin/voice    → VoiceRoomDashboard (all rooms visible)
├── /gedu/voice/[id] → VoiceSessionPage (accessed from Groups page, not a room list)
└── /gamer/voice    → VoiceRoomDashboard (enrolled group rooms only)

Shared voice components (src/components/voice/)
├── VoiceSessionPage    — Standalone voice page: auto-joins by room ID, role-agnostic (backHref pattern)
├── VoiceRoomDashboard  — Unified dashboard: room list or in-session spatial view
├── VoiceRoomCard       — Card for each room (always-open, live, or upcoming)
├── VoiceRoomProvider   — React context orchestrator (composes internal hooks)
├── SpatialVoiceRoom    — In-session layout: screen share + canvas + controls + participants
├── SpatialCanvas       — Renders zones + draggable avatars on a 21:9 canvas
├── DraggableAvatar     — Pointer-drag avatar with speaking glow (rAF + AnalyserNode)
├── VoiceAvatar         — Presentational avatar (identicon/video, mic status, name label)
├── Zone                — Renders a named zone rectangle on the canvas
├── VoiceControls       — Mic/camera/screen-share toggles, lock indicators, mic level
├── ScreenShareDisplay  — Renders screen share video with sharer badge and stop button
├── ParticipantList     — Always-visible list: speaking indicator, volume slider, mod controls
└── MicLevelIndicator   — Real-time mic input level bar (Web Audio API)

Internal hooks (src/components/voice/hooks/)
├── types.ts                  — Shared types (VoiceParticipant, LockState, AppMessage, etc.)
├── use-audio-pipeline.ts     — Audio element playback, volume multipliers, AnalyserNodes, routing
├── use-spatial-positions.ts  — Position tracking, zone detection, move, spatial app messages
├── use-screen-share.ts       — Screen sharer detection, start/stop, auto-replace
└── use-moderator-controls.ts — Mute, lock/unlock, lock state sync, moderator app messages

Global hooks
├── src/hooks/use-voice-session.ts       — Session logic (room lists, join/leave, auto-leave)
└── src/hooks/use-voice-room-realtime.ts — Supabase Realtime → query invalidation

API routes (src/app/api/voice/)
└── token/route.ts  — POST (access control + Daily.co meeting token)

Service layer (src/services/voice/)
├── voice.service.ts  — VoiceService class (RPC + session window computation)
├── voice.queries.ts  — React Query hooks (useAvailableVoiceRooms, useVoiceToken)
└── index.ts          — Barrel exports

Utilities
├── src/lib/voice-schedule.ts   — computeSessionWindow() (shared server/client)
├── src/lib/constants/voice.ts  — SESSION_WINDOW_BEFORE/AFTER, TOKEN_EXPIRY, etc.
├── src/lib/daily.ts            — Daily.co REST API wrapper (server-only)

Spatial config (src/lib/constants/)
├── spatial.ts        — Types, pure functions (zone detection, overlap, gain calc)
└── spatial.config.ts — Canvas dimensions, zone rects, avatar size, colors
```

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

**RPC:** `get_available_voice_rooms()` (SECURITY DEFINER) returns role-filtered rooms with schedule data joined from products. Admins see all rooms, gedus see gedu lounge + own group rooms, gamers see enrolled group rooms only. For gamers, the RPC also returns `enrolled_at` (from `group_enrollments.created_at`) so the client can determine whether a mid-session enrollment should display as "Upcoming" instead of "Live".

## Schedule-Driven Room Windows

Voice rooms don't have an "open/closed" status column. Instead, each group room inherits its schedule from the linked product (`day_of_week`, `start_time`, `timezone`, `duration_minutes`).

**Session window** = `[sessionStart - BEFORE, sessionEnd + AFTER]` (configurable in `src/lib/constants/voice.ts`)

The `computeSessionWindow()` utility (in `src/lib/voice-schedule.ts`) determines if a room is currently open. It reuses `getNextSessionStart()` from `src/lib/enrollment.ts` and also checks the previous week's occurrence to handle "currently in session" state.

**Client-side:** The service layer maps each room through `computeSessionWindow()` to get `isOpen`, `nextSessionStart`, and `windowClosesAt` for UI display (Live/Upcoming badges, countdown).

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

### Audio element + Web Audio hybrid
Audio playback uses `<audio>` elements for reliable WebRTC track output. A Web Audio graph exists solely for speaking-glow visualization:

```
<audio>.srcObject = MediaStream([track])
createMediaElementSource(element) → AnalyserNode → AudioContext.destination
```

**Chrome bypasses the Web Audio graph for output** when `createMediaElementSource` is used with a MediaStream `srcObject`. The graph exists solely for the AnalyserNode (speaking glow) — it must terminate at `ctx.destination` for data to flow. All audible control (`element.volume`) is applied outside the graph. See `docs/chrome-webrtc-volume-bug.md` for the full investigation.

### AudioContext lifecycle
Browsers create AudioContext in a suspended state until a user gesture resumes it. `manageAudioNodes()` always `await ctx.resume()` before connecting any node to the destination. Without this, nodes would connect to a still-suspended context and produce no audio output.

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

### Viewing rooms
1. `VoiceRoomDashboard` renders `VoiceRoomDashboardInner` inside `VoiceRoomProvider`
2. `useVoiceSession()` calls `useAvailableVoiceRooms()` → `get_available_voice_rooms` RPC
3. Each room is mapped through `computeSessionWindow()` to compute `isOpen` and `nextSessionStart`
4. Rooms are sorted: always-open first, then live group rooms, then upcoming group rooms
5. Supabase Realtime on `voice_rooms` + `group_enrollments` invalidates the cache

### Joining a room
1. User clicks Join on a `VoiceRoomCard`
2. `joinRoom()` → `POST /api/voice/token` with `roomId`
3. Token endpoint validates role, membership, and session window
4. Lazy-creates Daily.co room if needed
5. Issues a meeting token with `isOwner` (which also controls `enable_screenshare`) and `exp`
6. `VoiceRoomProvider.join()` connects to the Daily.co room

### Auto-leave triggers
1. **Room disappears** from available list → auto-leave + "session ended" message
2. **Session window expires** → periodic `computeSessionWindow()` check → graceful leave
3. **Token expires** → Daily.co hard disconnect (backup if client-side check misses it)

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

### Live countdown for upcoming sessions
The `NextSession` component computes "Next session in X days/hours" once on render. When a session is minutes away, a live-updating countdown (re-computing every ~30s) would give better feedback that the room is about to open.

### Volume amplification above 100%
Currently capped at 100% due to a Chrome limitation with WebRTC MediaStream sources (see `docs/chrome-webrtc-volume-bug.md`). If Chrome fixes [the underlying bug](https://issues.chromium.org/issues/40184923), GainNode amplification through the existing Web Audio graph would "just work" — the only code change needed would be raising the slider max and volume clamp. Alternatively, if Daily.co adds per-subscriber server-side audio processing to their SFU, that would bypass the client-side limitation entirely.

### Sanitize pipe delimiter from display names in token userName
The token endpoint encodes `userId|role|displayName` as a pipe-delimited string in Daily.co's `user_name` field. If a user's `display_name` contains `|`, the client-side parser (`mapParticipant`) handles it correctly by re-joining slots 2+. However, a user could set their display name to e.g. `fakeId|admin|Admin` and the parser would extract a spoofed `role` and `userId`. This is cosmetic-only — the Daily.co token's `is_owner` flag (set server-side) is the real authority for drag permissions and `moveUser` validation — but it could cause incorrect role badges or identicons. Fix by stripping `|` from `displayName` before encoding, or switching to JSON encoding.
