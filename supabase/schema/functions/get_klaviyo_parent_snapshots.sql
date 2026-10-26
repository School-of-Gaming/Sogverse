--
-- Name: get_klaviyo_parent_snapshots(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) RETURNS TABLE(customer_id uuid, snapshot jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.id,
         jsonb_build_object(
           'profile', jsonb_build_object(
             'id',                p.id,
             'email',             p.email,
             'first_name',        p.first_name,
             'last_name',         p.last_name,
             'phone',             p.phone,
             'locale',            p.locale,
             'spoken_languages',  to_jsonb(p.spoken_languages),
             'currency',          p.currency,
             'created_at',        p.created_at,
             'email_verified_at', p.email_verified_at,
             'home_location', (
               SELECT jsonb_build_object(
                        'id',           l.id,
                        'name',         l.name,
                        'name_i18n',    l.name_i18n,
                        'country_code', l.country_code
                      )
                 FROM public.locations l
                WHERE l.id = p.home_location_id
             )
           ),
           'attribution', jsonb_build_object(
             'utm_source',                     p.utm_source,
             'utm_medium',                     p.utm_medium,
             'utm_campaign',                   p.utm_campaign,
             'utm_content',                    p.utm_content,
             'utm_term',                       p.utm_term,
             'signup_intent_kind',             p.signup_intent_kind,
             'signup_intent_id',               p.signup_intent_id,
             'registration_marketing_consent', p.registration_marketing_consent
           ),
           'gamers', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',          g.id,
                        'first_name',  g.first_name,
                        'birth_year',  gp.birth_year,
                        'birth_month', gp.birth_month,
                        'gender',      gp.gender,
                        'minecraft',   EXISTS (
                                         SELECT 1
                                           FROM public.minecraft_accounts m
                                          WHERE m.user_id = g.id
                                            AND m.minecraft_username IS NOT NULL
                                       ),
                        'roblox',      EXISTS (
                                         SELECT 1
                                           FROM public.roblox_accounts r
                                          WHERE r.user_id = g.id
                                            AND r.roblox_username IS NOT NULL
                                       )
                      )
                      ORDER BY g.created_at, g.id
                    )
               FROM public.parent_gamer pg
               JOIN public.profiles g       ON g.id = pg.gamer_id
               JOIN public.gamer_profiles gp ON gp.user_id = g.id
              WHERE pg.parent_id = p.id
           ), '[]'::jsonb),
           'participations', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',                 part.id,
                        'participant_id',     part.participant_id,
                        'status',             part.status,
                        -- Read now, from the product's dates in its own zone:
                        -- nothing writes when a product ends, so a stored
                        -- state would lag the calendar.
                        'state',              CASE
                                                WHEN part.status = 'waitlisted'::public.participation_status
                                                  THEN 'waitlisted'
                                                WHEN part.status = 'completed'::public.participation_status
                                                  THEN 'past'
                                                WHEN pr.end_date IS NOT NULL
                                                 AND pr.end_date < (now() AT TIME ZONE pr.timezone)::date
                                                  THEN 'past'
                                                ELSE 'active'
                                              END,
                        'signed_up_at',       part.signed_up_at,
                        'waitlisted_at',      part.waitlisted_at,
                        'seat_offer_sent_at', part.seat_offer_sent_at,
                        'product',            public.klaviyo_product_document(part.product_id)
                      )
                      ORDER BY part.signed_up_at, part.id
                    )
               FROM public.participations part
               JOIN public.products pr ON pr.id = part.product_id
              WHERE part.customer_id = p.id
                AND part.status <> 'reserving'::public.participation_status
           ), '[]'::jsonb),
           'subscriptions', COALESCE((
             SELECT jsonb_agg(
                      jsonb_build_object(
                        'id',                 fs.id,
                        'status',             fs.status,
                        'current_period_end', fs.current_period_end,
                        'currency',           fs.currency,
                        'participation_id',   fs.participation_id,
                        'created_at',         fs.created_at
                      )
                      ORDER BY fs.created_at, fs.id
                    )
               FROM public.family_subscriptions fs
              WHERE fs.customer_id = p.id
           ), '[]'::jsonb),
           'payments', (
             SELECT jsonb_build_object(
                      'count',         count(*),
                      'first_at',      min(pay.created_at),
                      'last_at',       max(pay.created_at),
                      'lifetime_cents', COALESCE((
                        SELECT jsonb_object_agg(per.currency, per.total)
                          FROM (
                            SELECT pay2.currency, sum(pay2.amount_cents) AS total
                              FROM public.payments pay2
                             WHERE pay2.customer_id = p.id
                               AND pay2.purpose <> 'reservation_duplicate'::public.payment_purpose
                             GROUP BY pay2.currency
                          ) AS per
                      ), '{}'::jsonb)
                    )
               FROM public.payments pay
              WHERE pay.customer_id = p.id
                AND pay.purpose <> 'reservation_duplicate'::public.payment_purpose
           )
         )
    FROM public.profiles p
   WHERE p.id = ANY (p_customer_ids)
     AND p.role = 'customer'::public.user_role;
$$;


--
-- Name: FUNCTION get_klaviyo_parent_snapshots(p_customer_ids uuid[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) IS 'The single definition of what Klaviyo is told about a parent: one row per named id that is an existing parent (role customer), and none for any other — a parent deleted, or an account that was never one — which tells the sync to delete that Klaviyo profile. `profile`: id, email, names, phone, locale, spoken_languages, currency, created_at, email_verified_at and home_location ({id, name, name_i18n, country_code}, null when unset). `attribution`: the five utm_* values, signup_intent_kind and signup_intent_id, and registration_marketing_consent — all write-once. `gamers`: every linked gamer as {id, first_name, birth_year, birth_month, gender, minecraft, roblox}, the last two whether a username is linked. `participations`: every seat the parent holds or waits for (the retired reserving status left out) as {id, participant_id, status, state, signed_up_at, waitlisted_at, seat_offer_sent_at, product}, where state is waitlisted, active or past — past for a completed seat, or an active one whose product ended before today in its own zone — read at call time, and product is klaviyo_product_document. `subscriptions`: every family subscription as {id, status, current_period_end, currency, participation_id, created_at}. `payments`: {count, first_at, last_at, lifetime_cents}, lifetime_cents an object of summed amount_cents per currency, refunded duplicates (reservation_duplicate) left out of all four. Every gamer fact and the parent''s phone are in it, so it is for the service role alone.';


--
-- Name: FUNCTION get_klaviyo_parent_snapshots(p_customer_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_klaviyo_parent_snapshots(p_customer_ids uuid[]) TO service_role;


