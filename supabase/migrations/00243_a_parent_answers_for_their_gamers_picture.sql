-- A parent answers, for their gamer, whether the child may be photographed.
--
-- WHAT THIS IS
--
-- The twin of the marketing-consent system 00220 built, with one thing changed
-- and everything else deliberately identical: the SUBJECT. A marketing consent
-- is about an adult's mailbox and is held by the adult whose mailbox it is. A
-- photo consent is about a CHILD'S IMAGE and is held on the child — but it is
-- answered by their parent, because a child cannot give it and we do not ask
-- them to. That single difference is what every departure from 00220 below
-- follows from, and there are exactly three of them:
--
--   * The state table is keyed on the GAMER, not on the answering customer.
--     Two parents linked to one child are answering the same question about the
--     same child, and a per-parent key would let them hold two answers with no
--     rule for which one a photographer obeys.
--   * The event log carries `answered_by`. The marketing twin did not need it —
--     there, the subject and the answerer are the same person, so the subject
--     column already said who spoke. Here they are two people, and "who
--     answered for this child" is exactly the provenance a safeguarding review
--     asks for.
--   * The read scope is wider than a family. A gedu about to take a photo has
--     to know which children on the roster may be in it, so the policies below
--     admit the gedus of a group the child is in — and admit them through the
--     roster's OWN predicate, so the two cannot drift apart (see section 2).
--
-- Everything else is 00220 verbatim and on purpose: state table plus
-- append-only event log (one indexed read answers "may this child be
-- photographed right now", and a separate log answers "when was that decided
-- and how were they asked"); an enum for the consent type rather than a
-- whitelist table (there is no text to version — the party named IS the whole
-- of it); a product-level ask set written by one admin RPC; one self-service
-- writer that appends an event only when the state actually MOVES, so a stale
-- tab replaying its POST cannot make the log answer "how often did this parent
-- change their mind" with a number made of page loads.
--
-- WHY THE CONSENT IS LYNX-SPECIFIC AND NOT A GENERIC "MAY WE PHOTOGRAPH"
--
-- School of Gaming does not put children's photographs on its own products, so
-- it does not ask. The one place real photographs of children arise is the
-- Roblox Programme delivered with Lynx Educate, where session reports carry
-- them and impact reporting shares them onward. So the enum has exactly one
-- value, `lynx_educate`, exactly as the marketing enum names the party rather
-- than the activity. A future partner is a new enum value and a new sentence,
-- which is a migration either way — and that is the point: a typo cannot become
-- a permission over a child's photograph that nobody can find to revoke.
--
-- WHY ONE TICK COVERS THREE USES
--
-- Session reports, sponsor/impact reporting to Lynx Educate and Roblox, and
-- public use on the three parties' websites and social media are one box. They
-- are not three because a parent choosing among them is choosing between things
-- they cannot verify the boundaries of, and a partial permission over a
-- photograph is a permission whose edge somebody has to police at the moment of
-- publishing. One question, one answer, one thing to check before a shutter
-- opens. The data model does not encode the three uses at all, which is what
-- keeps that decision reversible in copy rather than in a migration.
--
-- WHY THERE IS NO 'registration' SOURCE
--
-- 00220's event source admits `registration` because a parent ticks the
-- marketing box on the sign-up form, before their account exists. No gamer
-- exists at that moment, so no photo consent can be answered there: a gamer is
-- created later, by an already-signed-in parent, and this consent is never part
-- of that creation. The CHECK below therefore admits `settings` and `enrolment`
-- and nothing else, and there is no service-role writer beside the RPC because
-- there is no sessionless surface to need one.
--
-- WHY A DELETED GAMER TAKES THEIR CONSENTS WITH THEM
--
-- Both tables cascade from `gamer_profiles(user_id)`. A permission to
-- photograph somebody who no longer has an account is not a record worth
-- keeping, and — unlike an enrolment acceptance, which is a statement about a
-- past agreement somebody may still have to answer for — this one governs a
-- future act that can no longer happen. The event log cascades with the state
-- for the same reason 00220 gives: evidence for an answer nobody holds is not
-- evidence of anything. `answered_by` is the exception and does NOT cascade: it
-- names the PARENT, and a parent's account going away must not delete the
-- child's answer, so it is ON DELETE SET NULL and NULL there means exactly
-- "the account that answered has since been removed".
--
-- WHO MAY WRITE IT
--
-- The parent, through `set_gamer_photo_consent`, from the gamer's page under
-- their My SOG and from a product's signup panel. Nobody else, and that
-- includes both halves people expect to be here:
--
--   * NOT the gamer. A child may SEE what their parent answered — the read
--     policy below says so — and may never change it. Consent to photograph a
--     child is a parental decision in every jurisdiction we operate in, and a
--     surface that let a child grant it would be the platform accepting a
--     consent it knows to be invalid.
--   * NOT an admin. There is no admin writer at all, which matches 00220
--     exactly: an admin editing somebody else's answer about their own child is
--     not a thing this platform does. Admins read it, on the gamer's admin
--     page, and that is the whole of their access.

-- ---------------------------------------------------------------------------
-- 1. The consents that exist
-- ---------------------------------------------------------------------------

CREATE TYPE public.gamer_photo_consent_type AS ENUM (
  'lynx_educate'
);

COMMENT ON TYPE public.gamer_photo_consent_type IS
  'The photo permissions a parent can hold on behalf of a gamer. One value, '
  'lynx_educate: School of Gaming does not use children''s photographs on its '
  'own products and so does not ask, and the Roblox Programme delivered with '
  'Lynx Educate is the one place real photographs of children arise. Named for '
  'the PARTY exactly as marketing_consent_type (00220) is, rather than for the '
  'activity — because an enum value here is a standing permission over a '
  'child''s image and, like a marketing consent and unlike a consent DOCUMENT '
  '(00210), it has no text to version and no republication for a stored row to '
  'outlive. A future partner is a new value and a new sentence; what the enum '
  'buys is that a typo cannot become a permission nobody can find to revoke.';

-- ---------------------------------------------------------------------------
-- 2. The staff read predicate
-- ---------------------------------------------------------------------------
--
-- Defined before the table it guards, because a policy's USING clause is
-- resolved at CREATE POLICY time and a forward reference does not exist yet.
--
-- "Which gamers may a gedu see a photo answer for?" has exactly one correct
-- answer, and it is not a new one: it is the set of people already on the
-- rosters that gedu can open. If this policy computed that set for itself, the
-- two definitions would be free to drift — a later change to who may open a
-- group's feed would silently leave the photo list showing children the gedu
-- can no longer otherwise see, or hiding children they can. So the predicate is
-- expressed by composing the roster's OWN two halves and nothing else:
--
--   * `gedu_teaches_group` — the exact ownership test get_gedu_group_feed makes
--     before it will hand a gedu a roster at all.
--   * an ACTIVE participation in that group — the exact filter that feed's
--     roster query applies when deciding who is on it.
--
-- Read together: the caller may see this child's answer if and only if the
-- child appears on a roster the caller may open. Change either half for the
-- feed and this moves with it, which is the whole reason it is written as a
-- composition rather than as a query that happens to agree today.
--
-- SECURITY DEFINER, because the composition reads two tables the caller cannot:
-- gedu_group_assignments is RLS-scoped to the caller's own rows (harmless here)
-- but `participations` is not readable across families at all, so an inline
-- EXISTS in the policy — which Postgres evaluates as the querying role — would
-- be filtered to nothing and quietly answer `false` for every child. Being
-- DEFINER is also what lets it call gedu_teaches_group, which is deliberately
-- NOT granted to `authenticated`: inside a definer function the privilege check
-- is made against the definer, so that helper stays private and this one is the
-- single exposed surface.
--
-- It is `LANGUAGE sql` and therefore self-scoping by construction, which is the
-- correct classification for it: it answers only "does the CALLER teach this
-- child", it takes no argument that could name a different asker, and it is
-- total — an unknown gamer id is `false`, never NULL, so a USING clause is
-- never handed a three-valued answer.

CREATE FUNCTION public.gedu_teaches_gamer(p_gamer_id uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.participations p
     WHERE p.participant_id = p_gamer_id
       AND p.group_id IS NOT NULL
       AND p.status = 'active'::public.participation_status
       AND public.gedu_teaches_group(p.group_id)
  );
$$;

COMMENT ON FUNCTION public.gedu_teaches_gamer(p_gamer_id uuid) IS
  'Internal predicate: is the CALLER a gedu on a group this gamer is actively '
  'in? Deliberately composed from the roster''s own two halves rather than '
  'computed afresh — gedu_teaches_group is the ownership test '
  'get_gedu_group_feed makes before handing over a roster at all, and the '
  'active-participation filter is the one that feed applies when deciding who '
  'is on it — so "a gedu may see this child''s photo answer" cannot drift away '
  'from "this child is on a roster that gedu may open". SECURITY DEFINER '
  'because an RLS policy evaluates its predicate as the querying role, and a '
  'gedu cannot read `participations` across families; being definer is also '
  'what lets it call gedu_teaches_group, which stays ungranted for exactly that '
  'reason. Self-scoping: it answers only about the caller, no argument can name '
  'a different asker, and it is total — an unknown gamer id is false rather '
  'than NULL, so a USING clause is never handed a three-valued answer. Exposed '
  'to `authenticated` because the gamer_photo_consents read policy is a policy '
  'and must therefore be able to call it.';

REVOKE EXECUTE ON FUNCTION public.gedu_teaches_gamer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gedu_teaches_gamer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gedu_teaches_gamer(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. What is true right now
-- ---------------------------------------------------------------------------

CREATE TABLE public.gamer_photo_consents (
  gamer_id     uuid NOT NULL
                 REFERENCES public.gamer_profiles(user_id) ON DELETE CASCADE,
  consent_type public.gamer_photo_consent_type NOT NULL,
  granted      boolean NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gamer_id, consent_type)
);

COMMENT ON TABLE public.gamer_photo_consents IS
  'The CURRENT answer to "may this child be photographed for this partner" — '
  'one row per (gamer, consent type), and the row a gedu reads before a shutter '
  'opens. The twin of marketing_consents (00220) with the subject changed from '
  'an adult''s mailbox to a child''s image, which is why it is keyed on the '
  'GAMER and not on the answering parent: two parents linked to one child are '
  'answering one question about one child, and a per-parent key would let them '
  'hold two answers with no rule for which one a photographer obeys. An ABSENT '
  'row and `granted = false` are treated identically by every surface — never '
  'asked and asked-and-declined both mean the child stays out of the photo — '
  'and the distinction survives only in the event log, where it is the '
  'difference between a decision and a silence. Deliberately not derived from '
  'gamer_photo_consent_events: a check made at the moment of taking a '
  'photograph must not fold a history, and the present tense must not depend on '
  'a log a retention policy could one day trim. REVOCABLE by construction, '
  'which is what keeps it out of the non-revocable enrolment-condition system '
  '00210 built. Written by set_gamer_photo_consent and by nothing else: no Data '
  'API role holds a write grant.';

COMMENT ON COLUMN public.gamer_photo_consents.gamer_id IS
  'The child the permission is ABOUT, keyed to gamer_profiles rather than to '
  'profiles so the foreign key itself says the subject is a gamer — an adult '
  'holding a seat on a product whose audience admits adults has no row here, '
  'and cannot: a gamer consent cannot apply to an adult, and the enrolment '
  'panel does not put the question when the participant is the parent. ON '
  'DELETE CASCADE: a permission to photograph somebody who no longer has an '
  'account governs an act that can no longer happen, and the audit trail '
  'cascades with it for the same reason.';

COMMENT ON COLUMN public.gamer_photo_consents.granted IS
  'True means photographs of this child may be taken and used for the named '
  'partner; false means the parent said no. NOT NULL and no third state — '
  '"not asked" is the absence of the row, so a NULL here would be a second '
  'spelling of a state the primary key already expresses by omission.';

COMMENT ON COLUMN public.gamer_photo_consents.updated_at IS
  'When this state was last CHANGED, stamped server-side. Not a call counter: '
  'set_gamer_photo_consent leaves the row untouched when the submitted state '
  'already matches, so this is the moment the parent last actually changed '
  'their mind. The full history is in gamer_photo_consent_events.';

ALTER TABLE public.gamer_photo_consents ENABLE ROW LEVEL SECURITY;

-- Four SELECT policies and no write policy, because there is no write grant for
-- a write policy to authorize: the only writer is a SECURITY DEFINER function,
-- which bypasses RLS entirely. The `(SELECT …)` wrapper on the argument-free
-- predicates is the standing form here — it makes the call an InitPlan
-- evaluated once per statement rather than once per row; the two that take the
-- row's own column cannot be hoisted that way and are called directly.
CREATE POLICY admins_read_gamer_photo_consents ON public.gamer_photo_consents
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- The answerer reading back what they answered. is_parent_of is the same
-- predicate that guards every other parent-side read of a linked child's data,
-- so a family's view of this table is exactly their view of their children.
CREATE POLICY parents_read_gamer_photo_consents ON public.gamer_photo_consents
  FOR SELECT
  TO authenticated
  USING (public.is_parent_of(gamer_id));

-- The child may SEE the answer and can never change it — there is no writer
-- that would accept them. A child who is told "you are not in the photos" and
-- cannot find out why has been handed a rule with no visible source.
CREATE POLICY gamers_read_own_photo_consents ON public.gamer_photo_consents
  FOR SELECT
  TO authenticated
  USING (gamer_id = (SELECT auth.uid()));

-- The reason this table is readable outside the family at all: a gedu standing
-- in front of a group has to know who may be in the picture. Scoped through
-- gedu_teaches_gamer, which is built on the roster's own predicate — see
-- section 2 for why that indirection is the point rather than a detour.
CREATE POLICY gedus_read_roster_gamer_photo_consents
  ON public.gamer_photo_consents
  FOR SELECT
  TO authenticated
  USING (public.gedu_teaches_gamer(gamer_id));

-- SELECT and nothing more for `authenticated`; nothing at all for `anon`. A row
-- here names a child and a permission over their image, so it is personal data
-- about a minor on both counts.
GRANT SELECT ON TABLE public.gamer_photo_consents TO authenticated;
GRANT ALL    ON TABLE public.gamer_photo_consents TO service_role;

-- ---------------------------------------------------------------------------
-- 4. How it got that way
-- ---------------------------------------------------------------------------

CREATE TABLE public.gamer_photo_consent_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gamer_id     uuid NOT NULL
                 REFERENCES public.gamer_profiles(user_id) ON DELETE CASCADE,
  consent_type public.gamer_photo_consent_type NOT NULL,
  granted      boolean NOT NULL,
  source       text NOT NULL,
  answered_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_gamer_photo_consent_events_source
    CHECK (source IN ('settings', 'enrolment'))
);

