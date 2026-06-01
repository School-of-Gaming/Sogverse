# Database Access Patterns

How to choose between the user-bound Supabase client, `createAdminClient` (service-role), and SECURITY DEFINER RPCs in server-side routes. Picking the right one is a security decision, not a stylistic one.

## TL;DR

| Context | Use |
|---|---|
| Reads/writes on normal tables by an authenticated user, where RLS already authorizes the operation | **User-bound client** from `requireRole` result |
| Writes to sensitive tables (money, seats, enrollments — see list below) | **SECURITY DEFINER RPC** called via the user-bound client |
| Webhooks, `auth.admin.*`, storage on privileged buckets, cron — anything with no user session or that genuinely needs server-only credentials | **`createAdminClient`** (service-role) |

Default to the user-bound client. Reach for `createAdminClient` only when one of the three context bullets in row 3 applies. If you find yourself reaching for it because a grant-locked table is rejecting your write, the answer is a SECURITY DEFINER RPC, not service-role.

## Threat model

What we're hardening against, in roughly descending damage:

1. **Service-role key compromise.** Leaked in logs, committed to git, exposed via SSRF or misconfiguration. Every route holding the key is a full-DB compromise vector. Mitigation: keep the set of routes that use service-role small, visible, and justified.
2. **Auth check bypass.** A bug or refactor lets a request reach a write path without `requireRole` gating it correctly. Mitigation: make the DB itself a second layer of defense — RLS, grant lockdown, or an RPC-internal role check — so a route-handler bug doesn't translate to a DB-level capability.
3. **RLS misconfiguration.** A typo in a `USING` predicate, an accidentally-permissive `WITH CHECK`, a policy that authorizes the actor but not the target. Mitigation: for sensitive tables, don't depend on RLS alone — pair it with grant lockdown so PostgreSQL rejects unauthorized writes even if RLS is wrong.
4. **Application bugs.** A route writes wrong data — wrong `customer_id`, wrong product, wrong amount. Mitigation: encode invariants in SECURITY DEFINER RPCs whose signatures and bodies are auditable in one place.
5. **SQL injection.** Low likelihood with the Supabase client's parameterization, but bounded by what the connection can do. Mitigation: smaller connection privilege = smaller blast radius.

Every architectural choice below is evaluated against these.

## The three layers PostgreSQL gives us

Reading these in order is essential — they apply in this order to every query.

1. **Grants.** `GRANT ... ON table TO role`. Without the grant, PostgreSQL rejects with `permission denied for table X` *before* it ever consults RLS. The `authenticated` role has whatever grants migrations explicitly bestow.
2. **Row Level Security (RLS) policies.** `CREATE POLICY ... USING (...) WITH CHECK (...)`. Filters rows on SELECT, gates writes on INSERT/UPDATE/DELETE. Only runs after grants permit the operation.
3. **Application code.** `requireRole`, route handler logic, business invariants.

The service-role bypasses (1) and (2). SECURITY DEFINER functions bypass (1) by running as the function's owner. The user-bound client of an authenticated user is subject to all three.

## The four write models

### Model A — Service-role client (`createAdminClient`)

```ts
const admin = createAdminClient();
await admin.from("participations").insert({ ... });
```

- Bypasses grants and RLS.
- Trust boundary: the route handler. Single layer of defense.
- Failure modes:
  - `requireRole` bypass → route can do anything to any table.
  - Key leak → full DB compromise.
  - SQL injection in route → bounded only by what the route's code can construct.

