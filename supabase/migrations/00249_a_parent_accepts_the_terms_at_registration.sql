-- A parent accepts the terms, and declares they are a guardian, when they
-- register — and the account records which text they accepted.
--
-- WHY
--
-- Two separate obligations, answered by one tick and one record.
--
--   * **The contract.** In the EU a set of terms binds only if it was presented
--     before the contract was concluded and the business can afterwards show
--     WHICH VERSION was accepted and WHEN. Until now the register form neither
--     presented the terms nor recorded anything, so the honest answer to "what
--     did this family agree to" was nothing at all.
--   * **Article 8.** Consent on behalf of a child has to be given by the holder
--     of parental responsibility, and the controller has to make reasonable
--     efforts — proportionate to the technology and the risk — to verify that
--     it was. Sogverse's structure already carries most of that: only an adult
--     account holder can create a gamer, a gamer holds no payment relationship,
--     and every enrolment is an act of the account holder. The missing piece
--     was the account holder ever SAYING they are the parent or guardian. This
--     migration is the place that statement is kept.
--
-- Nothing more is intended by it. There is no identity check, no re-asking at
-- enrolment, and no second box: one declaration, recorded once per account
-- against the wording that was on screen.
--
-- WHY IT REUSES THE 00210 REGISTRY AND NOT A BOOLEAN COLUMN
--
-- A boolean on `profiles` would answer "did they tick it" and nothing else —
-- and the question that matters in a dispute is WHICH TEXT they ticked. 00210
-- already built the answer to that: `consent_documents` is a document identity,
-- `consent_document_versions` is one row per published revision, and the
-- current version of a slug is the row with the greatest created_at (version
-- DESC to break a tie deterministically). Republishing the terms is then one
-- INSERT, and every acceptance already on file goes on naming the text it was
-- actually given for. That derivation is copied verbatim from
-- `record_required_consents` below, deliberately: two spellings of "which
-- version is current" is one spelling too many.
--
-- WHY A NEW TABLE AND NOT consent_acceptances
--
-- `consent_acceptances` is per ENROLMENT — `participant_id` and `product_id`
-- are both NOT NULL, and 00210 says at length why there is no unique constraint
-- on it: a second child, or the same child a term later, is a fresh agreement
-- rather than a duplicate. Neither column has a value here. An acceptance of
-- the platform's own terms belongs to the ACCOUNT, conditions no seat, and is
-- recorded exactly once per version — so widening that table's two columns to
-- nullable would destroy the one invariant that makes it readable ("every row
-- here is a seat's condition") in order to store a row that is not about a seat
-- at all. Two tables, same registry, and neither one lies about its subject.
--
-- WHAT IS DELIBERATELY ABSENT, and it is the same list 00210 wrote
--
--   * No revocation. A row is a statement that an agreement happened at an
--     instant, and a statement about the past cannot be un-made. There is no
--     revoked_at column and there must never be one. (The revocable
--     marketing/photo consents are 00220 and 00244 and are a different system.)
--   * No signature and no locale. The terms are published in one text; a name
--     copied out of `profiles` would add no evidence the uid does not carry.
--   * No Data API write path. The only writer is the function below, granted to
--     `service_role` alone, called by the register route.
--
-- WHY THE DECLARATION IS A VERSIONED DOCUMENT WITH NO PAGE
--
-- `guardian-declaration` names no published page — it is the SENTENCE the
-- parent ticked, and its version is the version of that wording. It is in the
-- registry anyway because the thing worth proving is identical in both cases:
-- what exactly was on screen when they agreed. Rewriting the sentence is then
-- the same one-INSERT move as republishing the terms, and the accounts that
-- accepted the old wording go on naming it.

-- ---------------------------------------------------------------------------
-- 1. The two documents, and the version of each that is live today
-- ---------------------------------------------------------------------------
--
-- `terms-and-conditions` is published at /terms-and-conditions and its version
-- label is that page's own "Last updated" date, exactly as the two Roblox
-- documents' labels are (00210). `guardian-declaration` has no page: its
-- version is the date the sentence beside the register form's checkbox was
-- written.

INSERT INTO public.consent_documents (slug) VALUES
  ('terms-and-conditions'),
  ('guardian-declaration');

INSERT INTO public.consent_document_versions (document_slug, version) VALUES
  ('terms-and-conditions', '2026-08-31'),
  ('guardian-declaration', '2026-09-11');

-- ---------------------------------------------------------------------------
-- 2. The acceptances
-- ---------------------------------------------------------------------------

CREATE TABLE public.account_consent_acceptances (
  customer_id      uuid NOT NULL
                     REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_slug    text NOT NULL,
  document_version text NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, document_slug, document_version),
  CONSTRAINT account_consent_acceptances_document_fkey
    FOREIGN KEY (document_slug, document_version)
    REFERENCES public.consent_document_versions(document_slug, version)
);

