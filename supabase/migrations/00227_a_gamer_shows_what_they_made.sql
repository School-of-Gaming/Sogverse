-- A gamer shows what they made, and on some products that is owed work.
--
-- WHY
--
-- Nothing in the platform can store "a thing this gamer made in this group" — a
-- published Roblox game, a Scratch project, a world they built. Many products
-- have a creative element and a link to the result is meaningful on every one of
-- them; on Roblox-sponsored products it is contractual, because every gamer
-- still enrolled at the product's end date must have a published game URL.
--
-- This migration lays down the general feature and the one flag that makes it
-- required, and nothing else:
--
--   * `gamer_group_creations` — one row per (group, member), holding an ORDERED
--     JSONB array of {title, url} objects. Structurally the private note's twin.
--   * `set_gamer_group_creations` — the replace-the-list write, guarded exactly
--     as the note write is.
--   * `products.requires_gamer_creations` — an admin decision, NOT derivable
--     from `topic`: not every roblox_studio product is sponsored.
--   * The three staff readers that already carry the note gain the list beside
--     it; the family product page gains the caller's OWN list as a TOP-LEVEL
--     array; and the gedu dashboard's owed count gains a fourth condition.
--
-- WHY JSONB AND NOT ONE ROW PER CREATION
--
-- Nothing ever reads, updates or references a single creation on its own: the
-- dialog replaces the whole list, and every reader wants the whole list. A
-- relational shape would therefore pay a correlated subquery in each of the four
-- widened readers, plus a position column and per-row RPC bookkeeping, for zero
-- relational use — and almost every member has zero or one entry. The price of
-- the JSONB choice is the CHECK below, which is the ugly part and is paid once.
-- Array order IS display order; there is no reorder affordance and no position
-- column, so staff retype to rearrange.
--
-- WHY THE URL IS NOT VALIDATED
--
-- Owner decision: staff are trusted, the value is stored as raw text, and we
-- revisit only if it becomes a problem. The safety is on the RENDER side — the
-- family card parses the stored value and only builds an anchor when it parses
-- as http(s), degrading to the (required, non-blank) title otherwise, so a
-- `javascript:` value can never reach an href. That is why `title` is required
-- rather than optional: it is the label the degrade path needs.
--
-- WHY THE TABLE HAS RLS ON AND NO POLICY AT ALL
--
-- The same access story as `gamer_group_notes`, for the same reasons — see
-- 00203's header, which argues it in full. Nothing reads or writes this table
-- over the Data API: every read rides one of the widened documents, every write
-- goes through `set_gamer_group_creations`, and all of those are SECURITY
-- DEFINER. RLS on with no policy is deny-all to anyone who reaches the table,
-- and `authenticated` and `anon` hold no grant of any kind on it. That absence
-- is also what keeps `gedu_teaches_group_product` private: a policy predicate is
-- evaluated as the QUERYING role, so a SELECT policy naming it would have forced
-- an EXECUTE grant and turned an internal predicate into an exposed function.
--
-- Note this table is family-READABLE data written by staff — unlike the note,
-- which no family surface may ever show. That difference lives entirely in which
-- documents emit which column; it changes nothing about the table's grants,
-- because no family reads the table either.
--
-- WHY OWED-NESS ATTACHES TO THE FINAL SESSION
--
-- The owner's framing: if this is the final session of this group, and this
-- group needs gamer creations, then the last session's work is not complete
-- until they are supplied. So the existing per-session completeness gains a
-- FOURTH condition beside attendance, the report and the report mail, rather
-- than inventing a second owed mechanic with a lead-time constant that would
-- fire at the wrong moment across formats spanning one hour to nine weeks.
-- "The final session" is the run's LAST COMPUTED OCCURRENCE — there is no stored
-- final-session flag — which makes an open-ended product (end_date NULL) one
-- that can be flagged and never owes. Documented behaviour, not an error.
--
-- WHY FOUR READERS ARE RECREATED AND ONE IS NOT
--
-- The three note-carrying STAFF documents widen together (group feed, assigned
-- product, voice overlay), and the family product page document gains a
-- different shape — a top-level array for its own participation, never a map
-- keyed by participant, so another child's work has nowhere to live BY TYPE.
-- `get_product_groups_with_details` (the admin three-arm document) is
-- deliberately NOT widened: it feeds no note button and no roster that draws
-- either mark, and its note fields ride only for shape parity across the three
-- arms. Adding a fourth field there would widen a document nothing reads.
--
-- Each body below is copied from `supabase/schema.sql` — the CURRENT definition,
-- which may already have superseded the migration that first wrote it — with the
-- creations join and key added and nothing else changed. Guards, comments,
-- search_path settings and grants are carried forward verbatim and re-asserted
-- at the foot.
--
-- Two of the recreated bodies carry `SET search_path TO 'public'` with
-- unqualified references rather than the current `TO ''` default. That is left
-- exactly as it stands — converting them is a separate change with its own risk
-- — and every reference this file ADDS to an old body is fully qualified, so
-- nothing here depends on the looser setting.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

