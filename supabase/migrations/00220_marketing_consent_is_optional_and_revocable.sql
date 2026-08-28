-- Marketing consent is optional, account-level, and revocable at any time.
--
-- WHY THIS IS A SEPARATE SYSTEM, AND NOT A COLUMN ON consent_acceptances
--
-- 00210 built the enrolment-consent system and, in the same breath, forbade
-- this one from joining it. Its header says it outright: a required consent is
-- a NON-REVOCABLE enrolment condition, "there is no revoke, no withdraw, no
-- granted = false", and the revocable marketing/media consents are "a separate
-- future system". This migration is that system. Nothing here touches
-- consent_acceptances, consent_documents, consent_document_versions or
-- product_required_consents, and nothing there should ever learn about the
-- tables below.
--
-- The reason the two cannot share a table is not tidiness, it is what a row
-- MEANS. An acceptance row is a statement about the past — this family agreed
-- to this text at this instant — and a statement about the past cannot be
-- un-made. A marketing consent is a statement about the PRESENT — you may mail
-- me — and the whole point of it is that it can be withdrawn tomorrow without
-- anything else changing. Folding them together would let a parent switch off
-- an enrolment condition while keeping the seat it bought them, which is the
-- exact hazard 00210 wrote its warning about.
--
-- WHY STATE + EVENTS, AND NOT EVENTS ALONE
--
-- Two questions get asked of this data and they want different shapes:
--
--   * "May we mail this parent right now?" — asked by every send, and it wants
--     one indexed row read, not a fold over a history ordered by timestamp with
--     a tie-break nobody agrees on. That is `marketing_consents`, one row per
--     (customer, consent type), holding the answer.
--   * "When did they say so, and how did we ask?" — asked by a regulator, a
--     complaint, or anyone auditing where an address came from. That is
--     `marketing_consent_events`, append-only, one row per CHANGE.
--
-- Deriving the first from the second is possible and would be wrong twice over:
-- it puts an aggregate on the hot path, and it makes the current state depend
-- on the completeness of a log that a retention policy may one day trim. So the
-- state table is the answer and the event table is the evidence.
--
-- WHY THE EVENT LOG RECORDS CHANGES AND NOT CALLS
--
-- `set_marketing_consent` writes an event only when the state actually moves.
-- Re-submitting a settings form that changed nothing, or a stale tab replaying
-- its POST, appends nothing. An event log that recorded non-changes would
-- answer "how often did this parent change their mind" with a number made of
-- page loads, and the one question the log exists to answer honestly is exactly
-- that one. The call is still accepted and still succeeds — idempotent, but
-- honest about it.
--
-- WHY CONSENT IS ACCOUNT-LEVEL AND NOT PER ENROLMENT
--
-- The subject of a marketing consent is a MAILBOX, and a mailbox belongs to one
-- adult, not to one seat. A parent who says "stop emailing me about clubs" has
-- said it once, about themselves; making them say it again per child, per
-- product, per term would be a dark pattern wearing a data model. So the key is
-- (customer_id, consent_type) and nothing else — no product, no participant, no
-- enrolment. This is the precise inverse of consent_acceptances, whose key
-- deliberately repeats per seat because each seat is its own agreement.
--
-- The holder is always the purchasing customer. Gamers and gedus hold no
-- marketing consents: a child's synthetic address reaches nobody, and a gedu's
-- relationship with us is a contract (00201), not a mailing list. The RPC's
-- role guard is what enforces that rather than a comment.
--
-- WHY 'registration' IS A SOURCE NO CLIENT MAY WRITE
--
-- Three surfaces can set a marketing consent, and only two of them have a
-- session. The registration checkbox is ticked BEFORE the account exists, so it
-- is written by the register route with the service-role client, on the profile
-- it has just created. The settings toggle and the product-signup panel both run
-- as a signed-in customer and go through the RPC below.
--
-- If the RPC accepted 'registration', any signed-in customer could rewrite their
-- own history to claim an opt-in was given at sign-up rather than talked into
-- later — or, far more usefully to us and therefore far more dangerous, a bug in
-- our own client could quietly mislabel every settings toggle as a registration
-- consent and destroy the provenance the log exists to carry. The source is the
-- one field on an event that no other field can corroborate, so the one source
-- with no live caller is the one the RPC refuses. service_role writes it, and
-- service_role is not a caller anybody reaches.
--
-- WHY THE NUMBER JUMPS FROM 00214 TO 00220
--
-- Three lines of work are in flight over the same numbering space: `dev` sits at
-- 00214, this branch's base holds 00210-00212, and that base is still under
-- review and may gain follow-ups of its own. Staging is shared and a version
-- already present in remote history is silently treated as applied, so a
-- collision here does not fail loudly — it skips a migration without a word. The
-- gap buys room for both of the other lines to grow without either of them
-- having to renumber around this one.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT TOUCH
--
-- No existing function is recreated: not handle_new_user, not create_product,
-- not update_product. Each of those is being edited on another live branch, and
-- a CREATE OR REPLACE here would either lose that branch's work or collide with
-- it at merge. The wiring — the register route's write, and the admin product
-- form's call to the setter below — lands in the change that owns those files.

