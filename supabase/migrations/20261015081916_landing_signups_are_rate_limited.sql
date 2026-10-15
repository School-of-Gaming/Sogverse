-- Landing page email sign-ups are rate limited.
--
-- WHAT THIS ADDS
--
-- landing_signup_attempts: one row per sign-up a landing page's email form
-- sends on, keyed by a hash of the address the request came from. The rows
-- exist to be counted and nothing else: the form is public, and every
-- accepted sign-up makes Brevo send a confirmation mail to whatever address
-- was typed, so an unlimited form is a way to mail strangers from our
-- account. Nothing about the person signing up is stored — not the email
-- address, not the name, not the page — only the request's hashed origin and
-- when it was made, and only for the hour the count looks back over.
--
-- take_landing_signup_allowance(p_client_key): the one writer. Under an
-- advisory lock on the key, it counts the key's attempts in the trailing hour,
-- answers false once there are ten, and otherwise records one and answers
-- true. It prunes every row older than the hour on the way past, so the table
-- holds at most an hour of attempts with no scheduled job behind it. Counted
-- in Postgres rather than in the route's process because an in-memory counter
-- is per instance and resets on every deploy.
--
-- ACCESS
--
-- service_role only, on both: the sign-up route calls the function on the
-- service-role client, since the form's readers have no session. RLS is on
-- with no policy, so no other role could read a row even if granted.

CREATE TABLE public.landing_signup_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_key text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT landing_signup_attempts_pkey PRIMARY KEY (id),
    CONSTRAINT landing_signup_attempts_client_key_shape CHECK (client_key ~ '^[0-9a-f]{64}$')
);

COMMENT ON TABLE public.landing_signup_attempts IS 'One row per landing page email sign-up the sign-up route accepted, written only by take_landing_signup_allowance and kept only to be counted: the client key is a sha256 of the address the request came from, and nothing about the person signing up is stored. Rows older than an hour are pruned by the same function.';

CREATE INDEX idx_landing_signup_attempts_key_time
    ON public.landing_signup_attempts USING btree (client_key, attempted_at DESC);

CREATE INDEX idx_landing_signup_attempts_time
    ON public.landing_signup_attempts USING btree (attempted_at);

ALTER TABLE public.landing_signup_attempts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.landing_signup_attempts TO service_role;

CREATE FUNCTION public.take_landing_signup_allowance(p_client_key text) RETURNS boolean
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_count integer;
BEGIN
  -- Without the lock, two concurrent requests from one address both read the
  -- same count and both pass.
  PERFORM pg_advisory_xact_lock(hashtext('landing_signup:' || p_client_key));

  DELETE FROM public.landing_signup_attempts
  WHERE attempted_at <= now() - interval '1 hour';

  SELECT count(*) INTO v_count
  FROM public.landing_signup_attempts
  WHERE client_key = p_client_key;

  IF v_count >= 10 THEN
    RETURN false;
  END IF;

  INSERT INTO public.landing_signup_attempts (client_key)
  VALUES (p_client_key);

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.take_landing_signup_allowance(p_client_key text) IS 'The rate limit on landing page email sign-ups: records one attempt for the client key (a sha256 of the request''s origin address) and answers true, or answers false once the key has ten attempts in the trailing hour. Prunes every attempt older than the hour on the way past. Called by the sign-up route on the service-role client, which maps false to 429.';

REVOKE ALL ON FUNCTION public.take_landing_signup_allowance(p_client_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_landing_signup_allowance(p_client_key text) TO service_role;
