-- The registration marketing answer is recorded by one function, in one
-- transaction, or not at all.
--
-- WHAT WAS WRONG
--
-- 00220 built the marketing-consent system as a state table plus an append-only
-- event log, and said plainly why: the state table is the answer every send
-- reads, and the event log is the evidence behind it. It then routed every
-- self-service write through `set_marketing_consent`, which writes both rows in
-- one function call and therefore in one transaction.
--
-- The registration answer was the one write that did not go through a function.
-- `set_marketing_consent` refuses the `registration` source on purpose — that
-- provenance may only be claimed by the register route, with the service-role
-- client, before the account has a session — so the route wrote the two rows
-- itself, as two separate PostgREST calls: an upsert into marketing_consents,
-- then an insert into marketing_consent_events.
--
-- Two calls are two transactions, and the second one can fail on its own. When
-- it does, the state table says a parent answered and the log has no record of
-- them ever being asked. That is the precise failure 00220's header calls out as
-- the thing the log exists to prevent: "an event asserting a state that is not
-- on file is worse than no record at all, and the log exists to corroborate the
-- state table." The route's own comment claimed the pair was all-or-nothing. It
-- was only half-or-nothing: a failed state write did skip the event, but a
-- failed event write left the state standing uncorroborated. On the one consent
-- whose whole value is being able to prove where an address came from, that is
-- the half that matters — an opt-in nobody can evidence is an opt-in we cannot
-- defend, and it is silently indistinguishable from one that was recorded
-- properly.
--
-- WHY A FUNCTION AND NOT A CLIENT-SIDE TRANSACTION
--
-- PostgREST has no transaction spanning two requests, and the admin client
-- speaks PostgREST. A function is how two statements become one unit of work
-- here, exactly as it already is for `set_marketing_consent` one call over. It
-- also puts the pair's invariant in the database rather than in a route comment,
-- which is the only place a future second caller would read it.
--
-- WHY IT IS NARROWER THAN set_marketing_consent, IN THREE WAYS
--
-- This function exists to mint the one provenance no live caller may claim, so
-- every degree of freedom it does not need is a way for that claim to be
-- forged, and each is closed:
--
--   * The consent type is NOT a parameter. It is `school_of_gaming`, hardcoded.
--     Ours is the only mailing list asked for at registration — the partner's is
--     asked on the products an admin attached it to, and nowhere else (00220) —
--     so a parameter here would be a way to stamp a Lynx opt-in as having been
--     given on the sign-up form, which no sign-up form has ever asked for.
--   * The source is NOT a parameter. It is `registration`, hardcoded, because
--     that is the entire reason this function exists.
--   * The customer IS a parameter, and has to be: there is no session to read
--     one from, which is the whole difficulty. That is exactly why the function
--     is granted to `service_role` alone and to nothing else — a parameter
--     naming the subject is a parameter that can be aimed at somebody, so the
--     only defence is that no reachable role can call it. It is not exposed to
--     `authenticated` or `anon`, so it is outside the §3.4 authorization spine's
--     surface (the spine classifies what those two roles can execute); the grant
--     below is the whole of its access control, and the role check inside is
--     defence in depth behind it.
--
-- WHY IT STILL CHECKS THE PROFILE'S ROLE
--
-- `set_marketing_consent` guards on `assert_role('customer')`, which is what
-- keeps gamers and gedus out of a table whose subject is a mailbox. This
-- function cannot use that primitive — it has no session, and the role it needs
-- to test belongs to the profile named in the argument rather than to the
-- caller — so it tests that profile directly. Same invariant, read from the
-- only place it is available here. A service-role caller aiming this at a gedu
-- gets an exception rather than a marketing consent for a contract holder.
--
-- WHY IT APPENDS AN EVENT ONLY WHEN THE STATE MOVES
--
-- The same rule `set_marketing_consent` follows, for the same reason 00220 gives
-- at length: the log records CHANGES, not calls, or "how often did this parent
-- change their mind" is answered with a number made of retries. At registration
-- the row cannot already exist — the account is seconds old — so the ordinary
-- call is always a change and always writes both rows. What the check buys is
-- that a retried request appends nothing, which the route's two blind writes
-- could not promise.
--
-- A DECLINE IS STILL A CHANGE, and still recorded. An absent row means "never
-- asked"; a `granted = false` row means "asked and said no". The sign-up form
-- asked, so the answer is written either way — `IS NOT DISTINCT FROM` is what
-- makes a first explicit "no" register as a move away from nothing, and it is
-- carried over from `set_marketing_consent` verbatim.
--
-- WHAT THIS MIGRATION DOES NOT TOUCH
--
-- No existing object is altered: not `set_marketing_consent`, not either table,
-- not their grants or policies. This is an addition beside them, which is also
-- what keeps it safe to push ahead of the deploy that starts calling it — the
-- currently deployed route goes on making its two writes against tables whose
-- grants have not moved.