-- ---------------------------------------------------------------------------
-- 1. The consents that exist
-- ---------------------------------------------------------------------------
--
-- An enum rather than a whitelist table, which is the opposite of the choice
-- 00210 made for consent DOCUMENTS — and the difference is that a document has
-- versions, is republished, and is pointed at by rows that must survive its
-- rewording, none of which is true here. A marketing consent has no text to
-- version: it is a standing permission to mail, held by one of exactly two
-- parties, and adding a third party is a migration either way. What the enum
-- buys is that a typo cannot become a consent nobody can revoke.

CREATE TYPE public.marketing_consent_type AS ENUM (
  'school_of_gaming',
  'lynx_educate'
);

COMMENT ON TYPE public.marketing_consent_type IS
  'The marketing permissions a parent can hold. school_of_gaming is our own '
  'mailing list, asked for at parent registration. lynx_educate is our '
  'partner''s, asked for only on products an admin has attached it to — see '
  'product_marketing_consents. An enum rather than a whitelist table because a '
  'marketing consent, unlike a consent DOCUMENT (00210), has no text to version '
  'and no republication for a stored row to outlive: it is a standing '
  'permission to mail, and the party it names is the whole of it.';

-- ---------------------------------------------------------------------------
-- 2. What is true right now
-- ---------------------------------------------------------------------------

CREATE TABLE public.marketing_consents (
  customer_id  uuid NOT NULL
                 REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type public.marketing_consent_type NOT NULL,
  granted      boolean NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, consent_type)
);

COMMENT ON TABLE public.marketing_consents IS
  'The CURRENT answer to "may we mail this parent about this thing" — one row '
  'per (customer, consent type), and the row every send reads. Deliberately '
  'not derived from marketing_consent_events: a send must not fold a history to '
  'learn whether it may run, and the present tense must not depend on a log a '
  'retention policy could one day trim. An ABSENT row means never asked or '
  'never answered, which is not the same as `granted = false` (a parent who '
  'said no) — both are "do not mail", and only one of them is a decision the '
  'parent made. Account-level on purpose: the subject of a marketing consent is '
  'a mailbox, and a mailbox belongs to one adult rather than to one seat, which '
  'is the exact inverse of consent_acceptances (00210) and its per-enrolment '
  'key. REVOCABLE by construction — that is what makes this a separate system '
  'from the non-revocable enrolment conditions, per 00210''s own mandate. '
  'Written by set_marketing_consent and by the register route''s service-role '
  'client and by nothing else: no Data API role holds a write grant.';

COMMENT ON COLUMN public.marketing_consents.customer_id IS
  'The adult who holds the permission, always a profile with role `customer`. '
  'Gamers and gedus hold none — a child''s synthetic address reaches nobody, '
  'and a gedu''s relationship with us is a contract (00201) rather than a '
  'mailing list — and the RPC''s role guard is what enforces that rather than a '
  'CHECK, because a role is a mutable property of a profile and a CHECK would '
  'freeze it at insert time. ON DELETE CASCADE: a permission to mail somebody '
  'who no longer exists is not a record worth keeping, and the audit trail '
  'cascades with them for the same reason.';

COMMENT ON COLUMN public.marketing_consents.granted IS
  'True means we may mail; false means the parent said no. NOT NULL and no '
  'third state — "not asked" is the absence of the row, so a NULL here would be '
  'a second spelling of a state the primary key already expresses by omission.';

