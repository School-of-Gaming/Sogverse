-- Names are stored trimmed, places never loop, and the waitlist promotion
-- leaves the group check to the trigger that already makes it.
--
-- * profiles.first_name and last_name are stored trimmed of whitespace of
--   every kind at both edges — [[:space:]] plus U+00A0, U+200B and U+FEFF,
--   named outright because the class does not cover the last two in our
--   collation and its coverage of the first depends on the collation. A first
--   name is two to 32 characters with at least one that is not whitespace, a
--   last name at most 32. btrim() would not do: it strips spaces only. A
--   person can update their own names straight through the Data API (column
--   grants plus users_update_own_profile), so this has to be the database's
--   rule rather than the forms'. The new-user trigger, create_gamer and
--   register_gedu trim the same class from what they are handed before writing
--   it; every route trims too, and the
--   forms say why a name is refused before the CHECK has to. Staging and
--   production held no row that breaks either rule; the UPDATEs below repair
--   any other database before the constraints go on.
-- * A place can never sit under its own descendant. trg_locations_refuse_loop
--   walks up from the new parent and refuses a write that would reach the row
--   itself; locations_no_self_parent stays as the one-step case. Every reader
--   that climbs the tree does it through location_lineage, which walks to the
--   root with no depth bound, because the trigger leaves no loop to bound:
--   gedu_covers_product_site, search_locations,
--   get_admin_municipality_invoicing and gedu_invoicing_document.
-- * promote_from_waitlist no longer re-checks that the target group belongs to
--   the seat's product. trg_validate_participations_group refuses that on the
--   promotion's own UPDATE. admin_move_participation keeps its check: the
--   switch route recognises its message after Stripe has already moved.
--
-- ACCESS
--
-- location_lineage is granted to anon, authenticated and service_role:
-- search_locations runs as its caller, anonymous ones included, and calls it,
-- and an admin's write to locations runs the loop trigger as that admin. It
-- reads only locations, which every role may read in full. The trigger
-- function is granted to nobody, like set_location_depth. Every other function
-- is replaced in place with its signature unchanged, so its grants and comment
-- stand.

-- ---------------------------------------------------------------------------
-- 1. Names are stored trimmed
-- ---------------------------------------------------------------------------

