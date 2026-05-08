# Groups Architecture

Admin-managed groups that assign a gedu (game educator) to a set of gamers within a product, with role-based viewing for all roles.

## Overview

Each product can have multiple groups. Each group has exactly one gedu and zero or more enrolled gamers. Admins manage groups through a batch-editing UI: they stage changes locally (add groups, reassign gedus, delete groups, drag-and-drop gamers between groups), review a change summary, and commit everything atomically via a single RPC. The server-side `commit_group_changes` function runs all mutations in one transaction — if any step fails, the entire batch rolls back.

A gamer can only be enrolled in one group per product (enforced by a trigger-based constraint). A gedu can only lead one group per product (enforced by a `UNIQUE(product_id, gedu_id)` constraint). When all groups are removed from a product, it is automatically hidden.

All four roles (admin, gedu, gamer, customer) view groups through a shared page architecture with role-specific thin wrappers. A single `get_my_groups()` RPC branches by role to return the appropriate data.

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
├── CommitFlowDialog     — Confirmation dialog: color-coded change list with gamer/gedu names
└── VisibilityWarningBanner — Warning when product is hidden or has no groups

Hooks
└── src/hooks/use-group-editor.ts — Reducer-based editor state + pure derived computations

API routes (src/app/api/admin/products/)
└── [id]/groups/route.ts — POST: batch commit (admin-only, delegates to commit_group_changes RPC)
```

### Groups Viewing (all roles)

```
Pages
├── /admin/groups        → AdminGroupsPageContent    → GroupsListContent
├── /admin/groups/[id]   → AdminGroupDetailContent    → GroupDetailContent
├── /gedu/groups         → GeduGroupsPageContent      → GroupsListContent
├── /gedu/groups/[id]    → GeduGroupDetailContent     → GroupDetailContent
├── /gamer/groups        → GamerGroupsPageContent     → GroupsListContent
├── /gamer/groups/[id]   → GamerGroupDetailContent    → GroupDetailContent
├── /customer/gamers     → CustomerGamersPage (GroupCards inline per gamer)
├── /customer/groups/[id]→ CustomerGroupDetailContent  → GroupDetailContent
└── /{role}/voice/[id]   → VoiceSessionPage (shared, role-agnostic)

Shared components (src/components/groups/)
├── GroupsListContent   — Lounge cards + group card list with loading/error/empty states
└── GroupDetailContent  — Product image, header, voice status, gamer roster, optional enrollment info
    Props: voiceRoute | onJoinClick (discriminated union), optional enrollment prop

Shared UI (src/components/ui/)
├── GroupCard           — Product image, product name, gedu, gamer count, schedule, voice status
├── GroupVoiceStatus    — Self-updating countdown/live status text
├── LoungeCard          — Always-open voice lounge banner card
└── JoinButton          — Fixed-width join button (Link via href | button via onClick, discriminated union)

Role wrappers (src/components/{role}/)
├── AdminGroupsPageContent  / AdminGroupDetailContent
├── GeduGroupsPageContent   / GeduGroupDetailContent
├── GamerGroupsPageContent  / GamerGroupDetailContent
└── CustomerGroupDetailContent (detail only — list is inline in CustomerGamersPage)

Hooks
└── src/hooks/use-groups-page.ts      — useGroupsWithVoice(): shared enrichment (session windows, sorting)

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

1. Admin clicks "Commit Changes" → `CommitBar` opens `CommitFlowDialog`
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
6. Role wrapper passes enriched groups + role-specific config to shared components

### Group detail page

1. Same data source as the list page (shared query, found by `groupId`)
2. `GroupDetailContent` renders product image, header, voice status, and gamer roster
3. Roster adapts to data: shows age + gender when available (admin/gedu/customer's own gamers), names-only when null (gamer role or other families' gamers — DOB/gender stripped server-side)
4. Voice join: admin/gedu/gamer use `voiceRoute` (Link navigation), customer uses `onJoinClick` (placeholder alert dialog)
5. Customer detail page also shows an enrollment info card (Sorgs/week + Unenroll button)

### Customer groups (inline in My Gamers page)