COMMENT ON COLUMN public.marketing_consents.updated_at IS
  'When this state was last CHANGED, stamped server-side. Not a call counter: '
  'set_marketing_consent leaves the row untouched when the submitted state '
  'already matches, so this is the moment the parent last actually moved the '
  'toggle. The full history is in marketing_consent_events.';

ALTER TABLE public.marketing_consents ENABLE ROW LEVEL SECURITY;

-- Two SELECT policies and no write policy, because there is no write grant for
-- a write policy to authorize: the writes arrive through a SECURITY DEFINER
-- function and through the service-role client, both of which bypass RLS
-- entirely. The `(SELECT …)` wrapper on each predicate is the standing form
-- here — it makes the call an InitPlan evaluated once per statement rather than
-- once per row.
CREATE POLICY admins_read_marketing_consents ON public.marketing_consents
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY customers_read_own_marketing_consents ON public.marketing_consents
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

-- SELECT and nothing more for `authenticated`; nothing at all for `anon`. A row
-- here names a person and their answer, so it is personal data on both counts.
GRANT SELECT ON TABLE public.marketing_consents TO authenticated;
GRANT ALL    ON TABLE public.marketing_consents TO service_role;

-- ---------------------------------------------------------------------------
-- 3. How it got that way
-- ---------------------------------------------------------------------------

CREATE TABLE public.marketing_consent_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL
                 REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type public.marketing_consent_type NOT NULL,
  granted      boolean NOT NULL,
  source       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_marketing_consent_events_source
    CHECK (source IN ('registration', 'settings', 'enrolment'))
);

COMMENT ON TABLE public.marketing_consent_events IS
  'APPEND-ONLY history: one row per CHANGE to a marketing consent, and the '
  'evidence behind whatever marketing_consents currently says. Nothing updates '
  'or deletes a row here — no Data API role holds any write grant at all, and '
  'the only writers are set_marketing_consent and the register route''s '
  'service-role client — because an event is a statement that something '
  'happened at an instant, and editing one would destroy the only thing the '
  'table is for. A repeat submission that changes nothing appends nothing: a '
  'log of "changes" that recorded non-changes would answer "how often did this '
  'parent change their mind" with a number made of page loads. Rows carry NO '
  'unique constraint — granting, revoking and granting again is the ordinary '
  'life of a revocable consent, and those three rows are history rather than '
  'duplicates.';

COMMENT ON COLUMN public.marketing_consent_events.granted IS
  'The state that was SET by this event, not the delta. Reading the log as a '
  'sequence of states is what makes a row meaningful on its own, and it is what '
  'lets the current-state table be reconstructed from the log if it ever has to '
  'be audited against it.';

COMMENT ON COLUMN public.marketing_consent_events.source IS
  'Which surface the answer came from: `registration` (the checkbox on the '
  'parent sign-up form), `settings` (the toggle on their own account page), or '
  '`enrolment` (the ask inside a product signup panel). This is the one field '
  'on an event that no other field can corroborate, which is why '
  'set_marketing_consent REFUSES `registration`: that source is written only by '
  'the register route through the service-role client, before the account has a '
  'session at all, so a value a client could send would be a provenance claim '
  'nothing checks. A CHECK rather than an enum because the set is a list of our '
  'own surfaces, which move with the product rather than with the data model.';

COMMENT ON COLUMN public.marketing_consent_events.created_at IS
  'When the answer was given, stamped by the server. A client never supplies '
  'it — a timestamp the consenting party chooses proves nothing about when they '
  'consented.';

CREATE INDEX idx_marketing_consent_events_customer
  ON public.marketing_consent_events (customer_id);

ALTER TABLE public.marketing_consent_events ENABLE ROW LEVEL SECURITY;

-- The same two SELECT policies as the state table, and for the same reason: a
-- parent may read their own history, an admin may read anyone's, and nobody
-- writes through the Data API at all.
CREATE POLICY admins_read_marketing_consent_events
  ON public.marketing_consent_events
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY customers_read_own_marketing_consent_events
  ON public.marketing_consent_events
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

