# Voice Chat Architecture

Daily.co-powered voice (and optional video) chat between gedus and gamers.

## Overview

A gedu opens a voice room, which creates a Daily.co room and a `voice_rooms` row in Supabase. Gamers see open rooms in a list and can join. When the gedu ends the session, gamers are auto-disconnected via Supabase Realtime.

## Component Map

```
Pages
├── /gedu/voice  → VoiceRoomPanel (start/end session, self-video, participant list)
└── /gamer/voice → VoiceRoomList  (browse open rooms, join, view gedu video)

Shared voice components (src/components/voice/)
├── VoiceRoomProvider  — React context wrapping Daily.co call object
├── VoiceControls      — Mic/camera toggle, leave button, mic level meter
├── ParticipantList    — Avatars + audio/video/speaking indicators
├── VideoTile          — Renders a participant's camera feed
└── MicLevelIndicator  — Real-time mic input level bar (Web Audio API)

API routes (src/app/api/voice/)
├── room/route.ts   — POST (open/create room), PATCH (close room)
└── token/route.ts  — POST (issue Daily.co meeting token)

Service layer (src/services/voice/)
├── voice.service.ts  — VoiceService class (DB queries + API fetches)
├── voice.queries.ts  — React Query hooks (useOpenVoiceRooms, useMyVoiceRoom, etc.)
└── index.ts          — Barrel exports

Supporting
├── src/lib/daily.ts                    — Daily.co REST API wrapper (server-only)
├── src/lib/constants/voice.ts          — TOKEN_EXPIRY, MAX_PARTICIPANTS, POLL_INTERVAL
└── src/hooks/use-voice-room-realtime.ts — Supabase Realtime → query invalidation
```

## Data Flow

### Gedu starts a session
1. `VoiceRoomPanel` calls `useOpenRoom` mutation → `POST /api/voice/room`
2. API route creates/reopens a Daily.co room + upserts `voice_rooms` row (status = open)
3. API route returns room data → panel calls `useVoiceToken` → `POST /api/voice/token`
4. Token route issues an owner token (camera + mic enabled)
5. `VoiceRoomProvider.join()` dynamically imports `@daily-co/daily-js`, creates a call object, and joins

### Gamer joins a session
1. `VoiceRoomList` polls open rooms via `useOpenVoiceRooms` (backed by `get_open_voice_rooms()` RPC)
2. Supabase Realtime also invalidates the query on any `voice_rooms` change
3. Gamer clicks Join → `POST /api/voice/token` issues a non-owner token (mic only, no camera)
4. `VoiceRoomProvider.join()` connects to the same Daily.co room

### Gedu ends a session
1. `VoiceRoomPanel` calls `leave()` then `useCloseRoom` → `PATCH /api/voice/room`
2. API route sets status = closed → Supabase Realtime fires
3. Gamer's `VoiceRoomList` detects the room disappeared from the open list → auto-calls `leave()`

## Database Schema

```sql
voice_rooms (
  id              UUID PK,
  gedu_id         UUID FK → profiles(id) UNIQUE,  -- one room per gedu
  name            TEXT,
  daily_room_name TEXT UNIQUE,
  status          voice_room_status ('open' | 'closed'),
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ
)
```

**RLS policies:** Admin has full access. Gedu has full access to own room. Gamer has read-only access. All policies use `get_user_role()` (SECURITY DEFINER) to avoid recursive RLS.

**Realtime:** Table has `REPLICA IDENTITY FULL` so UPDATE/DELETE events are delivered through RLS.

**Helper function:** `get_open_voice_rooms()` (SECURITY DEFINER) joins `voice_rooms` with `profiles` to return gedu display names.

## Role Permissions

| Capability | Admin | Gedu | Gamer |
|---|---|---|---|
| Create/manage rooms | - | Own room only | - |
| Join any room | Yes (owner token) | Own room (owner token) | Open rooms (non-owner token) |
| Camera | Yes | Yes | No |
| Microphone | Yes | Yes | Yes |

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