COMMENT ON TABLE public.gamer_photo_consent_events IS
  'APPEND-ONLY history: one row per CHANGE to a gamer photo consent, and the '
  'evidence behind whatever gamer_photo_consents currently says. Nothing '
  'updates or deletes a row here — no Data API role holds any write grant at '
  'all, and the only writer is set_gamer_photo_consent — because an event is a '
  'statement that something happened at an instant, and editing one would '
  'destroy the only thing the table is for. A repeat submission that changes '
  'nothing appends nothing, exactly as in marketing_consent_events (00220). '
  'Rows carry NO unique constraint: granting, revoking and granting again is '
  'the ordinary life of a revocable consent, and those three rows are history '
  'rather than duplicates. Readable by ADMINS ALONE, which is narrower than the '
  'state table beside it — a gedu needs today''s answer to decide whether to '
  'raise a camera, and has no business in the history of a family''s '
  'deliberations.';

COMMENT ON COLUMN public.gamer_photo_consent_events.gamer_id IS
  'The child the answer is ABOUT. Distinct from answered_by, which is the adult '
  'who gave it — the one column marketing_consent_events did not need, because '
  'there the subject and the answerer are the same person.';

COMMENT ON COLUMN public.gamer_photo_consent_events.granted IS
  'The state that was SET by this event, not the delta. Reading the log as a '
  'sequence of states is what makes a row meaningful on its own, and it is what '
  'lets the current-state table be reconstructed from the log if it ever has to '
  'be audited against it.';

