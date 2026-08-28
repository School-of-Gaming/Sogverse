# Creating staging test data through real RPCs

To create test data on **staging** through the real admin RPCs — so every RAISE, CHECK
and RLS policy applies — run them via psql (connection: `remote-supabase-psql.md`) with
transaction-local claims impersonating an admin. **Never hand-INSERT product-shaped
data**; the RPCs are the only writers that keep the invariants.

```sql
begin;
select set_config('request.jwt.claims',
  '{"sub":"<admin-profile-id>","role":"authenticated"}', true);
set local role authenticated;
select public.create_product(p_... => ...);  -- or any admin RPC
commit;
```

Find an admin profile id with `select id, email from profiles where role = 'admin'`.

Gotchas:

- `product_prices.currency` CHECK wants **lowercase** (`eur`, not `EUR`).
- Schedule-slot weekday is 0=Mon..6=Sun.
- **Read the RPC's real signature from `supabase/schema.sql`, not from memory** —
  staging can be ahead of the local branch.
- Verifying Stripe-side outcomes in **test mode** works directly with curl + the plain
  `STRIPE_SECRET_KEY` from `.env.local` (that one is the test-mode key).
- Empirical fact settled 2026-08-12: a subscription created via Checkout with
  `billing_cycle_anchor` + `proration_behavior: "none"` has `latest_invoice: null` —
  no €0 creation invoice exists. Anything discriminating deferred-billing subs on that
  is sound.
