# Shared Group Components — Reuse Guide

This doc explains the shared, role-agnostic components built for the gedu groups page and how to reuse them for admin, customer/parent, and gamer dashboards. Delete this doc once all roles have adopted the pattern.

## Shared Components

All live in `src/components/ui/` and are role-agnostic — they accept plain props, not role-specific data types.

### `GroupCard` (`group-card.tsx`)

A clickable card showing a group's product name, gedu name, gamer count, schedule, and voice status. Clicking navigates to a detail page; the Join button navigates to a voice session.

Props:
- `productName`, `geduName`, `gamerCount` — display data
- `schedule: { localDay, localTime, tzAbbrev }` — use `formatScheduleLocal()` to convert from DB fields
- `voiceIsOpen` — whether the session is currently joinable (includes 5-min buffer)
- `voiceNextSessionStart` — next session `Date` for countdown display
- `locale` — for date formatting
- `joinHref` — voice session route (e.g., `/gedu/voice/[roomId]`)
- `detailHref` — group detail route (e.g., `/gedu/groups/[groupId]`)

Behavior:
- When live: primary gradient border, Live badge, Join button, "Session in progress" or countdown
- When upcoming: countdown with warning color (< 12h) or muted color
- Countdown auto-updates every 60 seconds via `GroupVoiceStatus`

### `GroupVoiceStatus` (`group-card.tsx`)

Self-updating status text line. Two states:
1. Countdown visible → "Next session Thu, Mar 12, 5:30 PM (starts in 4 hours)"
2. No countdown → "Session in progress"

No null state — a group always has a schedule, so there's always one of these two.

Props: `nextSessionStart`, `locale`. No `isOpen` — the component doesn't need to know about live state.

### `LoungeCard` (`lounge-card.tsx`)

Banner card for always-open voice lounges. Primary gradient border, "Always Open" badge, Join button.

Props: `name`, `description`, `joinHref` (null = loading spinner on button).

### `JoinButton` (`join-button.tsx`)

Shared Join button with fixed `w-20` width across all cards and pages. Prevents layout shift.

Props: `href`, `disabled`, `loading`, `stopPropagation`.

### `VoiceSessionPage` (`src/components/voice/VoiceSessionPage.tsx`)

Role-agnostic voice session wrapper. Takes `roomId` and `backHref`. Fetches token, joins room, renders spatial view.

## How to Add Groups to a New Role

### 1. Create the groups RPC (if needed)

The gedu uses `get_gedu_groups()` which filters by `pg.gedu_id = auth.uid()`. Other roles need different filters:

| Role | Filter | Notes |
|---|---|---|
| Admin | No filter (all groups) | May want to filter by product or show all |
| Customer/Parent | `ge.gamer_id IN (SELECT gamer_id FROM gamer_links WHERE customer_id = auth.uid())` | Groups containing the customer's linked gamers |
| Gamer | `ge.gamer_id = auth.uid()` | Groups the gamer is enrolled in |

The RPC should return the same columns as `get_gedu_groups()` (including `gedu_display_name` and `voice_room_id`) since the shared `GroupCard` expects all of them. JOIN `voice_rooms` in the RPC so `voice_room_id` is always available — don't cross-reference with `useAvailableVoiceRooms()` client-side.

### 2. Add service + query hook

Follow the pattern in `src/services/groups/`:
- Add a method to `GroupsService` (e.g., `getAdminGroups()`, `getGamerGroups()`)
- Add a query hook in `groups.queries.ts` (e.g., `useAdminGroups()`, `useGamerGroups()`)
- The reshaping logic (flat rows → nested groups) is identical — reuse the same Map pattern

### 3. Create the composition hook

Follow `src/hooks/use-gedu-groups-page.ts`:
- Compose your new groups query + `useLoungeRoomId("admin_only")` (or whichever lounge type)
- The RPC should return `voice_room_id` directly (JOIN `voice_rooms` in the RPC) — no client-side cross-referencing needed
- Run `computeSessionWindow()` for each group to get `voiceIsOpen` and `voiceNextSessionStart`
- Sort: live groups first, then upcoming by soonest `nextSessionStart`

### 4. Create the page components

Follow `src/components/gedu/GeduGroupsPageContent.tsx` and `GeduGroupDetailContent.tsx`:

**Groups list page:**
```tsx
<LoungeCard name="Admin Lounge" description="..." joinHref={...} />
<h2>Your Groups</h2>
{groups.map((group) => (
  <GroupCard
    productName={group.productName}
    geduName={group.geduName}
    gamerCount={group.gamers.length}
    schedule={formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale)}
    voiceIsOpen={group.voiceIsOpen}
    voiceNextSessionStart={group.voiceNextSessionStart}
    locale={locale}
    joinHref={ROUTES.admin.voice(group.voiceRoomId)}
    detailHref={`/admin/groups/${group.groupId}`}
  />
))}
```

**Detail page:**
- Header with product name + Live badge + always-visible `JoinButton` (disabled when not live)
- `GroupVoiceStatus` for the status text line
- Schedule card, gamer roster, etc. — role-specific details

**Voice session route:**
```tsx
// src/app/(dashboard)/admin/voice/[id]/page.tsx
<VoiceSessionPage roomId={id} backHref="/admin/groups" />
```

### 5. Update navigation

- Add routes to `src/lib/constants/routes.ts`
- Update sidebar in `src/components/layout/sidebar.tsx`

## Role-Specific Differences

| Aspect | Gedu | Admin | Customer/Parent | Gamer |
|---|---|---|---|---|
| Lounge | Gedu Lounge (`gedu_only`) | Admin Lounge (`admin_only`) | None | None |
| Group filter | Assigned as gedu | All (or filtered) | Linked gamer enrolled | Self enrolled |
| Detail page extras | Gamer roster | Gamer roster + edit | Child's group info | Own schedule |
| Voice join | Yes | Yes | No (view only) | Yes |

## Cleanup When All Roles Are Migrated

Once all roles access voice rooms through their groups page (not the old voice room list), remove:

### Files to delete
- `src/components/voice/VoiceRoomCard.tsx` — replaced by shared `GroupCard`
- `src/components/voice/VoiceRoomDashboard.tsx` — replaced by groups page per role
- `src/components/ui/next-session.tsx` — replaced by `GroupVoiceStatus` (if no other consumers)
- `src/hooks/use-voice-session.ts` — the sorting and join/leave logic moves into per-role hooks + `VoiceSessionPage`
- Old voice room list pages (e.g., `/gedu/voice/page.tsx` if it still exists)

### Files to check for dead imports
- `src/services/voice/` — `useAvailableVoiceRooms()` may still be used by legacy voice pages; check before removing. `useLoungeRoomId()` is the replacement for lounge room lookups.
- `src/components/voice/index.ts` — remove barrel exports for deleted components

### Verification
1. Search for imports of deleted components: `grep -r "VoiceRoomCard\|VoiceRoomDashboard\|NextSession\|use-voice-session" src/`
2. Run `npm run lint` and `npm run type-check` to catch any broken references
3. Run `npm run test` to verify no test imports the old components
4. Check the admin UI Components page still renders correctly

### This doc
Delete `docs/shared-group-components.md` after cleanup is complete.

## Style Guide

All shared components have demos on the admin UI Components page (`/admin/ui-components`). The GroupCard demos show all voice states: live, buffer window (live + countdown), and 4 countdown tiers. Reference these before customizing.