Use only when the operation genuinely cannot be performed by an authenticated user:
- Webhooks (no user session at all)
- `supabase.auth.admin.*` calls (Supabase's Auth Admin API requires service-role)
- Storage bucket writes to admin-only buckets
- Cron jobs and other system tasks

### Model B — User-bound client + RLS only

```ts
const { supabase } = result; // from requireRole
await supabase.from("locations").insert({ ... });
```

- Subject to grants and RLS.
- Trust boundary: `requireRole` ∪ RLS policies. Two independent layers.
- Failure modes:
  - `requireRole` bypass → RLS still blocks (good).
  - RLS misconfigured → write goes through (bad — but at least RLS misconfigurations are testable).
  - SQL injection → still bounded by RLS.

Use for routes that read or write normal tables on behalf of an authenticated user, where the appropriate RLS policies (admin_full_access_*, customer_select_own_*, etc.) already authorize what the route does.

### Model C — User-bound client → SECURITY DEFINER RPC (no grant lockdown)

```ts
const { supabase } = result;
await supabase.rpc("admin_do_thing", { p_x, p_y });
```

```sql
CREATE FUNCTION admin_do_thing(p_x uuid, p_y uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF get_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- ...do the thing...
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_do_thing(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION admin_do_thing(uuid, uuid) TO authenticated;
```

- Function runs as table owner; bypasses grants and RLS *inside the function only*.
- Trust boundary: the RPC body. The function can do *exactly* what it's coded to do — no more, no less.
- Failure modes:
  - `requireRole` bypass → RPC re-checks role internally (good).
  - SQL injection in route → bounded by the RPC's parameter signature (good).
  - Bugs in the RPC body → the function does the wrong thing (audit the RPC).

Use when a route would otherwise use the service-role client to do a *specific*, well-defined operation that you can name and codify in SQL.

### Model D — Grant lockdown + SECURITY DEFINER RPC + user-bound client

Same as Model C, plus:

```sql
REVOKE ALL ON participations FROM authenticated;
GRANT SELECT ON participations TO authenticated;
```

The table is unwritable from the `authenticated` role at the grant level. The only way data ever lands in it is via SECURITY DEFINER RPCs (running as owner) or via the service-role client. RLS becomes a third layer for SELECT only.

- Trust boundary: every write path is named, auditable, and has an RPC body you can review.
- Failure modes:
  - `requireRole` bypass → RPC re-checks role (good).
  - RLS misconfigured → irrelevant for writes; PostgreSQL rejects at the grant level anyway (good).
  - Future "let me just do a quick `.from(...).insert(...)`" → fails closed with `permission denied for table` (good — forces the engineer to add a proper RPC).

This is the strongest model. Reserve it for tables where a stray write would be expensive (financial, enrollment, billing).

## Which model when

```
Is the route doing storage / auth.admin.* / webhook work?
├─ yes → Model A (createAdminClient)
└─ no
   │
   Does the route write to a sensitive table?
   (participations, payments, refunds,
    token_balances, family_subscriptions,
    family_subscription_items, anything else
    that holds money, seats, or enrollment state)
   ├─ yes → Model C or D (SECURITY DEFINER RPC + user-bound client)
   └─ no
      │
      Does the operation only touch normal tables?
      └─ yes → Model B (user-bound client + RLS)
```

The default is Model B. Models C/D are the upgrade for sensitive tables. Model A is the exception, not the rule.

## Currently-sensitive tables (grant-locked)

Per migration `00039`, these tables have `REVOKE ALL FROM authenticated` + `GRANT SELECT` only — writes must go through a SECURITY DEFINER RPC or the service-role client:

- `participations`
- `payments`
- `refunds`
- `family_subscriptions`
- `family_subscription_items`
- `product_subscription_prices` (no SELECT either — admin-only catalog)
- `session_cancellations`
- `credit_deductions`
- `product_seat_counts`

Plus `token_balances` (with its own `adjust_token_balance` RPC). Per CLAUDE.md: "All token balance changes must go through the `adjust_token_balance()` RPC."

When adding a new table that holds money, seats, enrollments, or analogous state, default to grant lockdown.

## The SECURITY DEFINER RPC template

A well-formed admin write RPC looks like this:

```sql
CREATE OR REPLACE FUNCTION admin_<verb>_<noun>(
  p_<param1> <type>,
  p_<param2> <type>
)
RETURNS <return_type>  -- usually uuid (the new row's id) or void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp  -- defend against search-path attacks
AS $$
DECLARE
  v_<local> <type>;
BEGIN
  -- 1. Role check — first thing, every time.
  IF get_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate inputs and business rules. Raise with codes the route can map.
  --    (P0002 = not found, 22023 = bad-state / invalid-parameter, etc.)

  -- 3. Lock anything you'll read-then-write (SELECT ... FOR UPDATE) if there's
  --    financial or seat-count math at stake.

  -- 4. Do the write. Let the table's own constraints (CHECK, partial UNIQUE,
  --    FK) be the source of truth — don't re-validate what the DB will.

  RETURN v_<result>;
END;
$$;

-- Lock down by default; grant to authenticated only because the role check
-- inside makes it safe.
REVOKE EXECUTE ON FUNCTION admin_<verb>_<noun>(<types>) FROM public, anon;
GRANT EXECUTE ON FUNCTION admin_<verb>_<noun>(<types>) TO authenticated;
```

Notes:

- **Always `SET search_path`.** Without it, a SECURITY DEFINER function inherits the caller's search path, which is a known privilege-escalation vector.
- **Always re-check the role inside.** Don't trust that the route did it. The RPC must be safe to expose to `authenticated` without external gating.
- **Don't re-implement constraints in PL/pgSQL.** If the table has a CHECK or partial UNIQUE that catches the bad case, let it fire and translate the error code in the route. The DB knows the truth.
- **Be specific in error codes.** `42501` for forbidden, `P0002` for not-found, `22023` for bad-state, `23505` for unique-violation (PostgreSQL emits this one itself). The route handler maps these to HTTP status. Routes that map raw error messages leak DB internals — map codes, not messages.
- **Per CLAUDE.md:** the RPC must be added to the allowlist in `tests/db/access-control.test.ts` because it's callable from `authenticated`. The role check inside is what makes that safe.

## Worked example: `POST /api/admin/products/[id]/participations`

This route — admin comp-enroll, currently shipped on this branch — is the worked example. It writes to `participations`, which is grant-locked. The route currently uses Model A (`createAdminClient`) because that was the established pattern when it was written. The architecturally-correct shape is Model D.

### Current shape (Model A)

```ts
// route.ts
const result = await requireRole("admin", { ... });
if (result instanceof NextResponse) return result;
const { user } = result;

const admin = createAdminClient();

const { data: product } = await admin
  .from("products").select("id, product_type").eq("id", productId).maybeSingle();
// ... consumer_club gate ...

const { data: parentLinks } = await admin
  .from("parent_gamer").select("parent_id, created_at")
  .eq("gamer_id", gamerId).order("created_at", { ascending: true }).limit(1);
// ... parent resolution ...

const { data: inserted } = await admin
  .from("participations")
  .insert({ product_id: productId, gamer_id, customer_id, status: "active", credits_remaining: 0 })
  .select("id").single();
```

Three round-trips, full service-role privileges throughout, business rules in TypeScript.

### Target shape (Model D)

```sql
-- migration: 000XX_admin_add_gamer_to_product.sql
CREATE OR REPLACE FUNCTION admin_add_gamer_to_product(
  p_product_id uuid,
  p_gamer_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product_type product_type;
  v_customer_id uuid;
  v_participation_id uuid;
BEGIN
  IF get_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT product_type INTO v_product_type FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_product_type = 'consumer_club' THEN
    RAISE EXCEPTION 'consumer_club_not_supported' USING ERRCODE = '22023';
  END IF;

  SELECT parent_id INTO v_customer_id
  FROM parent_gamer WHERE gamer_id = p_gamer_id
  ORDER BY created_at ASC LIMIT 1;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'gamer_has_no_parent' USING ERRCODE = '22023';
  END IF;

  INSERT INTO participations (product_id, gamer_id, customer_id, status, credits_remaining)
  VALUES (p_product_id, p_gamer_id, v_customer_id, 'active', 0)
  RETURNING id INTO v_participation_id;

  RETURN v_participation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_add_gamer_to_product(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION admin_add_gamer_to_product(uuid, uuid) TO authenticated;
```

```ts
// route.ts
const result = await requireRole("admin", { ... });
if (result instanceof NextResponse) return result;
const { user, supabase } = result;

const { data, error } = await supabase.rpc("admin_add_gamer_to_product", {
  p_product_id: productId,
  p_gamer_id: gamerId,
});

if (error) {
  if (error.code === "P0002") return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (error.code === "23505") return NextResponse.json({ error: "Already enrolled" }, { status: 409 });
  if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: "Failed to add gamer" }, { status: 500 });
}
// audit log unchanged
return NextResponse.json({ participation_id: data });
```

### Why the target is better

- **Three layers of defense for the write:** route `requireRole` + RPC `get_user_role()` check + grant lockdown on `participations`. The service-role version has one (route check only).
- **One round-trip instead of three.**
- **The trust boundary is the 30-line RPC body**, not "everything the service-role connection could possibly do."
- **Service-role key isn't on the critical path.** A future key leak doesn't compromise this route's data.
- **Business rules live in SQL**, next to the constraints they coexist with.

### Why it isn't done yet

It's a coordinated change: the routes that currently use `createAdminClient` for admin writes form a small but real set, and converting them piecemeal creates inconsistency. The plan is a single sweep — see TODO.md "Convert admin writes to SECURITY DEFINER RPCs."

## What not to do

- **Don't reach for `createAdminClient` just because a query is rejecting with `permission denied for table`.** That's the grant lockdown telling you to write an RPC.
- **Don't `GRANT INSERT TO authenticated` on a grant-locked table** to "work around" the lockdown. The lockdown is load-bearing. If you need to write, write an RPC.
- **Don't put business rules in the route when they're really invariants on the data.** A rule like "consumer_club products can't be comped" belongs in the RPC, where it's adjacent to the data and reused by every caller, not in the TypeScript handler where the next caller (a future admin script, a different route) has to reimplement it.
- **Don't return raw `error.message` from a DB call to the client.** Map error codes. Raw messages leak constraint names, column names, and sometimes data.
- **Don't skip the role check inside a SECURITY DEFINER function** because "the route checks it." The function must be safe assuming the route check didn't happen — that's the whole point of the second layer.

## Cross-references

- CLAUDE.md "Function & Table Access Control" — the rules this doc operationalizes.
- CLAUDE.md "All token balance changes must go through the `adjust_token_balance()` RPC" — the existing precedent.
- `supabase/migrations/00039_participations_payments_v2.sql` — the grant lockdown that motivated this doc.
- `tests/db/access-control.test.ts` — enforces that new functions are private by default and new tables have RLS.
- TODO.md — the list of routes still on Model A that should move to Model C/D.
