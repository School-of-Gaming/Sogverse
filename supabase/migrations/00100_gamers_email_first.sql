-- Make gamer accounts email-first, like every other role.
--
-- Background: gamer profiles historically stored their identity in
-- `profiles.username` (an opaque `g<hex>` token) and had `email` forced to
-- NULL. The *real* auth identifier — a synthetic
-- `<token>@gamer.sogverse.internal` address — lived only in `auth.users.email`
-- and was re-derived from `username` on demand at the call site.
--
-- This backfills that synthetic address onto `profiles.email` so gamers carry a
-- real, queryable email like everyone else, then makes `email` NOT NULL for all
-- roles. `username` is intentionally left in place; a follow-up migration drops
-- it once no code reads it. The existing `auth_identifier_check` still requires
-- `username` for gamers and that remains true (the create route keeps writing
-- it), so the constraint is untouched here.

-- 1. Backfill: gamers currently have email NULL. Reconstruct the synthetic
--    address from the stored username, lowercased to match generateGamerEmail()
--    (src/lib/utils.ts) and the value already in auth.users.email.
UPDATE public.profiles
SET email = lower(username) || '@gamer.sogverse.internal'
WHERE role = 'gamer'
  AND email IS NULL
  AND username IS NOT NULL;

-- 2. Every role now has an email; enforce it at the column level. This also
--    surfaces in the generated types as `email: string` (non-null). The ALTER
--    fails loudly if any row still has a NULL email, which is the safety net.
ALTER TABLE public.profiles
  ALTER COLUMN email SET NOT NULL;
