# Customer Enrollment Architecture

Customer-initiated enrollment system where parents enroll their gamers (children) into products, paying Sorg tokens weekly.

## Overview

Customers browse products on the public products page, click into a product detail page, and follow a multi-step enrollment wizard: select a gamer (or create one inline), select a group, review the cost, and confirm. Enrollment immediately deducts Sorg tokens for the upcoming session. Each subsequent week, a `pg_cron` job charges the customer's balance 24 hours before the next session. If the balance is insufficient, the enrollment is automatically cancelled.

Unenrollment is customer-initiated via the group detail page. A refund is only granted if the customer has been charged for an upcoming session that hasn't started yet AND the session is more than 24 hours away. If the charged session has already started, no refund is issued (the customer attended or had the opportunity to attend). If the session hasn't started but is within 24 hours, no refund is issued either.

Admins cannot enroll or unenroll gamers — they can only move gamers between groups within a product via `commit_group_changes`. Moves use `UPDATE` (not DELETE+INSERT) to preserve enrollment metadata and charge history.

## Component Map

```
Pages
├── /products                 → Product listing with "View Details" links
├── /products/[id]            → Product detail page with <EnrollmentWizard /> (customers only)
├── /customer/gamers          → My Gamers page with GroupCards per gamer
├── /customer/groups/[id]     → Group detail page with roster, voice status, enrollment info, unenroll
└── /customer                 → Dashboard with "My Gamers" quick action

Enrollment components (src/components/enrollment/)
├── EnrollmentWizard          — Multi-step flow: select gamer → select group → confirm → success
├── InlineGamerForm           — Compact gamer creation with dynamic age display (DOB + gender required)
└── UnenrollDialog            — Confirmation dialog with refund/no-refund messaging

Customer components (src/components/customer/)
└── CustomerGroupDetailContent — Thin wrapper: passes enrollment info + onJoinClick to GroupDetailContent

Shared group components (src/components/groups/, src/components/ui/)
├── GroupCard                 — Shared card with product image, schedule, voice status, Join button
├── GroupDetailContent        — Shared detail page with roster, padlet, optional enrollment info
└── JoinButton                — Shared button: Link (href) or button (onClick) via discriminated union

API routes (src/app/api/)
├── enrollments/route.ts              — POST: enroll gamer (customer-only)
└── enrollments/[id]/route.ts         — DELETE: unenroll gamer with refund check (customer-only)

Service layer (src/services/enrollments/)
├── enrollments.service.ts    — EnrollmentsService class (API fetches + RPC calls)
├── enrollments.queries.ts    — React Query hooks (useEnrollGamer, useUnenrollGamer, useEnrollmentGroups)
└── index.ts                  — Barrel exports

Service layer (src/services/groups/)
├── groups.service.ts         — GroupsService class (get_my_groups RPC call + reshaping)
├── groups.queries.ts         — React Query hooks (useMyGroups — used by all roles including customers)
└── index.ts                  — Barrel exports

Utilities
├── src/lib/utils.ts                   — wallClockToUtc() (shared timezone conversion)
├── src/lib/enrollment.ts              — getNextSessionStart(schedule, opts?), isWithinChargeWindow(nextSession, opts?), getRefundEligibility(opts)
└── src/lib/constants/enrollment.ts    — ENROLLMENT_CHARGE_WINDOW_HOURS = 24

Database functions (SQL)
├── enroll_gamer_in_group()            — Atomic enroll: verify parent, deduct tokens, insert enrollment + charge
├── unenroll_gamer()                   — Atomic unenroll: mark inactive, optional refund, mark charge as refunded
├── get_my_groups()                    — Unified RPC for all roles (customer branch scoped by enrolled_by)
├── get_enrollment_groups()            — Customer-facing group list with gamer count and age stats
├── compute_next_session()             — SQL equivalent of getNextSessionStart() for cron use
└── process_enrollment_charges()       — Cron entry point: charge active enrollments, auto-unenroll on failure
```

## Data Flow

### 1. Enroll a gamer (customer)