1. `CustomerGamersPage` calls `useMyGroups()` + `useGroupsWithVoice()` + `useMyGamers()`
2. Groups are filtered per gamer by matching `group.gamers` against the customer's gamer IDs
3. `GroupCard` renders per group under each gamer header, sorted live-first
4. Join button fires `onJoinClick` → placeholder "Voice Chat Coming Soon" dialog
5. Clicking a card navigates to `/customer/groups/[id]` → `CustomerGroupDetailContent`
6. After a successful unenroll, the customer is navigated back to My Gamers

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
| `get_my_groups()` | admin, gedu, gamer, customer | Returns groups for the calling user based on role (see below) |

**`get_my_groups()` role branching:**

| Role | Filter | Data |
|---|---|---|
| Admin | No filter (all groups) | Full gamer details (DOB, gender), token cost, last charge date |
| Gedu | `pg.gedu_id = auth.uid()` | Full gamer details (DOB, gender), token cost, last charge date |
| Gamer | Enrolled groups only (`group_enrollments WHERE gamer_id = auth.uid()`) | DOB and gender are NULL (privacy), token cost, no charge date |
| Customer | Enrolled groups only (`group_enrollments WHERE enrolled_by = auth.uid()`) | DOB/gender for own gamers only (CASE), token cost, last charge date for own enrollments |

### RLS Policies

- **`product_groups`:** Admin has full CRUD. Authenticated users can SELECT groups for visible products.
- **`group_enrollments`:** Admin has full CRUD. Authenticated users can SELECT enrollments for visible products. `ON DELETE RESTRICT` prevents group deletion while gamers are enrolled.

### Migrations

| Migration | Description |
|---|---|
| `00006_groups_and_enrollments.sql` | `product_groups`, `group_enrollments`, `enrollment_charges` tables, `commit_group_changes` RPC (admin-gated), `get_product_groups_with_details` RPC, `check_unique_gamer_per_product` trigger |
| `00009_rls_and_grants.sql` | All RLS policies and table/function grants for groups |
| `00012_gedu_groups_rpc.sql` | `get_my_groups` RPC (multi-role with customer branch, SECURITY DEFINER) |

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
| View groups page (own groups) | Yes | Yes (inline in My Gamers) | Yes | Yes |
| Manage groups (CRUD) | Yes | - | - | - |
| Manage enrollments | Yes | Enroll/unenroll own gamers | - | - |

## Role-Specific Page Behavior

| Aspect | Admin | Gedu | Gamer | Customer |
|---|---|---|---|---|
| Groups shown | All groups | Assigned groups | Enrolled groups | Enrolled groups (per gamer) |
| Lounge cards | Admin Lounge + Gedu Lounge | Gedu Lounge | None | None |
| Gamer roster | Full (age, gender) | Full (age, gender) | Names only | Own gamers full, others names only |
| Voice join | Navigate to voice room | Navigate to voice room | Navigate to voice room | Placeholder alert dialog |
| Enrollment info | - | - | - | Token cost + Unenroll button |
| Heading | "All Groups" | "Your Groups" | "My Groups" | Per-gamer under "My Gamers" |

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

The four role branches (admin, gedu, gamer, customer) share nearly identical `SELECT`/`FROM`/`JOIN` clauses. If a column is added or a JOIN changes, all branches must be updated in sync. Consider extracting the common query into a CTE or view — but only once the branches have stabilized, since roles may diverge (e.g., admin-only columns) and premature abstraction would make that harder.

---

## v2 Groups (parallel-phase)

The v2 product system (see `docs/products-redesign.md`) ships its own group infrastructure alongside the legacy v1 tables. They run in parallel until the v2 cutover, when the v1 `product_groups` / `group_enrollments` / `enrollment_charges` are dropped (see § "Cutover").

### Schema differences from v1

| Concept | v1 | v2 |
|---|---|---|
| Groups table | `product_groups(product_id → products, gedu_id NOT NULL, ...)` | `product_groups_v2(product_id → products_v2, name TEXT NOT NULL, ...)` |
| Gedu assignment | Single `gedu_id` column with `UNIQUE(product_id, gedu_id)` | Separate `gedu_group_assignments_v2(group_id, gedu_id, product_id)` join with `UNIQUE(gedu_id, product_id)` |
| Group naming | None (rendered as "Group A/B/C…" by index) | Required `name` column with non-blank check; admins can rename |
| Gamer ↔ group | `group_enrollments(group_id, gamer_id, status, …)` | `participations_v2.group_id` (nullable; `NULL` = unassigned inbox) |
| Empty-product behavior | Auto-hide product when last group is deleted | No auto-hide — products with no groups are valid (admins create groups after seats sell) |

