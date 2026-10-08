--
-- Name: get_trainee_assigned_product(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_my_group_id uuid;
  v_timezone    text;
  v_today       date;
  v_product     jsonb;
  v_groups      jsonb;
BEGIN
  PERFORM public.assert_role('gedu');

  -- The caller's trainee group on this product. There is at most one (the
  -- table is UNIQUE on gedu and product), so a named group only has to agree
  -- with it.
  SELECT t.group_id
    INTO v_my_group_id
    FROM public.gedu_group_trainees t
   WHERE t.product_id = p_product_id
     AND t.gedu_id    = (SELECT auth.uid())
     AND (p_group_id IS NULL OR t.group_id = p_group_id);

  IF v_my_group_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'id',                       p.id,
    'product_type',             p.product_type,
    'topic',                    p.topic,
    'timezone',                 p.timezone,
    'start_date',               p.start_date,
    'end_date',                 p.end_date,
    'is_remote',                p.is_remote,
    'requires_gamer_creations', p.requires_gamer_creations,
    'translations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'locale',      pt.locale,
               'name',        pt.name,
               'description', pt.short_description
             ))
        FROM public.product_translations pt
       WHERE pt.product_id = p.id
    ), '[]'::jsonb),
    'schedule_slots', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'weekday',          ss.weekday,
               'start_time',       to_char(ss.start_time, 'HH24:MI:SS'),
               'duration_minutes', ss.duration_minutes
             ) ORDER BY ss.weekday, ss.start_time)
        FROM public.schedule_slots ss
       WHERE ss.product_id = p.id
    ), '[]'::jsonb)
  ), p.timezone
  INTO v_product, v_timezone
  FROM public.products p
  WHERE p.id = p_product_id;

  v_today := (now() AT TIME ZONE COALESCE(v_timezone, 'UTC'))::date;

  -- Every group of the product, ordered as get_gedu_assigned_product orders
  -- them. A sibling group is shown by name only, so the trainee can see it
  -- exists (its voice room, locked): its size, its staff and its members are
  -- nothing a gamer on this group is shown. The caller's own group carries the
  -- rest, and its roster is the trainee workspace document's, row for row.
  SELECT COALESCE(
           jsonb_agg(g ORDER BY g->>'created_at', g->>'id'),
           '[]'::jsonb
         )
    INTO v_groups
    FROM (
      SELECT CASE WHEN pg.id <> v_my_group_id THEN
        jsonb_build_object(
          'id',          pg.id,
          'name',        pg.name,
          'created_at',  pg.created_at,
          'is_my_group', false
        )
      ELSE jsonb_build_object(
        'id',          pg.id,
        'name',        pg.name,
        'created_at',  pg.created_at,
        'is_my_group', true,
        'participant_count', (
          SELECT COUNT(*)::integer
            FROM public.participations part
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ),
        'gedus', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'id',         gp.id,
                   'first_name', gp.first_name,
                   'role',       ga.role
                 ) ORDER BY gp.first_name)
            FROM public.gedu_group_assignments ga
            JOIN public.profiles gp ON gp.id = ga.gedu_id
           WHERE ga.group_id = pg.id
        ), '[]'::jsonb),
        'roster', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'participant_id',     part.participant_id,
                   'first_name',         gmp.first_name,
                   'signed_up_at',       part.signed_up_at,
                   'group_joined_at',    part.group_joined_at,
                   'age', CASE WHEN gprof.birth_year IS NOT NULL THEN
                            EXTRACT(YEAR FROM age(v_today::timestamp,
                                                  make_date(gprof.birth_year, gprof.birth_month, 1)::timestamp))::integer
                          END,
                   'gender',             gprof.gender,
                   'minecraft_username', mca.minecraft_username,
                   'minecraft_uuid',     mca.minecraft_uuid,
                   'roblox_username',    rba.roblox_username,
                   'roblox_user_id',     rba.roblox_user_id,
                   'has_note',           (gn.participant_id IS NOT NULL),
                   'creations',          '[]'::jsonb
                 ) ORDER BY gmp.first_name)
            FROM public.participations part
            JOIN public.profiles gmp                ON gmp.id        = part.participant_id
            LEFT JOIN public.gamer_profiles gprof   ON gprof.user_id = part.participant_id
            LEFT JOIN public.minecraft_accounts mca ON mca.user_id   = part.participant_id
            LEFT JOIN public.roblox_accounts rba    ON rba.user_id   = part.participant_id
            LEFT JOIN public.gamer_group_notes gn
                   ON gn.group_id       = part.group_id
                  AND gn.participant_id = part.participant_id
           WHERE part.group_id = pg.id
             AND part.status   = 'active'::public.participation_status
        ), '[]'::jsonb)
      ) END AS g
        FROM public.product_groups pg
       WHERE pg.product_id = p_product_id
    ) AS sub;

  RETURN jsonb_build_object(
    'product',     v_product,
    'my_group_id', v_my_group_id,
    'groups',      v_groups
  );
END;
$$;


--
-- Name: FUNCTION get_trainee_assigned_product(p_product_id uuid, p_group_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) IS 'The trainee''s door to a product: get_gedu_assigned_product''s document for a gedu holding a TRAINEE seat on it, refused with 42501 otherwise (gedu-only on its first statement). p_group_id is optional and, when given, must be the caller''s trainee group. The shell is the gedu one''s (topic included). `groups` holds every group of the product, ordered by created_at then id. A sibling group carries {id, name, created_at, is_my_group: false} and nothing else — its name is shown so the trainee can see it exists, but its size, staff and members are nothing a gamer on this group is shown. The caller''s own group carries is_my_group true, participant_count, `gedus` as {id, first_name, role}, and the same redacted roster get_trainee_group_feed serves: an integer `age` instead of the birth year and month, `has_note` instead of the note, `creations` always [], and no contact address.';


--
-- Name: FUNCTION get_trainee_assigned_product(p_product_id uuid, p_group_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_trainee_assigned_product(p_product_id uuid, p_group_id uuid) TO service_role;


