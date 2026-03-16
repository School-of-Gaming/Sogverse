# Shared Group Components

Role-agnostic components and hooks used by the admin, gedu, and gamer groups pages. Each role's page is a thin wrapper (~15 lines) that passes role-specific configuration to these shared building blocks.

## Architecture

```
Role wrapper (e.g., AdminGroupsPageContent)
  → useMyGroups()              — single RPC, branches by role server-side
  → useGroupsWithVoice()       — enriches with session windows, sorts live-first
  → GroupsListContent          — renders lounge cards + group card list
      → LoungeCard             — always-open voice lounge banner
      → GroupCard              — clickable group card with voice status
          → GroupVoiceStatus   — self-updating countdown text

Role wrapper (e.g., AdminGroupDetailContent)
  → useGroupsWithVoice()       — same data, finds group by ID
  → GroupDetailContent         — header, voice join, gamer roster
      → JoinButton             — fixed-width join button
      → PadletLink             — external Padlet link
```

## Shared Components

### `GroupsListContent` (`src/components/groups/GroupsListContent.tsx`)

Top-level list page layout. Renders lounge cards, a heading, and the group card list with loading/error/empty states.

Props:
- `groups: GroupWithVoice[]` — enriched group data
- `isLoading`, `error` — query state
- `lounges: LoungeConfig[]` — zero or more lounge cards to render above the list
- `heading`, `subheading`, `emptyText` — role-specific copy
- `voiceRoute: (roomId) => string` — voice session URL builder
- `detailRoute: (groupId) => string` — group detail URL builder

### `GroupDetailContent` (`src/components/groups/GroupDetailContent.tsx`)

Group detail page layout. Shows product name, game badge, live status, schedule, padlet link, voice join button, and gamer roster.

Props:
- `groups: GroupWithVoice[]`, `groupId` — finds the group from the shared query
- `isLoading`, `error` — query state
- `backHref` — back link to the groups list
- `voiceRoute: (roomId) => string` — voice session URL builder

The roster adapts to data availability: when `gamer.dateOfBirth` and `gamer.gender` are present (admin/gedu), it shows age and gender. When null (gamer role — DOB/gender stripped server-side for privacy), it shows names only.

### `GroupCard` (`src/components/ui/group-card.tsx`)

Clickable card showing a group's product name, gedu name, gamer count, schedule, and voice status. Clicking navigates to the detail page; the Join button navigates to the voice session.

Props:
- `productName`, `geduName`, `gamerCount` — display data
- `schedule: { localDay, localTime, tzAbbrev }` — use `formatScheduleLocal()` to convert from DB fields
- `voiceIsOpen` — whether the session is currently joinable (includes buffer window)
- `voiceNextSessionStart` — next session `Date` for countdown display
- `locale` — for date formatting
- `joinHref` — voice session route
- `detailHref` — group detail route

Behavior:
- When live: primary gradient border, Live badge, Join button, "Session in progress" or countdown
- When upcoming: countdown with warning color (< 12h) or muted color
- Countdown auto-updates every 60 seconds via `GroupVoiceStatus`

### `GroupVoiceStatus` (`src/components/ui/group-card.tsx`)

Self-updating status text line. Two states:
1. Countdown visible: "Next session Thu, Mar 12, 5:30 PM (starts in 4 hours)"
2. No countdown: "Session in progress"

A group always has a schedule, so there's always one of these two states.

Props: `nextSessionStart`, `locale`.

### `LoungeCard` (`src/components/ui/lounge-card.tsx`)

Banner card for always-open voice lounges. Primary gradient border, "Always Open" badge, Join button.

Props: `name`, `description`, `joinHref` (null = loading spinner on button).

### `JoinButton` (`src/components/ui/join-button.tsx`)

Fixed `w-20` width join button used across all cards and pages. Prevents layout shift.

Props: `href`, `disabled`, `loading`, `stopPropagation`.

### `VoiceSessionPage` (`src/components/voice/VoiceSessionPage.tsx`)

Role-agnostic voice session wrapper. Takes `roomId` and `backHref`. Auto-joins the Daily.co room on mount, renders the spatial voice room, and auto-kicks when the session window closes.

Each role has a thin route wrapper (`/{role}/voice/[id]/page.tsx`) that computes the appropriate `backHref` from `searchParams.groupId`.

## Shared Hooks

### `useGroupsWithVoice()` (`src/hooks/use-groups-page.ts`)

Enriches a groups query result with voice session window state. Accepts any `UseQueryResult<GeduGroup[], Error>` (from `useMyGroups()`).

Returns `{ groups: GroupWithVoice[], isLoading, error }` where each group has:
- `voiceIsOpen: boolean` — is the session window currently open?
- `voiceNextSessionStart: Date` — when is the next (or current) session?

Groups are sorted live-first, then by soonest upcoming session.

A 30-second tick timer (`SESSION_TICK_MS`) periodically updates session window computations so Live badges and Join buttons transition in real-time without waiting for a data refetch.

### `useGeduGroupsPage()` (`src/hooks/use-gedu-groups-page.ts`)

Gedu-specific composition: `useGroupsWithVoice(useMyGroups())` + `useLoungeRoomId("gedu_only")`. Returns groups, lounge room ID, loading state, and error.

## Role Wrappers

Each role has two thin wrapper components (~15 lines each) that pass role-specific configuration:

| Role | List wrapper | Detail wrapper | Lounges |
|---|---|---|---|
| Admin | `AdminGroupsPageContent` | `AdminGroupDetailContent` | Admin Lounge + Gedu Lounge |
| Gedu | `GeduGroupsPageContent` | `GeduGroupDetailContent` | Gedu Lounge |
| Gamer | `GamerGroupsPageContent` | `GamerGroupDetailContent` | None |

Role-specific config passed to shared components:
- **Lounges:** Admin gets both, gedu gets one, gamer gets none
- **Routes:** `voiceRoute` and `detailRoute` use each role's route constants
- **Copy:** Heading ("All Groups" / "Your Groups" / "My Groups"), subheading, empty state text

## Style Guide

All shared components have demos on the admin UI Components page (`/admin/ui-components`). The GroupCard demos show all voice states: live, buffer window (live + countdown), and 4 countdown tiers. Reference these before customizing.
