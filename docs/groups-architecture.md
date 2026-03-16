# Groups Architecture

Admin-managed groups that assign a gedu (game educator) to a set of gamers within a product, with role-based viewing for admins, gedus, and gamers.

## Overview

Each product can have multiple groups. Each group has exactly one gedu and zero or more enrolled gamers. Admins manage groups through a batch-editing UI: they stage changes locally (add groups, reassign gedus, delete groups, drag-and-drop gamers between groups), review a change summary, and commit everything atomically via a single RPC. The server-side `commit_group_changes` function runs all mutations in one transaction — if any step fails, the entire batch rolls back.

A gamer can only be enrolled in one group per product (enforced by a trigger-based constraint). A gedu can only lead one group per product (enforced by a `UNIQUE(product_id, gedu_id)` constraint). When all groups are removed from a product, it is automatically hidden.

All three roles (admin, gedu, gamer) view groups through a shared page architecture with role-specific thin wrappers. A single `get_my_groups()` RPC branches by role to return the appropriate data.

## Component Map

### Admin Group Management (batch editing)

```
Pages
└── /admin/products/[id] → GeduGroupsCard (group list, drag-and-drop, commit bar)

Admin components (src/components/admin/)
├── GeduGroupsCard       — Top-level orchestrator: DndContext, group list, commit bar, add-group dialog
├── GroupCard            — Single droppable group card: gedu info, gamer chips, stats, delete/reassign
├── EnrolledGamerChip    — Draggable gamer chip with age/gender detail
├── GeduPickerDialog     — Searchable side sheet for selecting a gedu (add or reassign)
├── CommitBar            — Sticky bottom bar: pending change count, discard/commit buttons
├── ChangeSummaryDialog  — Confirmation dialog: color-coded change list with gamer/gedu names
└── VisibilityWarningBanner — Warning when product is hidden or has no groups

Hooks
└── src/hooks/use-group-editor.ts — Reducer-based editor state + pure derived computations

API routes (src/app/api/admin/products/)
└── [id]/groups/route.ts — POST: batch commit (admin-only, delegates to commit_group_changes RPC)
```

### Groups Viewing (all roles)

```
Pages
├── /admin/groups       → AdminGroupsPageContent   → GroupsListContent
├── /admin/groups/[id]  → AdminGroupDetailContent   → GroupDetailContent
├── /gedu/groups        → GeduGroupsPageContent     → GroupsListContent
├── /gedu/groups/[id]   → GeduGroupDetailContent    → GroupDetailContent
├── /gamer/groups       → GamerGroupsPageContent    → GroupsListContent
├── /gamer/groups/[id]  → GamerGroupDetailContent   → GroupDetailContent
└── /{role}/voice/[id]  → VoiceSessionPage (shared, role-agnostic)

Shared components (src/components/groups/)
├── GroupsListContent   — Lounge cards + group card list with loading/error/empty states
└── GroupDetailContent  — Group header, voice status, gamer roster (adapts to data availability)

Shared UI (src/components/ui/)
├── GroupCard           — Clickable card: product name, gedu, gamer count, schedule, voice status
├── GroupVoiceStatus    — Self-updating countdown/live status text
├── LoungeCard          — Always-open voice lounge banner card
└── JoinButton          — Fixed-width join button with loading state

Role wrappers (src/components/{role}/)
├── AdminGroupsPageContent / AdminGroupDetailContent
├── GeduGroupsPageContent  / GeduGroupDetailContent
└── GamerGroupsPageContent / GamerGroupDetailContent

Hooks
├── src/hooks/use-groups-page.ts      — useGroupsWithVoice(): shared enrichment (session windows, sorting)
└── src/hooks/use-gedu-groups-page.ts — Gedu-specific: composes useMyGroups() + gedu lounge lookup

Service layer (src/services/groups/)
├── groups.service.ts  — GroupsService class (RPC queries + reshaping)
├── groups.queries.ts  — React Query hooks (useProductGroups, useMyGroups)
└── index.ts           — Barrel exports
```

## Data Flow

### Admin loads a product page (batch editing)

1. `GeduGroupsCard` renders with `productId`
2. `useProductGroups(productId)` calls the `get_product_groups_with_details` RPC (SECURITY DEFINER, admin-only)
3. `GroupsService.getProductGroups()` reshapes the flat RPC rows into nested `ProductGroup[]` (group → gamers)
4. `useGroupEditor(serverGroups)` initializes an empty reducer state — no staged changes yet
5. `computeEffectiveGroups()` returns the server groups as-is

### Admin stages changes

All edits are local — no server calls until commit.

1. **Add group:** Admin opens `GeduPickerDialog`, picks a gedu → `ADD_GROUP` action → temp ID generated
2. **Reassign gedu:** Admin clicks reassign on a group, picks a new gedu → `UPDATE_GROUP_GEDU` action
3. **Delete group:** Admin clicks delete (only enabled when group has no gamers) → `DELETE_GROUP` action
4. **Move gamer:** Admin drags a gamer chip to a different group → `MOVE_GAMER` action

