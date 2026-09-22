--
-- Name: is_subscription_shaped(public.product_type, public.billing_mode); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_subscription_shaped(p_type public.product_type, p_mode public.billing_mode) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT p_type = 'consumer_club' AND p_mode = 'paid';
$$;


--
-- Name: FUNCTION is_subscription_shaped(p_type public.product_type, p_mode public.billing_mode); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_subscription_shaped(p_type public.product_type, p_mode public.billing_mode) IS 'Whether an active seat on this product cannot exist without a monthly Stripe subscription: true for a consumer club that charges, false for everything else. Every other shape is either no-charge or paid once — out of band or through Checkout — so an admin action on it leaves no recurring charge unaccounted for. The named home of the question admin_move_participation asks of a switch target and admin_enroll_participant refuses on. Kept in lockstep with isSubscriptionShaped in src/lib/constants/billing.ts, which the admin groups panel reads to decide whether to offer comp-enrollment and whether a promotion needs the never-paid dialog.';


--
-- Name: FUNCTION is_subscription_shaped(p_type public.product_type, p_mode public.billing_mode); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_subscription_shaped(p_type public.product_type, p_mode public.billing_mode) FROM PUBLIC;