GRANT SELECT ON TABLE public.marketing_consent_events TO authenticated;
GRANT ALL    ON TABLE public.marketing_consent_events TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Which products ask for which consent
-- ---------------------------------------------------------------------------
--
-- The mirror of product_required_consents (00210), one system over, and it is a
-- mirror on purpose: an admin picks the set on the product form, the join table
-- has exactly one writer, and the shop reads it through the product's own read
-- predicate. What differs is everything downstream — a row here means the
-- signup panel ASKS, never that it refuses — so the two tables are separate for
-- the same reason their consents are.

CREATE TABLE public.product_marketing_consents (
  product_id   uuid NOT NULL
                 REFERENCES public.products(id) ON DELETE CASCADE,
  consent_type public.marketing_consent_type NOT NULL,
  PRIMARY KEY (product_id, consent_type)
);

COMMENT ON TABLE public.product_marketing_consents IS
  'The admin-picked set: which marketing consents a product''s signup panel '
  'ASKS a parent about. Empty for almost every product — the Lynx Educate '
  'partnership is what this exists for. A row here is an ask and never a '
  'requirement: declining is a complete answer and the seat is unaffected, '
  'which is the whole line between this table and product_required_consents '
  '(00210). Written only by admin_set_product_marketing_consents; no Data API '
  'role holds a write grant, so the join table has exactly one writer. Readable '
  'through the product''s own read predicate, exactly as product_prices, '
  'schedule_slots and product_required_consents are, because the shop has to '
  'tell a stranger what signing up would ask them. ON DELETE CASCADE from '
  'products: an ask is a property of a product and means nothing without it.';

COMMENT ON COLUMN public.product_marketing_consents.consent_type IS
  'Which permission the panel asks for. The consent itself is account-level, so '
  'a parent who already answered on another product is asked once and their '
  'existing answer stands — this column decides whether the question is PUT, '
  'never where the answer is stored.';

ALTER TABLE public.product_marketing_consents ENABLE ROW LEVEL SECURITY;

-- SELECT only, gated by the product's own read predicate — the same policy
-- shape product_prices, product_translations, schedule_slots and
-- product_required_consents carry, so an ask is exactly as visible as the
-- product it belongs to and no more.
CREATE POLICY read_product_marketing_consents_via_product
  ON public.product_marketing_consents
  FOR SELECT
  TO anon, authenticated
  USING (public.can_read_product(product_id));

GRANT SELECT ON TABLE public.product_marketing_consents TO anon;
GRANT SELECT ON TABLE public.product_marketing_consents TO authenticated;
GRANT ALL    ON TABLE public.product_marketing_consents TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The one self-service writer
-- ---------------------------------------------------------------------------
--
-- Every path a signed-in parent has to their own marketing consents runs
-- through here: the settings toggle and the product signup panel alike. One
-- function so the two cannot drift, and so the customer id can be taken from
-- auth.uid() in exactly one place — it is never a parameter, because a
-- parameter is a thing a caller can aim at somebody else.
--
-- The guard is `assert_role('customer')` rather than a bare "is signed in"
-- check. Gamers and gedus hold no marketing consents at all, and an ADMIN does
-- not act through this function either: an admin who is also a parent holds
-- their consents on that customer account and toggles them there like anybody
-- else. An admin editing somebody ELSE'S marketing consent is not a thing this
-- platform does — the answer belongs to the person whose mailbox it is.