1. Customer navigates to `/products/[id]` → `EnrollmentWizard` renders
2. **Step 1: Select gamer** — `useMyGamers()` fetches customer's gamers. Already-enrolled gamers (via `useMyGroups()`) are disabled. If no gamers exist, the inline creation form is shown automatically.
3. **Step 1a: Create gamer (optional)** — `InlineGamerForm` collects display name, username, password, DOB, gender. Calls `POST /api/gamers/create`. On success, auto-selects the new gamer and advances.
4. **Step 2: Select group** — `useEnrollmentGroups(productId)` fetches groups via `get_enrollment_groups` RPC. Shows gedu name, gamer count, age range. If only one group exists, auto-selects and skips to step 3.
5. **Step 3: Confirm** — Shows enrollment summary: gamer, gedu, token cost, current balance, balance after. Insufficient balance shows a warning with link to `/customer/sorg`.
6. Customer clicks "Confirm Enrollment" → `useEnrollGamer()` mutation → `POST /api/enrollments`
7. API route looks up product via group, computes next `session_date` via `getNextSessionStart()`, calls `enroll_gamer_in_group` RPC
8. RPC atomically: verifies parent-child relationship, checks no active enrollment exists, deducts tokens via `adjust_token_balance()`, inserts `group_enrollments` row, inserts `enrollment_charges` row
9. Success screen shows new balance and links to My Gamers page

### 2. Unenroll — with refund (> 24h before next session)

