-- A session report carries photos.
--
-- Session reports have been text-only. A gedu wants to put pictures in one —
-- mostly in-game screenshots, sometimes a photo of something a gamer made — and
-- the report is the main thing a family gets back between payments. Many parents
-- read the report ONLY in the email, so the photos have to be fetchable by an
-- email client with no session at all.
--
-- This migration is the storage half of that feature: the bucket, the child
-- table, the two writers, and the widened read documents.
--
-- WHY THE BUCKET IS PUBLIC AND CARRIES NO storage.objects POLICY
--
-- The security model is UNLISTED, not private. One URL feeds the app and the
-- email, and possession of it is the credential: the object is named by the
-- row's random UUID (~122 bits), it is linked from no crawlable page, and there
-- is no enumeration path. An email client fetches an image with a bare GET — no
-- cookies, no place to type a code — so a private bucket plus signed URLs would
-- buy an expiry clock that breaks old mail and nothing else. Deleting the object
-- is the kill switch.
--
-- No public-read policy on storage.objects is added, and that is deliberate:
-- 00028 dropped the product-images one for exactly this reason. The public CDN
-- endpoint bypasses RLS, so such a policy grants no read anybody lacks — all it
-- adds is `.list()` enumeration, which is precisely the thing that must stay
-- impossible when the unguessable name IS the security mechanism.
--
-- No bucket-level size or mime limits: this repo enforces those in the upload
-- route, which is the only writer, and which verifies the bytes (JPEG magic
-- number, byte cap) before it ever reaches storage.
--
-- Remember that `storage.buckets` rows and `storage.objects` policies never
-- appear in `schema.sql` — the documented exception — so this file is where the
-- bucket's current state lives.
--
-- WHY A CHILD TABLE AND NOT A jsonb ARRAY ON group_sessions
--
-- Considered, and close to a wash: an array is smaller (no table, no RLS entry,
-- and the cap check is one guarded UPDATE). The table wins on being the
-- idiomatic shape here — per-field CHECKs instead of one jsonb shape constraint,
-- no hand-written `Json` schema on the TypeScript side, and plain SQL instead of
-- fiddly jsonb manipulation. Recorded so it is not re-derived as a discovery.
--
-- WHY THERE IS NO `path` COLUMN
--
-- The object is named `<id>.jpg`, derived from the primary key by one helper
-- beside the existing product-image URL helper. A stored path would be a
-- restatement of the key. The catalogue's product_images DOES carry one, and the
-- difference is that there it holds a sha256 — a genuinely different value.
--
-- WHY created_by IS AUDIT AND NOTHING ELSE
--
-- These are photos concerning children, and "who uploaded this" must be
-- answerable. It gates nothing — deletion rights are role-based, see the delete
-- RPC — and it appears on no feed. It mirrors group_sessions.report_emailed_by in
-- every respect, its reference target and its ON DELETE SET NULL included: a
-- departed gedu leaves the upload recorded without the name.
--
-- WHY THE TABLE HAS RLS AND ZERO POLICIES
--
-- The same posture group_sessions itself has carried since it was created: no
-- grant to `authenticated` at all, a service_role grant, and SECURITY DEFINER
-- RPCs as the only way in. RLS is enabled because every table must have it; the
-- absence of policies is what "no client role reaches this table directly"
-- looks like when someone later adds a grant by accident — it fails closed.
--
-- WHY THE CAP IS A PARAMETER WITH A HARD CEILING BEHIND IT
--
-- The product cap (5 at launch) lives in ONE named constant in the contracts
-- module, which is the single point of control — raising it is a one-line
-- change and no migration. So the RPC takes it as a parameter and refuses beyond
-- it while holding the session row's lock, which is what makes two concurrent
-- tabs unable to overshoot. SQL then holds only a hard SANITY ceiling of 24, so
-- a buggy or malicious caller cannot pass something absurd. The two numbers are
-- not derived from one another and are not meant to be.
--
-- WHY THE DIMENSION CHECK IS 4096 AND NOT THE CLIENT'S EDGE CAP
--
-- The client normalizes to a ~2048 px longest edge before uploading. 4096 is
-- deliberately looser: it is a SANITY bound on a number the client claims, not a
-- restatement of a value the client derives, and the two do not share a source.
-- What it defends is layout arithmetic — the stored dimensions are what the app
-- gallery and the email size their boxes from — so the worst an implausible
-- value produces is a mis-sized box in that group's own mail.
--
-- WHY THE FAMILY FEED GETS A NEW NAME AND THE GEDU FEED DOES NOT
--
-- Both documents grow a per-session `images` array. The gedu feed's contracts
-- schema is tolerant, so widening it in place is invisible to the still-deployed
-- app during the deploy window. The FAMILY feed's contracts schema is
-- deliberately `.strict()` at every level, so the same widening would make the
-- old app fail to PARSE its own read for the minute between the migration
-- deploying and the new app going live. That is the one case the release rules
-- call out as needing a compatibility step, and the step is expand-contract on
-- the function: this migration adds `get_my_family_product_feed_v2` returning the
-- widened document, the new app calls it, and `get_my_family_product_feed` is
-- left COMPLETELY untouched — not recreated, not re-granted, not re-commented —
-- through the window. A follow-up cleanup migration drops the old one and
-- nothing more; the versioned name then stays permanently, because renaming it
-- back would need a deploy window of its own, which is the exact cost this step
-- exists to avoid.
--
-- The admin group surface reads the gedu document, so there is no third document
-- to widen.