The denormalized `product_id` on `gedu_group_assignments_v2` is what makes "one group per Gedu per product" expressible as a UNIQUE constraint. A BEFORE-INSERT/UPDATE trigger fills it from the group's `product_id` if the caller omits it, and rejects mismatches if the caller passes a wrong value.

### v2 RPCs

- `get_product_groups_v2_with_details(p_product_id UUID) → JSONB` — admin-only read. Returns `{ product_id, groups: [{id, name, display_order, gedus: […], participations: […]}], unassigned: [{…}] }` in a single round-trip.
- `commit_group_changes_v2(p_product_id, p_added_groups, p_renamed_groups, p_deleted_group_ids, p_gedu_assignments_added, p_gedu_assignments_removed, p_participation_moves) → JSONB { tempMap }` — atomic batch mutation. Locks the product row first (`SELECT 1 FROM products_v2 WHERE id = $1 FOR UPDATE`) to serialize with participation flow. Order of operations: removes → deletes → renames → inserts (with inline geduIds) → adds → participation moves. Removing before adding lets a single batch swap a Gedu between two groups without tripping `UNIQUE(gedu_id, product_id)`.

### v2 admin UI

The v2 Groups panel lives at `src/components/admin/products-v2/groups/`:

```
groups-panel.tsx       — Top-level orchestrator: query, DnD context, commit bar, picker sheet, summary dialog
unassigned-card.tsx    — Leftmost droppable card for participations with group_id IS NULL
group-column.tsx       — Per-group card: editable name input, multi-Gedu pills, droppable participation area
gamer-chip.tsx         — Draggable participation chip with age/gender detail
gedu-pill.tsx          — Gedu pill with optional remove (X) button; pending-add and pending-remove states
commit-bar.tsx         — Sticky bottom bar showing staged-change count
commit-summary-dialog.tsx — Review dialog: segmented summary list + Apply (atomic via apply route)
```

Mutations flow through `POST /api/admin/products-v2/[id]/groups/apply` → `commit_group_changes_v2`. The route is intentionally simpler than the v1 streaming SSE route — no email notifications, no Daily.co room provisioning. Email + Daily.co code stays on the v1 route for future reuse on v2.

The staged-changes reducer (`src/hooks/use-group-editor-v2.ts`) extends the v1 pattern for:

- **Multi-Gedu groups** — `geduIds: string[]` inline on added groups + separate `geduAssignmentsAdded` / `geduAssignmentsRemoved` buckets for existing groups.
- **Named groups** — `RENAME_GROUP` action; renames of newly-added groups mutate the `addedGroups` entry in place; renames of existing groups upsert in `renamedGroups`.
- **Unassigned column** — `MOVE_PARTICIPATION` takes `toGroupId: string | null` where `null` is the unassigned-inbox sentinel. The reducer mirrors the DB's `ON DELETE SET NULL` by treating any participation effectively placed in a deleted group as unassigned in the rendered snapshot.
- **Cancellation pairs** — `ADD_GEDU` followed by `REMOVE_GEDU` on the same `(group, gedu)` pair cancels out (and vice versa), so the apply payload only carries net changes.

### Cutover

At v2 cutover (per `docs/products-redesign.md` §10), drop:
- v1 tables: `product_groups`, `group_enrollments`, `enrollment_charges`
- v1 RPCs: `commit_group_changes`, `get_product_groups_with_details`, `enroll_gamer_in_group`, `unenroll_gamer`, `get_enrollment_groups`
- v1 admin UI: `gedu-groups-card.tsx`, `group-card.tsx` (legacy), `commit-bar.tsx` (legacy), `commit-flow-dialog.tsx`, `commit-flow-parts.tsx`, `gedu-picker-dialog.tsx`
- v1 hook: `use-group-editor.ts`

Rename the `_v2` versions to drop the suffix at the same time.
