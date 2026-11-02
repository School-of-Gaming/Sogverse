-- School of Gaming's own mailing-list consent rows leave Sogverse's consent
-- tables, which now hold only the partner's list.
--
-- WHAT THIS CHANGES
--
-- 1. Every `school_of_gaming` row of `marketing_consents` and
--    `marketing_consent_events` is deleted. That list is answered in Klaviyo,
--    and the granted answers are already there. The `registration`-sourced
--    events go with them: the registration writer only ever wrote our own list.
-- 2. The schema refuses those rows from now on: both tables CHECK that the
--    consent type is `lynx_educate`, and the events' source CHECK admits only
--    `settings` and `enrolment`, the two surfaces set_marketing_consent accepts.
--    set_marketing_consent keeps its own guard, which gives the clearer message.
-- 3. The comments that described the kept rows say what is true now.
--
-- The enum value `school_of_gaming` stays: a product still asks for it, and the
-- answer is stored on the booking and sent to Klaviyo.

-- ---------------------------------------------------------------------------
-- 1. The rows
-- ---------------------------------------------------------------------------

DELETE FROM public.marketing_consent_events
 WHERE consent_type = 'school_of_gaming'::public.marketing_consent_type;

DELETE FROM public.marketing_consents
 WHERE consent_type = 'school_of_gaming'::public.marketing_consent_type;

-- ---------------------------------------------------------------------------
-- 2. The schema refuses them
-- ---------------------------------------------------------------------------

ALTER TABLE public.marketing_consents
  ADD CONSTRAINT chk_marketing_consents_type
  CHECK (consent_type = 'lynx_educate'::public.marketing_consent_type);

ALTER TABLE public.marketing_consent_events
  ADD CONSTRAINT chk_marketing_consent_events_type
  CHECK (consent_type = 'lynx_educate'::public.marketing_consent_type);

ALTER TABLE public.marketing_consent_events
  DROP CONSTRAINT chk_marketing_consent_events_source;

ALTER TABLE public.marketing_consent_events
  ADD CONSTRAINT chk_marketing_consent_events_source
  CHECK (source = ANY (ARRAY['settings'::text, 'enrolment'::text]));

-- ---------------------------------------------------------------------------
-- 3. The comments
-- ---------------------------------------------------------------------------

COMMENT ON TYPE public.marketing_consent_type IS 'The marketing permissions a parent can be asked for in Sogverse. lynx_educate is our partner''s list, asked for only on products an admin has attached it to — see product_marketing_consents — and the only type marketing_consents and marketing_consent_events hold. school_of_gaming is our own mailing list, whose current answer lives in Klaviyo: a product can still ask for it, and that answer is stored on the booking and sent there, while Sogverse keeps what the parent answered at registration (profiles.registration_marketing_consent) and no account-level answer of its own. An enum rather than a whitelist table because a marketing consent, unlike a consent DOCUMENT, has no text to version and no republication for a stored row to outlive: it is a standing permission to mail, and the party it names is the whole of it.';

COMMENT ON TABLE public.marketing_consents IS 'The CURRENT answer to "may we mail this parent about this thing" — one row per (customer, consent type), and the row every send reads. Deliberately not derived from marketing_consent_events: a send must not fold a history to learn whether it may run, and the present tense must not depend on a log a retention policy could one day trim. An ABSENT row means never asked or never answered, which is not the same as `granted = false` (a parent who said no) — both are "do not mail", and only one of them is a decision the parent made. Account-level on purpose: the subject of a marketing consent is a mailbox, and a mailbox belongs to one adult rather than to one seat, which is the exact inverse of consent_acceptances and its per-enrolment key. REVOCABLE by construction — that is what makes this a separate system from the non-revocable enrolment conditions, which mandate the split. Holds lynx_educate answers alone, enforced by a CHECK: School of Gaming''s own list is answered in Klaviyo. Written by set_marketing_consent and by nothing else: no Data API role holds a write grant.';

COMMENT ON TABLE public.marketing_consent_events IS 'APPEND-ONLY history: one row per CHANGE to a marketing consent, and the evidence behind whatever marketing_consents currently says. Nothing updates or deletes a row here — no Data API role holds any write grant at all, and the only writer is set_marketing_consent — because an event is a statement that something happened at an instant, and editing one would destroy the only thing the table is for. A repeat submission that changes nothing appends nothing: a log of "changes" that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. Rows carry NO unique constraint — granting, revoking and granting again is the ordinary life of a revocable consent, and those three rows are history rather than duplicates. Holds lynx_educate events alone, enforced by a CHECK, like marketing_consents.';

