# Voice Chat Architecture

Daily.co-powered spatial voice (and optional video) chat for gedus, admins, and gamers.

## Overview

An admin or gedu opens a voice room, which creates a Daily.co room and a `voice_rooms` row in Supabase. All roles can browse and join open rooms. The spatial canvas lets participants drag avatars into zones (breakout rooms, broadcast) for zone-based audio isolation. When the host ends the session, participants are auto-disconnected via Supabase Realtime.

## Component Map

```
Pages
├── /admin/voice → VoiceRoomPanel (start/end session, browse/join rooms, spatial canvas)
├── /gedu/voice  → VoiceRoomPanel (start/end session, browse/join rooms, spatial canvas)
└── /gamer/voice → VoiceRoomList  (browse open rooms, join, spatial canvas)

Shared voice components (src/components/voice/)
├── VoiceRoomProvider  — React context: Daily.co call, spatial positions, audio routing
├── SpatialVoiceRoom   — In-session layout: canvas + controls + leave/end buttons
├── SpatialCanvas      — Renders zones + draggable avatars on a 21:9 canvas
├── DraggableAvatar    — Pointer-drag avatar with speaking glow (rAF + AnalyserNode)
├── VoiceAvatar        — Presentational avatar (identicon/video, mic status, name label)
├── Zone               — Renders a named zone rectangle on the canvas
├── VoiceControls      — Mic/camera toggle, mic level meter
├── ParticipantList    — Avatars + audio/video/speaking indicators (legacy, non-spatial)
├── VideoTile          — Renders a participant's camera feed (legacy, non-spatial)
└── MicLevelIndicator  — Real-time mic input level bar (Web Audio API)

Hooks
├── src/hooks/use-voice-session.ts       — Shared session logic (join/leave/reconnect)
└── src/hooks/use-voice-room-realtime.ts — Supabase Realtime → query invalidation

API routes (src/app/api/voice/)
├── room/route.ts   — POST (open/create room), PATCH (close room)
└── token/route.ts  — POST (issue Daily.co meeting token)

Service layer (src/services/voice/)
├── voice.service.ts  — VoiceService class (DB queries + API fetches)
├── voice.queries.ts  — React Query hooks (useOpenVoiceRooms, useMyVoiceRoom, etc.)
└── index.ts          — Barrel exports

Spatial config (src/lib/constants/)
├── spatial.ts        — Types, pure functions (zone detection, overlap, gain calc)
├── spatial.config.ts — Canvas dimensions, zone rects, avatar size, colors
└── voice.ts          — TOKEN_EXPIRY, MAX_PARTICIPANTS, POLL_INTERVAL

Supporting
├── src/lib/daily.ts  — Daily.co REST API wrapper (server-only)
```

## Data Flow

### Host (admin/gedu) starts a session
1. `VoiceRoomPanel` calls `useVoiceSession({ canCreate: true })` → `startSession()`
2. `useOpenRoom` mutation → `POST /api/voice/room` creates/reopens a Daily.co room + upserts `voice_rooms` row (status = open)
3. `useVoiceToken` → `POST /api/voice/token` issues an owner token (camera + mic + moderation)
4. `VoiceRoomProvider.join()` dynamically imports `@daily-co/daily-js`, creates a call object, joins, and places avatar in the general zone

### Participant joins a session
1. Room browser (in both `VoiceRoomList` and `VoiceRoomPanel`) polls open rooms via `useOpenVoiceRooms` (backed by `get_open_voice_rooms()` RPC)
2. Supabase Realtime also invalidates the query on any `voice_rooms` change
3. User clicks Join → `POST /api/voice/token` issues a token (owner for admin/gedu, non-owner for gamer)
4. `VoiceRoomProvider.join()` connects to the Daily.co room, requests positions from existing participants via app message

### Spatial audio routing
1. Participants drag avatars on the canvas → `moveLocal`/`moveOther` broadcast position via Daily.co `sendAppMessage`
2. `updateAudioRouting()` sets `<audio>` element volume per remote participant based on zone membership
3. Same zone or broadcast zone = full volume; different zones = silent

### Host ends a session
1. `SpatialVoiceRoom` calls `endSession()` → `leave()` then `useCloseRoom` → `PATCH /api/voice/room`
2. API route sets status = closed → Supabase Realtime fires
3. Other participants detect the room disappeared from the open list → auto-calls `leave()`

## Database Schema

```sql
voice_rooms (
  id              UUID PK,
  creator_id      UUID FK → profiles(id) UNIQUE,  -- one room per creator
  name            TEXT,
  daily_room_name TEXT UNIQUE,
  status          voice_room_status ('open' | 'closed'),
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

**RLS policies:** Admin has full access. Gedu has full access to own room + read access to all rooms. Gamer has read-only access. All policies use `get_user_role()` (SECURITY DEFINER) to avoid recursive RLS.

**Realtime:** Table has `REPLICA IDENTITY FULL` so UPDATE/DELETE events are delivered through RLS.

**Helper function:** `get_open_voice_rooms()` (SECURITY DEFINER) joins `voice_rooms` with `profiles` to return creator display names and roles.

## Role Permissions

| Capability | Admin | Gedu | Gamer |
|---|---|---|---|
| Create/manage rooms | Own room | Own room | - |
| Close any room | Yes (by roomId) | Own room only | - |
| Join any open room | Yes (owner token) | Yes (owner token) | Yes (non-owner token) |
| Camera | Yes | Yes | Yes |
| Microphone | Yes | Yes | Yes |
| Drag other avatars | Yes | Yes | Own only |
| Enter broadcast zone | Yes | Yes | No (ejected to nearest edge) |

## Environment Variables

| Variable | Side | Purpose |
|---|---|---|
| `DAILY_API_KEY` | Server | Daily.co REST API authentication |
| `NEXT_PUBLIC_DAILY_DOMAIN` | Both | Daily.co subdomain for room URLs |

## Future Improvements

### Extract shared auth/role-check helper for API routes
Both voice API routes (and other existing routes) repeat the same ~15-line pattern: `createClient()` → `getUser()` → query profile → check role → return 401/403. A shared helper like `getAuthenticatedProfile(allowedRoles: string[])` would reduce boilerplate and keep authorization logic consistent as more endpoints are added.

### Use generated Profile type in API routes instead of manual type assertions
The API routes cast profile query results with inline types (`as { role: string; display_name: string | null; ... }`). Importing the generated `Profile` type from `@/types` would be safer and stay in sync with schema changes automatically.

### Clean up idle Daily.co rooms
Closing a session marks the DB row as closed but leaves the Daily.co room alive (it gets reused on next open). If Daily.co plan limits become a concern, add either:
- Delete-on-close (simple, but adds latency on next open)
- A periodic cleanup job that deletes Daily.co rooms for long-closed sessions

### Add participant tracking to the database
Currently participant presence is only tracked in Daily.co's runtime. Persisting join/leave events to a `voice_room_participants` table would enable:
- Session history and analytics
- Participant count displayed without joining the call
- Billing/usage tracking per gamer

### Customer (parent) subscription gate
The token route has a `// Future: check parent subscription here` comment. Before going to production, gamers should only be able to join if their linked customer has an active subscription.

### Extract VoiceRoomProvider into smaller hooks
The provider (~600 lines) handles call lifecycle, audio playback, audio analysis, spatial positions, app messaging, and audio routing. Consider extracting `useSpatialPositions` and `useAudioAnalysis` as internal hooks to improve maintainability.