COMMENT ON TABLE public.account_consent_acceptances IS
  'One row per (account, document VERSION) the account holder has accepted — '
  'the ACCOUNT-level counterpart of consent_acceptances, which is per enrolment '
  'and whose participant_id and product_id are both NOT NULL because a row '
  'there conditions one seat. A row here conditions no seat: it is what the '
  'person agreed to when they opened the account. Written at registration and '
  'NEVER REVOKED — a row is a statement that an agreement happened at an '
  'instant, and a statement about the past cannot be un-made, so there is no '
  'revoked_at column and there must never be one (the revocable marketing and '
  'photo consents are 00220 and 00244 and are a separate system). The versions '
  'live in the 00210 registry: consent_documents holds the identity, '
  'consent_document_versions one row per published revision, and the composite '
  'foreign key below is what stops a row naming a text nobody published. A '
  'LATER version is a fresh row rather than an edit, because accepting a '
  'revision is a new agreement and the old one still happened. INSERT-ONLY and '
  'insert-only from ONE place: no Data API role holds a write grant, and '
  'record_account_consents — service_role only — is the sole writer.';

COMMENT ON COLUMN public.account_consent_acceptances.customer_id IS
  'The adult who agreed, and the account the agreement belongs to. Always a '
  'profile whose role is `customer`: the writer refuses anything else, which is '
  'the invariant assert_role gives a self-service writer, read off the named '
  'profile because no session exists at registration.';

COMMENT ON COLUMN public.account_consent_acceptances.document_slug IS
  'Which document, never which revision of it — the stable identity in '
  'consent_documents.slug. Part of the primary key, so accepting two documents '
  'is two rows.';

COMMENT ON COLUMN public.account_consent_acceptances.document_version IS
  'The version that was CURRENT for this slug at the moment of acceptance, '
  'resolved server-side and never supplied by a caller. Part of the primary '
  'key, which is what makes a replay of the same acceptance idempotent and a '
  'later revision a new row rather than an overwrite.';

COMMENT ON COLUMN public.account_consent_acceptances.accepted_at IS
  'When the agreement was recorded, stamped by the server. A client never '
  'supplies it — a timestamp the agreeing party chooses proves nothing about '
  'when they agreed.';

ALTER TABLE public.account_consent_acceptances ENABLE ROW LEVEL SECURITY;

-- Two SELECT policies and no write policy, because there is no write grant for
-- a write policy to authorize — the inserts arrive through a SECURITY DEFINER
-- function, which bypasses RLS entirely. The `(SELECT …)` wrapper on each
-- predicate is the standing form here: it makes the call an InitPlan evaluated
-- once per statement rather than once per row. Both predicates are copied from
-- consent_acceptances (00210), which is the same question one table over.
CREATE POLICY admins_read_account_consent_acceptances
  ON public.account_consent_acceptances
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY customers_read_own_account_consent_acceptances
  ON public.account_consent_acceptances
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

-- SELECT and nothing more for `authenticated`; nothing at all for `anon`, since
-- a row names a person. `service_role` gets the full set, as it does on every
-- other table the DB suite asserts against through the admin client.
GRANT SELECT ON TABLE public.account_consent_acceptances TO authenticated;
GRANT ALL    ON TABLE public.account_consent_acceptances TO service_role;