CREATE TABLE public.gamer_group_creations (
  group_id       uuid NOT NULL REFERENCES public.product_groups(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  creations      jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (group_id, participant_id),

  -- The whole shape, enforced loudly at the schema because the column is JSONB
  -- and PostgreSQL will otherwise take absolutely anything.
  --
  -- Every clause is written as "NOT (a jsonpath that MATCHES a violation)", so
  -- the constraint reads as a list of the things that are refused. Two
  -- mechanical notes on the jsonpath, both learned the hard way and both worth
  -- keeping:
  --
  --   * The size clause is `strict`. In lax mode a filter applied to `$` unwraps
  --     the array first, so `@.size()` answers 1 for every ELEMENT rather than
  --     the array's length, and both the empty list and a 21-element list pass.
  --     Strict mode keeps `@` bound to the array. An error under strict mode is
  --     suppressed by the `@?` operator and yields false, which is why the
  --     jsonb_typeof clause beside it is what refuses a non-array — the two are
  --     one decision and neither can raise.
  --   * A POSIX repetition count may not exceed 255, so the 2000-character URL
  --     cap cannot be written `{2001,}`. `(.{250}){8}.` is 2001 characters by
  --     construction and is what that expression means; the title's cap is under
  --     the limit and is written the obvious way. `flag "s"` makes `.` match a
  --     newline, so a multi-line paste cannot slip past a length cap.
  --
  -- Caps: at most 20 entries, a title of at most 200 characters and a URL of at
  -- most 2000. Twenty is far above the "almost always zero or one" reality and
  -- is a sanity bound, not a product limit; 2000 is the practical ceiling for a
  -- URL anyone will paste.
  CONSTRAINT chk_gamer_group_creations_shape CHECK (
    jsonb_typeof(creations) = 'array'
    AND NOT (creations @? 'strict $ ? (@.size() < 1 || @.size() > 20)')
    AND NOT (creations @? '$[*] ? (@.type() != "object")')
    AND NOT (creations @? '$[*] ? (!exists(@.title) || !exists(@.url))')
    AND NOT (creations @? '$[*] ? (@.title.type() != "string" || @.url.type() != "string")')
    AND NOT (creations @? '$[*].keyvalue() ? (@.key != "title" && @.key != "url")')
    AND NOT (creations @? '$[*] ? (@.title like_regex "^[[:space:]]*$" || @.url like_regex "^[[:space:]]*$")')
    AND NOT (creations @? '$[*] ? (@.title like_regex "^.{201,}" flag "s")')
    AND NOT (creations @? '$[*] ? (@.url like_regex "^(.{250}){8}." flag "s")')
  )
);

COMMENT ON TABLE public.gamer_group_creations IS
  'One row per (group, member): the things that person made during this group''s '
  'run, as an ORDERED JSONB array of {title, url} objects. Array order is display '
  'order — there is no position column and no reorder affordance, so staff retype '
  'to rearrange. Written by staff (an admin, or a gedu assigned to the product), '
  'read by that member and their family: this is the one piece of staff-authored '
  'per-member data that IS family-visible, which is a property of which documents '
  'emit it and not of this table''s access, since no family reads the table either. '
  'The URL is raw text with NO validation, by owner decision — the family card '
  'parses it and renders a plain label rather than an anchor when it does not '
  'parse as http(s), which is why the title is required. ABSENCE OF A ROW is what '
  '"no creations" means everywhere: an empty list DELETES the row rather than '
  'storing [], and the CHECK refuses an empty array so the two states cannot both '
  'exist. Strictly keyed to the group, so the list does not follow a member moved '
  'to another group, and a member who leaves leaves their row behind — unreachable '
  'from every surface and refused by the write RPC''s target check, an accepted '
  'leftover exactly as the note''s is. Deleting the GROUP does delete the row, by '
  'FK. No Data API role holds a grant on this table and RLS is on with no policy '
  'at all: every read rides a document RPC, every write goes through '
  'set_gamer_group_creations, and all of those are SECURITY DEFINER.';

COMMENT ON COLUMN public.gamer_group_creations.group_id IS
  'The group the list is filed under. ON DELETE CASCADE — the list belongs to the '
  'group, so deleting the group deletes it. Accepted: group deletion is rare admin '
  'cleanup, and the same choice the note makes.';

COMMENT ON COLUMN public.gamer_group_creations.participant_id IS
  'The person the creations belong to — whoever holds the seat, adult or child, '
  'the same subject participations.participant_id names. References profiles '
  'rather than participations so a seat rewritten in place does not take the list '
  'with it; membership is asserted by the write RPC''s target check instead.';

COMMENT ON COLUMN public.gamer_group_creations.creations IS
  'The ordered list: a JSONB array of objects with EXACTLY the keys title and url, '
  'both non-blank strings, title at most 200 characters and url at most 2000, at '
  'least one and at most twenty entries. All of that is the table''s CHECK, which '
  'is a loud backstop rather than a routine error path — the dialog drops a fully '
  'blank row and refuses to save a half-filled one, so a violation reaching here '
  'means a non-UI caller. The write RPC deliberately does not normalise the value '
  '(no trimming, no key filtering): rebuilding each element would silently discard '
  'the extra keys this CHECK exists to refuse.';

COMMENT ON COLUMN public.gamer_group_creations.updated_by IS
  'Who last wrote the list. ON DELETE SET NULL: a departed gedu''s account must '
  'not delete the work they recorded. Stored from day one and displayed NOWHERE in '
  'v1 — no reader joins profiles for it — so this and updated_at are provenance '
  'held against a later need, not fields with a surface behind them.';

ALTER TABLE public.gamer_group_creations ENABLE ROW LEVEL SECURITY;

-- The same touch trigger the notes and participations use, rather than a
-- hand-set column inside the RPC: one writer for one derived value.
CREATE TRIGGER gamer_group_creations_updated_at
  BEFORE UPDATE ON public.gamer_group_creations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- `service_role` and nothing else, exactly as gamer_group_notes is granted. Not
-- a narrowing of some default — there is no default; an ungranted table is
-- unreachable, which is the whole access story. The DB suite asserts against
-- this table through the admin client, which is what the service_role grant is
-- for. Nothing for `authenticated`, nothing for `anon`: with no write grant the
-- table is correctly absent from the write-IDOR loop's completeness check, and
-- the write-IDOR REQUIREMENT is met one layer up, by set_gamer_group_creations
-- authorizing actor and target.
GRANT ALL ON TABLE public.gamer_group_creations TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The write
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.set_gamer_group_creations(
  p_group_id uuid, p_participant_id uuid, p_creations jsonb
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_creations jsonb := COALESCE(p_creations, '[]'::jsonb);
  v_row       public.gamer_group_creations;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ACTOR half: an admin, or a gedu who teaches this group's product. Read
  -- and write parity between the two is deliberate and is the note's rule
  -- unchanged — refusing a substitute standing in for another group would make
  -- the feature useless in the one situation it matters most.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The TARGET half: creations may only be filed against somebody who sits in
  -- the group they are filed under. Without this an authorized gedu could write
  -- against any profile id on the platform. The table carries no write grant, so
  -- it is correctly outside the write-IDOR loop's completeness check — these two
  -- checks together are what stands in for an entry there, and the db tests
  -- assert both halves negatively.
  --
  -- ANY status counts, not just active, exactly as the note's target check does:
  -- what it excludes is a member who has LEFT the group, which is why an
  -- orphaned list cannot be edited back into life.
  IF NOT EXISTS (
    SELECT 1 FROM public.participations part
     WHERE part.group_id       = p_group_id
       AND part.participant_id = p_participant_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Refused here rather than by the CHECK only because the CHECK's message for a
  -- non-array is about jsonpath, which names nothing a caller can act on.
  IF jsonb_typeof(v_creations) <> 'array' THEN
    RAISE EXCEPTION 'p_creations must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- An empty list DELETES the row. Absence of a row is what "no creations" means
  -- on every surface, so the empty save has to produce that absence rather than
  -- an empty array standing in for it — and the CHECK refuses an empty array, so
  -- the two states genuinely cannot both exist. The returned document is the
  -- empty shape, so a caller merges the same keys either way.
  IF jsonb_array_length(v_creations) = 0 THEN
    DELETE FROM public.gamer_group_creations
     WHERE group_id = p_group_id AND participant_id = p_participant_id;

    RETURN jsonb_build_object(
      'group_id',       p_group_id,
      'participant_id', p_participant_id,
      'creations',      '[]'::jsonb,
      'updated_at',     NULL
    );
  END IF;

  -- Upsert, last-write-wins, no history. updated_at is left to the touch
  -- trigger. The list is stored EXACTLY as supplied: no trimming and no
  -- rebuilding of each element, because rebuilding would quietly drop the extra
  -- keys the CHECK exists to refuse, and trimming would make the CHECK's
  -- non-blank clause unreachable. Shape, caps and blankness are all the table's
  -- (23514), which the dialog is built never to hit.
  INSERT INTO public.gamer_group_creations AS c
         (group_id, participant_id, creations, updated_by)
  VALUES (p_group_id, p_participant_id, v_creations, (SELECT auth.uid()))
  ON CONFLICT (group_id, participant_id) DO UPDATE
     SET creations  = EXCLUDED.creations,
         updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'group_id',       v_row.group_id,
    'participant_id', v_row.participant_id,
    'creations',      v_row.creations,
    'updated_at',     v_row.updated_at
  );
END;
$$;

COMMENT ON FUNCTION public.set_gamer_group_creations(p_group_id uuid, p_participant_id uuid, p_creations jsonb) IS
  'Replace the whole list of creations for one member of one group, and return '
  'the resulting document (group_id, participant_id, creations, updated_at). '
  'Set-shaped rather than per-row add/update/delete: nothing reads or references '
  'a single creation, and a small list edited in a dialog is replaced whole. Open '
  'to an ADMIN or to any gedu assigned to any group of the group''s product, with '
  'full read/write parity between the two; guard-first on assert_role, then two '
  'further 42501s — the ACTOR half (staff reach over the product) and the TARGET '
  'half (the participant actually holds a participation in that group, at ANY '
  'status). The target half is what stands in for a write-IDOR loop entry, since '
  'the table carries no write grant for any client role. An EMPTY list deletes '
  'the row and returns the empty-shaped document, because absence of a row is '
  'what "no creations" means everywhere else. The value is stored verbatim — no '
  'trimming, no key filtering — so the table''s CHECK is the single authority on '
  'shape, caps and blankness (23514); normalising here would discard the extra '
  'keys that CHECK exists to refuse. Idempotent: the same list written twice is '
  'the same row, which is what makes a partial failure in the two-write dialog '
  'safe to retry. Last-write-wins, and only the last writer is stored — there is '
  'no history, and nothing in v1 displays the provenance it does keep.';

REVOKE EXECUTE ON FUNCTION public.set_gamer_group_creations(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_gamer_group_creations(uuid, uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The requirement flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN requires_gamer_creations boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.requires_gamer_creations IS
  'Does this product contractually require a creation from every member? An '
  'ADMIN decision, deliberately not derived from `topic`: not every roblox_studio '
  'product is Roblox-sponsored, so a contract obligation is stated rather than '
  'inferred. STAFF-FACING ONLY — a family sees nothing different on a flagged '
  'product, and no family document carries this column. What it changes is '
  'SIGNALS, never the authoring surface: adding a creation is the same gesture on '
  'every product, and the flag only makes the final session''s completeness gain a '
  'fourth condition (every current roster member has at least one creation) '
  'beside attendance, the report and the report mail. Defaults false, so flagging '
  'a product IS the opt-in and no epoch gating is needed. An open-ended product '
  '(end_date NULL) may be flagged and never owes, because it has no final '
  'session.';

-- ---------------------------------------------------------------------------
-- 4. create_product carries the flag
-- ---------------------------------------------------------------------------
--
-- The body below is the LIVE definition from supabase/schema.sql with ONE
-- addition: requires_gamer_creations in the INSERT. Everything else is verbatim.
--
-- Adding a parameter changes the argument list, so CREATE OR REPLACE would leave
-- a second overload behind and break PostgREST's candidate resolution. The
-- function is therefore DROPped with its full old signature and recreated, which
-- rebuilds its ACL from scratch — hence the REVOKE/GRANT pair re-issued for both
-- roles and the re-COMMENT.
--
-- The new parameter is appended to the DEFAULT tail, following the same
-- convention every argument since 00178 has taken. It defaults FALSE rather than
-- NULL: the column is NOT NULL, false is the resting state of the whole feature,
-- and an omitting caller therefore creates an unflagged product, which is what
-- omission should mean.

DROP FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]);

CREATE FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_status public.product_status DEFAULT 'pending'::public.product_status, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id    UUID;
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- image_path is absent from this INSERT on purpose (00198): a product's
  -- picture is the catalogue entry it points at, the route writes image_id in
  -- its own statement after this one, and the trigger on products derives the
  -- served path from it.
  INSERT INTO public.products (
    product_type, billing_mode, topic,
    min_age, max_age, spoken_language_code,
    location_id, is_remote, status, signup_threshold,
    start_date, end_date, timezone,
    seat_count, waitlist_enabled, registration_opens_at,
    is_visible, created_by,
    primary_gedu_fee_cents, assistant_gedu_fee_cents, municipality_fee_cents,
    for_gamers, for_parents, tag, region_lock_country,
    requires_gamer_creations
  )
  VALUES (
    p_product_type, p_billing_mode, p_topic,
    p_min_age, p_max_age, p_spoken_language_code,
    p_location_id, p_is_remote, p_status, p_signup_threshold,
    p_start_date, p_end_date, p_timezone,
    p_seat_count, p_waitlist_enabled, p_registration_opens_at,
    p_is_visible, auth.uid(),
    p_primary_gedu_fee_cents, p_assistant_gedu_fee_cents, p_municipality_fee_cents,
    p_for_gamers, p_for_parents, p_tag, p_region_lock_country,
    -- NOT coalesced: the column is NOT NULL, so an explicit null is refused
    -- loudly rather than silently becoming false.
    p_requires_gamer_creations
  )
  RETURNING id INTO v_product_id;

  -- Staff-only, so it lands in its own table. No row when there is no link.
  IF v_material_url IS NOT NULL THEN
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (v_product_id, v_material_url);
  END IF;

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      v_product_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description'
    );
  END LOOP;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        v_product_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        v_product_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT v_product_id, unnest(p_holiday_calendar_ids);
  END IF;

  -- The enrolment conditions (00210). Delegated rather than written inline
  -- because this function is SECURITY INVOKER and product_required_consents
  -- carries no write grant for `authenticated` — the guarded DEFINER writer is
  -- what makes that possible. Unconditional: NULL means "requires nothing",
  -- which on a create is the same as doing nothing, and calling it anyway keeps
  -- this function and update_product reading identically.
  PERFORM public.set_product_required_consents(v_product_id, p_required_consent_slugs);

  RETURN v_product_id;
END;
$$;

COMMENT ON FUNCTION public.create_product(p_product_type public.product_type, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_status public.product_status, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean) IS
  'Admin-gated product create: the parent row plus its translations, schedule slots, prices, holiday calendars, the staff-only material link and, since 00210, the consent documents enrolling on it requires. SECURITY INVOKER — the assert_admin() first statement runs as the caller, which is also why assert_admin itself is granted to authenticated. p_for_gamers/p_for_parents are non-defaulted on purpose: a defaulted audience is one an omitting caller could set without meaning to. p_tag (00178) IS defaulted, and for the opposite reason: null is a legal value for a tag, no CHECK backstops it, and codegen cannot express an explicit null for a non-defaulted argument at all — so omission is how "untagged" reaches the column, and the required-nullable wire schema is what stops an accidental omission upstream. p_region_lock_country (00193) is defaulted for exactly that reason too, and carries one more thing worth knowing: the lock it writes is enforced in the UI alone, because a family''s location is self-attested — see the column comment. p_required_consent_slugs (00210) is defaulted on the same argument and is NOT written inline: this function is SECURITY INVOKER and product_required_consents carries no write grant, so the row goes through set_product_required_consents, the join table''s single guarded writer. p_requires_gamer_creations (00227) is defaulted to FALSE rather than to null, because the column is NOT NULL and false is the resting state of that whole feature — so an omitting caller creates an unflagged product, which is what omission should mean, and an explicit null is refused loudly by the column rather than silently becoming false. This function does NOT take a picture: 00198 dropped p_image_path, because a product''s picture is the product_images entry its image_id points at, written by the route in a second statement, and the served image_path column is derived from that link by trg_products_apply_image_path. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone.';

REVOKE ALL ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean) TO authenticated;
GRANT ALL ON FUNCTION public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. update_product carries the flag
-- ---------------------------------------------------------------------------
--
-- Same drop-and-recreate for the same reason, and the body below is the LIVE
-- definition from supabase/schema.sql with ONE addition: the flag joins the
-- UPDATE's assignment list. Everything else is verbatim.
--
-- It has to join that list, not merely be permitted to: this statement assigns
-- every editable column on every call, so a column it does not name is cleared
-- by the next admin edit. That rule is stated in the body's own comment and this
-- is the column that has to obey it.

DROP FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[]);

CREATE FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer DEFAULT NULL::integer, p_max_age integer DEFAULT NULL::integer, p_is_visible boolean DEFAULT false, p_waitlist_enabled boolean DEFAULT true, p_location_id uuid DEFAULT NULL::uuid, p_signup_threshold integer DEFAULT NULL::integer, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_seat_count integer DEFAULT NULL::integer, p_schedule_slots jsonb DEFAULT NULL::jsonb, p_prices jsonb DEFAULT NULL::jsonb, p_holiday_calendar_ids uuid[] DEFAULT NULL::uuid[], p_primary_gedu_fee_cents integer DEFAULT NULL::integer, p_assistant_gedu_fee_cents integer DEFAULT NULL::integer, p_municipality_fee_cents integer DEFAULT NULL::integer, p_material_url text DEFAULT NULL::text, p_tag public.product_tag DEFAULT NULL::public.product_tag, p_region_lock_country text DEFAULT NULL::text, p_required_consent_slugs text[] DEFAULT NULL::text[], p_requires_gamer_creations boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_slot          JSONB;
  v_price         JSONB;
  v_translation   JSONB;
  v_locales       TEXT[];
  v_material_url  TEXT := NULLIF(btrim(COALESCE(p_material_url, '')), '');
