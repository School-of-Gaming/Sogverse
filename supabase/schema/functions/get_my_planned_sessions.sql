--
-- Name: get_my_planned_sessions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_planned_sessions() RETURNS TABLE(participation_id uuid, session_date date, starts_at timestamp with time zone, ends_at timestamp with time zone, cancelled boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT p.id,
         planned.session_date,
         planned.starts_at,
         planned.ends_at,
         -- An unplaced seat has no group, so nothing is cancelled for it.
         COALESCE(p.group_id = ANY (planned.cancelled_group_ids), false) AS cancelled
    FROM public.participations p
    JOIN public.products pr ON pr.id = p.product_id
         -- The product-local today, and the product-local date the seat became
         -- the family's: the later of signing up and being placed, which is
         -- the moment the prep window counts its sessions from. GREATEST
         -- skips a NULL, so an unplaced seat's day is its signup's.
   CROSS JOIN LATERAL (
         SELECT (now() AT TIME ZONE pr.timezone)::date AS today,
                (GREATEST(p.signed_up_at, p.group_joined_at)
                   AT TIME ZONE pr.timezone)::date      AS seat_day
         ) AS local
         -- A cancelled membership's paid-through date: the product-local date
         -- of the `canceling` subscription's current_period_end, the instant
         -- the family's access ends. NULL on anything else.
    LEFT JOIN public.family_subscriptions fs
      ON fs.participation_id = p.id
     AND fs.status = 'canceling'
   CROSS JOIN LATERAL public.planned_group_sessions(
         pr.id,
         -- From the day before the earlier of today and the seat's day: the
         -- day before so a session still running past midnight is in, and back
         -- to the seat's day so the prep window's sessions are in however long
         -- ago the seat was taken.
         LEAST(local.today, local.seat_day) - 1,
         -- To the plan's horizon for this group, raised to the paid-through
         -- date so a winding-down membership's last covered session is in.
         public.session_plan_horizon(
           pr.id,
           p.group_id,
           (fs.current_period_end AT TIME ZONE pr.timezone)::date
         )
       ) AS planned
   WHERE p.status = 'active'::public.participation_status
     AND (
           p.customer_id    = (SELECT auth.uid())
        OR p.participant_id = (SELECT auth.uid())
         )
   ORDER BY p.id, planned.session_date, planned.starts_at;
$$;


--
-- Name: FUNCTION get_my_planned_sessions(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_my_planned_sessions() IS 'The planned sessions (planned_group_sessions) of every active seat the caller is party to — as the buyer or as the one in the seat — placed and unplaced alike, one row per (participation, session), each with `cancelled` true when the seat''s group has cancelled that date and false on an unplaced seat. Dates only: never the reason or who cancelled. One span per seat: from the day before the earlier of the product-local today and the product-local date the seat became the family''s (the later of signed_up_at and group_joined_at), to session_plan_horizon for the seat''s group raised to the product-local date a `canceling` subscription''s current_period_end falls on. That span holds the three things the My SOG cards derive: the next session that runs; every session a winding-down membership''s paid window still covers; and the prep window, the second session starting after the seat''s moment (TOPIC_PREP_WINDOW_SESSIONS in src/components/family/enrollment-rollup.ts). The last is inside the span because a dated product''s horizon is its end_date, and an open-ended one''s is at least its eighth session that has not ended, of which at least two start after now unless six sessions run at once — and a seat''s moment is never after now. The exception is an open-ended product with fewer than two sessions in the year ahead, whose horizon stops a year out. SECURITY DEFINER to cross into session_cancellations, which has no authenticated grant, narrowed to the caller''s own seats. Takes no argument, so the set is defined by auth.uid() alone.';


--
-- Name: FUNCTION get_my_planned_sessions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_my_planned_sessions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_my_planned_sessions() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_planned_sessions() TO service_role;


