-- Whether we have proof the address on a profile reaches the person who owns
-- the account: one nullable timestamp, written only by the server.
--
-- NULL means "not verified", and it is the resting state for most of the table:
-- gamer accounts carry a synthetic <token>@gamer.sogverse.internal address that
-- no inbox will ever answer, so their rows stay NULL forever and nothing about
-- that is an error to be corrected. A timestamp rather than a boolean because
-- the *when* is the part that answers questions later ("was this address
-- verified before or after the refund dispute?"), and a boolean throws it away
-- for nothing saved.
--
-- NO UPDATE GRANT, DELIBERATELY — AND THIS IS THE WHOLE POINT OF THE COLUMN
--
-- `profiles` is the one table in the schema with column-scoped UPDATE grants
-- (phone, spoken_languages, locale, first_name, last_name, home_location_id),
-- pinned by an exact-equality assertion in the DB authorization spine. The
-- reflex when adding a column here is to add a grant beside those. Do not. A
-- verification marker a user can set is not a verification marker: it says only
-- that its owner wanted it to say something. The column is written exclusively
-- by service-role code — the route that validates a signed link from the
-- address itself — and read by everyone.
--
-- `service_role` needs no new grant: `GRANT ALL ON TABLE public.profiles TO
-- service_role` is a table-level ACL, and table-level privileges cover every
-- column the table has or later gains. The DO block at the bottom reads that
-- back out of the catalog rather than asserting it from memory.
--
-- WHY A CHANGED ADDRESS RESETS IT
--
-- The marker is a claim about one specific address, not about the account. Let
-- it survive an email change and it becomes a claim about whatever address is
-- there now — which nobody ever proved, and which is exactly the state an
-- attacker who has taken over a session would want to manufacture. So the
-- trigger below empties it whenever `email` actually moves. Re-verifying is a
-- new link to the new inbox, which is the honest cost.
--
-- The reset runs BEFORE UPDATE OF email, and the `IS DISTINCT FROM` test is
-- load-bearing rather than defensive: `UPDATE OF email` fires whenever `email`
-- appears in the SET list, including a no-op rewrite to the same string, and a
-- server-side re-save of an unchanged profile must not quietly un-verify a
-- family. Only a real change clears it.

ALTER TABLE public.profiles
  ADD COLUMN email_verified_at timestamp with time zone;

COMMENT ON COLUMN public.profiles.email_verified_at IS
  'When the address in profiles.email was last proven to reach this account''s '
  'owner, or NULL for "not verified" — the resting state for gamer rows, whose '
  'synthetic <token>@gamer.sogverse.internal address no inbox answers. Written '
  'only by service_role (the route that validates a signed verification link); '
  'there is deliberately no UPDATE grant at any level for authenticated or '
  'anon, because a marker its own subject can set proves nothing. Reset to NULL '
  'by trg_reset_email_verification whenever profiles.email changes — the value '
  'is a claim about one address, not about the account.';

CREATE OR REPLACE FUNCTION public.reset_email_verification_on_email_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $$
BEGIN
  -- A no-op rewrite of the same address is not a change and must not cost the
  -- family their verified state; only a different string does.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- No grants, deliberately. PostgreSQL does not check EXECUTE on a trigger
-- function — the executor calls it from the trigger context — so granting one
-- only widens the callable surface for nothing. REVOKE strips the EXECUTE
-- PUBLIC gets by default at CREATE FUNCTION time.
REVOKE ALL ON FUNCTION public.reset_email_verification_on_email_change() FROM PUBLIC;

CREATE TRIGGER trg_reset_email_verification
  BEFORE UPDATE OF email ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reset_email_verification_on_email_change();

COMMENT ON TRIGGER trg_reset_email_verification ON public.profiles IS
  'Empties profiles.email_verified_at whenever profiles.email actually changes: '
  'the marker is a claim about one address, so it cannot be allowed to follow '
  'the account onto a new one. Fires on UPDATE OF email, which includes a SET '
  'that rewrites the same value, so the body tests IS DISTINCT FROM and leaves '
  'an unchanged address verified.';

-- Assert the end state rather than trusting that the statements above took the
-- branch they look like they took. Apply-time protection: it says what was true
-- when 00186 ran, and nothing about later migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = 'email_verified_at'
       AND is_nullable = 'YES'
       AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION 'profiles.email_verified_at is missing, not nullable, or not timestamptz';
  END IF;

  -- The whole point of the column, read back out of the catalog. A grant here
  -- would be invisible in application behaviour right up until someone marked
  -- their own unproven address verified.
  IF has_column_privilege('authenticated', 'public.profiles', 'email_verified_at', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE profiles.email_verified_at — this column is server-written proof and must carry no UPDATE grant';
  END IF;

  IF has_column_privilege('anon', 'public.profiles', 'email_verified_at', 'UPDATE') THEN
    RAISE EXCEPTION 'anon can UPDATE profiles.email_verified_at';
  END IF;

  -- The write path that DOES exist. Table-level GRANT ALL is supposed to reach
  -- every column including new ones; assert it rather than assume it, because
  -- the verify route has no other way in.
  IF NOT has_column_privilege('service_role', 'public.profiles', 'email_verified_at', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role cannot UPDATE profiles.email_verified_at — the table-wide grant did not reach the new column, and the verify route has no other path';
  END IF;

  -- Reads are table-wide and unchanged; assert it so "no grant" is understood as
  -- "no WRITE grant" rather than a column nobody can see.
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'email_verified_at', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated cannot SELECT profiles.email_verified_at — the table-wide read grant did not reach the new column';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'profiles'
       AND t.tgname = 'trg_reset_email_verification'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_reset_email_verification is missing — a changed address would stay verified';
  END IF;

  -- And the standing invariant 00137/00184 also pin: the column-level UPDATE
  -- surface must never have arrived as a table-wide grant, which would carry
  -- `role`.
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated can UPDATE profiles.role — a table-wide grant leaked in';
  END IF;
END;
$$;