COMMENT ON COLUMN public.marketing_consent_events.source IS 'Which surface the answer came from: `settings` (the toggle on their own account page) or `enrolment` (the ask inside a product signup panel), the two set_marketing_consent accepts. This is the one field on an event that no other field can corroborate. A CHECK rather than an enum because the set is a list of our own surfaces, which move with the product rather than with the data model.';

COMMENT ON COLUMN public.gamer_photo_consent_events.source IS 'Which surface the answer came from: `settings` (the card on the gamer''s page under the parent''s My SOG) or `enrolment` (the ask inside a product signup panel). There is deliberately NO `registration` value: no gamer exists while a parent is registering, so there is nothing for a photo consent to be about at that moment. A CHECK rather than an enum because the set is a list of our own surfaces, which move with the product rather than with the data model.';


-- The body is unchanged apart from the comment on the consent-type guard.
CREATE OR REPLACE FUNCTION public.set_marketing_consent(p_consent_type public.marketing_consent_type, p_granted boolean, p_source text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_customer_id uuid;
  v_current     boolean;
BEGIN
  PERFORM public.assert_role('customer');

  IF p_consent_type IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION 'a marketing consent needs both a type and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- School of Gaming's own list is answered in Klaviyo. The tables' CHECKs
  -- refuse it too; this guard is here for the clearer message.
  IF p_consent_type <> 'lynx_educate'::public.marketing_consent_type THEN
    RAISE EXCEPTION 'marketing consent % is answered in Klaviyo, not here', p_consent_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- The source is the one field on an event that nothing else can corroborate,
  -- so only the two surfaces that call this may be named. NULL is refused by
  -- the same statement rather than by a NOT NULL further down, so the message
  -- names the real problem.
  IF p_source IS NULL OR p_source NOT IN ('settings', 'enrolment') THEN
    RAISE EXCEPTION
      'marketing consent source must be settings or enrolment (got %)',
      COALESCE(p_source, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  v_customer_id := (SELECT auth.uid());

  -- FOR UPDATE so two submissions racing on the same toggle serialize rather
  -- than both concluding they are the change. A row that does not exist locks
  -- nothing, which is the harmless half: the ON CONFLICT below is what settles
  -- a first-answer race, and the losing side writes an event for a state it
  -- genuinely did set.
  SELECT mc.granted
    INTO v_current
    FROM public.marketing_consents mc
   WHERE mc.customer_id = v_customer_id
     AND mc.consent_type = p_consent_type
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL here, and NULL is
  -- distinct from both true and false — which is the intended reading. "Never
  -- answered" is not the same state as "answered no", so a parent explicitly
  -- declining for the first time is a CHANGE and gets its event, while a
  -- re-submission of an answer already on file is not and does not.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.marketing_consents (
    customer_id, consent_type, granted, updated_at
  )
  VALUES (v_customer_id, p_consent_type, p_granted, now())
  ON CONFLICT (customer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.marketing_consent_events (
    customer_id, consent_type, granted, source
  )
  VALUES (v_customer_id, p_consent_type, p_granted, p_source);
END;
$$;

REVOKE ALL ON FUNCTION public.set_marketing_consent(public.marketing_consent_type, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(public.marketing_consent_type, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(public.marketing_consent_type, boolean, text) TO service_role;

COMMENT ON FUNCTION public.set_marketing_consent(public.marketing_consent_type, boolean, text) IS 'The one writer of a marketing consent: the settings toggle and the product signup panel both call it, so the two paths cannot drift. Guard-first on assert_role(''customer'') — gamers and gedus hold no marketing consents, and an admin toggles their own on their own parent account rather than through here, because the answer belongs to whoever owns the mailbox. The customer is auth.uid() and is never a parameter, so there is nothing for a caller to aim at another family. p_source must be `settings` or `enrolment`, the two surfaces that call it. Only lynx_educate is accepted: School of Gaming''s own list is answered in Klaviyo — a product signup panel''s school_of_gaming answer is stored on the booking and sent there. The tables'' CHECKs refuse the same rows; the guard here is what names the reason. IDEMPOTENT AND HONEST ABOUT IT — submitting the state already on file succeeds and appends NO event, because a change log that recorded non-changes would answer "how often did this parent change their mind" with a number made of page loads. A first explicit "no" IS a change: an absent row means never answered, which is not the same state as a recorded refusal.';
