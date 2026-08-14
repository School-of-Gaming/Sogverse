-- Rate-limit the verification-email send the same way feedback is rate-limited.
--
-- WHY A ROUTE ANYONE MAY PRESS NEEDS A LIMIT IN THE DATABASE
--
-- `POST /api/auth/verify-email/send` can name no recipient — it reads the
-- address off the session — so the worst a caller can do with it is send
-- themselves mail. That is what makes it safe to expose, and it is NOT what
-- makes it free: every send spends one message from the shared Brevo quota, and
-- that quota also carries password-reset mail. A caller holding the button down
-- costs other people their ability to get back into their accounts, which is a
-- real harm even though nothing about it reaches another user's data.
--
-- The limit lives here rather than in the route for the same reason feedback's
-- does: an in-process counter is per-instance and resets on every deploy, and
-- the route is not the only way in — a signed-in caller can drive PostgREST
-- directly. A row in a table, counted under an advisory lock, is the only
-- version of this that two concurrent requests cannot both pass.
--
-- SIX PER HOUR, COPIED DELIBERATELY
--
-- The shape is `submit_feedback`'s, down to the number: advisory xact lock on
-- the caller, count the trailing hour, refuse at six by RETURNING FALSE rather
-- than raising, insert otherwise. Returning false is the load-bearing half —
-- "you have asked too often" is an ordinary outcome of pressing a button, not
-- an error, and the route maps it to a 429 the settings card can word for
-- itself. Six also happens to be generous for this button: a person who has not
-- received the mail resends once or twice, not six times.
--
-- WHY THIS TABLE PRUNES ITSELF AND feedback_submissions DOES NOT
--
-- A feedback row is the feedback — it is read back, answered, and kept. These
-- rows are pure bookkeeping: nothing reads them but the count above, and a row
-- older than an hour can never change that count again. So the RPC deletes the
-- caller's expired rows on the way past, which keeps the table proportional to
-- recent activity with no job to schedule and nothing to remember. It is the
-- caller's own rows only, under the lock already held, so the delete adds no
-- contention that the insert did not already have.
--
-- NO GRANTS FOR authenticated OR anon, DELIBERATELY
--
-- The count is only trustworthy if the rows are. A caller who could DELETE their
-- own rows would clear their own limit, and one who could INSERT could file
-- rows against the wrong hour; either would make the table decorative. So the
-- table carries no Data API grant at all beyond `service_role`'s — every write
-- goes through the SECURITY DEFINER RPC below, which is the only thing that
-- ever names a user, and it names `auth.uid()`. RLS is enabled with no policies
-- because there is nothing to authorize: with no grant, no policy could ever be
-- consulted, and enabling it keeps the table inside the standing "every table
-- has RLS" sweep rather than being an exception someone has to justify later.

CREATE TABLE public.verification_email_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.verification_email_requests IS
  'One row per verification-email send, written only by '
  'request_my_verification_email. The rows exist to be counted and nothing '
  'else: they protect the shared Brevo quota (whose exhaustion would degrade '
  'password-reset delivery) from a button any signed-in caller may press. The '
  'RPC prunes the caller''s rows older than an hour as it goes, so the table '
  'stays proportional to recent activity with no scheduled job behind it.';

-- The index the count uses, in the shape feedback's carries: leading on the
-- user because every read is for one caller, then descending on time because
-- the predicate is a trailing window.
CREATE INDEX idx_verification_email_requests_user_created
  ON public.verification_email_requests (user_id, created_at DESC);

ALTER TABLE public.verification_email_requests ENABLE ROW LEVEL SECURITY;

-- `service_role` only, matching feedback_submissions' table-level ACL. Nothing
-- for `authenticated` or `anon` — see the header.
GRANT ALL ON TABLE public.verification_email_requests TO service_role;