BEGIN
  PERFORM public.assert_admin();

  -- The product gate lock, taken where the existence probe used to be: this
  -- function now deletes from the product's roster, so it serializes against
  -- the participation RPCs that write it (join_waitlist et al) exactly as they
  -- serialize against each other. FOUND is set by PERFORM, so the not-found
  -- error is unchanged in code and position.
  PERFORM 1 FROM public.products WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_translations IS NULL OR jsonb_array_length(p_translations) = 0 THEN
    RAISE EXCEPTION 'At least one translation is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every editable column is assigned on every call, which is why a new column
  -- has to reach this statement in the same change that adds it — a column this
  -- function does not know about is nulled by the next admin edit. `tag` is the
  -- one 00178 added, and it is the case that shows why the rule needs stating:
  -- its parameter is defaulted, so an omitting caller clears the tag silently
  -- and legally. That is the intended way to clear one; what stops it happening
  -- by accident is the wire schema demanding the field on every update.
  -- `region_lock_country` (00193) is the same shape for the same reasons, and a
  -- region lock is editable for a product's whole life on purpose: it gates
  -- future enrolments only and never revisits an existing seat.
  -- `requires_gamer_creations` (00227) obeys the same rule with one difference:
  -- its parameter defaults FALSE, not null, because the column is NOT NULL — so
  -- an omitting caller UNFLAGS the product rather than failing, which is the
  -- same "omission clears it" semantics `tag` has, and the same required wire
  -- field is what keeps it deliberate.
  --
  -- `image_path` is the one editable-looking column this statement must NOT
  -- name, and 00198 removed the assignment along with the parameter that fed
  -- it. It is derived from image_id by trg_products_apply_image_path, which
  -- runs on this very UPDATE; assigning it here only ever wrote a value the
  -- trigger overwrote a moment later.
  UPDATE public.products SET
    billing_mode             = p_billing_mode,
    topic                    = p_topic,
    min_age                  = p_min_age,
    max_age                  = p_max_age,
    for_gamers               = p_for_gamers,
    for_parents              = p_for_parents,
    tag                      = p_tag,
    region_lock_country      = p_region_lock_country,
    spoken_language_code     = p_spoken_language_code,
    location_id              = p_location_id,
    is_remote                = p_is_remote,
    signup_threshold         = p_signup_threshold,
    start_date               = p_start_date,
    end_date                 = p_end_date,
    timezone                 = p_timezone,
    seat_count               = p_seat_count,
    waitlist_enabled         = p_waitlist_enabled,
    registration_opens_at    = p_registration_opens_at,
    is_visible               = p_is_visible,
    primary_gedu_fee_cents   = p_primary_gedu_fee_cents,
    assistant_gedu_fee_cents = p_assistant_gedu_fee_cents,
    municipality_fee_cents   = p_municipality_fee_cents,
    requires_gamer_creations = p_requires_gamer_creations
  WHERE id = p_id;

  -- A product with no waitlist holds no queue. The admin form turns the flag
  -- off two ways — unticking the box, or choosing Unlimited seats, which
  -- derives it false — and the groups panel draws its waitlist column only
  -- while the flag is on, so anything left queued here would be invisible to
  -- every affordance that could promote or remove it. Deleting is the clean
  -- answer rather than the harsh one: the edit that got us here means the
  -- product has seats open, so a dropped family can re-enter through the front
  -- door and land in a BETTER state than the queue they were in (free products
  -- re-enroll instantly; paid ones check out, which is what creates the
  -- subscription a promotion could never have created for them). Promoting
  -- them here instead would grant a free seat on a subscription-billed club.
  --
  -- This is silent by owner decision: no confirmation, no warning, no email.
  -- The triggering edit is expected to be accidental, and the families are told
  -- nothing — a known, accepted impact, recorded here because it is the kind of
  -- thing a future reader will assume was an oversight.
  --
  -- Keyed to the flag's VALUE, not to it changing, so the same statement heals
  -- a queue stranded by an edit made before this rule existed: the next save of
  -- anything at all on the product clears it.
  --
  -- THE CARVE-OUT: never delete a row that carries a LIVE subscription
  -- (00170's predicate — a family_subscriptions row with status <>
  -- 'cancelled'; a dunning-dead one is not live and does not protect the row).
  -- The FK is ON DELETE CASCADE, so dropping such a row would delete our only
  -- record of a subscription Stripe keeps billing — the exact hazard
  -- demote_to_waitlist and admin_remove_participation refuse for. A waitlisted
  -- row with a live subscription is a webhook-race ghost (a demote landing
  -- between Checkout completing and the webhook's insert, or a manual
  -- sub-adoption), effectively unreachable, and it is skipped in silence:
  -- there is no surface here to report it on, and refusing the whole product
  -- edit over a row nobody can see would be worse than leaving it queued.
  IF NOT p_waitlist_enabled THEN
    DELETE FROM public.participations p
     WHERE p.product_id = p_id
       AND p.status = 'waitlisted'
       AND NOT EXISTS (
         SELECT 1
           FROM public.family_subscriptions fs
          WHERE fs.participation_id = p.id
            AND fs.status <> 'cancelled'
       );
  END IF;

  -- Cleared means the row goes, so "no lesson material" stays the absence of a
  -- record rather than becoming a row holding NULL.
  IF v_material_url IS NULL THEN
    DELETE FROM public.product_staff_details WHERE product_id = p_id;
  ELSE
    INSERT INTO public.product_staff_details (product_id, material_url)
    VALUES (p_id, v_material_url)
    ON CONFLICT (product_id) DO UPDATE
      SET material_url = EXCLUDED.material_url;
  END IF;

  -- product_translations — UPSERT new set, then DELETE leftovers (the
  -- "≥1 row remains" trigger passes because the new rows are already in
  -- place before any delete fires).
  v_locales := ARRAY[]::TEXT[];

  FOR v_translation IN SELECT * FROM jsonb_array_elements(p_translations)
  LOOP
    INSERT INTO public.product_translations (
      product_id, locale, name, short_description, long_description
    )
    VALUES (
      p_id,
      v_translation->>'locale',
      v_translation->>'name',
      COALESCE(v_translation->>'short_description', ''),
      v_translation->>'long_description'
    )
    ON CONFLICT (product_id, locale) DO UPDATE SET
      name              = EXCLUDED.name,
      short_description = EXCLUDED.short_description,
      long_description  = EXCLUDED.long_description,
      updated_at        = NOW();

    v_locales := array_append(v_locales, v_translation->>'locale');
  END LOOP;

  DELETE FROM public.product_translations
  WHERE product_id = p_id
    AND locale <> ALL (v_locales);

  -- schedule_slots — wipe and replace.
  DELETE FROM public.schedule_slots WHERE product_id = p_id;

  IF p_schedule_slots IS NOT NULL THEN
    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_schedule_slots)
    LOOP
      INSERT INTO public.schedule_slots (
        product_id, weekday, start_time, duration_minutes
      )
      VALUES (
        p_id,
        (v_slot->>'weekday')::SMALLINT,
        (v_slot->>'start_time')::TIME,
        (v_slot->>'duration_minutes')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_prices — wipe and replace.
  DELETE FROM public.product_prices WHERE product_id = p_id;

  IF p_prices IS NOT NULL THEN
    FOR v_price IN SELECT * FROM jsonb_array_elements(p_prices)
    LOOP
      INSERT INTO public.product_prices (
        product_id, currency, price_cents
      )
      VALUES (
        p_id,
        v_price->>'currency',
        (v_price->>'price_cents')::INTEGER
      );
    END LOOP;
  END IF;

  -- product_holiday_calendars — wipe and replace.
  DELETE FROM public.product_holiday_calendars WHERE product_id = p_id;

  IF p_holiday_calendar_ids IS NOT NULL
     AND array_length(p_holiday_calendar_ids, 1) > 0 THEN
    INSERT INTO public.product_holiday_calendars (product_id, calendar_id)
    SELECT p_id, unnest(p_holiday_calendar_ids);
  END IF;

  -- product_required_consents — wipe and replace (00210), through the join
  -- table's single guarded writer. NULL clears the set, which is the only
  -- expressible way to clear one and is why the wire schema demands the field
  -- on every update. Existing consent_acceptances are untouched: dropping a
  -- requirement changes what FUTURE enrolments must agree to and says nothing
  -- about what past ones did agree to.
  PERFORM public.set_product_required_consents(p_id, p_required_consent_slugs);

  RETURN p_id;
END;
$$;

COMMENT ON FUNCTION public.update_product(p_id uuid, p_billing_mode public.billing_mode, p_translations jsonb, p_topic public.product_topic, p_spoken_language_code public.spoken_language, p_is_remote boolean, p_timezone text, p_registration_opens_at timestamp with time zone, p_for_gamers boolean, p_for_parents boolean, p_min_age integer, p_max_age integer, p_is_visible boolean, p_waitlist_enabled boolean, p_location_id uuid, p_signup_threshold integer, p_start_date date, p_end_date date, p_seat_count integer, p_schedule_slots jsonb, p_prices jsonb, p_holiday_calendar_ids uuid[], p_primary_gedu_fee_cents integer, p_assistant_gedu_fee_cents integer, p_municipality_fee_cents integer, p_material_url text, p_tag public.product_tag, p_region_lock_country text, p_required_consent_slugs text[], p_requires_gamer_creations boolean) IS
  'Admin-gated product edit: parent row plus wipe-and-replace of translations, schedule slots, prices, holiday calendars, the staff-only material link and — since 00210 — the set of consent documents enrolling on it requires, under the product gate lock. Since 00171 it also DELETES the product''s waitlist whenever the saved waitlist_enabled is false — the flag goes off by unticking it or by uncapping, and the groups panel draws its waitlist column only while it is on, so a surviving queue would be invisible to every affordance that could work it. Deletion rather than promotion: promoting would grant seats with no subscription behind them, while the edit itself opens seats, so a dropped family can simply sign up again. It is silent by owner decision — no confirmation, warning or email — and keyed to the flag''s value rather than to it changing, so it also heals a queue stranded before the rule existed. One exception: a waitlisted row carrying a LIVE subscription (a family_subscriptions row with status <> ''cancelled'', 00170''s predicate) is skipped, because the FK cascades and deleting it would orphan billing Stripe still runs. SECURITY DEFINER since 00171 — participations grants authenticated no writes, so the delete cannot run as the caller; the assert_admin() first statement is what authorizes the whole function. Since 00173 it assigns for_gamers/for_parents, which are non-defaulted parameters precisely because this statement assigns every editable column on every call. Since 00178 it also assigns tag, whose parameter IS defaulted — null is a legal tag and no CHECK backstops it, so omission is the only expressible way to clear one, and the required-nullable wire schema is what keeps that deliberate. Since 00193 it assigns region_lock_country the same way, and that column is deliberately editable on a live product: the lock gates future enrolments only, is never re-run against a seat already held, and is enforced in the UI alone because a family''s location is self-attested. Since 00198 it does NOT assign image_path and takes no p_image_path: that column is derived from image_id by trg_products_apply_image_path on this very UPDATE, so the assignment was always overwritten a moment later. Since 00199 p_spoken_language_code is public.spoken_language rather than text, because the reference table it used to name is gone. Since 00210 p_required_consent_slugs replaces the requirement set through set_product_required_consents — NULL clears it, and past acceptances are never touched, because dropping a requirement changes what future enrolments must agree to and says nothing about what past ones did. Since 00227 it assigns requires_gamer_creations, whose parameter defaults FALSE rather than null because the column is NOT NULL — so an omitting caller unflags the product, the same "omission clears it" semantics tag has, kept deliberate by the required wire field.';

REVOKE ALL ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean) TO authenticated;
GRANT ALL ON FUNCTION public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The voice staff overlay carries the list
-- ---------------------------------------------------------------------------
--
-- Owner decision: creations edit in-session too, so the per-gamer dialog is
-- identical in every mount and the overlay has to feed the same flair. One
-- LEFT JOIN, one key, and the map's entries otherwise unchanged.
--
-- `creations` is emitted as [] rather than null when there is no row, unlike
-- `note` beside it. The note is a nullable scalar and null IS its empty; a list
-- has a real empty value, and emitting it means no reader has to decide what a
-- null list means.