COMMENT ON COLUMN public.gamer_photo_consent_events.source IS
  'Which surface the answer came from: `settings` (the card on the gamer''s '
  'page under the parent''s My SOG) or `enrolment` (the ask inside a product '
  'signup panel). There is deliberately NO `registration` value, which is the '
  'one place this CHECK differs from marketing_consent_events'' (00220): that '
  'source exists because a parent ticks a marketing box before their account '
  'exists, and no gamer exists at that moment for a photo consent to be about. '
  'A CHECK rather than an enum because the set is a list of our own surfaces, '
  'which move with the product rather than with the data model.';

COMMENT ON COLUMN public.gamer_photo_consent_events.answered_by IS
  'The adult who gave this answer, taken from auth.uid() inside the RPC and '
  'never accepted from a caller. This is the provenance the marketing twin did '
  'not need: there the subject column already said who spoke, and here the '
  'subject is a child who cannot answer for themselves, so "which parent '
  'decided this" is exactly what a safeguarding review asks. Nullable and ON '
  'DELETE SET NULL rather than cascading: the answer belongs to the CHILD, and '
  'a parent closing their account must not delete it. NULL therefore means '
  '"the account that answered has since been removed" and never "unknown at '
  'the time" — every write supplies it.';

COMMENT ON COLUMN public.gamer_photo_consent_events.created_at IS
  'When the answer was given, stamped by the server. A client never supplies '
  'it — a timestamp the consenting party chooses proves nothing about when they '
  'consented.';