CREATE FUNCTION public.request_my_verification_email()
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_count   integer;
BEGIN
  -- Not reachable through PostgREST as `authenticated` (that role's JWT always
  -- carries a subject), but a request row attributed to nobody would count
  -- against nobody, so this fails closed rather than inserting NULL.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock keyed to the caller: without it two concurrent requests both
  -- read the same count and both pass, which is precisely the bypass a
  -- database-side limit exists to close.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  SELECT count(*) INTO v_count
  FROM public.verification_email_requests
  WHERE user_id = v_user_id
    AND created_at > now() - interval '1 hour';

  -- Returns false (not an error) when the per-hour rate limit is hit; the route
  -- maps that to 429.
  IF v_count >= 6 THEN
    RETURN false;
  END IF;

  INSERT INTO public.verification_email_requests (user_id)
  VALUES (v_user_id);

  -- These rows are pure bookkeeping — nothing reads them but the count above,
  -- and one older than the window can never change that count again — so the
  -- RPC self-prunes instead of leaving a table to grow forever. Scoped to the
  -- caller, under the lock already held.
  DELETE FROM public.verification_email_requests
  WHERE user_id = v_user_id
    AND created_at <= now() - interval '1 hour';

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.request_my_verification_email() IS
  'Self-scoping rate-limit gate for the verification-email send: takes no '
  'argument and writes a verification_email_requests row for auth.uid(), '
  'refusing with false once the caller has six rows in the trailing hour. '
  'Prunes the caller''s expired rows on the way past, because nothing reads '
  'them but its own count. The route maps false to 429.';

-- A created function comes back PUBLIC-executable, so the REVOKE is
-- load-bearing rather than boilerplate. `authenticated` only: the route calls
-- this on the caller's OWN client, which is what makes the auth.uid() keying
-- the whole of the authorization. `service_role` gets no grant — an admin-client
-- caller would be counted as whoever the JWT said, and there is no such path.
REVOKE EXECUTE ON FUNCTION public.request_my_verification_email() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_my_verification_email() TO authenticated;

-- Assert the end state rather than trusting that the statements above took the
-- branch they look like they took. Apply-time protection: it says what was true
-- when 00189 ran, and nothing about later migrations.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'verification_email_requests'
       AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'verification_email_requests is missing or has RLS disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'verification_email_requests'
       AND indexname = 'idx_verification_email_requests_user_created'
  ) THEN
    RAISE EXCEPTION 'idx_verification_email_requests_user_created is missing — the trailing-hour count would seq-scan';
  END IF;

  -- The whole point of the table having no user-facing grant: a caller who
  -- could write these rows could clear or forge their own limit.
  IF has_table_privilege('authenticated', 'public.verification_email_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.verification_email_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.verification_email_requests', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.verification_email_requests', 'DELETE')
  THEN
    RAISE EXCEPTION 'authenticated holds a grant on verification_email_requests — the rate-limit rows must only ever be written by the definer RPC';
  END IF;

  IF has_table_privilege('anon', 'public.verification_email_requests', 'SELECT')
     OR has_table_privilege('anon', 'public.verification_email_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.verification_email_requests', 'UPDATE')
     OR has_table_privilege('anon', 'public.verification_email_requests', 'DELETE')
  THEN
    RAISE EXCEPTION 'anon holds a grant on verification_email_requests';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.verification_email_requests', 'SELECT') THEN
    RAISE EXCEPTION 'service_role cannot read verification_email_requests — the DB tests assert against it through the admin client';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'request_my_verification_email'
       AND p.pronargs = 0
  ) THEN
    RAISE EXCEPTION 'request_my_verification_email is missing';
  END IF;

  -- A STRICT function skips its body on NULL input, which would skip the guard.
  -- It takes no arguments, so this cannot bite today; assert it anyway, because
  -- the spine does and a later rewrite that adds a parameter should fail here
  -- first.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'request_my_verification_email'
       AND p.proisstrict
  ) THEN
    RAISE EXCEPTION 'request_my_verification_email is STRICT — its guard would be skippable';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.request_my_verification_email()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE request_my_verification_email — the route calls it on the caller''s own client';
  END IF;

  IF has_function_privilege('anon', 'public.request_my_verification_email()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE request_my_verification_email — the REVOKE FROM PUBLIC did not take';
  END IF;
END;
$$;
