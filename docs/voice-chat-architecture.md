# Voice Chat Architecture

Daily.co-powered spatial voice (and optional video) chat for gedus, admins, and gamers.

## Overview

Voice rooms are linked 1:1 to product groups — each group gets a dedicated room that opens/closes automatically based on the product's weekly schedule. Two always-open special rooms (Admin Lounge, Gedu Lounge) are seeded in the migration. Access control is enrollment-based: gamers can only see and join rooms for groups they're enrolled in, gedus see rooms for their assigned groups, and admins see everything.

The spatial canvas lets participants drag avatars into zones (breakout rooms, broadcast) for zone-based audio isolation.

## Component Map

```
Pages
├── /admin/voice → VoiceRoomDashboard (all rooms visible)
├── /gedu/voice  → VoiceRoomDashboard (gedu lounge + assigned group rooms)
└── /gamer/voice → VoiceRoomDashboard (enrolled group rooms only)

Shared voice components (src/components/voice/)
├── VoiceRoomDashboard — Unified dashboard: room list or in-session spatial view
├── VoiceRoomCard      — Card for each room (always-open, live, or upcoming)
├── VoiceRoomProvider  — React context: Daily.co call, spatial positions, audio routing
├── SpatialVoiceRoom   — In-session layout: canvas + controls + leave button
├── SpatialCanvas      — Renders zones + draggable avatars on a 21:9 canvas
├── DraggableAvatar    — Pointer-drag avatar with speaking glow (rAF + AnalyserNode)
├── VoiceAvatar        — Presentational avatar (identicon/video, mic status, name label)
├── Zone               — Renders a named zone rectangle on the canvas
├── VoiceControls      — Mic/camera toggle, mic level meter
└── MicLevelIndicator  — Real-time mic input level bar (Web Audio API)

Hooks
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
  creator_id      UUID FK → profiles(id),  -- nullable
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
| Drag other avatars | Yes | Yes | Own only |
| Enter broadcast zone | Yes | Yes | No |

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
5. Issues a meeting token with appropriate `isOwner` flag and `exp`
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

### Add participant tracking to the database
Currently participant presence is only tracked in Daily.co's runtime. Persisting join/leave events to a `voice_room_participants` table would enable session history, analytics, and participant count display without joining the call.

### Extract VoiceRoomProvider into smaller hooks
The provider handles call lifecycle, audio playback, audio analysis, spatial positions, app messaging, and audio routing. Consider extracting `useSpatialPositions` and `useAudioAnalysis` as internal hooks.