CREATE INDEX idx_gamer_photo_consent_events_gamer
  ON public.gamer_photo_consent_events (gamer_id);

ALTER TABLE public.gamer_photo_consent_events ENABLE ROW LEVEL SECURITY;

-- One SELECT policy, and admins only. The state table's four readers exist
-- because four parties need the CURRENT answer; only an audit needs the
-- history, and an audit is an admin.
CREATE POLICY admins_read_gamer_photo_consent_events
  ON public.gamer_photo_consent_events
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

GRANT SELECT ON TABLE public.gamer_photo_consent_events TO authenticated;
GRANT ALL    ON TABLE public.gamer_photo_consent_events TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Which products ask for which consent
-- ---------------------------------------------------------------------------
--
-- The mirror of product_marketing_consents (00220), which is itself the mirror
-- of product_required_consents (00210). Same shape, same single writer, same
-- read predicate: a row here means the signup panel ASKS, never that it
-- refuses, and declining is a complete answer that leaves the seat untouched.

CREATE TABLE public.product_gamer_photo_consents (
  product_id   uuid NOT NULL
                 REFERENCES public.products(id) ON DELETE CASCADE,
  consent_type public.gamer_photo_consent_type NOT NULL,
  PRIMARY KEY (product_id, consent_type)
);

COMMENT ON TABLE public.product_gamer_photo_consents IS
  'The admin-picked set: which photo consents a product''s signup panel ASKS a '
  'parent about, and — downstream — which products show a gedu the roster''s '
  'photo permissions at all. Empty for almost every product; the Roblox '
  'Programme delivered with Lynx Educate is what this exists for. A row here is '
  'an ask and never a requirement: declining is a complete answer and the seat '
  'is unaffected, which is the whole line between this table and '
  'product_required_consents (00210). The question is PUT only when the '
  'selected participant is a gamer — a parent taking an adult seat is not a '
  'subject this consent can have. Written only by '
  'admin_set_product_gamer_photo_consents; no Data API role holds a write '
  'grant, so the join table has exactly one writer. Readable through the '
  'product''s own read predicate, exactly as product_prices, schedule_slots, '
  'product_required_consents and product_marketing_consents are, because the '
  'shop has to tell a stranger what signing up would ask them. ON DELETE '
  'CASCADE from products: an ask is a property of a product and means nothing '
  'without it.';