CREATE FUNCTION public.record_registration_marketing_consent(
  p_customer_id uuid,
  p_granted     boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_current boolean;
BEGIN
  IF p_customer_id IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION
      'a registration marketing consent needs both a customer and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The role invariant `set_marketing_consent` gets from assert_role, read off
  -- the named profile instead because there is no session here to ask about.
  -- A missing profile fails the same test and gets the same refusal: both mean
  -- "this is not a parent's mailbox".
  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_customer_id
       AND p.role = 'customer'
  ) THEN
    RAISE EXCEPTION
      'marketing consent belongs to a customer profile (% is not one)',
      p_customer_id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- FOR UPDATE so a retry racing the original serializes rather than both
  -- concluding they are the change. A row that does not exist locks nothing,
  -- which is the harmless half — the ON CONFLICT below settles a first-answer
  -- race, and the losing side writes an event for a state it genuinely set.
  SELECT mc.granted
    INTO v_current
    FROM public.marketing_consents mc
   WHERE mc.customer_id = p_customer_id
     AND mc.consent_type = 'school_of_gaming'
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL, and NULL is
  -- distinct from both true and false, which is the intended reading. Never
  -- answered is not the same state as answered no, so a parent declining on the
  -- sign-up form is a change and gets its event.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.marketing_consents (
    customer_id, consent_type, granted, updated_at
  )
  VALUES (p_customer_id, 'school_of_gaming', p_granted, now())
  ON CONFLICT (customer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.marketing_consent_events (
    customer_id, consent_type, granted, source
  )
  VALUES (p_customer_id, 'school_of_gaming', p_granted, 'registration');
END;
$$;

COMMENT ON FUNCTION public.record_registration_marketing_consent(uuid, boolean)
IS
  'Record the marketing answer given on the parent sign-up form — the state row '
  'and its event row together, in one transaction. The register route called '
  'PostgREST twice for this and two calls are two transactions, so a failed '
  'second write left marketing_consents asserting an answer that '
  'marketing_consent_events could not corroborate; on the one consent whose '
  'value is provable provenance, an opt-in nobody can evidence is worse than '
  'none. Deliberately narrower than set_marketing_consent: the consent type is '
  'hardcoded to school_of_gaming (ours is the only list asked for at '
  'registration — the partner''s is asked on products, per 00220) and the source '
  'is hardcoded to `registration`, so neither can be forged through this '
  'function. The customer IS a parameter because no session exists yet, which is '
  'why the only EXECUTE grant is to service_role: a parameter naming the '
  'subject can be aimed at somebody, so nothing reachable may call it. It still '
  'tests that the named profile is a `customer`, which is the invariant '
  'assert_role gives the self-service writer, read from the only place '
  'available here. Appends an event only when the state actually MOVES, so a '
  'retried registration request records nothing twice — and a first explicit '
  '"no" IS a move, because an absent row means never asked.';

REVOKE EXECUTE ON FUNCTION
  public.record_registration_marketing_consent(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.record_registration_marketing_consent(uuid, boolean) TO service_role;