CREATE FUNCTION public.set_marketing_consent(
  p_consent_type public.marketing_consent_type,
  p_granted      boolean,
  p_source       text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
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

  -- 'registration' is refused here and only ever written by the register route
  -- through the service-role client, before the account has a session at all.
  -- See the header: source is the one field on an event that nothing else can
  -- corroborate, so the source with no live caller is the one a live caller may
  -- not claim. NULL is refused by the same statement rather than by a NOT NULL
  -- further down, so the message names the real problem.
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

COMMENT ON FUNCTION public.set_marketing_consent(
  public.marketing_consent_type, boolean, text
) IS
  'The one self-service writer of a marketing consent: the settings toggle and '
  'the product signup panel both call it, so the two paths cannot drift. '
  'Guard-first on assert_role(''customer'') — gamers and gedus hold no '
  'marketing consents, and an admin toggles their own on their own parent '
  'account rather than through here, because the answer belongs to whoever owns '
  'the mailbox. The customer is auth.uid() and is never a parameter, so there '
  'is nothing for a caller to aim at another family. REFUSES p_source = '
  '''registration'': that source is written only by the register route through '
  'the service-role client, before a session exists, and it is the one field on '
  'an event nothing else can corroborate. IDEMPOTENT AND HONEST ABOUT IT — '
  'submitting the state already on file succeeds and appends NO event, because '
  'a change log that recorded non-changes would answer "how often did this '
  'parent change their mind" with a number made of page loads. A first '
  'explicit "no" IS a change: an absent row means never answered, which is not '
  'the same state as a recorded refusal.';

REVOKE EXECUTE ON FUNCTION public.set_marketing_consent(
  public.marketing_consent_type, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(
  public.marketing_consent_type, boolean, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketing_consent(
  public.marketing_consent_type, boolean, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The one writer of a product's ask set
-- ---------------------------------------------------------------------------
--
-- Wipe-and-replace, the same shape set_product_required_consents (00210) uses
-- one system over, and it exists as its own guarded SECURITY DEFINER function
-- for the same reason: the admin product form reaches it as the admin's own
-- session role, and an inline INSERT would need a table write grant on the join
-- table — which is the Data API surface this migration keeps at zero.

CREATE FUNCTION public.admin_set_product_marketing_consents(
  p_product_id    uuid,
  p_consent_types public.marketing_consent_type[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
BEGIN
  PERFORM public.assert_admin();

  -- A NULL element is refused BEFORE the replacing DELETE, which is 00211's
  -- lesson carried over verbatim: `NOT (col = ANY (array))` is three-valued, so
  -- an array holding a NULL makes the predicate match nothing and quietly
  -- degrades a wipe-and-replace into a merge. `unnest(NULL::…[])` yields no
  -- rows, so an omitted array — the ordinary "asks nothing" shape — passes
  -- straight through here.
  IF EXISTS (
    SELECT 1 FROM unnest(p_consent_types) AS c WHERE c IS NULL
  ) THEN
    RAISE EXCEPTION
      'the marketing-consent list contains a NULL entry, which is not a consent'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The product must exist. Unlike the required-consents writer, whose foreign
  -- key into the document whitelist does its validating for it, this one's only
  -- FK is the product itself — and on a call that clears the set there is no
  -- INSERT for that FK to fire on, so a typo'd id would silently delete nothing
  -- and report success.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.product_marketing_consents
   WHERE product_id = p_product_id
     AND NOT (consent_type = ANY (
       COALESCE(p_consent_types, ARRAY[]::public.marketing_consent_type[])
     ));

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair is a SET replacement, and leaving an unchanged row in place keeps the
  -- delete from churning rows an admin did not touch.
  IF p_consent_types IS NOT NULL
     AND array_length(p_consent_types, 1) > 0 THEN
    INSERT INTO public.product_marketing_consents (product_id, consent_type)
    SELECT p_product_id, c
      FROM unnest(p_consent_types) AS c
    ON CONFLICT (product_id, consent_type) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_product_marketing_consents(
  uuid, public.marketing_consent_type[]
) IS
  'Replace the set of marketing consents a product''s signup panel asks about, '
  'admin-only and guard-first on assert_admin. The only writer of '
  'product_marketing_consents: that table carries no write grant for any Data '
  'API role, and an inline INSERT from the admin product form would need one, '
  'because the form reaches this as the admin''s own session role. NULL and an '
  'empty array both mean "asks nothing", which is how a set is cleared. A NULL '
  'ELEMENT is refused before the replacing DELETE runs — 00211''s lesson, one '
  'system over: `NOT (col = ANY (array))` is three-valued, so a NULL inside the '
  'array would match nothing and turn the wipe-and-replace into a merge. An '
  'unknown product is refused explicitly rather than by a foreign key, because '
  'a call that CLEARS the set performs no insert for an FK to fire on and would '
  'otherwise report success for a product that does not exist.';

REVOKE EXECUTE ON FUNCTION public.admin_set_product_marketing_consents(
  uuid, public.marketing_consent_type[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_product_marketing_consents(
  uuid, public.marketing_consent_type[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_marketing_consents(
  uuid, public.marketing_consent_type[]
) TO service_role;