COMMENT ON COLUMN public.product_gamer_photo_consents.consent_type IS
  'Which permission the panel asks for. The consent itself is held on the '
  'GAMER and not on the enrolment, so a child asked about on two products has '
  'one answer — this column decides whether the question is PUT, never where '
  'the answer is stored.';

ALTER TABLE public.product_gamer_photo_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_product_gamer_photo_consents_via_product
  ON public.product_gamer_photo_consents
  FOR SELECT
  TO anon, authenticated
  USING (public.can_read_product(product_id));

GRANT SELECT ON TABLE public.product_gamer_photo_consents TO anon;
GRANT SELECT ON TABLE public.product_gamer_photo_consents TO authenticated;
GRANT ALL    ON TABLE public.product_gamer_photo_consents TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The one writer
-- ---------------------------------------------------------------------------
--
-- Every path to a photo consent runs through here: the card on the gamer's page
-- under the parent's My SOG, and the ask inside a product signup panel. One
-- function so the two cannot drift.
--
-- The subject IS a parameter here, which is the one place this function is
-- structurally weaker than set_marketing_consent (00220) — there the customer
-- is auth.uid() and there is nothing for a caller to aim. It cannot be avoided:
-- the answer is about a child, and a parent has several. So the parameter is
-- defended twice over, and the second defence is the load-bearing one:
--
--   * assert_role('customer') first, which keeps out gamers (a child may never
--     grant permission to photograph themselves), gedus, and admins (00220's
--     ruling, unchanged: an admin editing another family's answer about their
--     own child is not a thing this platform does).
--   * a `parent_gamer` link from auth.uid() to the named child, checked before
--     anything is written. Without it the role guard alone would let any parent
--     on the platform answer for any child on it.
--
-- The refusal for "not your child" and for "no such gamer" is deliberately the
-- same 42501: a distinguishable answer would make this function an oracle for
-- whether a given uuid is a child on this platform.

