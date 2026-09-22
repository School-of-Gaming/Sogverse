--
-- Name: stamp_participation_group_joined_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stamp_participation_group_joined_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  -- No group, no join. The ON DELETE SET NULL cascade from product_groups lands
  -- here too, which is the path no function would ever have covered: deleting a
  -- group rewrites group_id on every member row with nothing in between. A
  -- member with no group is not new to anything.
  IF NEW.group_id IS NULL THEN
    NEW.group_joined_at := NULL;

  -- IS DISTINCT FROM rather than <>, so a NULL on either side counts as a
  -- change: a seat moving from no group into one is exactly the case <> would
  -- miss. An UPDATE that does not NAME group_id never fires this trigger at
  -- all, so an unrelated write — a status change, the updated_at touch — cannot
  -- re-stamp; an UPDATE that names it with the value it already held does fire,
  -- and this comparison is what makes that a no-op.
  ELSIF TG_OP = 'INSERT' OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN
    -- now(), not clock_timestamp(). This is a display timestamp with no
    -- cross-row ordering semantics — the same case as signed_up_at beside it.
    -- Two moves inside one transaction therefore stamp identically, which is
    -- correct: they are one decision.
    NEW.group_joined_at := now();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION stamp_participation_group_joined_at(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.stamp_participation_group_joined_at() IS 'Trigger function: keep participations.group_joined_at in step with group_id. Sets it to now() when a seat enters a group or moves to a different one, clears it when the seat leaves a group (including via the ON DELETE SET NULL cascade from product_groups), and leaves it alone otherwise. The column has no other writer.';


--
-- Name: FUNCTION stamp_participation_group_joined_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.stamp_participation_group_joined_at() FROM PUBLIC;