-- Not expected to touch a row on staging or production, which held none.
UPDATE public.profiles
   SET first_name = regexp_replace(first_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g')
 WHERE first_name ~ '^[[:space:]\u00A0\u200B\uFEFF]|[[:space:]\u00A0\u200B\uFEFF]$';

UPDATE public.profiles
   SET last_name = regexp_replace(last_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g')
 WHERE last_name ~ '^[[:space:]\u00A0\u200B\uFEFF]|[[:space:]\u00A0\u200B\uFEFF]$';

ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_first_name_len,
  DROP CONSTRAINT profiles_last_name_len,
  ADD CONSTRAINT profiles_first_name_shape
    CHECK (char_length(first_name) BETWEEN 2 AND 32
           AND first_name !~ '^[[:space:]\u00A0\u200B\uFEFF]|[[:space:]\u00A0\u200B\uFEFF]$'
           AND first_name ~ '[^[:space:]\u00A0\u200B\uFEFF]'),
  ADD CONSTRAINT profiles_last_name_shape
    CHECK (char_length(last_name) <= 32
           AND last_name !~ '^[[:space:]\u00A0\u200B\uFEFF]|[[:space:]\u00A0\u200B\uFEFF]$');

COMMENT ON CONSTRAINT profiles_first_name_shape ON public.profiles IS 'A first name is 2 to 32 characters long, neither begins nor ends with whitespace — any character of the [[:space:]] class, or U+00A0, U+200B or U+FEFF — and holds at least one character that is none of those. Held here rather than only in the forms because a person may update their own first_name straight through the Data API. Every reader may therefore use it as it is: it is never empty, never blank and never padded.';

COMMENT ON CONSTRAINT profiles_last_name_shape ON public.profiles IS 'A last name is at most 32 characters long and neither begins nor ends with whitespace — any character of the [[:space:]] class, or U+00A0, U+200B or U+FEFF. It may be empty: a gamer inherits the parent''s, and older parent accounts predate the requirement the registration forms now make.';

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  profile_first_name   TEXT;
  profile_last_name    TEXT;
  utm_source_raw       TEXT;
  utm_medium_raw       TEXT;
  utm_campaign_raw     TEXT;
  utm_content_raw      TEXT;
  utm_term_raw         TEXT;
  utm_source_value     TEXT;
  utm_medium_value     TEXT;
  utm_campaign_value   TEXT;
  utm_content_value    TEXT;
  utm_term_value       TEXT;
  registration_value   TIMESTAMPTZ;
BEGIN
  -- Both names trimmed of whitespace of every kind first, because the
  -- profiles CHECKs refuse it at either edge. A first name of nothing but
  -- whitespace is then '' and takes the stand-in like an absent one.
  profile_first_name := COALESCE(
    NULLIF(regexp_replace(NEW.raw_user_meta_data->>'first_name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'), ''),
    'New User'
  );

  profile_last_name := COALESCE(
    regexp_replace(NEW.raw_user_meta_data->>'last_name', '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
    ''
  );

  -- Sanitise here, in the body, rather than letting the CHECKs decide: a
  -- malformed value must cost this family nothing at all, so it degrades to
  -- NULL and the signup succeeds. Trim first, then test the trimmed value —
  -- and store the trimmed value, so what the CHECK sees is what was tested.
  -- An absent key arrives NULL, `btrim(NULL)` is NULL, and every comparison
  -- below is then NULL, so the CASE falls through to ELSE without a special
  -- case for it.
  utm_source_raw   := NEW.raw_user_meta_data->>'utm_source';
  utm_medium_raw   := NEW.raw_user_meta_data->>'utm_medium';
  utm_campaign_raw := NEW.raw_user_meta_data->>'utm_campaign';
  utm_content_raw  := NEW.raw_user_meta_data->>'utm_content';
  utm_term_raw     := NEW.raw_user_meta_data->>'utm_term';

  utm_source_value := CASE
    WHEN btrim(utm_source_raw) <> ''
     AND char_length(btrim(utm_source_raw)) <= 200
     AND utm_source_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_source_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_source_raw)
    ELSE NULL
  END;

  utm_medium_value := CASE
    WHEN btrim(utm_medium_raw) <> ''
     AND char_length(btrim(utm_medium_raw)) <= 200
     AND utm_medium_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_medium_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_medium_raw)
    ELSE NULL
  END;

  utm_campaign_value := CASE
    WHEN btrim(utm_campaign_raw) <> ''
     AND char_length(btrim(utm_campaign_raw)) <= 200
     AND utm_campaign_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_campaign_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_campaign_raw)
    ELSE NULL
  END;

  utm_content_value := CASE
    WHEN btrim(utm_content_raw) <> ''
     AND char_length(btrim(utm_content_raw)) <= 200
     AND utm_content_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_content_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_content_raw)
    ELSE NULL
  END;

  utm_term_value := CASE
    WHEN btrim(utm_term_raw) <> ''
     AND char_length(btrim(utm_term_raw)) <= 200
     AND utm_term_raw !~ '[[:cntrl:]]'
     AND left(btrim(utm_term_raw), 1) NOT IN ('=', '+', '-', '@', chr(9), chr(13))
      THEN btrim(utm_term_raw)
    ELSE NULL
  END;

  -- A password account arrives whole: every route that creates one supplies
  -- the name, the terms acceptance and the consents in the same request, so it
  -- is registered the moment it exists. Any other provider (Google) arrives
  -- with none of that, and stays unregistered until a completion route has it.
  -- The provider is read from app metadata, which only the auth server writes;
  -- user metadata is the caller's and could claim anything.
  registration_value := CASE
    WHEN NEW.raw_app_meta_data->>'provider' = 'email' THEN now()
    ELSE NULL
  END;

  INSERT INTO public.profiles (
    id, email, role, first_name, last_name,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    registration_completed_at
  )
  VALUES (
    NEW.id, NEW.email, 'customer', profile_first_name, profile_last_name,
    utm_source_value, utm_medium_value, utm_campaign_value,
    utm_content_value, utm_term_value,
    registration_value
  );

  INSERT INTO public.customer_profiles (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_gamer(p_gamer_id uuid, p_parent_id uuid, p_first_name text, p_last_name text, p_birth_year smallint, p_birth_month smallint, p_gender public.gender_type DEFAULT NULL::public.gender_type, p_sign_in public.gamer_sign_in DEFAULT 'parent'::public.gamer_sign_in, p_guardian_attested boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_declaration_version text;
begin
  -- The PIN invariant, first and before anything is written: a gamer must never
  -- exist in a family that has no parent PIN, because the gate on leaving a
  -- gamer session IS that PIN, and a family without one would leave the gate
  -- with nothing behind it. Named SQLSTATE, because this is the one failure in
  -- this body the parent can actually act on — the route turns P0025 into "set
  -- a PIN first" rather than into the generic failure the raises below get.
  if not exists (
    select 1 from public.customer_profiles
     where user_id = p_parent_id
       and pin_hash is not null
  ) then
    raise exception 'PIN_REQUIRED' using errcode = 'P0025';
  end if;

  -- The declaration, refused before anything is written and refused on NULL as
  -- well as on false: a three-valued answer to "are you this child's parent or
  -- guardian" is not an answer. There is no route by which a parent reaches
  -- this with the box unticked — the form disables the button and the body
  -- schema refuses anything but true — so this is the database's own guarantee
  -- rather than the user-facing check, and a plain raise is the right shape:
  -- nothing the parent can act on reaches them through it.
  if p_guardian_attested is not true then
    raise exception
      'a gamer may only be created with the guardian declaration attested';
  end if;

  -- Promote the trigger-seeded customer profile to a gamer. Gate on role =
  -- 'customer' so this can't corrupt an already-promoted gamer or an admin/gedu,
  -- and so a double-call fails on the second pass. Keep the synthetic email
  -- handle_new_user() copied from auth.users — gamers are email-first.
  --
  -- The child starts in the parent's locale: the parent is the one setting the
  -- account up, so the welcome mail and the child's first sign-in read the way
  -- the parent uses the site. Copied once, never synced; the child's to change.
  -- The names are trimmed of whitespace of every kind, which the profiles
  -- CHECKs refuse at either edge.
  update public.profiles
  set role = 'gamer',
      first_name = regexp_replace(p_first_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
      last_name = regexp_replace(p_last_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
      locale = (select parent.locale from public.profiles parent where parent.id = p_parent_id)
  where id = p_gamer_id
    and role = 'customer';

  if not found then
    raise exception 'No promotable customer profile % found for gamer creation', p_gamer_id;
  end if;

  -- Swap extension tables: drop the customer row handle_new_user() created,
  -- add the gamer row.
  delete from public.customer_profiles where user_id = p_gamer_id;

  -- `sign_in` rides along rather than being written afterwards: the route has
  -- already created the auth user with whichever address the chosen mode calls
  -- for, so the mode and the address it describes land in one transaction.
  insert into public.gamer_profiles (user_id, birth_year, birth_month, gender, sign_in)
  values (p_gamer_id, p_birth_year, p_birth_month, p_gender, p_sign_in);

  -- The declaration, against the wording that is current right now. It has to
  -- follow the gamer_profiles insert above, because that is what the row's
  -- foreign key points at. A slug with no published version is a broken deploy
  -- rather than a runtime condition, and it is named rather than left to the
  -- NOT NULL to abort with a message mentioning no document.
  select cdv.version
    into v_declaration_version
    from public.consent_document_versions cdv
   where cdv.document_slug = 'guardian-declaration'
   order by cdv.created_at desc, cdv.version desc
   limit 1;

  if v_declaration_version is null then
    raise exception 'no published version exists for guardian-declaration';
  end if;

  insert into public.gamer_consent_acceptances (
    gamer_id, document_slug, document_version, accepted_by
  )
  values (
    p_gamer_id, 'guardian-declaration', v_declaration_version, p_parent_id
  );

  -- Link to the parent. The validate_parent_gamer_on_insert trigger re-checks
  -- both roles, so this must run after the promote above.
  insert into public.parent_gamer (parent_id, gamer_id)
  values (p_parent_id, p_gamer_id);
end;
$$;

CREATE OR REPLACE FUNCTION public.register_gedu(p_user_id uuid, p_first_name text, p_last_name text, p_locale text, p_phone text, p_spoken_languages public.spoken_language[], p_location_ids uuid[], p_minecraft_username text, p_minecraft_uuid text, p_roblox_username text, p_roblox_user_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Only operate on a freshly-created customer profile (the role the new-user
  -- trigger seeds). Refusing anything else stops this from being used to mutate
  -- an established account of any role.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'customer'
  ) THEN
    RAISE EXCEPTION 'register_gedu: % is not a newly-created customer profile', p_user_id;
  END IF;

  -- Callers pass '' for absent optional text (the generated RPC arg types are
  -- non-null `string`); NULLIF turns those back into SQL NULL so e.g. an empty
  -- phone stays NULL rather than tripping the profiles.phone format CHECK.
  -- The names are trimmed of whitespace of every kind, which the profiles
  -- CHECKs refuse at either edge.
  UPDATE public.profiles
  SET role             = 'gedu',
      first_name       = regexp_replace(p_first_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
      last_name        = regexp_replace(p_last_name, '^[[:space:]\u00A0\u200B\uFEFF]+|[[:space:]\u00A0\u200B\uFEFF]+$', '', 'g'),
      locale           = NULLIF(p_locale, ''),
      phone            = NULLIF(p_phone, ''),
      spoken_languages = COALESCE(p_spoken_languages, '{}'),
      -- A password account arrives stamped by handle_new_user; a Google one
      -- arrives owing, and is registered the moment this promotion commits.
      -- COALESCE keeps an existing stamp's original moment.
      registration_completed_at = COALESCE(registration_completed_at, now())
  WHERE id = p_user_id;

  -- Swap the trigger-created customer extension row for a gedu one.
  DELETE FROM public.customer_profiles WHERE user_id = p_user_id;
  INSERT INTO public.gedu_profiles (user_id) VALUES (p_user_id);

  -- Coverage areas (empty = remote-only, which is valid).
  IF p_location_ids IS NOT NULL AND array_length(p_location_ids, 1) IS NOT NULL THEN
    INSERT INTO public.gedu_locations (gedu_id, location_id)
    SELECT p_user_id, unnest(p_location_ids);
  END IF;

  -- Optional Minecraft account. A duplicate uuid is allowed (an educator may
  -- share an account with someone else on the platform), so this insert has no
  -- rejection path of its own.
  IF p_minecraft_username IS NOT NULL AND p_minecraft_username <> '' THEN
    INSERT INTO public.minecraft_accounts (user_id, minecraft_username, minecraft_uuid)
    VALUES (p_user_id, p_minecraft_username, NULLIF(p_minecraft_uuid, ''));
  END IF;

  -- Optional Roblox account, on the same terms. The account id arrives as text
  -- carrying the same '' sentinel and is cast once here; a non-numeric value
  -- would raise, which is correct — the only caller resolves it from Roblox's
  -- own answer, so anything else is a bug rather than a user's typo.
  IF p_roblox_username IS NOT NULL AND p_roblox_username <> '' THEN
    INSERT INTO public.roblox_accounts (user_id, roblox_username, roblox_user_id)
    VALUES (p_user_id, p_roblox_username, NULLIF(p_roblox_user_id, '')::bigint);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Places never loop
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.location_lineage(p_location_id uuid)
    RETURNS TABLE (location_id uuid, distance integer)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_id     uuid := p_location_id;
  v_parent uuid;
BEGIN
  distance := 0;
  WHILE v_id IS NOT NULL LOOP
    SELECT l.parent_id INTO v_parent
      FROM public.locations l
     WHERE l.id = v_id;

    -- Only the starting id can name no row: every parent_id is held to an
    -- existing row by its foreign key.
    IF NOT FOUND THEN
      RETURN;
    END IF;

    location_id := v_id;
    RETURN NEXT;

    distance := distance + 1;
    v_id := v_parent;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.location_lineage(p_location_id uuid) IS 'A place and every place above it, as (location_id, distance): the place itself at distance 0, its parent at 1, up to the country. Empty for NULL or an id no place has. The one way any reader climbs the location tree, and it climbs through retired rows, which still sit where they sat. Walks to the root with no depth bound and no loop check: trg_locations_refuse_loop keeps a loop from ever being written, so every climb ends at a country. SECURITY INVOKER over locations, which anon and authenticated read in full; granted to both because search_locations runs as its caller and calls it, and because an admin''s write to locations runs the loop trigger, which calls it, as that admin.';

REVOKE ALL ON FUNCTION public.location_lineage(p_location_id uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.location_lineage(p_location_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.location_lineage(p_location_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.location_lineage(p_location_id uuid) TO service_role;

CREATE FUNCTION public.refuse_location_loop() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- One writer of parentage at a time. Two re-parents that close a loop only
  -- together would otherwise each walk a tree the other has not committed
  -- yet, and both pass. Re-parenting is rare (an admin moving a site, a
  -- reference-data refresh), so serialising it costs nothing anyone waits on.
  PERFORM pg_advisory_xact_lock(hashtext('public.locations.parent_id'));

  IF EXISTS (
    SELECT 1
      FROM public.location_lineage(NEW.parent_id) AS lin
     WHERE lin.location_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'location % cannot move under %, which sits under it', NEW.id, NEW.parent_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_location_loop() FROM PUBLIC;

COMMENT ON FUNCTION public.refuse_location_loop() IS 'Trigger body of trg_locations_refuse_loop: refuses, with check_violation, a parent_id whose lineage reaches the row being written, so the location tree never holds a loop. Serialises every write of parentage on a transaction-scoped advisory lock first, so two writes that would close a loop only together cannot both pass.';

CREATE TRIGGER trg_locations_refuse_loop
  BEFORE INSERT OR UPDATE OF parent_id ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.refuse_location_loop();

COMMENT ON TRIGGER trg_locations_refuse_loop ON public.locations IS 'Keeps the location tree free of loops: a place may not be put under itself or under anything below it. locations_no_self_parent is the one-step case of the same rule; this is every other length. The readers rely on it: location_lineage climbs with no loop check because this leaves no loop to meet.';

CREATE OR REPLACE FUNCTION public.gedu_covers_product_site(p_gedu_id uuid, p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  WITH
  product AS (
    SELECT p.is_remote, p.location_id
      FROM public.products p
     WHERE p.id = p_product_id
  ),
  -- The site and every place above it. A tick is an "I cover this subtree"
  -- claim, so a tick on any of these covers the site.
  lineage AS (
    SELECT lin.location_id AS id
      FROM product
     CROSS JOIN LATERAL public.location_lineage(product.location_id) AS lin
  )
  SELECT EXISTS (SELECT 1 FROM product WHERE product.is_remote)
      OR EXISTS (
           SELECT 1
             FROM lineage
             JOIN public.gedu_locations gl ON gl.location_id = lineage.id
            WHERE gl.gedu_id = p_gedu_id
         );
$$;

CREATE OR REPLACE FUNCTION public.search_locations(p_query text, p_types public.location_type[] DEFAULT NULL::public.location_type[], p_limit integer DEFAULT 20, p_country text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
WITH
probe AS (
  SELECT
    folded.needle,
    -- LIKE metacharacters in the needle are escaped, not stripped: a user typing
    -- "%" should find nothing rather than everything. Both arms build their
    -- patterns from this one value.
    replace(replace(replace(folded.needle, '\', '\\'), '%', '\%'), '_', '\_') AS pattern,
    char_length(folded.needle) >= 2 AS runnable,
    -- The cap is the server's, not the caller's. Clamped rather than rejected so
    -- an out-of-range limit degrades to a sane page instead of an error.
    least(greatest(coalesce(p_limit, 20), 1), 50) AS cap
  FROM (
    SELECT lower(public.immutable_unaccent(btrim(coalesce(p_query, '')))) AS needle
  ) AS folded
),
matched AS (
  -- One row per matching place, at its best rank across both arms. A place found
  -- by name AND by postal code is one hit, not two, and it keeps the better of
  -- the two ranks — which is what `DISTINCT ON (id) ORDER BY id, match_rank`
  -- expresses.
  SELECT DISTINCT ON (h.id)
         h.id, h.name, h.name_i18n, h.type, h.parent_id, h.country_code,
         h.external_code,
         -- Carried for the ordering below only; not part of the wire shape.
         h.depth,
         h.match_rank
    FROM (
      -- ARM 1 — the stored fold: canonical name, name_i18n alternates, official
      -- code.
      SELECT
        l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code,
        l.external_code, l.depth,
        CASE
          -- A term IS the needle.
          WHEN l.search_blob LIKE (SELECT '%' || public.location_search_separator() || pattern || public.location_search_separator() || '%' FROM probe) THEN 0
          -- A term STARTS WITH the needle. A prefix hit found late in the scan
          -- therefore still outranks an infix hit found early, which is the whole
          -- point of ranking rather than filtering.
          WHEN l.search_blob LIKE (SELECT '%' || public.location_search_separator() || pattern || '%' FROM probe) THEN 1
          ELSE 2
        END AS match_rank
      FROM public.locations l
      -- Scalar subqueries rather than a join to `probe`: each becomes an InitPlan
      -- evaluated once, which is what lets the planner treat the pattern as a
      -- runtime constant and consider the trigram index.
      WHERE (SELECT runnable FROM probe)
        AND l.search_blob LIKE (SELECT '%' || pattern || '%' FROM probe)
        AND (p_types IS NULL OR l.type = ANY (p_types))
        -- Both filters live here rather than in `page`, so the total the panel
        -- reports counts only rows it could actually offer.
        AND l.retired_at IS NULL
        AND (p_country IS NULL OR l.country_code = p_country)

      UNION ALL

      -- ARM 2 — postal codes, joined back to the municipality they reach. The
      -- hit is the place, never the code: the code carries no name, no parent and
      -- nothing anyone browses.
      SELECT
        l.id, l.name, l.name_i18n, l.type, l.parent_id, l.country_code,
        l.external_code, l.depth,
        -- The needle IS a whole code, or it is a prefix of one. Nothing else —
        -- an infix arm on a five-digit code is noise, not a search.
        --
        -- Equality takes the unescaped needle because `=` interprets no
        -- metacharacters; the prefix takes the escaped pattern for the same
        -- reason arm 1 does.
        CASE
          WHEN pc.postal_code = (SELECT needle FROM probe) THEN 0
          ELSE 1
        END AS match_rank
      FROM public.postal_codes pc
      JOIN public.locations l ON l.id = pc.location_id
      WHERE (SELECT runnable FROM probe)
        AND pc.postal_code LIKE (SELECT pattern || '%' FROM probe)
        -- Every filter arm 1 applies, applied to the joined row rather than
        -- assumed from the fact that postal rows point at municipalities.
        AND (p_types IS NULL OR l.type = ANY (p_types))
        AND l.retired_at IS NULL
        AND (p_country IS NULL OR l.country_code = p_country)
    ) AS h
   ORDER BY h.id, h.match_rank
),
page AS (
  SELECT m.*
    FROM matched m
   -- A total order, so the page is stable: rank, then venues after places, then
   -- broadest level first, then name, then id to break the homonym ties France
   -- is full of.
   --
   -- Breadth is the stored `depth`, which is true for any hierarchy shape. Sites
   -- are pushed below places by their own term ahead of depth, because depth
   -- cannot separate them: a Finnish site and a French commune are both at
   -- depth 3.
   ORDER BY m.match_rank, (m.type = 'site'), m.depth, m.name, m.id
   LIMIT (SELECT cap FROM probe)
),
-- The chain of every hit on this page: its lineage without the hit itself,
-- at most `cap` lineages of a handful of levels each.
--
-- Deliberately unfiltered on `retired_at`: a hit's ancestors are rendered as a
-- path, and a path with a link missing is unreadable. Retirement hides a place
-- from being *chosen*, not from being *named*.
walk AS (
  SELECT p.id AS anchor_id, lin.location_id AS node_id, lin.distance AS depth
    FROM page p
   CROSS JOIN LATERAL public.location_lineage(p.id) AS lin
   WHERE lin.distance > 0
),
chains AS (
  SELECT w.anchor_id,
         jsonb_agg(
           jsonb_build_object(
             'id', a.id,
             'name', a.name,
             'name_i18n', a.name_i18n,
             'type', a.type
           ) ORDER BY w.depth
         ) AS ancestors
    FROM walk w
    JOIN public.locations a ON a.id = w.node_id
   GROUP BY w.anchor_id
)
SELECT jsonb_build_object(
  -- The union, deduped — so a place matching by name and by code counts once.
  'total', (SELECT count(*) FROM matched),
  'results', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',            p.id,
        'name',          p.name,
        'name_i18n',     p.name_i18n,
        'type',          p.type,
        'parent_id',     p.parent_id,
        'country_code',  p.country_code,
        'external_code', p.external_code,
        -- Nearest first, matching every other ancestor chain in this codebase.
        'ancestors',     coalesce(c.ancestors, '[]'::jsonb)
      ) ORDER BY p.match_rank, (p.type = 'site'), p.depth, p.name, p.id
    )
      FROM page p
      LEFT JOIN chains c ON c.anchor_id = p.id
  ), '[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.get_admin_municipality_invoicing(p_month_start date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_clubs     jsonb;
  v_orphans   text;
BEGIN
  PERFORM public.assert_admin();

  -- The month is named by its first day and nothing else. A mid-month argument
  -- is a caller that has not decided what it is asking for — the window would
  -- be a month-long span that matches no calendar month, and every total drawn
  -- from it would be wrong in a way nobody could see. Refused loudly, after the
  -- guard, so an unauthorized caller learns nothing about the argument shape.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH candidate AS (
    SELECT p.*
      FROM public.products p
     WHERE p.product_type = 'municipality_club'
       AND (
             EXISTS (
               SELECT 1
                 FROM public.product_groups g
                 JOIN public.group_sessions gs ON gs.group_id = g.id
                WHERE g.product_id = p.id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
                  -- Cancellation: the same exclusion as `sessions` below.
                  AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
             )
          OR (
               p.start_date <= v_month_end
               AND p.end_date >= p_month_start
             )
           )
  ),
  -- The nearest municipality in the lineage of each candidate's own location,
  -- nearest by distance in case a tree ever nests two.
  municipality AS (
    SELECT DISTINCT ON (o.location_id)
           o.location_id AS origin_id,
           l.id,
           l.name,
           l.name_i18n
      FROM (SELECT DISTINCT c.location_id FROM candidate c) AS o
     CROSS JOIN LATERAL public.location_lineage(o.location_id) AS lin
      JOIN public.locations l ON l.id = lin.location_id
     WHERE l.type = 'municipality'
     ORDER BY o.location_id, lin.distance
  )
  SELECT COALESCE(jsonb_agg(club.doc ORDER BY club.id), '[]'::jsonb)
    INTO v_clubs
    FROM (
      SELECT c.id,
             jsonb_build_object(
               'id',                     c.id,
               'timezone',               c.timezone,
               'start_date',             c.start_date,
               'end_date',               c.end_date,
               'municipality_fee_cents', c.municipality_fee_cents,
               'product_translations',   tr.items,
               'schedule_slots',         sl.items,
               'planned_dates',          pd.items,
               'holiday_breaks',         hb.items,
               'location',
                 jsonb_build_object(
                   'id',        l.id,
                   'name',      l.name,
                   'name_i18n', l.name_i18n,
                   'type',      l.type
                 ),
               'municipality',
                 CASE WHEN m.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',        m.id,
                             'name',      m.name,
                             'name_i18n', m.name_i18n
                           )
                 END,
               -- The buyer of this club, whole rather than by id: the caller
               -- turns it into a Finvoice file, so a second admin-gated round
               -- trip per club would buy nothing. Null where nobody has said
               -- who pays yet — flagged by the page, refused by the export.
               'invoice_customer',
                 CASE WHEN ic.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                             'id',                 ic.id,
                             'fennoa_customer_no', ic.fennoa_customer_no,
                             'invoice_name',       ic.invoice_name,
                             'street',             ic.street,
                             'postal_code',        ic.postal_code,
                             'city',               ic.city,
                             'country_code',       ic.country_code,
                             'your_reference',     ic.your_reference,
                             'invoice_text',       ic.invoice_text,
                             'billing_cadence',    ic.billing_cadence
                           )
                 END,
               'sessions',               se.items,
               'cancelled_sessions',     cx.items,
               'group_ids',              gr.items
             ) AS doc
        FROM candidate c
        -- Every municipality club has a location, in person and online alike
        -- (chk_products_in_person_has_location, chk_products_online_muni_has_location),
        -- and its foreign key is ON DELETE RESTRICT.
        JOIN public.locations l ON l.id = c.location_id
        LEFT JOIN municipality m ON m.origin_id = c.location_id
        -- The link is the club's own column and never the location's: one city
        -- can be two customers, and an association can buy clubs sited in a
        -- municipality it is not.
        LEFT JOIN public.invoice_customers ic ON ic.id = c.invoice_customer_id
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object('locale', pt.locale, 'name', pt.name)
                            ORDER BY pt.locale
                          )
                     FROM public.product_translations pt
                    WHERE pt.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) tr
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'weekday',          ss.weekday,
                              'start_time',       to_char(ss.start_time, 'HH24:MI'),
                              'duration_minutes', ss.duration_minutes
                            )
                            ORDER BY ss.weekday, ss.start_time
                          )
                     FROM public.schedule_slots ss
                    WHERE ss.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) sl
        -- The plan: every date planned_session_dates puts inside the month,
        -- clipped to the club's term by that function — one per date, since a
        -- product has at most one slot per weekday. These are the dates the
        -- club was due to meet; the page sets them beside the stored rows and
        -- the cancellations.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(psd.session_date ORDER BY psd.session_date)
                     FROM public.planned_session_dates(c.id, p_month_start, v_month_end) psd
                 ), '[]'::jsonb) AS items
        ) pd
        -- The holiday breaks touching the month, each with the planned dates
        -- it withdrew inside it: the page shows those as holiday lines at no
        -- charge, and the file leaves them out.
        CROSS JOIN LATERAL (
          SELECT public.holiday_breaks_document(c.id, p_month_start, v_month_end) AS items
        ) hb
        -- Raw rows, one per (group, date). The page collapses two groups on one
        -- date into the single session the club is paid for, and can still say
        -- which groups met — an aggregate here would have thrown that away.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     gs.group_id,
                              'session_date', gs.session_date
                            )
                            ORDER BY gs.session_date, gs.group_id
                          )
                     FROM public.group_sessions gs
                     JOIN public.product_groups g ON g.id = gs.group_id
                    WHERE g.product_id = c.id
                      AND gs.session_date >= p_month_start
                      AND gs.session_date <= v_month_end
                      -- Cancellation: a row kept under a cancellation is not a
                      -- session that ran, so it never reaches the bill. Left
                      -- out here rather than trusted to the page, so no reader
                      -- of this document can count one.
                      AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
                 ), '[]'::jsonb) AS items
        ) se
        -- Cancellation: the month's cancelled (group, date) pairs in effect,
        -- in the same shape as `sessions`, so the page can show a cancelled
        -- date as Cancelled rather than as unrecorded and never bill it. The
        -- same predicate `sessions` excludes by, so a pair here never also
        -- appears there, and an inert cancellation appears in neither. One on
        -- a holiday is not listed: that date is the break's holiday line and
        -- nothing else.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(
                            jsonb_build_object(
                              'group_id',     sc.group_id,
                              'session_date', sc.session_date
                            )
                            ORDER BY sc.session_date, sc.group_id
                          )
                     FROM public.session_cancellations sc
                     JOIN public.product_groups g ON g.id = sc.group_id
                    WHERE g.product_id = c.id
                      AND sc.session_date >= p_month_start
                      AND sc.session_date <= v_month_end
                      AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
                      AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
                 ), '[]'::jsonb) AS items
        ) cx
        -- Every group the club has, whether or not the month says anything
        -- about it. A date is cancelled for the club only when every one of its
        -- groups cancelled it, and a group that neither met nor cancelled is
        -- exactly the one neither list above can name — without this a
        -- sibling's cancellation would hide its missed session. Every row, with
        -- no filter: a group has no archived state and no start date, so any
        -- group the product holds is one its schedule is due to meet.
        CROSS JOIN LATERAL (
          SELECT COALESCE((
                   SELECT jsonb_agg(g.id ORDER BY g.id)
                     FROM public.product_groups g
                    WHERE g.product_id = c.id
                 ), '[]'::jsonb) AS items
        ) gr
    ) club;

  -- Every club on the invoice belongs to a municipality, or there is no invoice.
  -- A municipality club whose chain reaches no municipality cannot be billed to
  -- anybody, and the reader of this document has no way to tell such a club from
  -- one whose location was mistyped an hour ago — so the read stops and names the
  -- products, which is the whole of the repair instruction. Checked against the
  -- document that was built rather than against a second walk of the tree,
  -- because what matters is what would have been emitted.
  --
  -- A missing invoice CUSTOMER is deliberately NOT refused here, and the
  -- difference is real: a club with no municipality has nobody to bill and
  -- cannot be rendered on a page that is organised by municipality, while a club
  -- with no customer renders perfectly well and simply cannot have a file
  -- produced for it yet. Refusing the month would take every other file down
  -- with it.
  SELECT string_agg(club.value ->> 'id', ', ' ORDER BY club.value ->> 'id')
    INTO v_orphans
    FROM jsonb_array_elements(v_clubs) AS club(value)
   WHERE jsonb_typeof(club.value -> 'municipality') = 'null';

  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION
      'get_admin_municipality_invoicing: no municipality is an ancestor-or-self of the location of municipality club(s) % — repoint the location so the club can be invoiced',
      v_orphans
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
    'clubs',       v_clubs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gedu_invoicing_document(p_month_start date, p_gedu_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_month_end date;
  v_doc       jsonb;
BEGIN
  -- The month is named by its first day and nothing else, exactly as the
  -- municipality invoicing read demands: a mid-month argument would answer
  -- for a month-long span that matches no calendar month.
  IF p_month_start IS NULL
     OR p_month_start <> date_trunc('month', p_month_start::timestamp)::date THEN
    RAISE EXCEPTION
      'gedu invoicing: p_month_start must be the first day of a month (got %)',
      p_month_start
      USING ERRCODE = 'check_violation';
  END IF;

  v_month_end := (p_month_start + INTERVAL '1 month' - INTERVAL '1 day')::date;

  WITH
  -- Standing seats: every group a gedu is assigned to TODAY whose month says
  -- anything — its product's term overlaps the month, or it stored a session
  -- row inside it (a stored row on an unscheduled date still ran). Assignments
  -- carry no history, so a past month is read against today's staffing.
  assigned AS (
    SELECT a.gedu_id, a.group_id, a.role
      FROM public.gedu_group_assignments a
      JOIN public.product_groups g ON g.id = a.group_id
      JOIN public.products p       ON p.id = g.product_id
     WHERE (p_gedu_id IS NULL OR a.gedu_id = p_gedu_id)
       AND (
             (p.start_date <= v_month_end
              AND (p.end_date IS NULL OR p.end_date >= p_month_start))
          OR EXISTS (
               SELECT 1
                 FROM public.group_sessions gs
                WHERE gs.group_id = a.group_id
                  AND gs.session_date >= p_month_start
                  AND gs.session_date <= v_month_end
             )
           )
  ),
  -- Dated seats: every live substitution inside the month, in the role the
  -- request records — the absent gedu's role when it was filed — and naming
  -- the absent gedu the sub stood in for.
  subbed AS (
    SELECT r.id, r.substitute_id AS gedu_id, r.group_id, r.session_date, r.role,
           r.requested_by AS absent_gedu_id
      FROM public.session_substitution_requests r
     WHERE r.status = 'substituted'::public.substitution_request_status
       AND r.substitute_id IS NOT NULL
       AND (p_gedu_id IS NULL OR r.substitute_id = p_gedu_id)
       AND r.session_date >= p_month_start
       AND r.session_date <= v_month_end
  ),
  seat AS (
    SELECT s.gedu_id, s.group_id FROM assigned s
    UNION
    SELECT s.gedu_id, s.group_id FROM subbed s
  ),
  -- The gedu's OWN live absences inside the month, on groups they hold a seat
  -- on — the first half of the derivation, which takes them out of those
  -- sessions — naming the sub who covered, once one is seated. Never the
  -- reason: the document does not say why anybody was away.
  absent AS (
    SELECT r.id, r.requested_by AS gedu_id, r.group_id, r.session_date,
           r.role, r.status, r.substitute_id
      FROM public.session_substitution_requests r
      JOIN seat s ON s.gedu_id = r.requested_by AND s.group_id = r.group_id
     WHERE r.status <> 'withdrawn'::public.substitution_request_status
       AND r.session_date >= p_month_start
       AND r.session_date <= v_month_end
  ),
  seat_group AS (
    SELECT DISTINCT g.id, g.product_id, g.name
      FROM seat s
      JOIN public.product_groups g ON g.id = s.group_id
  ),
  seat_product AS (
    SELECT p.*
      FROM public.products p
     WHERE p.id IN (SELECT sg.product_id FROM seat_group sg)
  ),
  -- The nearest municipality in the lineage of each product's location, the
  -- same read the municipality invoicing document makes, so a club can be
  -- labelled by its town. A consumer club may reach none, and an online one
  -- may have no location; either then carries null.
  municipality AS (
    SELECT DISTINCT ON (o.location_id)
           o.location_id AS origin_id, l.id, l.name, l.name_i18n
      FROM (SELECT DISTINCT sp.location_id FROM seat_product sp) AS o
     CROSS JOIN LATERAL public.location_lineage(o.location_id) AS lin
      JOIN public.locations l ON l.id = lin.location_id
     WHERE l.type = 'municipality'
     ORDER BY o.location_id, lin.distance
  )
  SELECT jsonb_build_object(
           'month_start', to_char(p_month_start, 'YYYY-MM-DD'),
           'gedus', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',         pr.id,
                        'first_name', pr.first_name,
                        'last_name',  pr.last_name,
                        -- The gedu's own address, so an admin can find them by
                        -- it. Only here: a counterpart below is named, never
                        -- addressed.
                        'email',      pr.email,
                        'assignments', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'group_id', a.group_id,
                                     'role',     a.role
                                   )
                                   ORDER BY a.group_id
                                 )
                            FROM assigned a
                           WHERE a.gedu_id = pr.id
                        ), '[]'::jsonb),
                        'substitutions', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'request_id',   s.id,
                                     'group_id',     s.group_id,
                                     'session_date', s.session_date,
                                     'role',         s.role,
                                     'absent_gedu',  jsonb_build_object(
                                                       'id',         ap.id,
                                                       'first_name', ap.first_name,
                                                       'last_name',  ap.last_name
                                                     )
                                   )
                                   ORDER BY s.session_date, s.group_id, s.id
                                 )
                            FROM subbed s
                            JOIN public.profiles ap ON ap.id = s.absent_gedu_id
                           WHERE s.gedu_id = pr.id
                        ), '[]'::jsonb),
                        'absences', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object(
                                     'request_id',   ab.id,
                                     'group_id',     ab.group_id,
                                     'session_date', ab.session_date,
                                     'role',         ab.role,
                                     'status',       ab.status,
                                     -- Null while the request is open.
                                     'substitute',
                                       CASE WHEN sp.id IS NULL THEN NULL
                                            ELSE jsonb_build_object(
                                                   'id',         sp.id,
                                                   'first_name', sp.first_name,
                                                   'last_name',  sp.last_name
                                                 )
                                       END
                                   )
                                   ORDER BY ab.session_date, ab.group_id, ab.id
                                 )
                            FROM absent ab
                            LEFT JOIN public.profiles sp ON sp.id = ab.substitute_id
                           WHERE ab.gedu_id = pr.id
                        ), '[]'::jsonb)
                      )
                      ORDER BY pr.id
                    )
               FROM public.profiles pr
              WHERE pr.id IN (SELECT s.gedu_id FROM seat s)
           ), '[]'::jsonb),
           'groups', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',         sg.id,
                        'product_id', sg.product_id,
                        'name',       sg.name,
                        -- Stored rows in the month with no cancellation in
                        -- effect: the evidence a session ran. A row kept
                        -- under a cancellation is not one, and is left out
                        -- here so no reader can count it.
                        'sessions', COALESCE((
                          SELECT jsonb_agg(gs.session_date ORDER BY gs.session_date)
                            FROM public.group_sessions gs
                           WHERE gs.group_id = sg.id
                             AND gs.session_date >= p_month_start
                             AND gs.session_date <= v_month_end
                             AND NOT public.group_session_is_cancelled(gs.group_id, gs.session_date)
                        ), '[]'::jsonb),
                        -- The month's cancellations in effect, by the same
                        -- predicate, so a date here never also appears above
                        -- and an inert cancellation appears in neither. One
                        -- on a holiday is not listed: that date is the
                        -- break's holiday line and nothing else.
                        'cancelled_sessions', COALESCE((
                          SELECT jsonb_agg(sc.session_date ORDER BY sc.session_date)
                            FROM public.session_cancellations sc
                           WHERE sc.group_id = sg.id
                             AND sc.session_date >= p_month_start
                             AND sc.session_date <= v_month_end
                             AND public.group_session_is_cancelled(sc.group_id, sc.session_date)
                             AND NOT public.group_session_date_is_holiday(sc.group_id, sc.session_date)
                        ), '[]'::jsonb)
                      )
                      ORDER BY sg.id
                    )
               FROM seat_group sg
           ), '[]'::jsonb),
           'products', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',                       sp.id,
                        'product_type',             sp.product_type,
                        'timezone',                 sp.timezone,
                        'start_date',               sp.start_date,
                        'end_date',                 sp.end_date,
                        'primary_gedu_fee_cents',   sp.primary_gedu_fee_cents,
                        'assistant_gedu_fee_cents', sp.assistant_gedu_fee_cents,
                        'product_translations', COALESCE((
                          SELECT jsonb_agg(
                                   jsonb_build_object('locale', pt.locale, 'name', pt.name)
                                   ORDER BY pt.locale
                                 )
                            FROM public.product_translations pt
                           WHERE pt.product_id = sp.id
                        ), '[]'::jsonb),
                        -- The plan: every date planned_session_dates puts
                        -- inside the month, clipped to the term by that
                        -- function — the dates a seat was due.
                        'planned_dates', COALESCE((
                          SELECT jsonb_agg(psd.session_date ORDER BY psd.session_date)
                            FROM public.planned_session_dates(sp.id, p_month_start, v_month_end) psd
                        ), '[]'::jsonb),
                        -- The holiday breaks touching the month, each with
                        -- the planned dates it withdrew inside it: the
                        -- invoice shows those as holiday lines at no charge.
                        'holiday_breaks', public.holiday_breaks_document(
                                            sp.id, p_month_start, v_month_end
                                          ),
                        'location',
                          CASE WHEN l.id IS NULL THEN NULL
                               ELSE jsonb_build_object(
                                      'id',        l.id,
                                      'name',      l.name,
                                      'name_i18n', l.name_i18n,
                                      'type',      l.type
                                    )
                          END,
                        'municipality',
                          CASE WHEN m.id IS NULL THEN NULL
                               ELSE jsonb_build_object(
                                      'id',        m.id,
                                      'name',      m.name,
                                      'name_i18n', m.name_i18n
                                    )
                          END
                      )
                      ORDER BY sp.id
                    )
               FROM seat_product sp
               LEFT JOIN public.locations l ON l.id = sp.location_id
               LEFT JOIN municipality m     ON m.origin_id = sp.location_id
           ), '[]'::jsonb)
         )
    INTO v_doc;

  RETURN v_doc;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The waitlist promotion leaves the group check to its trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promote_from_waitlist(p_participation_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_id  UUID;
  v_status      public.participation_status;
BEGIN
  PERFORM public.assert_admin();

  SELECT product_id, status INTO v_product_id, v_status
    FROM public.participations
    WHERE id = p_participation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation not found' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize against concurrent joins/cancels/promotions on this product.
  PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

  -- Idempotent / wrong-state: report current status without mutating.
  IF v_status <> 'waitlisted' THEN
    RETURN jsonb_build_object('kind', 'noop', 'status', v_status::text);
  END IF;

  -- Give them a seat. No seat-count gate by design: promoting from a full
  -- waitlist is a deliberate admin capacity override. waitlisted_at cleared so
  -- they leave the waitlist ordering. The uq_participations_active_or_waitlisted
  -- index already guaranteed no other in-set row exists for this (product,gamer).
  -- A p_group_id of NULL is the unassigned inbox; one naming a group of another
  -- product is refused by trg_validate_participations_group on this write.
  --
  -- The two offer stamps go with it. An admin dragging a row that
  -- carries a live offer is answering it on the family's behalf — granting
  -- exactly the seat the offer asked about — so the offer is over, and the
  -- emailed link stops validating on its own because it no longer matches. The
  -- clear is unconditional rather than guarded: the CHECK forbids an offer
  -- stamp on a non-waitlisted row, so leaving one behind would fail this very
  -- UPDATE.
  UPDATE public.participations
     SET status = 'active',
         group_id = p_group_id,
         waitlisted_at = NULL,
         seat_offer_sent_at = NULL,
         seat_offer_expiry_notified_at = NULL
   WHERE id = p_participation_id;

  RETURN jsonb_build_object(
    'kind', 'promoted',
    'participation_id', p_participation_id,
    'product_id', v_product_id,
    'group_id', p_group_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. End state
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_found text;
  v_a     uuid := gen_random_uuid();
  v_b     uuid := gen_random_uuid();
BEGIN
  -- The name rules are in force, in their new form only.
  IF (SELECT count(*)
        FROM pg_constraint
       WHERE conrelid = 'public.profiles'::regclass
         AND contype = 'c'
         AND convalidated
         AND conname IN ('profiles_first_name_shape', 'profiles_last_name_shape')
         AND pg_get_constraintdef(oid) LIKE '%u200B%') <> 2 THEN
    RAISE EXCEPTION 'profiles must carry validated profiles_first_name_shape and profiles_last_name_shape refusing whitespace of every kind';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.profiles'::regclass
       AND conname IN ('profiles_first_name_len', 'profiles_last_name_len')
  ) THEN
    RAISE EXCEPTION 'profiles still carries a length-only name constraint';
  END IF;

  -- Every writer this migration owns trims.
  SELECT string_agg(p.proname, ', ') INTO v_found
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('handle_new_user', 'create_gamer', 'register_gedu')
     AND p.prosrc NOT LIKE '%regexp_replace(%first_name%u200B%';
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION '% writes a first name untrimmed', v_found;
  END IF;

  -- No reader climbs the tree on its own any more: a recursive walk over
  -- parent_id is the shape that needed a depth bound.
  SELECT string_agg(p.proname, ', ') INTO v_found
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ILIKE '%WITH RECURSIVE%'
     AND p.prosrc LIKE '%parent_id%';
  IF v_found IS NOT NULL THEN
    RAISE EXCEPTION '% still walks parent_id itself rather than through location_lineage', v_found;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgrelid = 'public.locations'::regclass
       AND tgname = 'trg_locations_refuse_loop'
       AND tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'locations must carry an enabled trg_locations_refuse_loop';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'promote_from_waitlist'
       AND p.prosrc LIKE '%is not in product%'
  ) THEN
    RAISE EXCEPTION 'promote_from_waitlist still re-checks the target group';
  END IF;

  -- The loop rule, on two throwaway places, all rolled back by the closing
  -- raise: a place may not move under its own child.
  BEGIN
    INSERT INTO public.locations (id, name, type)
    VALUES (v_a, 'loop probe a', 'site');
    INSERT INTO public.locations (id, name, type, parent_id)
    VALUES (v_b, 'loop probe b', 'site', v_a);

    BEGIN
      UPDATE public.locations SET parent_id = v_b WHERE id = v_a;
      RAISE EXCEPTION 'locations let a place move under its own child';
    EXCEPTION WHEN check_violation THEN
      NULL;
    END;

    RAISE EXCEPTION 'loop probe finished' USING ERRCODE = 'SGLP0';
  EXCEPTION WHEN SQLSTATE 'SGLP0' THEN
    NULL;
  END;
END;
$$;
