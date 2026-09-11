# GDPR Right to Erasure

Erasing an account on request. There is no in-app flow, so this is a hand operation
against prod over psql. Connection details: `remote-supabase-psql.md`.

The shape is **inventory read-only, delete once, re-scan**. The delete cannot be undone,
so nothing is written until the inventory is complete and the owner has confirmed it.

## 1. Find the account and its family

Look the address up in `auth.users`, then read `public.profiles.role`. For a customer,
list their gamers through `parent_gamer`, and check whether each gamer has **another**
parent: a gamer with a second parent survives the delete (see step 3).

Carry the ids forward; do not dump whole `profiles` or `auth.users` rows. Selecting
every column of a person's row pulls PII into the session for no purpose, and the
auto-mode classifier blocks it. Counts and ids are enough to plan the delete.

## 2. Inventory — counts first, then a full scan

**Counts over the FKs.** The FKs to `public.profiles` in `supabase/schema.sql` are the
list; count the account's rows in each. Most are `ON DELETE CASCADE`. The ones that
change the plan:

- **`payments` and `family_subscriptions` are `RESTRICT`**, and so is
  `gedu_group_assignments` for a gedu. A row there blocks the delete outright, and it is
  money or staffing history, so it is a decision rather than an obstacle. Accounting
  records carry a statutory retention obligation, so raise it with finance before
  touching them. Do not delete these rows to clear the way.
- **`consent_acceptances.accepted_by`, `products.created_by` and the `voice_*` columns
  carry no `ON DELETE` action.** A row there blocks the delete unless the same delete
  cascades it away by another column. A parent's own `consent_acceptances` go with
  `customer_id`, so only an acceptance made on someone else's behalf blocks.
- **`customer_profiles.stripe_customer_id`** set means a Stripe customer exists (step 5).

**Then scan every column for the ids and the address**, which catches anything that
references the account without an FK: ids in jsonb or text, the address copied into a
log. Read-only sessions refuse `CREATE TEMP TABLE`, so hits are reported as notices:

```sql
SET default_transaction_read_only = on;
DO $$
declare r record; n bigint;
  ids uuid[] := array['<parent-uuid>'::uuid, '<gamer-uuid>'::uuid];
  email text := '<address>';
begin
  for r in select c.table_schema s, c.table_name t, c.column_name col, c.data_type dt
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema
      and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema in ('public', 'storage', 'auth')
      and c.data_type in ('uuid', 'text', 'character varying', 'jsonb', 'ARRAY')
  loop
    begin
      if r.dt = 'uuid' then
        execute format('select count(*) from %I.%I where %I = any($1)', r.s, r.t, r.col)
          into n using ids;
      else
        execute format('select count(*) from %I.%I where %I::text ilike any($1)', r.s, r.t, r.col)
          into n using (select array_agg('%' || x || '%') from unnest(ids::text[] || email) x);
      end if;
      if n > 0 then raise notice 'HIT %.%.% = %', r.s, r.t, r.col, n; end if;
    exception when others then raise notice 'ERR %.%.%: %', r.s, r.t, r.col, sqlerrm;
    end;
  end loop;
end $$;
```

Run it with `psql -X -q -f scan.sql 2>&1 | grep -E 'HIT|ERR'`. Every `HIT` must be a
row the delete will cascade to; one that isn't must be handled first. `storage` is in
the scan because uploaded objects outlive their row in `public` unless removed.

Put the inventory in front of the owner — who the family is, what they hold, anything
outside the database — and wait for an explicit go-ahead.

## 3. Delete

```sql
\set ON_ERROR_STOP on
SET default_transaction_read_only = off;
BEGIN READ WRITE;
DELETE FROM auth.flow_state WHERE user_id IN ('<parent-uuid>', '<gamer-uuid>');
DELETE FROM auth.users WHERE id = '<parent-uuid>' AND email = '<address>';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN ('<parent-uuid>', '<gamer-uuid>')) THEN
    RAISE EXCEPTION 'family not fully deleted — rolling back';
  END IF;
END $$;
COMMIT;
```

- **One row, the parent, deletes the whole family.** `auth.users` cascades to
  `auth.identities`, `auth.sessions` (and through them `auth.refresh_tokens`), the other
  auth tables that key on the user, and `public.profiles`, and from there through every
  cascading FK.
- **`auth.flow_state` is the exception in `auth`**: it carries a `user_id` with no FK, so
  its rows survive a SQL delete and are removed explicitly.
- **List every gamer being erased in both id lists, and only those.** A gamer who keeps
  another parent stays out of the guard, or it rolls back a correct delete. The `parent_gamer` delete fires a trigger that
  deletes a gamer's auth user once their last parent link is gone. A gamer with another
  parent is left alone, which is correct: the other parent still holds them.
- **The `email` in the `WHERE`** guards against a pasted id belonging to someone else.
- **The guard block** rolls the transaction back unless every expected auth user is gone,
  so a gamer who unexpectedly survives is caught before commit, not after.
- **psql, not the Admin API**, because the prod service-role key is deliberately absent
  from `.env.local`. For a delete, raw SQL on `auth.users` is safe; the reason to prefer
  the Admin API for an email change (`correct-user-email.md`) doesn't apply when the row
  is removed rather than updated. Storage objects are the exception: a SQL delete leaves
  the file in the bucket, so a storage hit in step 2 is removed through the Storage API
  first.

## 4. Verify

Re-run the scan from step 2. Zero `HIT` lines is the result. `grep` exits 1 on no match,
which here means success.

## 5. Outside the Sogverse database

- **Stripe.** Only if `stripe_customer_id` was set. The customer is the join, and nothing
  resolves one by email, so without that id there is nothing to find. With it, the
  customer's invoices are accounting records: take it to finance with the step 2
  retention question.
- **Brevo.** Transactional only; the app never adds anyone to a contact list. Send logs
  expire on Brevo's side.
- **The old platform (SOGGA / Chargebee).** A family that predates Sogverse may still be
  held there. Not covered by this procedure; say so when reporting the erasure done.

## Last executed

Prod, 2026-09-11: a customer with one gamer and no second parent; no payments,
subscriptions, Stripe customer, participations or storage objects. The single delete
removed both auth users; the re-scan returned zero hits. The old platform was not checked.