Each action updates the reducer state. `computeEffectiveGroups()` derives the UI state by applying staged changes to server groups. `buildChangeSummary()` generates human-readable change descriptions.

### Admin commits changes

1. Admin clicks "Commit Changes" → `CommitBar` opens `ChangeSummaryDialog`
2. Admin reviews the color-coded summary and clicks "Confirm"
3. `useCommitGroupChanges` mutation fires → `POST /api/admin/products/[id]/groups` with `BatchGroupChanges`
4. API route verifies admin role, checks product exists, calls `commit_group_changes` RPC
5. RPC runs atomically: delete moved enrollments → delete groups → insert new groups → update gedu assignments → insert new enrollments → auto-hide check
6. API route fetches refreshed groups and returns them
7. React Query cache invalidates `["groups", "product", productId]` and `["products"]` (auto-hide may change visibility)
8. On success, `RESET` action clears all staged changes

### Commit RPC step ordering

The `commit_group_changes` RPC executes steps in a specific order to satisfy FK constraints:

1. **Delete enrollments** from source groups (moves out) — must happen before group deletion because of `ON DELETE RESTRICT`
2. **Delete groups** — now safe because moved enrollments are gone
3. **Insert new groups** — builds a `tempId → realId` map for resolving temp IDs in enrollment moves
4. **Update existing groups** — gedu reassignments
5. **Insert enrollments** into destination groups — resolves temp IDs via the map
6. **Auto-hide check** — if no groups remain, set `is_visible = false` on the product

### Any role views their groups

1. Role wrapper calls `useMyGroups()` → `get_my_groups()` RPC (branches by role server-side)
2. `GroupsService.getMyGroups()` reshapes flat RPC rows into nested `GeduGroup[]`
3. `useGroupsWithVoice()` enriches each group with `computeSessionWindow()` → `voiceIsOpen` + `voiceNextSessionStart`
4. Groups are sorted: live first, then upcoming by soonest session start
5. A 30-second tick timer re-evaluates session windows so Live badges and Join buttons update in real-time
6. Role wrapper passes enriched groups + role-specific config (lounges, routes, headings) to shared `GroupsListContent`

### Group detail page

1. Same data source as the list page (shared query, found by `groupId`)
2. `GroupDetailContent` renders header, voice status, and gamer roster
3. Roster adapts to data: shows age + gender when available (admin/gedu), names-only when null (gamer — DOB/gender stripped server-side)
4. Join button links to `/{role}/voice/{roomId}?groupId={groupId}` so the back button returns to the detail page

## Database Schema

### `product_groups`
```sql
product_groups (
  id            UUID PK DEFAULT gen_random_uuid(),
  product_id    UUID FK → products(id) NOT NULL,
  gedu_id       UUID FK → profiles(id) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, gedu_id)  -- one group per gedu per product
)
```

### `group_enrollments`
```sql
group_enrollments (
  id        UUID PK DEFAULT gen_random_uuid(),
  group_id  UUID FK → product_groups(id) ON DELETE RESTRICT NOT NULL,
  gamer_id  UUID FK → profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, gamer_id)  -- a gamer appears once per group
)
```

### Cross-table uniqueness trigger

A gamer can only be enrolled in one group per product. Since this spans two tables (`group_enrollments` → `product_groups`), it is enforced by a `BEFORE INSERT` trigger (`enforce_unique_gamer_per_product`) rather than a native constraint.

### RPCs (SECURITY DEFINER)

| Function | Role Gate | Purpose |
|---|---|---|
| `get_product_groups_with_details(p_product_id)` | admin | Returns flat rows joining groups, gedus, enrollments, and gamer profiles for a specific product |
| `commit_group_changes(p_product_id, ...)` | admin | Atomic batch mutation of groups and enrollments, returns `{ autoHidden }` |
| `get_my_groups()` | admin, gedu, gamer | Returns groups for the calling user based on role (see below) |

**`get_my_groups()` role branching:**

| Role | Filter | Data |
|---|---|---|
| Admin | No filter (all groups) | Full gamer details (DOB, gender) |
| Gedu | `pg.gedu_id = auth.uid()` | Full gamer details (DOB, gender) |
| Gamer | Enrolled groups only (`group_enrollments WHERE gamer_id = auth.uid()`) | DOB and gender are NULL (privacy) |
| Customer | Raises `42501` permission error | — |

### RLS Policies

- **`product_groups`:** Admin has full CRUD. Authenticated users can SELECT groups for visible products.
- **`group_enrollments`:** Admin has full CRUD. Authenticated users can SELECT enrollments for visible products. `ON DELETE RESTRICT` prevents group deletion while gamers are enrolled.

### Migrations