CREATE OR REPLACE FUNCTION public.get_group_staff_overlay(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_type public.product_type;
  v_members      jsonb;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright; a gedu has to teach some
  -- group of this group's product.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group_product(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The product type travels because the voice room has NO other route to it:
  -- /voice/group/[id] is passed a group id and a back link, VoiceRoomContext
  -- carries groupId and isModerator, and the token deliberately puts nothing
  -- staff-shaped on itself. The newcomer badge is a clubs-only PRESENTATION
  -- rule and the join stamp is a FACT, so the fact is emitted unconditionally
  -- and the client applies the rule — one shared helper instead of the same
  -- decision baked into four RPCs.
  SELECT p.product_type INTO v_product_type
    FROM public.product_groups g
    JOIN public.products p ON p.id = g.product_id
   WHERE g.id = p_group_id;

  -- One entry per ACTIVE participation of the group, note or no note, stamp or
  -- no stamp — the same map shape get_gedu_group_feed already uses for
  -- attendance. So the map's own keys name exactly the people a note may be
  -- written about, which is the seat-holder set the room needs; a separate ids
  -- array would be a second list of the same people to keep true. A participant
  -- id absent from the map — a visiting admin, the gedu themselves, a stale
  -- peer — simply gets no flair.
  --
  -- No join can fan a row out: gamer_group_notes and gamer_group_creations are
  -- each keyed on exactly (group_id, participant_id) and profiles.id is a
  -- primary key.
  SELECT COALESCE(jsonb_object_agg(part.participant_id, jsonb_build_object(
           'group_joined_at',            part.group_joined_at,
           'note',                       n.note,
           'note_updated_by_first_name', ed.first_name,
           -- 00227. Always an array, never null: absence of a row means an
           -- empty list, and the reader should not have to know that.
           'creations',                  COALESCE(cr.creations, '[]'::jsonb)
         )), '{}'::jsonb)
    INTO v_members
    FROM public.participations part
    LEFT JOIN public.gamer_group_notes n
           ON n.group_id       = part.group_id
          AND n.participant_id = part.participant_id
    LEFT JOIN public.profiles ed ON ed.id = n.updated_by
    LEFT JOIN public.gamer_group_creations cr
           ON cr.group_id       = part.group_id
          AND cr.participant_id = part.participant_id
   WHERE part.group_id = p_group_id
     AND part.status   = 'active'::public.participation_status;

  RETURN jsonb_build_object(
    'product_type', v_product_type,
    'members',      v_members
  );
END;
$$;

COMMENT ON FUNCTION public.get_group_staff_overlay(p_group_id uuid) IS 'The staff-only marks for one group''s active roster, in one document: product_type, and a map keyed by participant id whose entries carry group_joined_at, note, note_updated_by_first_name and — since 00227 — creations. Open to an ADMIN or to any gedu assigned to any group of the group''s product, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. Built for the voice room, which has no other route to these marks: staff-only data must never ride the Daily token or user_name, because that channel is broadcast to every peer including children. A refused caller means the flair is gated by data access rather than by a viewer prop. Note that `creations` is the one entry here that is NOT staff-only — the gamer''s own family reads the same list on their product page — but it rides this document because the per-gamer dialog is identical in every mount, including in-session. It is emitted as [] rather than null when there is no row, because a list has a real empty value where a note does not. product_type is on the document because the room knows only a group id, and the clubs-only newcomer rule is applied client-side from it. Every active member appears whether or not they have a note or a creation, so the map''s keys are the seat-holder set. An unknown group id returns a null-shaped document to an admin rather than raising.';

REVOKE ALL ON FUNCTION public.get_group_staff_overlay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_staff_overlay(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. The gedu group feed carries the list, and the flag
-- ---------------------------------------------------------------------------
--
-- The copy both workspace shells actually render — the gedu product page and
-- the admin group details page — and the one a roster write invalidates.
--
-- TWO additions, not one. The roster rows gain `creations`; the PRODUCT SHELL
-- gains `requires_gamer_creations`, because the fourth completeness condition is
-- derived CLIENT-SIDE from the flag plus the roster's creations, and this
-- document is where the session cards get their product from. Without the flag
-- on the wire there is no way to ask the question.

CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id uuid;
  v_product    jsonb;
  v_group      jsonb;
  v_site       jsonb;
  v_roster     jsonb;
  v_sessions   jsonb;
BEGIN
  -- Guard-first, in the shape set_group_notes established and the authorization
  -- spine reads: the role half admits an admin or a gedu and refuses everyone
  -- else on the first statement.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The ownership half. An admin passes it outright — the admin group details
  -- page renders this same document for any group of any product, which is what
  -- makes it the same surface as the gedu workspace rather than a second one.
  --
  -- For a GEDU this is unchanged: v1 shows them only their OWN group's feed.
  -- Peer-group feeds are not a schema restriction — relaxing this to "any group
  -- on a product the caller is assigned to" is a change to this predicate alone,
  -- and nothing downstream assumes the caller teaches the group they are
  -- reading, which is exactly what the admin path above now relies on.
  IF NOT public.is_admin()
     AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT g.product_id INTO v_product_id
    FROM public.product_groups g WHERE g.id = p_group_id;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- Gedu-only, and stored somewhere only this function and an admin can
    -- reach. This document is never served to a parent or a gamer.
    'material_url', psd.material_url,
    -- 00227. Staff-facing only, and the one thing a client needs before it can
    -- decide that the final session owes creations: the condition is derived on
    -- the client from this flag, the schedule and the roster's creations, so no
    -- document carries an "owed" field of its own.
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  LEFT JOIN public.product_staff_details psd ON psd.product_id = p.id
  WHERE p.id = v_product_id;

  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note,
    'gedu_note',   g.gedu_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = p_group_id;

  -- The venue, on in-person products only. A remote municipality club carries a
  -- location_id too (a municipality, by CHECK), so "has a location" is the
  -- wrong test and would put a site-notes panel on a club that has no building.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes,
    'gedu_note',   ssd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd       ON sd.location_id  = l.id
  LEFT JOIN public.site_staff_details ssd ON ssd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- The current roster. There is deliberately no joined-by-date machinery and
  -- no enrollment-at-the-time derivation: "who was enrolled then" is knowledge
  -- we do not have and choose not to fake. `signed_up_at` travels with each row
  -- so the client can tell someone who joined last week from one who has been
  -- here all term.
  --
  -- The identity key is `participant_id` as of 00175. Every row on this roster
  -- is whoever holds the seat, and since 00173 that can be an adult — the
  -- date_of_birth / gender / game-account columns below simply come back NULL
  -- for one, which is the deliberate empty the row renders rather than a gap.
  --
  -- Both platforms travel (00195), and neither implies the other: a child may
  -- have given one handle, both, or none. Which one a surface draws is decided
  -- by the product's topic, which this document does not carry — the page takes
  -- it from get_gedu_assigned_product.
  --
  -- `signed_up_at` and `group_joined_at` answer two different questions and
  -- both travel (00203): the first is when this seat was taken on the PRODUCT,
  -- the second when it entered THIS GROUP, and a member moved between two
  -- groups of one product has a fresh second and an unchanged first.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_roster
    FROM (
      SELECT jsonb_build_object(
        'participant_id',     part.participant_id,
        'first_name',         gmp.first_name,
        'signed_up_at',       part.signed_up_at,
        'date_of_birth',      gprof.date_of_birth,
        'gender',             gprof.gender,
        'minecraft_username', mca.minecraft_username,
        'minecraft_uuid',     mca.minecraft_uuid,
        'roblox_username',    rba.roblox_username,
        'roblox_user_id',     rba.roblox_user_id,
        -- Every gamer account is created by a parent who signed up with an
        -- email, so on a CHILD row this is non-null in practice and the wire
        -- contract said so until 00173. An ADULT row has no parent link at all,
        -- so it is NULL there and the contract now allows it — the address for
        -- that row is the one below.
        'parent_email', (
          SELECT pp.email
            FROM public.parent_gamer pgm
            JOIN public.profiles pp ON pp.id = pgm.parent_id
           WHERE pgm.gamer_id = part.participant_id
           ORDER BY pgm.created_at ASC NULLS LAST, pgm.id ASC
           LIMIT 1
        ),
        -- The adult's own address, and NULL on every child row. Deliberately
        -- not "the participant's email whoever they are": a gamer's profile
        -- email is the synthetic @gamer.sogverse.internal handle, which is not
        -- a mailbox and must never reach a copy-email affordance. The role
        -- check (00177) is what makes "adult seat" mean the ROLE, not id
        -- equality alone: a hand-written row with a gamer's id transposed into
        -- customer_id satisfies the equality but is not a customer, and yields
        -- NULL here rather than leaking the synthetic handle.
        'participant_email',
          CASE WHEN part.participant_id = part.customer_id
                AND gmp.role = 'customer' THEN gmp.email END,
        -- The staff-only flair (00203), in parity with
        -- get_gedu_assigned_product's roster — the two shapes are kept
        -- identical on purpose, and this is the copy the page renders.
        'group_joined_at',            part.group_joined_at,
        'note',                       gn.note,
        'note_updated_by_first_name', ned.first_name,
        -- 00227, and the one field on this roster that is NOT staff-only: the
        -- member's own family reads the same list on their product page. It
        -- rides here because the roster is where the per-gamer dialog is opened
        -- from, and because the client derives the final session's fourth
        -- completeness condition by tallying it against this same roster.
        -- Always an array, never null.
        'creations',                  COALESCE(gc.creations, '[]'::jsonb)
      ) AS entry
        FROM public.participations part
        JOIN public.profiles gmp                ON gmp.id        = part.participant_id
        LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
        LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
        LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
        -- Keyed on exactly (group_id, participant_id), so this cannot fan the
        -- row out; profiles.id behind it is a primary key.
        LEFT JOIN public.gamer_group_notes gn
               ON gn.group_id       = part.group_id
              AND gn.participant_id = part.participant_id
        LEFT JOIN public.profiles ned           ON ned.id        = gn.updated_by
        -- Same key, same guarantee.
        LEFT JOIN public.gamer_group_creations gc
               ON gc.group_id       = part.group_id
              AND gc.participant_id = part.participant_id
       WHERE part.group_id = p_group_id
         AND part.status   = 'active'::public.participation_status
    ) AS roster_rows;

  -- Every stored row for the group, newest first — including rows the schedule
  -- no longer projects. An orphan is history, not a mistake.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',               s.id,
        'session_date',     s.session_date,
        'starts_at',        s.starts_at,
        'ends_at',          s.ends_at,
        'report',           s.report,
        'gedu_note',        s.gedu_note,
        'created_at',       s.created_at,
        'updated_at',       s.updated_at,
        'created_by',       s.created_by,
        'updated_by',       s.updated_by,
        -- When this session's report was mailed to the group's families, and
        -- NULL until it has been (00197). The card renders the sent line from
        -- it and decides whether to offer the button, so it has to travel with
        -- the session rather than be read separately.
        --
        -- Its partner column `report_emailed_by` deliberately stays OFF the
        -- wire: it is an audit trail for staff, nothing renders it, and the
        -- card's author chip is `updated_by_first_name` above.
        'report_emailed_at', s.report_emailed_at,
        -- The last editor's first name, for the author chip on the card.
        --
        -- LEFT-JOIN-shaped on purpose: NULL when nothing has stamped the row
        -- yet, and NULL again if the profile has gone. The FK is ON DELETE SET
        -- NULL, so the second case cannot arise from a deleted profile — it is
        -- written this way so the shape survives any future relaxation rather
        -- than because it is reachable today.
        --
        -- This is the LAST TOUCHER of the whole session, not the report's
        -- author: an attendance correction or a staff-note edit moves it.
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        -- The session's photos (00222). `created_by` is deliberately NOT on the
        -- wire — it is safeguarding audit, it gates nothing and nothing renders
        -- it, exactly like report_emailed_by above. Ordered by (created_at, id):
        -- the stamp is clock_timestamp() taken under the session row's lock and
        -- the id breaks a sub-tick tie, so every surface draws the same order.
        -- The URL is derived from the id by one helper rather than stored.
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        -- Sparse map keyed by participant id. A roster member absent from this
        -- object is UNMARKED, which is a different claim from 'absent'.
        'attendance', COALESCE((
          SELECT jsonb_object_agg(a.participant_id, a.status)
            FROM public.session_attendance a
           WHERE a.session_id = s.id
        ), '{}'::jsonb)
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = p_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'product',  v_product,
    'group',    v_group,
    'site',     v_site,
    'roster',   v_roster,
    'sessions', v_sessions
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS 'One round trip for a group workspace: product shell (with the gedu-only material link, read from product_staff_details), group notes, site notes on in-person products, the current roster, and every stored session row with its sparse attendance map and, since 00222, its photos. Contains no schedule expansion — the client owns the calendar math. Open since 00204 to an ADMIN as well as to the assigned gedu, guard-first on assert_role with the ownership question as a second 42501 — the same shape set_group_notes uses. The admin caller is the product page''s per-group GROUP DETAILS page, which renders the gedu workspace''s page body unchanged: one body fed by one document is what keeps the two surfaces one surface, where a second admin-shaped RPC would have started drifting field by field. An admin passes the ownership half outright; a gedu is still shown only their OWN group''s feed, and a customer or a gamer is still refused on the first statement, which is what keeps the material link and the three staff notes off every family surface. Each roster row is keyed by participant_id (00175 — whoever holds the seat, child or adult), carries both game identities since 00195 (minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, independent of each other and drawn according to the product''s topic, which this document does not carry), and carries two contact fields and never both: parent_email for a child (their linked parent), participant_email for an adult seat (their own address, NULL on child rows because a gamer profile''s email is a synthetic non-mailbox). Since 00203 each roster row also carries the staff-only flair — group_joined_at (when the seat entered THIS group, as against signed_up_at, which is when it was taken on the product), note and note_updated_by_first_name — in deliberate parity with get_gedu_assigned_product''s roster, which is the parity the page depends on because it renders this copy. Since 00227 each roster row additionally carries `creations` (always an array, [] when there is no row) — the one roster field that is NOT staff-only, since the member''s own family reads the same list — and the product shell carries requires_gamer_creations, because the final session''s fourth completeness condition is derived on the CLIENT from that flag, the schedule and this roster''s creations; no document carries an "owed" field. Each session row carries report_emailed_at since 00197 — when its report was mailed to the families, NULL until it was — and never report_emailed_by, which is audit and renders nowhere. Since 00222 each session row also carries `images`: {id, width, height} per photo, ordered by (created_at, id), with the uploader deliberately off the wire for the same reason the sender is. Widened IN PLACE rather than under a versioned name because the gedu contracts schema is tolerant of unknown keys.';

REVOKE ALL ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. The gedu assigned-product document keeps parity
-- ---------------------------------------------------------------------------
--
-- Its roster's shape is in documented parity with the feed's and the two share a
-- row type, so it widens with it rather than splitting the type. The shell gains
-- the flag for the same reason: the page composes both documents, and a shell
-- that carries the flag on one and not the other is the drift this parity exists
-- to prevent.

CREATE OR REPLACE FUNCTION public.get_gedu_assigned_product(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_caller_id   UUID := (SELECT auth.uid());
  v_my_group_id UUID;
  v_product     JSONB;
  v_groups      JSONB;
BEGIN
  PERFORM public.assert_role('gedu');

  SELECT group_id
    INTO v_my_group_id
    FROM gedu_group_assignments
   WHERE product_id = p_product_id
     AND gedu_id    = v_caller_id
   LIMIT 1;

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    -- Which game identity this product's surfaces are about, if any. The enum
    -- travels as its text value; the mapping from a topic to a platform is a
    -- client-side decision (minecraft_java -> Minecraft, roblox_studio ->
    -- Roblox, everything else -> no game identity), deliberately not encoded
    -- here: a topic gaining or losing a platform is a product decision, not a
    -- schema change.
    'topic',        p.topic,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    -- 00227, in shell parity with get_gedu_group_feed's for the same reason the
    -- rosters are in parity: the page composes both documents.
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'locale',      pt.locale,
                 'name',        pt.name,
                 'description', pt.short_description
               )
             )
        FROM product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'weekday',          ss.weekday,
                 'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
                 'duration_minutes', ss.duration_minutes
               )
               ORDER BY ss.weekday, ss.start_time
             )
        FROM schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM products p
  WHERE p.id = p_product_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Product not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT jsonb_build_object(
        'id',            pg.id,
        'name',          pg.name,
        'created_at',    pg.created_at,
        'is_my_group',   (pg.id = v_my_group_id),
        -- Every active seat on the group, whoever holds it. Spelled for a gamer
        -- until 00175, at which point counting an adult parent under that name
        -- became a lie the badge repeated on screen.
        'participant_count',   (
          SELECT COUNT(*)::INTEGER
            FROM participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id',         gp.id,
                     'first_name', gp.first_name
                   )
                   ORDER BY gp.first_name
                 )
            FROM gedu_group_assignments ga
            JOIN profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster',
          CASE WHEN pg.id = v_my_group_id THEN
            COALESCE((
              SELECT jsonb_agg(
                       jsonb_build_object(
                         'participant_id',     part.participant_id,
                         'first_name',         gmp.first_name,
                         'date_of_birth',      gprof.date_of_birth,
                         'gender',             gprof.gender,
                         'minecraft_username', mca.minecraft_username,
                         'minecraft_uuid',     mca.minecraft_uuid,
                         'roblox_username',    rba.roblox_username,
                         'roblox_user_id',     rba.roblox_user_id,
                         'parent_email',       (
                           SELECT pp.email
                             FROM parent_gamer pgm
                             JOIN profiles pp ON pp.id = pgm.parent_id
                            WHERE pgm.gamer_id = part.participant_id
                            ORDER BY pgm.created_at ASC NULLS LAST,
                                     pgm.id           ASC
                            LIMIT 1
                         ),
                         -- Shape parity with get_gedu_group_feed, which is the
                         -- copy every rendered roster actually comes from. Kept
                         -- deliberately rather than left out: one roster shape
                         -- with two definitions is how the two drift, and the
                         -- next reader would delete the wrong one. Do not
                         -- remove this as unused. The role check (00177) keeps
                         -- it in step with the feed: an id transposition yields
                         -- NULL rather than a gamer's synthetic handle.
                         'participant_email',
                           CASE WHEN part.participant_id = part.customer_id
                                 AND gmp.role = 'customer'
                                THEN gmp.email END,
                         -- The staff-only flair (00203). Emitted for every
                         -- roster row, note or no note, stamp or no stamp. The
                         -- join stamp is a FACT and the clubs-only newcomer
                         -- rule is a PRESENTATION rule applied client-side, so
                         -- nothing here is nulled out by product type.
                         'group_joined_at',            part.group_joined_at,
                         'note',                       gn.note,
                         'note_updated_by_first_name', ned.first_name,
                         -- 00227, in parity with the feed's roster. Always an
                         -- array, never null.
                         'creations',                  COALESCE(gc.creations, '[]'::jsonb)
                       )
                       ORDER BY gmp.first_name
                     )
                FROM participations part
                JOIN profiles gmp              ON gmp.id        = part.participant_id
                LEFT JOIN gamer_profiles gprof  ON gprof.user_id = part.participant_id
                LEFT JOIN minecraft_accounts mca ON mca.user_id  = part.participant_id
                LEFT JOIN roblox_accounts rba    ON rba.user_id   = part.participant_id
                -- Keyed on exactly (group_id, participant_id), so this cannot
                -- fan the row out; profiles.id behind it is a primary key.
                LEFT JOIN public.gamer_group_notes gn
                       ON gn.group_id       = part.group_id
                      AND gn.participant_id = part.participant_id
                LEFT JOIN public.profiles ned ON ned.id = gn.updated_by
                -- Same key, same guarantee.
                LEFT JOIN public.gamer_group_creations gc
                       ON gc.group_id       = part.group_id
                      AND gc.participant_id = part.participant_id
               WHERE part.group_id = pg.id
                 AND part.status   = 'active'
            ), '[]'::jsonb)
          ELSE NULL
          END
      ) AS g
        FROM product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;

