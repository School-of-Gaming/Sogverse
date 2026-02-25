# Gedu Groups Architecture

Admin-managed groups that assign a gedu (game educator) to a set of gamers within a product.

## Overview

Each product can have multiple groups. Each group has exactly one gedu and zero or more enrolled gamers. Admins manage groups through a batch-editing UI: they stage changes locally (add groups, reassign gedus, delete groups, drag-and-drop gamers between groups), review a change summary, and commit everything atomically via a single RPC. The server-side `commit_group_changes` function runs all mutations in one transaction — if any step fails, the entire batch rolls back.

A gamer can only be enrolled in one group per product (enforced by a trigger-based constraint). A gedu can only lead one group per product (enforced by a `UNIQUE(product_id, gedu_id)` constraint). When all groups are removed from a product, it is automatically hidden.

## Component Map

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

Service layer (src/services/groups/)
├── groups.service.ts  — GroupsService class (RPC query + API fetch for commit)
├── groups.queries.ts  — React Query hooks (useProductGroups, useCommitGroupChanges)
└── index.ts           — Barrel exports
```

## Data Flow

### Admin loads a product page

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

### RPCs (SECURITY DEFINER, admin-only)

| Function | Purpose |
|---|---|
| `get_product_groups_with_details(p_product_id)` | Returns flat rows joining groups, gedus, enrollments, and gamer profiles (date of birth, gender) |
| `commit_group_changes(p_product_id, ...)` | Atomic batch mutation of groups and enrollments, returns `{ autoHidden }` |

Both RPCs check `get_user_role() = 'admin'` and raise `42501` (insufficient privilege) otherwise.

### RLS Policies

- **`product_groups`:** Admin has full CRUD. Authenticated users can SELECT groups for visible products.
- **`group_enrollments`:** Admin has full CRUD. Authenticated users can SELECT enrollments for visible products. `ON DELETE RESTRICT` prevents group deletion while gamers are enrolled.

### Migrations

| Migration | Description |
|---|---|
| `00024_product_groups.sql` | Creates tables, RLS policies, grants, initial `get_product_groups_with_details` RPC |
| `00025_display_name_not_null.sql` | Backfills NULL `display_name`, adds NOT NULL constraint, simplifies `get_open_voice_rooms` |
| `00026_group_rpc_gamer_details.sql` | Adds `gamer_date_of_birth` and `gamer_gender` to the RPC |
| `00027_commit_group_changes_rpc.sql` | Creates the `commit_group_changes` RPC |
| `00028_unique_gamer_per_product.sql` | Trigger-based one-enrollment-per-gamer-per-product constraint |
| `00029_restrict_group_rpcs_to_admin.sql` | Adds `get_user_role()` admin checks to both RPCs |

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
| Manage groups (CRUD) | Yes | - | - | - |
| Manage enrollments | Yes | - | - | - |

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