CREATE FUNCTION public.set_gamer_photo_consent(
  p_gamer_id     uuid,
  p_consent_type public.gamer_photo_consent_type,
  p_granted      boolean,
  p_source       text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_parent_id uuid;
  v_current   boolean;
BEGIN
  PERFORM public.assert_role('customer');

  IF p_gamer_id IS NULL OR p_consent_type IS NULL OR p_granted IS NULL THEN
    RAISE EXCEPTION
      'a gamer photo consent needs a gamer, a type and an answer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- No 'registration': a gamer does not exist when the sign-up form is filled
  -- in, so there is no surface that could honestly claim it. NULL is refused by
  -- the same statement rather than by a NOT NULL further down, so the message
  -- names the real problem.
  IF p_source IS NULL OR p_source NOT IN ('settings', 'enrolment') THEN
    RAISE EXCEPTION
      'gamer photo consent source must be settings or enrolment (got %)',
      COALESCE(p_source, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  v_parent_id := (SELECT auth.uid());

  -- The target half of the authorization, and the reason the role guard alone
  -- is not enough: without this, any parent could answer for any child. A
  -- gamer who is not this caller's and a uuid belonging to nobody are refused
  -- identically, so neither answer is an oracle.
  IF NOT EXISTS (
    SELECT 1
      FROM public.parent_gamer pg
     WHERE pg.parent_id = v_parent_id
       AND pg.gamer_id  = p_gamer_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE so two submissions racing on the same answer serialize rather
  -- than both concluding they are the change — two parents of one child on two
  -- devices is the ordinary shape of that race here, not a stale tab. A row
  -- that does not exist locks nothing, which is the harmless half: the ON
  -- CONFLICT below settles a first-answer race, and the losing side writes an
  -- event for a state it genuinely did set.
  SELECT gpc.granted
    INTO v_current
    FROM public.gamer_photo_consents gpc
   WHERE gpc.gamer_id = p_gamer_id
     AND gpc.consent_type = p_consent_type
   FOR UPDATE;

  -- IS NOT DISTINCT FROM, not `=`: no row at all yields NULL here, and NULL is
  -- distinct from both true and false, which is the intended reading. "Never
  -- asked" is not the same state as "asked and declined" — both keep the child
  -- out of the photograph, and only one of them is a decision a parent made —
  -- so a first explicit "no" is a CHANGE and earns its event, while a
  -- re-submission of the answer already on file does not.
  IF v_current IS NOT DISTINCT FROM p_granted THEN
    RETURN;
  END IF;

  INSERT INTO public.gamer_photo_consents (
    gamer_id, consent_type, granted, updated_at
  )
  VALUES (p_gamer_id, p_consent_type, p_granted, now())
  ON CONFLICT (gamer_id, consent_type) DO UPDATE
    SET granted    = EXCLUDED.granted,
        updated_at = EXCLUDED.updated_at;

  INSERT INTO public.gamer_photo_consent_events (
    gamer_id, consent_type, granted, source, answered_by
  )
  VALUES (p_gamer_id, p_consent_type, p_granted, p_source, v_parent_id);
END;
$$;

COMMENT ON FUNCTION public.set_gamer_photo_consent(
  uuid, public.gamer_photo_consent_type, boolean, text
) IS
  'The one writer of a gamer photo consent: the card on the gamer''s page under '
  'the parent''s My SOG and the product signup panel both call it, so the two '
  'paths cannot drift. Guard-first on assert_role(''customer''), which keeps out '
  'gamers — a child may never grant permission to photograph themselves, and '
  'the read policy letting them SEE the answer is the whole of their access — '
  'gedus, and ADMINS, the last deliberately and for 00220''s reason: an admin '
  'editing another family''s answer about their own child is not a thing this '
  'platform does. Unlike its marketing twin the SUBJECT is a parameter, because '
  'a parent has several children and the answer is about one of them; the '
  'parameter is defended by a parent_gamer link from auth.uid() to the named '
  'gamer, checked before anything is written, and "not your child" and "no such '
  'gamer" are refused with the same 42501 so the function is not an oracle for '
  'which uuids are children here. Accepts only the `settings` and `enrolment` '
  'sources — there is no `registration`, because no gamer exists when a sign-up '
  'form is filled in. IDEMPOTENT AND HONEST ABOUT IT: submitting the state '
  'already on file succeeds and appends NO event, which matters more here than '
  'anywhere, because every enrolment writes every asked box whether or not the '
  'parent touched it. A first explicit "no" IS a change — an absent row means '
  'never asked, and only one of those two is a decision.';

REVOKE EXECUTE ON FUNCTION public.set_gamer_photo_consent(
  uuid, public.gamer_photo_consent_type, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_gamer_photo_consent(
  uuid, public.gamer_photo_consent_type, boolean, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_gamer_photo_consent(
  uuid, public.gamer_photo_consent_type, boolean, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. The one writer of a product's ask set
-- ---------------------------------------------------------------------------
--
-- Wipe-and-replace, identical in every respect to
-- admin_set_product_marketing_consents (00220) one system over, and its own
-- guarded SECURITY DEFINER function for the same reason: the admin product form
-- reaches it as the admin's own session role, and an inline INSERT would need a
-- table write grant on the join table — which is the Data API surface this
-- migration keeps at zero.

CREATE FUNCTION public.admin_set_product_gamer_photo_consents(
  p_product_id    uuid,
  p_consent_types public.gamer_photo_consent_type[]
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
      'the photo-consent list contains a NULL entry, which is not a consent'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The product must exist. The only FK here is the product itself, and on a
  -- call that CLEARS the set there is no INSERT for that FK to fire on — so a
  -- typo'd id would silently delete nothing and report success.
  IF NOT EXISTS (
    SELECT 1 FROM public.products WHERE id = p_product_id
  ) THEN
    RAISE EXCEPTION 'product % does not exist', p_product_id
      USING ERRCODE = 'no_data_found';
  END IF;

  DELETE FROM public.product_gamer_photo_consents
   WHERE product_id = p_product_id
     AND NOT (consent_type = ANY (
       COALESCE(p_consent_types, ARRAY[]::public.gamer_photo_consent_type[])
     ));

  -- ON CONFLICT DO NOTHING rather than a blind insert after a blind delete: the
  -- pair is a SET replacement, and leaving an unchanged row in place keeps the
  -- delete from churning rows an admin did not touch.
  IF p_consent_types IS NOT NULL
     AND array_length(p_consent_types, 1) > 0 THEN
    INSERT INTO public.product_gamer_photo_consents (product_id, consent_type)
    SELECT p_product_id, c
      FROM unnest(p_consent_types) AS c
    ON CONFLICT (product_id, consent_type) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_product_gamer_photo_consents(
  uuid, public.gamer_photo_consent_type[]
) IS
  'Replace the set of photo consents a product''s signup panel asks about — and '
  'therefore whether its session editor shows a gedu the roster''s photo '
  'permissions at all — admin-only and guard-first on assert_admin. The only '
  'writer of product_gamer_photo_consents: that table carries no write grant '
  'for any Data API role, and an inline INSERT from the admin product form '
  'would need one, because the form reaches this as the admin''s own session '
  'role. NULL and an empty array both mean "asks nothing", which is how a set '
  'is cleared. A NULL ELEMENT is refused before the replacing DELETE runs — '
  '00211''s lesson, two systems over: `NOT (col = ANY (array))` is three-valued, '
  'so a NULL inside the array would match nothing and turn the wipe-and-replace '
  'into a merge. An unknown product is refused explicitly rather than by a '
  'foreign key, because a call that CLEARS the set performs no insert for an FK '
  'to fire on and would otherwise report success for a product that does not '
  'exist. The exact twin of admin_set_product_marketing_consents (00220).';

REVOKE EXECUTE ON FUNCTION public.admin_set_product_gamer_photo_consents(
  uuid, public.gamer_photo_consent_type[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_product_gamer_photo_consents(
  uuid, public.gamer_photo_consent_type[]
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_product_gamer_photo_consents(
  uuid, public.gamer_photo_consent_type[]
) TO service_role;