COMMENT ON FUNCTION public.get_gedu_assigned_product(p_product_id uuid) IS 'One round trip for a gedu opening a product they are assigned to: the product shell, which group is theirs, and every group on the product with its participant_count and gedus. The roster rides only on the caller''s own group and is keyed by participant_id (00175) — the same shape get_gedu_group_feed serves, kept in parity on purpose even though the rendered roster always comes from the feed''s fresher copy. Since 00195 the shell carries the product''s topic (which decides whether a game identity is shown at all, and which one) and each roster entry carries roblox_username/roblox_user_id beside the Minecraft pair. Since 00203 each roster entry also carries the staff-only flair — group_joined_at, note and note_updated_by_first_name — emitted unconditionally, because the join stamp is a fact and the clubs-only newcomer rule is applied by the client. Since 00227 each roster entry carries `creations` too (always an array, [] when there is no row) and the shell carries requires_gamer_creations, both in parity with get_gedu_group_feed for the same reason every other field is: the page composes both documents, and a field on one shell and not the other is exactly the drift the parity exists to prevent.';

REVOKE ALL ON FUNCTION public.get_gedu_assigned_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_assigned_product(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. The family product page carries the caller's OWN list
-- ---------------------------------------------------------------------------
--
-- A TOP-LEVEL array, not a map keyed by participant. That is the whole privacy
-- argument in one type decision: another child's creations have nowhere to live
-- in this document, so no filter downstream can be forgotten. It is the same
-- move `attendance` already makes on this document, where the gedu feed carries
-- a map over the roster and this one carries a single answer.
--
-- This is the one staff-authored field on a family surface that carries LINKS,
-- and it is a deliberate, owner-approved exception to the link-free rule session
-- reports follow. The trust boundary: only staff write, only the gamer's own
-- family reads, and a value that does not parse as http(s) renders as its title
-- in plain text rather than as an anchor with nowhere to go.
--
-- The requirement flag and every owed state stay OFF this document. A family
-- sees nothing different on a flagged product.

CREATE OR REPLACE FUNCTION public.get_my_family_product_feed(p_participation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid            uuid := (SELECT auth.uid());
  v_participant_id uuid;
  v_group_id       uuid;
  v_product_id     uuid;
  v_participant    jsonb;
  v_product        jsonb;
  v_group          jsonb;
  v_site           jsonb;
  v_gedus          jsonb;
  v_sessions       jsonb;
  v_creations      jsonb;
BEGIN
  -- No caller, no answer. This function is scoped entirely to auth.uid(); with
  -- no uid there is nobody for it to be scoped TO, so there is no correct
  -- document to return and the only safe reply is a refusal. Checked FIRST and
  -- on its own, rather than folded into the predicate below, because the whole
  -- failure 00152 exists to fix was a NULL uid disappearing into a larger
  -- boolean expression.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT part.participant_id, part.group_id, part.product_id
    INTO v_participant_id, v_group_id, v_product_id
    FROM public.participations part
   WHERE part.id = p_participation_id;

  -- A participation that does not exist and one belonging to another family
  -- answer IDENTICALLY, on purpose. Distinguishing them would turn this
  -- function into an oracle for "is this a real enrollment id", which is a
  -- question no caller has a right to ask about a row that is not theirs.
  --
  -- The first arm is also what admits a PARENT'S OWN SEAT with no change: the
  -- participant is the caller, so it matches directly and the parent-link
  -- fallback is never reached.
  --
  -- `IS NOT DISTINCT FROM`, not `=`: the equality form is only safe here
  -- because of the guard above, and a predicate whose correctness depends on a
  -- check twenty lines away is one edit away from being wrong again. This form
  -- is false — never NULL — for every input, so the IF cannot be skipped.
  IF v_participant_id IS NULL
     OR NOT (v_participant_id IS NOT DISTINCT FROM v_uid
             OR public.is_parent_of(v_participant_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- An unplaced enrollment (purchased, awaiting a group) has no feed and no
  -- page: the sessions, the gedus and the group note all hang off the group.
  -- A DIFFERENT error from the refusal above, and deliberately so — the caller
  -- owns this row, so there is nothing to conceal from them, and the client
  -- renders both as not-found anyway. `no_data_found` is P0002, which PostgREST
  -- maps to a 404; the refusals above are 42501, which it maps to a 403.
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Participation % is not placed in a group', p_participation_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Whoever holds the seat. The page is participant-scoped and reachable by
  -- URL, so it cannot get the name from a dashboard card it was not opened
  -- from. This is the caller's own child, or the caller themselves — the
  -- ownership check above is what makes that true.
  SELECT jsonb_build_object(
    'id',         pr.id,
    'first_name', pr.first_name
  )
  INTO v_participant
  FROM public.profiles pr WHERE pr.id = v_participant_id;

  -- The product shell. Names live in product_translations, not on `products`,
  -- so the translations array IS the name. `material_url` lives on
  -- product_staff_details and this query does not join it. The requirement flag
  -- (00227) is not selected either, and its absence here is the enforcement: it
  -- is staff-facing, and a family sees nothing different on a flagged product.
  SELECT jsonb_build_object(
    'id',           p.id,
    'product_type', p.product_type,
    'timezone',     p.timezone,
    'start_date',   p.start_date,
    'end_date',     p.end_date,
    'is_remote',    p.is_remote,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ) ORDER BY pt.locale)
        FROM public.product_translations pt WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  )
  INTO v_product
  FROM public.products p
  WHERE p.id = v_product_id;

  -- The group's family-facing half. `gedu_note` is not selected, and its
  -- absence here is the enforcement — not a filter somewhere downstream. The id
  -- travels because the voice-room href and the feed's entry keys are built
  -- from it.
  SELECT jsonb_build_object(
    'id',          g.id,
    'name',        g.name,
    'public_note', g.public_note
  )
  INTO v_group
  FROM public.product_groups g WHERE g.id = v_group_id;

  -- The venue, in-person products only — same test as the gedu feed, and for
  -- the same reason: a remote municipality club carries a location_id (a
  -- municipality, by CHECK), so "has a location" would put an address on a club
  -- with no building. site_staff_details is not joined at all.
  SELECT jsonb_build_object(
    'location_id', l.id,
    'name',        l.name,
    'address',     sd.address,
    'public_note', sd.notes
  )
  INTO v_site
  FROM public.products p
  JOIN public.locations l ON l.id = p.location_id
  LEFT JOIN public.site_details sd ON sd.location_id = l.id
  WHERE p.id = v_product_id
    AND p.is_remote = false;

  -- Who teaches this group, by first name. Nothing else about them: not the
  -- surname, not the email, not the verification state. A family is being told
  -- who they are with, which is a first name's worth of information.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'first_name'), '[]'::jsonb)
    INTO v_gedus
    FROM (
      SELECT jsonb_build_object(
        'id',         pr.id,
        'first_name', pr.first_name
      ) AS entry
        FROM public.gedu_group_assignments ga
        JOIN public.profiles pr ON pr.id = ga.gedu_id
       WHERE ga.group_id = v_group_id
    ) AS gedu_rows;

  -- THIS participant's creations in THIS group, and nobody else's (00227). A
  -- flat array on the document rather than a map keyed by participant, so
  -- another child's work has nowhere to live here BY TYPE — the same move
  -- `attendance` makes below, where the gedu feed carries a map and this
  -- document carries one answer. Empty array when there is no row, so the card
  -- renders on "is this empty" and never on "is this null".
  SELECT COALESCE(
           (SELECT c.creations
              FROM public.gamer_group_creations c
             WHERE c.group_id       = v_group_id
               AND c.participant_id = v_participant_id),
           '[]'::jsonb
         )
    INTO v_creations;

  -- The group's whole stored history, newest first — including sessions that
  -- predate this participant's enrolment, and including rows the schedule no
  -- longer projects. See 00151's header for why there is no window here.
  --
  -- `report` and nothing else of the two note fields. `attendance` is ONE
  -- answer — this participant's — rather than the gedu feed's map over the
  -- roster, which is what makes another child's mark structurally unreachable
  -- rather than merely unrendered. NULL means unmarked, which is a third state
  -- and not the same claim as 'absent'.
  --
  -- The two `updated_by*` keys are 00194's widening, and the name travels per
  -- session rather than being resolved against `gedus` above because the sets
  -- genuinely differ: the gedu who wrote up September may not teach the group in
  -- November, and resolving against the current list would leave the oldest
  -- reports unsigned. It is the last editor of the SESSION, not the report's
  -- author — an attendance mark moves it — which is a limitation this document
  -- states rather than hides.
  --
  -- `images` is 00222's. Same shape as the gedu and admin documents' —
  -- {id, width, height}, ordered by (created_at, id) — because one shared
  -- gallery component renders them all. The uploader does not travel: it is
  -- safeguarding audit, and a family surface is the last place for it.
  SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'session_date' DESC), '[]'::jsonb)
    INTO v_sessions
    FROM (
      SELECT jsonb_build_object(
        'id',           s.id,
        'session_date', s.session_date,
        'starts_at',    s.starts_at,
        'ends_at',      s.ends_at,
        'report',       s.report,
        'updated_by',   s.updated_by,
        'updated_by_first_name', (
          SELECT pr.first_name
            FROM public.profiles pr
           WHERE pr.id = s.updated_by
        ),
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',     img.id,
                   'width',  img.width,
                   'height', img.height
                 ) ORDER BY img.created_at, img.id)
            FROM public.group_session_images img
           WHERE img.session_id = s.id
        ), '[]'::jsonb),
        'attendance', (
          SELECT a.status
            FROM public.session_attendance a
           WHERE a.session_id = s.id
             AND a.participant_id   = v_participant_id
        )
      ) AS entry
        FROM public.group_sessions s
       WHERE s.group_id = v_group_id
    ) AS session_rows;

  RETURN jsonb_build_object(
    'participant', v_participant,
    'product',     v_product,
    'group',       v_group,
    'site',        v_site,
    'gedus',       v_gedus,
    'creations',   v_creations,
    'sessions',    v_sessions
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_product_feed(p_participation_id uuid) IS 'One round trip for a family club/camp/event page, scoped to ONE participation: the product shell, the group name and its family-facing note, the venue on in-person products, the teaching gedus'' first names, the group''s full stored session history with reports and PHOTOS, the named participant''s own attendance marks, and — since 00227 — that participant''s own creations. Each session carries updated_by and the last editor''s first name (00194) — last editor of the SESSION, not author of the report: an attendance mark or a staff-note edit moves it. The name travels per session because a past session''s editor may no longer teach the group. Since 00222 each session also carries `images`: {id, width, height} per photo, ordered by (created_at, id), the same shape the gedu and admin documents carry because one shared gallery renders all three, and never the uploader, which is safeguarding audit; that key was added under a versioned twin and the twin was later dropped when the severity paragraph in docs/plans/CLAUDE.md settled that transient read-side breakage inside a release window is accepted. `creations` (00227) is a TOP-LEVEL array of {title, url} — this participant''s own, in this group, and structurally incapable of holding anybody else''s because it is not a map keyed by participant. It is the one staff-authored family-facing field that carries links, an owner-approved exception to the link-free rule session reports follow, and the render side parses each URL and degrades to the title as plain text when it is not http(s). Empty array when there is nothing, so the card renders on emptiness and never on null. Self-scoping — the caller must be the participation''s participant (a child, or a parent holding a seat of their own) or a parent linked to them; an unplaced participation has no page and answers P0002; a row that does not exist and a row belonging to another family are refused identically, so it cannot be used as an oracle for enrollment ids. Carries no gedu note of any scope, no roster, no other participant''s marks or creations, no parent email, no material link, no requires_gamer_creations flag and no owed/completeness state.';

REVOKE ALL ON FUNCTION public.get_my_family_product_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. The gedu dashboard's owed count gains a fourth condition
-- ---------------------------------------------------------------------------
--
-- The badge's UNIT does not change: it still counts SESSIONS needing attention.
-- The final session simply gains one more way to need it.
--
-- WHAT "THE FINAL SESSION" IS, AND WHY IT IS COMPUTED THIS WAY. There is no
-- stored final-session flag; occurrences come from the schedule. So the final
-- session is the LAST occurrence the schedule projects on or before end_date. It
-- is derived in a lateral of its own below rather than inline, because it is one
-- answer per assignment and the occurrence set it is compared against has many
-- rows. The window it walks is the SEVEN DAYS ending at end_date (floored at
-- start_date), which is sufficient because slots are weekly: any run at least a
-- week long has every weekday inside that window, and a shorter run is entirely
-- inside it. An open-ended product has end_date NULL, the lateral answers NULL,
-- the equality is never true, and such a product therefore never owes creations
-- — documented behaviour, not an error.
--
-- The condition attaches to an occurrence in the SAME set the other three use,
-- so it inherits their two properties for free: it can only fire once the
-- session has FINISHED (the set holds nothing else), and it is floored by the
-- epoch like everything else this count measures.

CREATE OR REPLACE FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  PERFORM public.assert_role('gedu');

  RETURN COALESCE((
    SELECT jsonb_agg(
             jsonb_build_object(
               'product_id',              a.product_id,
               'group_id',                a.group_id,
               'group_name',              g.name,
               -- Renamed from group_gamer_count in 00175: the count is every
               -- active seat on the group, and since 00173 one of those can be
               -- an adult.
               'group_participant_count', roster.roster_size,
               'site_name',               site.name,
               'attention_count',         COALESCE(owed.owed_count, 0)
             )
             ORDER BY g.name
           )
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = a.product_id

      -- The venue, in-person products only (see get_gedu_group_feed).
      LEFT JOIN LATERAL (
        SELECT l.name
          FROM public.locations l
         WHERE l.id = p.location_id AND p.is_remote = false
      ) AS site ON true

      CROSS JOIN LATERAL (
        SELECT COUNT(*)::integer AS roster_size
          FROM public.participations part
         WHERE part.group_id = g.id
           AND part.status   = 'active'::public.participation_status
      ) AS roster

      -- The run's FINAL computed occurrence (00227), which is the only session
      -- the creations condition below can attach to. NULL for an open-ended
      -- product, and NULL for a run whose schedule projects nothing at all;
      -- either way the equality below never holds and nothing ever owes.
      --
      -- Seven days ending at end_date, floored at start_date. Slots are weekly,
      -- so a run of a week or more has every weekday in that window and a
      -- shorter run is wholly inside it — which makes the max over the window
      -- the max over the whole run, at a bounded cost.
      CROSS JOIN LATERAL (
        SELECT max(d::date) AS session_date
          FROM generate_series(
                 GREATEST(
                   COALESCE(p.start_date, p.end_date - 6),
                   p.end_date - 6
                 )::timestamp,
                 p.end_date::timestamp,
                 interval '1 day'
               ) AS d
         -- Explicit rather than relying on generate_series answering nothing for
         -- a NULL bound: "an open-ended product never owes" is a decision and it
         -- should be readable as one.
         WHERE p.end_date IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.schedule_slots s
              WHERE s.product_id = p.id
                AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
           )
      ) AS final_occurrence

      LEFT JOIN LATERAL (
        SELECT COUNT(*)::integer AS owed_count
          FROM (
            -- Occurrences the schedule projects, floored at max(product start,
            -- epoch) and bounded above by "has actually finished".
            --
            -- The epoch floors THIS COUNT and nothing else. A pre-epoch session
            -- is fully recordable — a gedu may take its attendance and write it
            -- up — it simply never becomes work the platform asks for. That is
            -- why the write validator has no epoch floor of its own.
            SELECT d::date AS session_date
              FROM generate_series(
                     GREATEST(
                       COALESCE(p.start_date, (now() AT TIME ZONE p.timezone)::date - 365),
                       COALESCE(p_epoch_date, DATE '0001-01-01')
                     )::timestamp,
                     (now() AT TIME ZONE p.timezone)::date::timestamp,
                     interval '1 day'
                   ) AS d
             WHERE (p.end_date IS NULL OR d::date <= p.end_date)
               AND EXISTS (
                 SELECT 1
                   FROM public.schedule_slots s
                  WHERE s.product_id = p.id
                    AND s.weekday = (EXTRACT(ISODOW FROM d)::integer - 1)
                    AND ((d::date + s.start_time) AT TIME ZONE p.timezone)
                        + make_interval(mins => s.duration_minutes) <= now()
               )
            UNION
            -- Rows the schedule no longer projects still count: a session
            -- orphaned by a weekday move is history, and history that is
            -- missing marks is still owed.
            SELECT gs.session_date
              FROM public.group_sessions gs
             WHERE gs.group_id = g.id
               AND gs.ends_at <= now()
               AND gs.session_date >= COALESCE(p_epoch_date, DATE '0001-01-01')
               AND (p.start_date IS NULL OR gs.session_date >= p.start_date)
          ) AS occurrence
         WHERE roster.roster_size > 0
           -- "Needs attention" is FOUR questions joined by OR, and any one
           -- alone keeps the session on the list.
           --
           -- This derivation has a TWIN IN TYPESCRIPT — the gedu feed's
           -- entry-state module, which decides the same thing for the card
           -- from the feed document — and the two must agree, or the dashboard
           -- badge counts a session the card calls finished. Changing either
           -- half means changing both, in the same commit. That now includes
           -- the CREATIONS condition (4) below: the TS side derives it from the
           -- product's requires_gamer_creations flag, its own computation of the
           -- run's last occurrence, and the roster's creations lists — and it
           -- has to reach the same answer this does on all four.
           AND (
             -- (1) Some of the CURRENT roster has no answer yet. Measured
             -- against the current roster, never against the stored map's keys
             -- — which is why someone joining a long-running group reopens
             -- previously-complete sessions. That is the honest reading and it
             -- is chosen with eyes open.
             (
               SELECT COUNT(*)
                 FROM public.session_attendance att
                 JOIN public.group_sessions gs2 ON gs2.id = att.session_id
                 JOIN public.participations part2
                   ON part2.participant_id = att.participant_id
                  AND part2.group_id = g.id
                  AND part2.status   = 'active'::public.participation_status
                WHERE gs2.group_id     = g.id
                  AND gs2.session_date = occurrence.session_date
             ) < roster.roster_size
             -- (2) Nothing has been written for the families. NOT EXISTS rather
             -- than a LEFT JOIN's NULL test, so a date with no materialized row
             -- at all — the common case for a session nobody has touched — is
             -- the same answer as a row holding a blank report.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs3
                WHERE gs3.group_id     = g.id
                  AND gs3.session_date = occurrence.session_date
                  AND btrim(COALESCE(gs3.report, ''), E' \t\r\n\v\f') <> ''
             )
             -- (3) The families have not been told it is there (00197).
             -- Writing the report is half the job; a report nobody was mailed
             -- about is a report nobody reads, so a session stays owed until
             -- the send has been claimed.
             --
             -- NOT EXISTS again, for the same reason as (2): a date with no
             -- materialized row is the same answer as a row that was never
             -- mailed, and neither is a LEFT JOIN's three-valued NULL test.
             OR NOT EXISTS (
               SELECT 1
                 FROM public.group_sessions gs4
                WHERE gs4.group_id     = g.id
                  AND gs4.session_date = occurrence.session_date
                  AND gs4.report_emailed_at IS NOT NULL
             )
             -- (4) The FINAL session of a product that requires creations, with
             -- somebody on the current roster who has none (00227). Creations
             -- are part of the last session's work, so this fires on exactly one
             -- occurrence per run and only once that occurrence has finished —
             -- which is free, because every member of this set has finished.
             --
             -- Measured over the CURRENT roster, exactly as (1) is: leaving
             -- clears the debt and joining after the final session reopens it.
             -- An empty roster is already excluded by the roster_size guard
             -- above, so nothing here has to restate it.
             --
             -- The array-length test is defensive: the CHECK on the table
             -- refuses an empty array and the write RPC deletes the row instead
             -- of storing one, so "no row" is the only reachable empty. It costs
             -- nothing and it states what "has a creation" means.
             OR (
               p.requires_gamer_creations
               AND occurrence.session_date = final_occurrence.session_date
               AND EXISTS (
                 SELECT 1
                   FROM public.participations part3
                  WHERE part3.group_id = g.id
                    AND part3.status   = 'active'::public.participation_status
                    AND NOT EXISTS (
                      SELECT 1
                        FROM public.gamer_group_creations c
                       WHERE c.group_id       = g.id
                         AND c.participant_id = part3.participant_id
                         AND jsonb_array_length(c.creations) > 0
                    )
               )
             )
           )
      ) AS owed ON true

     WHERE a.gedu_id = v_uid
  ), '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_my_gedu_assignment_summaries(p_epoch_date date) IS 'One row per gedu assignment for the dashboard cards: group name, that group''s participant count (renamed from group_gamer_count in 00175 — an active seat may be held by an adult since 00173), the venue name on in-person products, and how many past sessions still need attention. A finished session on or after the epoch counts until ALL of: the register is in, a family-facing report is written, the mail telling the families it is there has been sent (00197), and — since 00227, on the run''s FINAL session of a product with requires_gamer_creations set — every current roster member has at least one creation. The final session is the last occurrence the schedule projects on or before end_date, derived here rather than stored; an open-ended product (end_date NULL) has none and therefore never owes creations, which is documented behaviour rather than an error. The badge''s unit is unchanged: it counts SESSIONS needing attention, and the final one simply has one more way to need it. The enforcement epoch travels in as an argument because it is a code constant, not a column. This count has a twin in TypeScript — the gedu feed''s entry-state derivation, which answers the same question for one card — and the two must be changed together, on all four conditions.';