-- ---------------------------------------------------------------------------
-- 1. The bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('session-images', 'session-images', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. The rows
-- ---------------------------------------------------------------------------

CREATE TABLE public.group_session_images (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL
               REFERENCES public.group_sessions(id) ON DELETE CASCADE,
  width      integer NOT NULL,
  height     integer NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- clock_timestamp() rather than now(), because this is an ORDERING KEY
  -- compared across concurrent transactions: the insert runs while holding the
  -- session row's lock, so a transaction-start stamp could tie or invert
  -- relative to lock-acquisition order. The id breaks a sub-tick tie.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_group_session_images_width
    CHECK (width > 0 AND width <= 4096),
  CONSTRAINT chk_group_session_images_height
    CHECK (height > 0 AND height <= 4096)
);

COMMENT ON TABLE public.group_session_images IS
  'The photos attached to one session''s report — mostly in-game screenshots. '
  'One row per upload, and the row''s id is also the object''s name in the '
  'public `session-images` bucket (`<id>.jpg`), which is why there is no path '
  'column: it would restate the primary key. The name is a random UUID rather '
  'than a content hash on purpose — the unguessable name IS the access control '
  '(see the migration header''s unlisted-not-private model), and per-upload '
  'identity means deleting one report''s photo can never collide with another '
  'report that attached identical bytes. Dedup is a non-goal. RLS on with ZERO '
  'policies and no grant to `authenticated`: the same posture group_sessions '
  'itself carries, so the two RPCs below are the only way in and a grant added '
  'by accident still fails closed. A photo lives exactly as long as its '
  'report — removed by a gedu or an admin, or CASCADEd away when the session '
  'row goes — and there is no timer, no reaper and no scheduled job.';

COMMENT ON COLUMN public.group_session_images.width IS
  'The stored image''s pixel width, claimed by the uploading client and bounded '
  'here. All gallery and email geometry is arithmetic from this and `height` — '
  'never measured — which is what lets server HTML and first client paint agree '
  'and keeps a mail laying out correctly with every image blocked. The CHECK''s '
  '4096 is a SANITY ceiling, deliberately looser than the client''s ~2048 px '
  'edge cap and not derived from it: the uploader is an assigned staff member, '
  'the value feeds layout alone, and the worst a wrong one produces is a '
  'mis-sized box in that group''s own mail.';

COMMENT ON COLUMN public.group_session_images.height IS
  'The stored image''s pixel height. See `width` — the same claim, the same '
  'sanity ceiling, and the same reason both are trusted after a bound check '
  'rather than re-derived by parsing the JPEG server-side.';

COMMENT ON COLUMN public.group_session_images.created_by IS
  'Who uploaded this photo. AUDIT ONLY, and specifically for safeguarding: '
  'these are pictures concerning children and "who put this here" must be '
  'answerable. It gates nothing — removal is role-based, matching how the '
  'report itself is edited — and it appears on no feed. The exact mirror of '
  'group_sessions.report_emailed_by, ON DELETE SET NULL included, so a departed '
  'gedu leaves the upload recorded without the name.';

COMMENT ON COLUMN public.group_session_images.created_at IS
  'When the photo was attached, and the DISPLAY ORDER key: every renderer '
  'orders by (created_at, id). Stamped with clock_timestamp() rather than now() '
  'because the insert runs under the session row''s lock, where a '
  'transaction-start stamp can tie or invert against lock-acquisition order; '
  'the id is the sub-tick tiebreaker.';

-- Ordering is per session by (created_at, id) on every surface, so the index
-- carries the whole shape rather than the key alone.
CREATE INDEX group_session_images_session_order_idx
  ON public.group_session_images (session_id, created_at, id);

ALTER TABLE public.group_session_images ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.group_session_images TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Attaching a photo
-- ---------------------------------------------------------------------------
--
-- Called on the UPLOADER'S OWN client — the guard is the authorization, exactly
-- as it is for set_group_session_notes. The route then uploads the object with
-- the admin client, and deletes this row again if that upload fails: an
-- object-less row is a broken image in the feed and in every mail sent
-- afterwards, which is why the order here inverts the product catalogue's
-- (object first, orphan tolerated — there the object is content-addressed and
-- an orphan is harmless).
--
-- Returns the id and nothing else, because the id is the whole of what the
-- caller does not already know: it names the object the route is about to
-- upload. Width, height and the session are values the caller just sent.

CREATE FUNCTION public.add_group_session_image(
  p_group_id     uuid,
  p_session_date date,
  p_width        integer,
  p_height       integer,
  p_max_images   integer
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_session_id uuid;
  v_uid        uuid := (SELECT auth.uid());
  v_count      integer;
  v_image_id   uuid;
BEGIN
  -- An admin, or a gedu. Written as one guard call rather than a branch around
  -- one so the authorization spine can read it, exactly as every other session
  -- writer is.
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  -- The assignment half of the gate, which is what an admin is exempt from.
  -- Any gedu assigned to the group may attach and remove photos, matching how
  -- the report itself is edited: there is no per-photo ownership.
  IF NOT public.is_admin() AND NOT public.gedu_teaches_group(p_group_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- The HARD sanity ceiling on a cap the caller supplies. The product cap lives
  -- in one constant in the contracts module and is passed in from there; this is
  -- only here so a buggy caller cannot ask for something absurd.
  IF p_max_images IS NULL OR p_max_images < 1 OR p_max_images > 24 THEN
    RAISE EXCEPTION
      'A photo cap of % is outside the 1..24 a caller may ask for',
      COALESCE(p_max_images::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  -- One refusal for every implausible dimension, rather than a 23514 from the
  -- CHECK for an out-of-range value and a 23502 from the NOT NULL for a missing
  -- one. The table's constraints still stand behind this and are what make the
  -- bound a guarantee rather than a convention.
  IF p_width IS NULL OR p_height IS NULL
     OR p_width  <= 0 OR p_width  > 4096
     OR p_height <= 0 OR p_height > 4096 THEN
    RAISE EXCEPTION
      'Image dimensions % x % are not a plausible session photo',
      COALESCE(p_width::text, 'NULL'), COALESCE(p_height::text, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT public.group_session_date_is_writable(p_group_id, p_session_date) THEN
    RAISE EXCEPTION 'No scheduled session on % for this group', p_session_date
      USING ERRCODE = 'check_violation';
  END IF;

  v_session_id := public.ensure_group_session(p_group_id, p_session_date);

  -- Take the session row's lock BEFORE counting, so two tabs uploading at once
  -- serialize here and the second one sees the first one's row. Without it both
  -- would count four and both would insert a fifth.
  PERFORM 1 FROM public.group_sessions WHERE id = v_session_id FOR UPDATE;

  SELECT count(*) INTO v_count
    FROM public.group_session_images
   WHERE session_id = v_session_id;

  IF v_count >= p_max_images THEN
    RAISE EXCEPTION
      'This session already holds % photos, which is the cap', v_count
      USING ERRCODE = 'P0023';
  END IF;

  INSERT INTO public.group_session_images (
    session_id, width, height, created_by
  )
  VALUES (v_session_id, p_width, p_height, v_uid)
  RETURNING id INTO v_image_id;

  RETURN v_image_id;
END;
$$;

COMMENT ON FUNCTION public.add_group_session_image(
  uuid, date, integer, integer, integer
) IS
  'Attach one photo to a session''s report, materializing the session row if '
  'needed, and hand back the id the object will be named by. Open to an ADMIN '
  'or to the gedu assigned to the group, guard-first on assert_role with the '
  'assignment question as a second 42501 — the same shape set_group_session_'
  'notes carries, and the same half an admin is exempt from. Addressed by '
  '(group, session date) like every other session write. Takes the CAP as a '
  'parameter, because the product cap lives in one constant in the contracts '
  'module and raising it must not need a migration; SQL holds only a hard '
  'sanity ceiling of 24 so a buggy caller cannot pass something absurd. Counts '
  'and inserts while holding the session row''s lock, so concurrent tabs cannot '
  'overshoot the cap, and refuses with SQLSTATE P0023 when it is already met — '
  'a code of its own because the UI answers it differently from every other '
  'refusal ("remove one first", not "that did not work"). Implausible '
  'dimensions are refused with check_violation as one class, the table''s own '
  'CHECKs standing behind that. Called on the UPLOADER''S OWN client: the guard '
  'is the authorization, and the route uploads the object with the admin client '
  'afterwards — deleting this row again if that upload fails, because an '
  'object-less row is a broken image in the feed and in every mail sent later.';

REVOKE EXECUTE ON FUNCTION public.add_group_session_image(
  uuid, date, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_group_session_image(
  uuid, date, integer, integer, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_group_session_image(
  uuid, date, integer, integer, integer
) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Removing a photo
-- ---------------------------------------------------------------------------
--
-- Keyed on the image id alone, because that is what a per-thumbnail remove
-- control has: the group is resolved from the row itself. That resolution is
-- also the authorization — an id belonging to a group the caller does not teach
-- and an id belonging to nothing at all are refused IDENTICALLY, so the function
-- cannot be used as an oracle for "is this a real photo id".

CREATE FUNCTION public.delete_group_session_image(p_image_id uuid)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_group_id uuid;
BEGIN
  PERFORM public.assert_role(
    CASE WHEN public.is_admin() THEN 'admin' ELSE 'gedu' END::public.user_role
  );

  SELECT s.group_id
    INTO v_group_id
    FROM public.group_session_images i
    JOIN public.group_sessions s ON s.id = i.session_id
   WHERE i.id = p_image_id;

  -- No row and somebody else's row answer the same way. Deliberate: the caller
  -- has no right to learn which of the two it was.
  IF v_group_id IS NULL
     OR (NOT public.is_admin() AND NOT public.gedu_teaches_group(v_group_id))
  THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.group_session_images WHERE id = p_image_id;
END;
$$;

COMMENT ON FUNCTION public.delete_group_session_image(uuid) IS
  'Remove one photo from a session''s report. Open to an ADMIN or to ANY gedu '
  'assigned to the group — there is no per-photo ownership, matching how the '
  'report itself is edited under the last-editor model. Guard-first on '
  'assert_role; the group is then resolved from the image''s own session row, '
  'and that resolution is the second half of the gate. A photo id that belongs '
  'to another group and one that belongs to nothing are refused identically '
  'with 42501, so this cannot be used as an oracle for real photo ids. Deletes '
  'the ROW only: the route deletes the object afterwards through the STORAGE '
  'API, never with SQL against storage.objects, which orphans the backing file. '
  'A failed object delete is logged and left — the row is gone, the URL is dead '
  'to the app, and an already-emailed copy simply stops loading.';

REVOKE EXECUTE ON FUNCTION public.delete_group_session_image(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_group_session_image(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_group_session_image(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 5. The gedu document, widened IN PLACE
-- ---------------------------------------------------------------------------
--
-- Recreated from its current definition in schema.sql with ONE addition: an
-- `images` array on every session entry. The gedu contracts schema is tolerant,
-- so the still-deployed app during the deploy window simply ignores a key it
-- does not know about — which is why this half needs no versioned name.
--
-- The admin group details page reads this same document, so the admin surface
-- gets the photos for free.

CREATE OR REPLACE FUNCTION public.get_gedu_group_feed(p_group_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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
        'note_updated_by_first_name', ned.first_name
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

COMMENT ON FUNCTION public.get_gedu_group_feed(p_group_id uuid) IS
  'One round trip for a group workspace: product shell (with the gedu-only '
  'material link, read from product_staff_details), group notes, site notes on '
  'in-person products, the current roster, and every stored session row with '
  'its sparse attendance map and, since 00222, its photos. Contains no schedule '
  'expansion — the client owns the calendar math. Open since 00204 to an ADMIN '
  'as well as to the assigned gedu, guard-first on assert_role with the '
  'ownership question as a second 42501 — the same shape set_group_notes uses. '
  'The admin caller is the product page''s per-group GROUP DETAILS page, which '
  'renders the gedu workspace''s page body unchanged: one body fed by one '
  'document is what keeps the two surfaces one surface, where a second '
  'admin-shaped RPC would have started drifting field by field. An admin passes '
  'the ownership half outright; a gedu is still shown only their OWN group''s '
  'feed, and a customer or a gamer is still refused on the first statement, '
  'which is what keeps the material link and the three staff notes off every '
  'family surface. Each roster row is keyed by participant_id (00175 — whoever '
  'holds the seat, child or adult), carries both game identities since 00195 '
  '(minecraft_username/minecraft_uuid and roblox_username/roblox_user_id, '
  'independent of each other and drawn according to the product''s topic, which '
  'this document does not carry), and carries two contact fields and never '
  'both: parent_email for a child (their linked parent), participant_email for '
  'an adult seat (their own address, NULL on child rows because a gamer '
  'profile''s email is a synthetic non-mailbox). Since 00203 each roster row '
  'also carries the staff-only flair — group_joined_at (when the seat entered '
  'THIS group, as against signed_up_at, which is when it was taken on the '
  'product), note and note_updated_by_first_name — in deliberate parity with '
  'get_gedu_assigned_product''s roster, which is the parity the page depends on '
  'because it renders this copy. Each session row carries report_emailed_at '
  'since 00197 — when its report was mailed to the families, NULL until it was '
  '— and never report_emailed_by, which is audit and renders nowhere. Since '
  '00222 each session row also carries `images`: {id, width, height} per photo, '
  'ordered by (created_at, id), with the uploader deliberately off the wire for '
  'the same reason the sender is. Widened IN PLACE rather than under a '
  'versioned name because the gedu contracts schema is tolerant of unknown '
  'keys — the family feed, whose schema is strict, got get_my_family_product_'
  'feed_v2 instead.';

-- CREATE OR REPLACE preserves the ACL, but a recreated function has been
-- observed coming back PUBLIC-executable on staging (00172), so the revoke and
-- the per-role grants are re-issued rather than assumed.
REVOKE EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_gedu_group_feed(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. The family document, under a versioned name
-- ---------------------------------------------------------------------------
--
-- get_my_family_product_feed is NOT touched by this migration — not recreated,
-- not re-granted, not re-commented. That is the whole compatibility mechanism:
-- its contracts schema is `.strict()` at every level, so the app still deployed
-- during the release window would fail to parse a widened result. This is the
-- same document plus `images`, under a name the new app calls; a follow-up
-- cleanup migration drops the old one after the window and does nothing else.

CREATE FUNCTION public.get_my_family_product_feed_v2(p_participation_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
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
  -- product_staff_details and this query does not join it.
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
  -- `images` is 00222's, and is the whole reason this function has a versioned
  -- name: the family contracts schema is strict, so the key could not simply
  -- appear on the old one. Same shape as the gedu document's — {id, width,
  -- height}, ordered by (created_at, id) — because one shared gallery component
  -- renders both. The uploader does not travel: it is safeguarding audit, and a
  -- family surface is the last place for it.
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
    'sessions',    v_sessions
  );
END;
$$;

COMMENT ON FUNCTION public.get_my_family_product_feed_v2(p_participation_id uuid) IS
  'One round trip for a family club/camp/event page, scoped to ONE '
  'participation: the product shell, the group name and its family-facing note, '
  'the venue on in-person products, the teaching gedus'' first names, the '
  'group''s full stored session history with reports and PHOTOS, and the named '
  'participant''s own attendance marks. Byte-for-byte the document '
  'get_my_family_product_feed returns plus one key — `images` per session, {id, '
  'width, height} ordered by (created_at, id), the same shape the gedu document '
  'carries because one shared gallery renders both, and never the uploader, '
  'which is safeguarding audit. The versioned NAME is the deploy-window '
  'compatibility step and the only reason this function exists separately: the '
  'family contracts schema is deliberately strict at every level, so widening '
  'the original in place would have made the still-deployed app fail to parse '
  'its own read for the minute between the migration and the release. The '
  'original is therefore untouched by 00222 and a later cleanup migration drops '
  'it; this name then stays permanently, because renaming it back would need a '
  'window of its own. Everything else is carried over unchanged: self-scoping — '
  'the caller must be the participation''s participant (a child, or a parent '
  'holding a seat of their own) or a parent linked to them; an unplaced '
  'participation has no page and answers P0002; a row that does not exist and a '
  'row belonging to another family are refused identically, so it cannot be '
  'used as an oracle for enrollment ids. Carries no gedu note of any scope, no '
  'roster, no other participant''s marks, no parent email, no material link and '
  'no owed/completeness state.';

REVOKE EXECUTE ON FUNCTION public.get_my_family_product_feed_v2(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed_v2(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_family_product_feed_v2(uuid)
  TO service_role;