| Migration | Description |
|---|---|
| `00007_groups_and_enrollments.sql` | `product_groups`, `group_enrollments`, `enrollment_charges` tables, `commit_group_changes` RPC (admin-gated), `get_product_groups_with_details` RPC, `check_unique_gamer_per_product` trigger |
| `00009_rls_and_grants.sql` | All RLS policies and table/function grants for groups |
| `00012_gedu_groups_rpc.sql` | `get_my_groups` RPC (multi-role, SECURITY DEFINER) |

## Client-Side State Management

The `useGroupEditor` hook uses a `useReducer` to track staged changes as a diff against server state:

```
GroupEditorState {
  addedGroups:      Array<{ tempId, geduId, geduDisplayName }>
  updatedGroups:    Array<{ groupId, geduId, geduDisplayName }>
  deletedGroupIds:  string[]
  enrollmentMoves:  Array<{ gamerId, fromGroupId, toGroupId }>
}
```

Two pure functions derive display state from `(serverGroups, editorState)`:

- **`computeEffectiveGroups()`** — merges server groups with staged changes to produce the UI-ready group list (with `isNew`, `isDeleted`, `isMoved` flags)
- **`buildChangeSummary()`** — generates human-readable change descriptions with typed segments (`text`, `gamer`, `gedu`, `warning`) for color-coded rendering

The `batchPayload` memo strips display-only fields (names) and passes only IDs to the API.

### Move semantics

When a gamer is moved A → B then B → C, the stored move becomes `{ from: A, to: C }` (preserving the original source). Moving back to the original group cancels the move entirely.

### Temp ID lifecycle

New groups receive `temp-N` IDs (module-level counter). These are sent to the RPC, which maps them to real UUIDs and uses the mapping to resolve enrollment move destinations.

## Role Permissions

| Capability | Admin | Customer | Gamer | Gedu |
|---|---|---|---|---|
| View groups (visible products) | Yes | Yes | Yes | Yes |
| View groups page (own groups) | Yes | - | Yes | Yes |
| Manage groups (CRUD) | Yes | - | - | - |
| Manage enrollments | Yes | - | - | - |

## Role-Specific Page Behavior

| Aspect | Admin | Gedu | Gamer |
|---|---|---|---|
| Groups shown | All groups | Assigned groups | Enrolled groups |
| Lounge cards | Admin Lounge + Gedu Lounge | Gedu Lounge | None |
| Gamer roster | Full (age, gender) | Full (age, gender) | Names only (DOB/gender stripped) |
| Voice join | Yes | Yes | Yes |
| Heading | "All Groups" | "Your Groups" | "My Groups" |

## Future Improvements

### Add error feedback on commit failure

When a commit fails, the change summary dialog has already closed and no error message is shown. The staged changes are preserved (the reducer is not reset), but the user has no indication that the commit failed or why. Options:
- Keep the dialog open during the mutation and show errors inline
- Show a toast/banner on the commit bar with the error message

### Add display_order reordering

The `commit_group_changes` RPC assigns `display_order` sequentially for new groups but does not support reordering existing groups. The `p_updated_groups` parameter only supports changing `geduId`. If group ordering becomes important, extend the parameter to accept `displayOrder` updates.

### Add Zod validation to the API route

The `POST /api/admin/products/[id]/groups` route destructures the request body with no schema validation. Malformed payloads produce cryptic Postgres errors. Adding Zod validation (already a project dependency) would give descriptive 400 errors.

### Disable editing while commit is in-flight

While the commit mutation is pending, the admin can still add groups, move gamers, etc. On success, `RESET` clears all staged changes — including any made after clicking Commit. Those changes are silently lost (they were never sent to the server). Disable the groups section (Add Group button, drag-and-drop, reassign/delete actions) while `isPending` to prevent this.

### Prevent gedu scheduling conflicts

A gedu can currently be assigned to groups across multiple products with no check for time conflicts. If products have scheduled sessions that overlap, a gedu could be double-booked. Add schedule conflict detection when assigning a gedu to a group.

### Add keyboard support for drag-and-drop

Only `PointerSensor` is configured in `GeduGroupsCard`. Keyboard-only users cannot move gamers between groups. Add `KeyboardSensor` from `@dnd-kit/core` alongside the existing sensor for accessibility.

### Reduce SQL duplication in `get_my_groups()`

The three role branches (admin, gedu, gamer) share nearly identical `SELECT`/`FROM`/`JOIN` clauses (~90 lines duplicated). If a column is added or a JOIN changes, all three branches must be updated in sync. Consider extracting the common query into a CTE or view — but only once the branches have stabilized, since admin and gedu may diverge (e.g., admin-only columns or gedu-only JOINs) and premature abstraction would make that harder.

### Customer/parent groups page

Add a groups page for customer role showing groups where their linked gamers are enrolled. Would use the same shared components with a new `get_my_groups` branch for `customer` role.