REVOKE ALL ON FUNCTION public.get_my_gedu_assignment_summaries(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_gedu_assignment_summaries(date) TO service_role;

-- ---------------------------------------------------------------------------
-- 11. End state
-- ---------------------------------------------------------------------------
--
-- Hand-written and per-migration, in the 00203/00204 shape. Its job is the class
-- of failure that reads as an empty panel rather than as an error: a widened
-- body retyped with a section missing, a guard lost in the retyping, a grant not
-- restored by a drop-and-recreate. Every one of those is silent at apply time
-- and expensive to find later.

DO $assert$
DECLARE
  v_src  text;
  v_proc text;
  v_n    integer;
BEGIN
  -- --- (a) The flag. -------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.products'::regclass
       AND attname  = 'requires_gamer_creations'
       AND attnotnull
       AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'products.requires_gamer_creations is missing or nullable — the column is NOT NULL so that "unflagged" is a value and never an absence';
  END IF;

  IF EXISTS (SELECT 1 FROM public.products WHERE requires_gamer_creations IS NULL) THEN
    RAISE EXCEPTION 'products.requires_gamer_creations holds a NULL — impossible under the NOT NULL, so the column was added wrongly';
  END IF;

  -- Launch day is quiet: the flag defaults false, so flagging a product is the
  -- opt-in and no existing product owes anything.
  IF EXISTS (SELECT 1 FROM public.products WHERE requires_gamer_creations) THEN
    RAISE EXCEPTION 'a product is already flagged as requiring creations — this migration adds the column with DEFAULT false and backfills nothing';
  END IF;

  -- --- (b) The table's access story, asserted as an absence. ---------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'gamer_group_creations' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'gamer_group_creations does not exist or does not have RLS enabled';
  END IF;

  -- RLS on with NO policy is deny-all, which is the strongest posture available
  -- and the one that matches how the table is used. A policy appearing here
  -- would also force an EXECUTE grant on gedu_teaches_group_product, since a
  -- policy predicate is evaluated as the querying role — see (e).
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'gamer_group_creations'
  ) THEN
    RAISE EXCEPTION 'gamer_group_creations has an RLS policy — it is meant to have none at all, because every read and write goes through a SECURITY DEFINER function';
  END IF;

  IF has_table_privilege('authenticated', 'public.gamer_group_creations', 'SELECT')
     OR has_table_privilege('authenticated', 'public.gamer_group_creations', 'INSERT')
     OR has_table_privilege('authenticated', 'public.gamer_group_creations', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.gamer_group_creations', 'DELETE')
  THEN
    RAISE EXCEPTION 'authenticated holds a grant on gamer_group_creations — no client role may touch this table directly, and the missing WRITE grant is also what keeps it correctly off the write-IDOR loop';
  END IF;

  IF has_table_privilege('anon', 'public.gamer_group_creations', 'SELECT')
     OR has_table_privilege('anon', 'public.gamer_group_creations', 'INSERT')
     OR has_table_privilege('anon', 'public.gamer_group_creations', 'UPDATE')
     OR has_table_privilege('anon', 'public.gamer_group_creations', 'DELETE')
  THEN
    RAISE EXCEPTION 'anon holds a grant on gamer_group_creations';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.gamer_group_creations', 'SELECT') THEN
    RAISE EXCEPTION 'service_role cannot read gamer_group_creations — the DB suite asserts against it through the admin client';
  END IF;

  -- --- (c) The table's shape. ----------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.gamer_group_creations'::regclass
       AND conname  = 'chk_gamer_group_creations_shape'
       AND contype  = 'c'
  ) THEN
    RAISE EXCEPTION 'gamer_group_creations lost its shape CHECK — the write RPC leaves the entire shape, the caps and the blankness rules to it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.gamer_group_creations'::regclass
       AND c.contype  = 'p'
       AND (
         SELECT array_agg(att.attname::text ORDER BY att.attname::text)
           FROM pg_attribute att
          WHERE att.attrelid = c.conrelid
            AND att.attnum   = ANY (c.conkey)
       ) = ARRAY['group_id', 'participant_id']
  ) THEN
    RAISE EXCEPTION 'gamer_group_creations is not keyed on (group_id, participant_id) — the upsert and every LEFT JOIN in this file depend on that pair being unique';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid    = 'public.gamer_group_creations'::regclass
       AND contype     = 'f'
       AND confrelid   = 'public.product_groups'::regclass
       AND confdeltype = 'c'  -- CASCADE
  ) THEN
    RAISE EXCEPTION 'gamer_group_creations has no ON DELETE CASCADE foreign key to product_groups — deleting a group must take its creations with it';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid    = 'public.gamer_group_creations'::regclass
       AND c.contype     = 'f'
       AND c.confrelid   = 'public.profiles'::regclass
       AND c.confdeltype = 'n'  -- SET NULL
       AND (SELECT att.attname FROM pg_attribute att
             WHERE att.attrelid = c.conrelid AND att.attnum = c.conkey[1]) = 'updated_by'
  ) THEN
    RAISE EXCEPTION 'gamer_group_creations.updated_by is not ON DELETE SET NULL — a departed gedu''s account must not delete the work they recorded';
  END IF;

  -- The CHECK is the whole of the shape story, so it is exercised rather than
  -- merely looked up: a constraint that exists and admits garbage is worse than
  -- one that is missing, because it reads as coverage.
  BEGIN
    INSERT INTO public.gamer_group_creations (group_id, participant_id, creations)
    VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            '[{"title":"a","url":"b","kind":"roblox"}]'::jsonb);
    RAISE EXCEPTION 'gamer_group_creations accepted an element with an extra key';
  EXCEPTION
    WHEN check_violation THEN NULL;   -- what we want: the shape CHECK fired
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'gamer_group_creations reached its FK check with a malformed element — the shape CHECK did not fire on an extra key';
  END;

  BEGIN
    INSERT INTO public.gamer_group_creations (group_id, participant_id, creations)
    VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            '[]'::jsonb);
    RAISE EXCEPTION 'gamer_group_creations accepted an empty array — absence of a row is what "no creations" means, and both states must not exist';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'gamer_group_creations reached its FK check with an empty array — the shape CHECK did not fire';
  END;

  BEGIN
    INSERT INTO public.gamer_group_creations (group_id, participant_id, creations)
    VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            jsonb_build_array(jsonb_build_object('title', '   ', 'url', 'https://example.com')));
    RAISE EXCEPTION 'gamer_group_creations accepted a blank title';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'gamer_group_creations reached its FK check with a blank title — the shape CHECK did not fire';
  END;

  BEGIN
    INSERT INTO public.gamer_group_creations (group_id, participant_id, creations)
    VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            jsonb_build_array(jsonb_build_object('title', repeat('x', 201), 'url', 'https://example.com')));
    RAISE EXCEPTION 'gamer_group_creations accepted a 201-character title';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'gamer_group_creations reached its FK check with an over-long title — the shape CHECK did not fire';
  END;

  BEGIN
    INSERT INTO public.gamer_group_creations (group_id, participant_id, creations)
    VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            jsonb_build_array(jsonb_build_object('title', 't', 'url', repeat('x', 2001))));
    RAISE EXCEPTION 'gamer_group_creations accepted a 2001-character url';
  EXCEPTION
    WHEN check_violation THEN NULL;
    WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'gamer_group_creations reached its FK check with an over-long url — the shape CHECK did not fire';
  END;

  -- ...and the good shape has to get through, or the CHECK is refusing the
  -- feature rather than protecting it. The FK is what stops this one, which is
  -- exactly the signal wanted: the shape CHECK passed and the row was refused
  -- for a reason this block has no fixtures for.
  BEGIN
    INSERT INTO public.gamer_group_creations (group_id, participant_id, creations)
    VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            jsonb_build_array(jsonb_build_object('title', repeat('x', 200), 'url', repeat('x', 2000))));
    RAISE EXCEPTION 'gamer_group_creations accepted a row against a group that does not exist — the FK is missing';
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION 'gamer_group_creations refused a well-formed 200/2000-character entry — the caps are off by one';
    WHEN foreign_key_violation THEN NULL;
  END;

  -- --- (d) The write RPC: guard-first, and exposed to exactly one role. -----
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr
    JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'set_gamer_group_creations';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'set_gamer_group_creations was not created';
  END IF;

  IF position('PERFORM public.assert_role(' IN v_src) = 0 THEN
    RAISE EXCEPTION 'set_gamer_group_creations does not guard on assert_role';
  END IF;

  IF position('gedu_teaches_group_product' IN v_src) = 0 THEN
    RAISE EXCEPTION 'set_gamer_group_creations does not compose gedu_teaches_group_product — the role guard alone admits every gedu on the platform';
  END IF;

  IF position('PERFORM public.assert_role(' IN v_src)
     > position('gedu_teaches_group_product' IN v_src) THEN
    RAISE EXCEPTION 'set_gamer_group_creations checks ownership before its role guard — the guard must be the first statement';
  END IF;

  IF position('public.participations part' IN v_src) = 0 THEN
    RAISE EXCEPTION 'set_gamer_group_creations lost its TARGET check — without it an authorized gedu can file creations against any profile on the platform, and that check is what stands in for a write-IDOR entry';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public' AND pr.proname = 'set_gamer_group_creations' AND pr.proisstrict
  ) THEN
    RAISE EXCEPTION 'set_gamer_group_creations is STRICT — its guard would be skipped on NULL input';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.set_gamer_group_creations(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot EXECUTE set_gamer_group_creations';
  END IF;

  IF has_function_privilege('anon', 'public.set_gamer_group_creations(uuid, uuid, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can EXECUTE set_gamer_group_creations — the REVOKE FROM PUBLIC did not take';
  END IF;

  -- --- (e) The predicate stays private. ------------------------------------
  IF has_function_privilege('authenticated', 'public.gedu_teaches_group_product(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.gedu_teaches_group_product(uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'gedu_teaches_group_product is executable by a client role — it is called only from inside SECURITY DEFINER RPCs, and exposing it would demand an authorization-spine entry';
  END IF;

  -- --- (f) The product writers took the flag and kept everything else. ------
  FOREACH v_proc IN ARRAY ARRAY['create_product', 'update_product'] LOOP
    SELECT pr.prosrc INTO v_src
      FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public' AND pr.proname = v_proc;

    IF v_src IS NULL THEN
      RAISE EXCEPTION '% was not recreated', v_proc;
    END IF;

    IF position('PERFORM public.assert_admin()' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost its assert_admin guard', v_proc;
    END IF;

    IF position('requires_gamer_creations' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not write requires_gamer_creations — update_product assigns every editable column on every call, so a column it does not name is cleared by the next admin edit', v_proc;
    END IF;

    IF position('set_product_required_consents' IN v_src) = 0
       OR position('product_translations' IN v_src) = 0
       OR position('schedule_slots' IN v_src) = 0
       OR position('product_prices' IN v_src) = 0
       OR position('product_holiday_calendars' IN v_src) = 0
       OR position('product_staff_details' IN v_src) = 0 THEN
      RAISE EXCEPTION '% lost a section while being retyped', v_proc;
    END IF;
  END LOOP;

  -- A leftover overload would break PostgREST's candidate resolution silently.
  SELECT count(*) INTO v_n
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname IN ('create_product', 'update_product');

  IF v_n <> 2 THEN
    RAISE EXCEPTION 'there are % create_product/update_product overloads, expected exactly 2 — the DROP did not take and PostgREST cannot resolve a candidate', v_n;
  END IF;

  -- v_src still holds update_product's source: it is the last name the loop
  -- above read.
  IF position('waitlisted' IN v_src) = 0
     OR position('family_subscriptions' IN v_src) = 0 THEN
    RAISE EXCEPTION 'update_product lost its waitlist teardown or the live-subscription carve-out inside it';
  END IF;

  -- --- (g) The four widened readers. ---------------------------------------
  --
  -- Each carries the join, the emitted key, its own guard and its own sections.
  -- A lost guard or a lost section reads as an empty panel rather than as an
  -- error, which is the whole reason these assertions exist.
  FOREACH v_proc IN ARRAY ARRAY[
    'get_group_staff_overlay',
    'get_gedu_group_feed',
    'get_gedu_assigned_product',
    'get_my_family_product_feed'
  ] LOOP
    SELECT pr.prosrc INTO v_src
      FROM pg_proc pr
      JOIN pg_namespace n ON n.oid = pr.pronamespace
     WHERE n.nspname = 'public' AND pr.proname = v_proc;

    IF position('gamer_group_creations' IN v_src) = 0 THEN
      RAISE EXCEPTION '% does not read gamer_group_creations', v_proc;
    END IF;

    IF position('''creations''' IN v_src) = 0 THEN
      RAISE EXCEPTION '% reads gamer_group_creations but emits no creations key', v_proc;
    END IF;
  END LOOP;

  -- The overlay.
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_group_staff_overlay';

  IF position('PERFORM public.assert_role(' IN v_src) = 0
     OR position('gedu_teaches_group_product' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_group_staff_overlay lost its guard or its ownership check';
  END IF;

  IF position('group_joined_at' IN v_src) = 0
     OR position('note_updated_by_first_name' IN v_src) = 0
     OR position('product_type' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_group_staff_overlay lost a section while being retyped';
  END IF;

  -- The group feed: roster key AND the flag on the shell, because the client
  -- derives owed-ness from both and one without the other is silent.
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_gedu_group_feed';

  IF position('PERFORM public.assert_role(' IN v_src) = 0
     OR position('gedu_teaches_group(p_group_id)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost its guard or its own-group check';
  END IF;

  IF position('''requires_gamer_creations'', p.requires_gamer_creations' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed does not emit requires_gamer_creations on the product shell — the client cannot ask whether the final session owes creations without it';
  END IF;

  IF position('material_url' IN v_src) = 0
     OR position('attendance' IN v_src) = 0
     OR position('report_emailed_at' IN v_src) = 0
     OR position('images' IN v_src) = 0
     OR position('note_updated_by_first_name' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_group_feed lost a section while being retyped';
  END IF;

  -- The assigned-product document, in parity with it.
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_gedu_assigned_product';

  IF position('PERFORM public.assert_role(''gedu'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product lost its assert_role(''gedu'') guard';
  END IF;

  IF position('''requires_gamer_creations'', p.requires_gamer_creations' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product does not emit requires_gamer_creations — its shell is in deliberate parity with get_gedu_group_feed''s';
  END IF;

  IF position('my_group_id' IN v_src) = 0
     OR position('participant_count' IN v_src) = 0
     OR position('schedule_slots' IN v_src) = 0
     OR position('note_updated_by_first_name' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_gedu_assigned_product lost a section while being retyped';
  END IF;

  -- The family document: the creations array is TOP-LEVEL, and nothing
  -- staff-only crept in beside it.
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_my_family_product_feed';

  IF position('''creations'',   v_creations' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed does not return creations at the TOP LEVEL — a map keyed by participant is exactly the shape this document must not have';
  END IF;

  -- The staff-only tables must not be reachable from this body at all, asserted
  -- on their SCHEMA-QUALIFIED names. Two deliberate choices in that sentence.
  -- Tables rather than columns: this body's comments name several staff-only
  -- columns precisely in order to say they are absent, so a column-name search
  -- would fire on the very prose that documents the rule. And qualified rather
  -- than bare: this function sets `search_path TO ''`, so a real reference can
  -- only ever be spelled `public.x`, while the prose above says `x` — which is
  -- what makes the distinction load-bearing rather than cosmetic.
  IF position('public.gamer_group_notes' IN v_src) <> 0
     OR position('public.product_staff_details' IN v_src) <> 0
     OR position('public.site_staff_details' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed reads a staff-only table — its absence from this body IS the enforcement, and no filter downstream substitutes for it';
  END IF;

  IF position('is_parent_of' IN v_src) = 0
     OR position('no_data_found' IN v_src) = 0
     OR position('images' IN v_src) = 0
     OR position('session_attendance' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_family_product_feed lost a section while being retyped';
  END IF;

  -- --- (h) The summaries RPC's fourth condition. ---------------------------
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_my_gedu_assignment_summaries';

  IF position('PERFORM public.assert_role(''gedu'')' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost its assert_role(''gedu'') guard';
  END IF;

  IF position('requires_gamer_creations' IN v_src) = 0
     OR position('gamer_group_creations' IN v_src) = 0
     OR position('final_occurrence' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries did not take the final-session creations condition';
  END IF;

  -- The three original conditions have to survive beside the fourth: the count
  -- is an OR, so a lost condition silently lowers every badge on the dashboard.
  IF position('session_attendance' IN v_src) = 0
     OR position('report_emailed_at' IN v_src) = 0
     OR position('btrim(COALESCE(gs3.report' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost one of its first three attention conditions';
  END IF;

  IF position('roster.roster_size > 0' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost its empty-roster guard — an empty roster owes nothing, creations included';
  END IF;

  -- The lockstep note is load-bearing: the TypeScript twin has to be changed in
  -- the same commit, and this file has just added a fourth thing they must
  -- agree on.
  IF position('TWIN IN TYPESCRIPT' IN v_src) = 0 THEN
    RAISE EXCEPTION 'get_my_gedu_assignment_summaries lost its TypeScript-twin comment — the comment is what tells the next editor the client derivation must change with it';
  END IF;

  -- --- (i) Every recreated function kept its grants and none gained anon. ---
  FOREACH v_proc IN ARRAY ARRAY[
    'public.get_gedu_assigned_product(uuid)',
    'public.get_gedu_group_feed(uuid)',
    'public.get_my_family_product_feed(uuid)',
    'public.get_my_gedu_assignment_summaries(date)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE')
    THEN
      RAISE EXCEPTION '% lost an EXECUTE grant during recreation', v_proc;
    END IF;

    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon — the REVOKE FROM PUBLIC did not take', v_proc;
    END IF;
  END LOOP;

  -- The overlay is authenticated-only by design: nothing server-side reads a
  -- document whose whole meaning is "what may THIS staff member see".
  IF NOT has_function_privilege('authenticated', 'public.get_group_staff_overlay(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_group_staff_overlay(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_group_staff_overlay is granted wrongly — authenticated only, never anon';
  END IF;

  FOREACH v_proc IN ARRAY ARRAY[
    'public.create_product(public.product_type, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, public.product_status, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean)',
    'public.update_product(uuid, public.billing_mode, jsonb, public.product_topic, public.spoken_language, boolean, text, timestamp with time zone, boolean, boolean, integer, integer, boolean, boolean, uuid, integer, date, date, integer, jsonb, jsonb, uuid[], integer, integer, integer, text, public.product_tag, text, text[], boolean)'
  ] LOOP
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE')
    THEN
      RAISE EXCEPTION '% lost an EXECUTE grant during the drop-and-recreate', v_proc;
    END IF;

    IF has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon — a recreated function comes back PUBLIC-executable and the REVOKE did not take', v_proc;
    END IF;
  END LOOP;

  -- --- (j) The admin three-arm document is deliberately NOT widened. --------
  --
  -- Stated as an assertion so that adding the join there later is a decision
  -- somebody makes rather than a tidy-up somebody performs: that document feeds
  -- no note button and no roster drawing either mark, and its note fields ride
  -- purely for shape parity across its three arms.
  SELECT pr.prosrc INTO v_src
    FROM pg_proc pr JOIN pg_namespace n ON n.oid = pr.pronamespace
   WHERE n.nspname = 'public' AND pr.proname = 'get_product_groups_with_details';

  IF position('gamer_group_creations' IN v_src) <> 0 THEN
    RAISE EXCEPTION 'get_product_groups_with_details reads gamer_group_creations — it is deliberately NOT widened, and widening one of its three arms would break the shape parity that is the only reason it carries the note fields at all';
  END IF;
END
$assert$;