1. Customer opens `/customer/gamers` → `useMyGroups()` loads groups, `GroupCard` renders per gamer
2. Customer clicks a group card → navigates to `/customer/groups/[id]`
3. `GroupDetailContent` shows roster, schedule, enrollment info card with "N Sorgs/week" and "Unenroll" button
4. Customer clicks "Unenroll" → `getRefundEligibility()` runs with fresh `new Date()` → `UnenrollDialog` opens with refund confirmation
5. Customer confirms → `useUnenrollGamer()` → `DELETE /api/enrollments/[id]`
6. API route queries the latest `enrollment_charges` row's `session_date` for this enrollment
7. API route reconstructs the session timestamp via `wallClockToUtc(session_date + start_time, timezone)` and verifies `now < sessionTime` (session hasn't started)
8. Passes `lastChargeSessionDate` to `getRefundEligibility()` → session hasn't started, outside 24h window → `eligible: true, refundAmount: token_cost`
9. Calls `unenroll_gamer` RPC with `p_refund = true`
10. RPC: looks up `products.token_cost` internally, sets `status='unenrolled'`, `unenrolled_at=NOW()`, credits tokens via `adjust_token_balance('enrollment_refund')`, marks latest `enrollment_charges` row as refunded
11. Dialog shows success with refund amount and new balance
12. On dismiss, customer is navigated back to My Gamers page

### 3. Unenroll — no refund (within 24h of next session)

Same as flow 2, except:
- `UnenrollDialog` shows "No refund will be issued — the next session is within 24 hours"
- API route's `getRefundEligibility()` → session hasn't started but within 24h window → `eligible: false, refundAmount: 0, reason: "within_window"`
- RPC is called with `p_refund = false` — status changes but no token adjustment

### 3a. Unenroll — no refund (session already attended)

Customer unenrolls after the charged session has already started. The latest charge covered a session that has already happened — refunding it would mean the customer attended for free.

- `UnenrollDialog` shows "You won't be charged for the next session"
- API route's `getRefundEligibility()` → `now > sessionTimestamp` → `eligible: false, refundAmount: 0, reason: "session_past"`
- RPC is called with `p_refund = false` — status changes, no token adjustment
- The cron hasn't charged for the next session yet, so the customer won't owe anything further

### 4. Weekly charge (pg_cron)

1. `process_enrollment_charges()` runs hourly at :00 via pg_cron
2. Queries all `group_enrollments` with `status = 'active'` (uses partial index)
3. For each enrollment, calls `compute_next_session()` to find the next session in UTC
4. Checks if current time is within the 24h charge window (`NOW() >= next_session - 24h`)
5. Skips if an `enrollment_charges` row already exists for that `session_date` (idempotency)
6. Deducts tokens via `adjust_token_balance('enrollment', -token_cost)`
7. Inserts `enrollment_charges` row with `session_date`
8. Updates `last_charged_at` on the enrollment

### 5. Auto-unenroll on insufficient balance

1. During weekly charge (flow 4), `adjust_token_balance()` attempts to deduct tokens
2. The `CHECK (token_balance >= 0)` constraint on `profiles.token_balance` raises `check_violation`
3. The `EXCEPTION WHEN check_violation` handler catches it
4. Handler sets `status='unenrolled'`, `unenrolled_at=NOW()` on the enrollment
5. No charge is recorded; the customer's balance is unchanged
6. Customer sees the enrollment disappear from their My Gamers page

## Database Schema

### `group_enrollments` (extended)
```sql
group_enrollments (
  id            UUID PK DEFAULT gen_random_uuid(),
  group_id      UUID FK → product_groups(id) ON DELETE RESTRICT NOT NULL,
  gamer_id      UUID FK → profiles(id) NOT NULL,
  enrolled_by   UUID FK → profiles(id) NOT NULL,               -- customer who enrolled
  status        TEXT NOT NULL DEFAULT 'active',                  -- 'active' | 'unenrolled'
  last_charged_at TIMESTAMPTZ,                                   -- tracks last weekly charge
  unenrolled_at TIMESTAMPTZ,                                     -- when unenrollment happened
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, gamer_id),
  CHECK (status IN ('active', 'unenrolled'))
)
-- Partial index: CREATE INDEX idx_group_enrollments_active ON group_enrollments(status) WHERE status = 'active'
```

### `enrollment_charges`
```sql
enrollment_charges (
  id                    UUID PK DEFAULT gen_random_uuid(),
  enrollment_id         UUID FK → group_enrollments(id) ON DELETE CASCADE NOT NULL,
  charged_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount                INTEGER NOT NULL,
  transaction_id        UUID FK → token_transactions(id) NOT NULL,
  refunded_at           TIMESTAMPTZ,
  refund_transaction_id UUID FK → token_transactions(id),
  session_date          DATE NOT NULL                            -- wall-clock date in product TZ
)
-- UNIQUE INDEX on (enrollment_id, session_date) prevents double-charging
```

### `token_transaction_type` enum additions
```sql
'enrollment'        -- weekly charge deduction
'enrollment_refund' -- refund on unenrollment
```

### RPCs (all SECURITY DEFINER)

| Function | Purpose | Called by |
|---|---|---|
| `enroll_gamer_in_group(customer_id, gamer_id, group_id, token_cost, session_date)` | Atomic enrollment with first charge | `POST /api/enrollments` |
| `unenroll_gamer(customer_id, enrollment_id, refund_amount)` | Unenroll with optional refund | `DELETE /api/enrollments/[id]` |
| `get_my_groups()` | All roles: returns groups with roster, schedule, voice room, token cost, last charge date. Customer branch scoped by `enrolled_by = auth.uid()` | `GroupsService.getMyGroups()` |
| `get_enrollment_groups(product_id)` | Visible product groups with gamer count and age stats | `EnrollmentsService.getEnrollmentGroups()` |
| `compute_next_session(day_of_week, start_time, timezone)` | Next session in UTC (SQL equivalent of `getNextSessionStart()`) | `process_enrollment_charges()` |
| `process_enrollment_charges()` | Hourly cron: charge active enrollments, auto-unenroll on failure | pg_cron |

### Cross-table uniqueness trigger

`check_unique_gamer_per_product` fires on `BEFORE INSERT` of `group_enrollments`. Only checks `status = 'active'` rows, allowing gamers to re-enroll after unenrollment.

### RLS Policies

- **`group_enrollments`:** Admin full CRUD. Customers can SELECT enrollments where `enrolled_by = auth.uid()`.
- **`enrollment_charges`:** Admin full access. Customers can SELECT charges for their own enrollments.

### Migrations

| Migration | Description |
|---|---|
| `00006_groups_and_enrollments.sql` | `group_enrollments`, `enrollment_charges` tables, `enroll_gamer_in_group`, `unenroll_gamer`, `get_enrollment_groups` RPCs, updated `commit_group_changes` with UPDATE-based moves |
| `00008_cron.sql` | `compute_next_session()`, `process_enrollment_charges()`, pg_cron schedule |
| `00009_rls_and_grants.sql` | All RLS policies and table/function grants for enrollments |
| `00012_gedu_groups_rpc.sql` | `get_my_groups()` with customer branch for enrollment viewing |

## Cron Job Details

### Schedule

`process_enrollment_charges` runs hourly at the top of the hour via pg_cron:

```sql
SELECT cron.schedule('process-enrollment-charges', '0 * * * *', $$SELECT process_enrollment_charges()$$);
```

### Timing behavior

For a product with sessions on Wednesdays at 12:30 (Europe/Helsinki):
- Charge window opens: Tuesday 12:30 Helsinki time (24h before)
- First cron run inside window: Tuesday 13:00 Helsinki time (next hourly boundary)
- Maximum charge latency: ~1 hour after the window opens

### Monitoring

```sql
-- View recent cron runs
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- View scheduled jobs
SELECT * FROM cron.job;

-- Unschedule if needed
SELECT cron.unschedule('process-enrollment-charges');
```

### Return value

`process_enrollment_charges()` returns JSONB:
```json
{
  "charged": 5,
  "unenrolled": 1,
  "errors": 0,
  "processed_at": "2026-02-25T13:00:00Z"
}
```

### Error handling

Each enrollment is processed in its own `BEGIN...EXCEPTION` block:
- **`check_violation`** (insufficient balance): auto-unenroll, increment `unenrolled` counter
- **`OTHERS`** (unexpected errors): log warning, increment `errors` counter, continue to next enrollment

Failed enrollments do not block processing of other enrollments.

## Cancellation Window Logic

The charge window (`ENROLLMENT_CHARGE_WINDOW_HOURS = 24`) serves two purposes:

1. **Cron charges:** The cron only charges for sessions whose start time is within the next 24 hours
2. **Refund eligibility:** When a customer unenrolls, refund eligibility uses a two-stage check (see below)

The constant lives in `src/lib/constants/enrollment.ts` (TypeScript) and is mirrored as a local variable in `process_enrollment_charges()` (SQL). If the window changes, both must be updated.

### Refund eligibility — two-stage check

`getRefundEligibility()` receives the `lastChargeSessionDate` (the session date the latest charge covers) and applies two checks in order:

1. **Stage 1 — Has the charged session started?** Reconstruct the session timestamp via `wallClockToUtc(lastChargeSessionDate + start_time, timezone)`. If `now > sessionTimestamp`, the session has already started. No refund — the customer attended (or had the opportunity to attend). Return `reason: "session_past"`.
2. **Stage 2 — Is the session within the cancellation window?** If the charged session hasn't started, check whether the next session is within 24 hours. If so, no refund — return `reason: "within_window"`. Otherwise, the customer is eligible for a full refund.

This prevents a scenario where a customer could repeatedly enroll, attend a session, unenroll for a refund, and re-enroll — getting free sessions indefinitely.

### Three refund states

| # | State | Condition | UI message |
|---|-------|-----------|------------|
| 1 | **Refund eligible** | Charged for upcoming session, outside 24h window | "Refund available" (green) |
| 2 | **Within window** | Charged for upcoming session, inside 24h window | "No refund — session is within 24h" (amber) |
| 3 | **Not yet charged** | Last charge's session already started; haven't been charged for next session yet | "You won't be charged for the next session" (muted) |

### Known limitation — admin schedule changes

If an admin changes a product's day after the cron has already charged for the original day, and the original session time passes, the system treats the session as "started" even though it was moved. This only happens if admins change the schedule within 24h of the original session (after the cron charged). Admins should make schedule changes more than 24h before sessions to avoid this edge case.

### First-week charge

When a customer enrolls, tokens are deducted immediately for the upcoming session. The `enroll_gamer_in_group` RPC receives the `session_date` and creates the first `enrollment_charges` row. The cron only handles subsequent weeks.

### Double-charge prevention

The `UNIQUE INDEX` on `enrollment_charges(enrollment_id, session_date)` is the database-level safety net. The cron also checks for existing charges before attempting to deduct, but the unique constraint guarantees idempotency even if the check-then-insert has a race condition.

## `commit_group_changes` — UPDATE-based moves

The admin `commit_group_changes` RPC uses `UPDATE group_enrollments SET group_id = ...` instead of DELETE+INSERT. This preserves:
- The enrollment UUID (`id`) — no `ON DELETE CASCADE` on linked `enrollment_charges`
- All enrollment metadata (`enrolled_by`, `status`, `last_charged_at`, `unenrolled_at`)
- All linked `enrollment_charges` rows (charge history stays intact)

Without this, moving a gamer between groups would destroy the enrollment, cascade-delete all charge records, and cause the cron to re-charge the customer.

## `compute_next_session` vs `getNextSessionStart`

Both functions compute the same result — the next UTC occurrence of a weekly session — using the same algorithm:

1. Get "now" in the product's timezone
2. Compute days until the target weekday (Monday=0..Sunday=6)
3. Build a wall-clock timestamp for that day + start time
4. Convert to UTC
5. If the result is in the past (today but time already passed), add 7 days

The TypeScript version uses `wallClockToUtc()` from `src/lib/utils.ts`, which converts wall-clock times to UTC via `Intl.DateTimeFormat`. The same function is used by `formatScheduleLocal()` for display formatting. The SQL version uses PostgreSQL's `AT TIME ZONE` operator. Both handle DST transitions natively through their respective timezone libraries.

## Role Permissions

| Capability | Admin | Customer | Gamer | Gedu |
|---|---|---|---|---|
| Enroll a gamer | - | Own gamers only | - | - |
| Unenroll a gamer | - | Own enrollments only | - | - |
| View enrollments | All (via RLS) | Own only (via `get_my_groups` customer branch) | - | - |
| Move gamers between groups | Yes (via `commit_group_changes`) | - | - | - |
| View enrollment charges | All (via RLS) | Own only | - | - |

## Future Improvements

### Age validation enforcement
Block enrollment if gamer's age (from DOB) is outside the product's min/max age range. Currently the UI shows age information but does not enforce restrictions.

### Notification on auto-unenroll
Email or push notification to inform parents when their gamer is auto-unenrolled due to insufficient Sorg balance. Important for customer trust — currently the customer only discovers it on their next dashboard visit.

### Enrollment pause/resume
Allow customers to temporarily pause an enrollment without fully unenrolling. Paused enrollments would not be charged by the cron and would not count toward group capacity, but could be resumed without re-enrolling.

### Configurable cron frequency
The cron currently runs hourly. For tighter charge timing (e.g., products starting at :15 or :45), 15-minute intervals would reduce maximum charge latency from ~1 hour to ~15 minutes.

### Rate-limit gamer creation
The `/api/gamers/create` endpoint only checks `requireRole("customer")`. A customer with 0 Sorgs could create unlimited gamer accounts. Options: add a max-gamers-per-customer cap, or defer gamer creation to happen atomically with enrollment.

### Move weekly charging to application code
The charging logic currently lives in a pg_cron SQL function (`process_enrollment_charges`). This works correctly — double-charging is prevented by the unique constraint, overdraft is prevented by the CHECK constraint — but the SQL is untestable in the normal Vitest pipeline, has no application-level logging or error alerting (Sentry, etc.), and failures are silent unless someone checks `cron.job_run_details`. Moving the orchestration to a Vercel Cron API route (e.g., `POST /api/cron/charge-enrollments`) would make the logic testable, debuggable, and observable alongside the rest of the codebase, while still using `adjust_token_balance()` for the atomic token deduction.

### Cron failure alerting
The cron job logs results to `cron.job_run_details` and emits `RAISE WARNING` to PostgreSQL logs on per-enrollment errors, but no one is proactively notified if the cron fails entirely or encounters errors. A scheduled health check (e.g., a Vercel Cron that queries `cron.job_run_details` for recent failures and alerts via email/Slack) would catch silent failures before they affect customers.

### Charge window constant sync
The 24-hour window is defined in two places: TypeScript constant and SQL local variable. A single source of truth (e.g., a `settings` table row readable by both) would prevent drift.

### E2E test: unenroll targets correct gamer when siblings share a group
A parent with two gamers (B and C) in the same group must be able to unenroll C without affecting B. The `?gamer=` query parameter on `/customer/groups/[id]` controls which enrollment the unenroll button targets. This flow needs an E2E test with a real database: enroll two gamers from the same customer into one group, click through from Gamer C's section, verify the unenroll dialog shows Gamer C's name and that only C's enrollment is removed. Requires local Supabase (Docker) to be available in the E2E test environment.

### Preserve enrollment history when groups are deleted
When an admin deletes a gedu group, unenrolled `group_enrollments` rows (and their linked `enrollment_charges`) are deleted to unblock the `ON DELETE RESTRICT` FK. This means parents lose visibility of past enrollments for that group. A future improvement could decouple enrollment history from the group lifecycle — e.g., by changing the FK to `SET NULL` and updating `get_my_groups` to `LEFT JOIN` on `product_groups`, showing a "Group removed" placeholder for orphaned enrollments.