-- ---------------------------------------------------------------------------
-- 3. The one writer
-- ---------------------------------------------------------------------------
--
-- Shaped after record_registration_marketing_consent (00221), which is the
-- other registration-time writer and the reason the shape is already settled:
--
--   * The customer IS a parameter, and has to be — there is no session when the
--     register route runs, which is the whole difficulty. A parameter naming
--     the subject is a parameter that can be aimed at somebody, so the only
--     defence is that no reachable role may call it: EXECUTE is granted to
--     `service_role` alone, which also puts it outside the §3.4 authorization
--     spine's surface (the spine classifies what `authenticated` and `anon` can
--     execute).
--   * It still tests the named profile's role, because that is the invariant
--     assert_role would give a self-service writer, read from the only place
--     available here. A service-role caller aiming this at a gedu or a child
--     gets an exception rather than a guardian declaration on an account that
--     holds no children.
--   * The VERSION is never a parameter. It is resolved per slug with the same
--     derivation record_required_consents uses — greatest created_at, version
--     DESC to break a tie deterministically — because an arbitrary answer to
--     "what is current" is worse than a wrong one, changing between reads.
--
-- It returns the number of rows it wrote, which is the only fact the caller
-- cannot derive: on a replay it is zero, and a zero that the caller did not
-- expect is worth a log line rather than an error.

CREATE FUNCTION public.record_account_consents(
  p_customer_id    uuid,
  p_document_slugs text[]
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_missing  text[];
  v_inserted integer;
BEGIN
  IF p_customer_id IS NULL
     OR p_document_slugs IS NULL
     OR array_length(p_document_slugs, 1) IS NULL
  THEN
    RAISE EXCEPTION
      'an account consent needs a customer and at least one document'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A NULL element is refused rather than skipped. `= ANY` and `unnest` both
  -- treat one as an unknown that quietly contributes nothing, so skipping it
  -- would record fewer documents than the caller asked for and say nothing
  -- about it — on a legal record, the wrong direction to fail in.
  IF array_position(p_document_slugs, NULL) IS NOT NULL THEN
    RAISE EXCEPTION
      'an account consent cannot name a NULL document'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = p_customer_id
       AND p.role = 'customer'
  ) THEN
    RAISE EXCEPTION
      'an account consent belongs to a customer profile (% is not one)',
      p_customer_id
      USING ERRCODE = 'raise_exception';
  END IF;

  -- Every named slug must have a published version, and the refusal names the
  -- ones that do not. Left to the NOT NULL on document_version this would abort
  -- with a constraint message naming no slug; a data error only a migration can
  -- create deserves a sentence saying which document is missing its text.
  v_missing := ARRAY(
    SELECT s
      FROM unnest(p_document_slugs) AS s
     WHERE NOT EXISTS (
       SELECT 1
         FROM public.consent_document_versions cdv
        WHERE cdv.document_slug = s
     )
  );

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION
      'no published version exists for %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ON CONFLICT DO NOTHING, and the primary key is what gives it meaning: a
  -- retried registration request re-records the same (account, slug, version)
  -- and writes nothing, while a parent who later accepts a NEW revision gets a
  -- second row rather than an overwrite. DISTINCT so a caller sending the same
  -- slug twice cannot make one statement fail the other in the same statement.
  WITH written AS (
    INSERT INTO public.account_consent_acceptances (
      customer_id, document_slug, document_version
    )
    SELECT p_customer_id,
           s,
           (SELECT cdv.version
              FROM public.consent_document_versions cdv
             WHERE cdv.document_slug = s
             ORDER BY cdv.created_at DESC, cdv.version DESC
             LIMIT 1)
      FROM (SELECT DISTINCT unnest(p_document_slugs) AS s) AS slugs
    ON CONFLICT (customer_id, document_slug, document_version) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM written;

  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.record_account_consents(uuid, text[]) IS
  'Record that an account holder accepted the named consent documents, each at '
  'that document''s CURRENT version — the only writer of '
  'account_consent_acceptances. Called by the parent register route after the '
  'account exists, with the fixed set the sign-up form asks about. The version '
  'is resolved here and never supplied by a caller: greatest created_at for the '
  'slug, version DESC to break a tie, the same derivation '
  'record_required_consents uses. Refuses a NULL or empty array, a NULL '
  'element, a slug with no published version, and a profile that is not a '
  '`customer` — the invariant assert_role gives a self-service writer, read off '
  'the named profile because no session exists at registration. The customer IS '
  'a parameter because of that missing session, which is exactly why the only '
  'EXECUTE grant is to service_role: a parameter naming the subject can be '
  'aimed at somebody, so nothing a browser can reach may call it. Idempotent on '
  '(account, slug, version), so a retried registration writes nothing twice '
  'while a later revision of a document is a fresh row rather than an '
  'overwrite. Returns the number of rows written.';

REVOKE EXECUTE ON FUNCTION
  public.record_account_consents(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.record_account_consents(uuid, text[]) TO service_role;
