--
-- Name: is_no_charge(public.billing_mode); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_no_charge(p_mode public.billing_mode) RETURNS boolean
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO ''
    AS $$
  SELECT p_mode IN ('free', 'external_contract');
$$;


--
-- Name: FUNCTION is_no_charge(p_mode public.billing_mode); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_no_charge(p_mode public.billing_mode) IS 'Whether a seat on a product with this billing mode costs anyone money: true for ''free'' and for ''external_contract'' (municipality clubs, invoiced off-platform — currently the only consumer of that mode), false for ''paid''. The named home of the colloquial "free", which almost always means both. The distinction between the two no-charge modes stays load-bearing elsewhere — each gates its own purchase shape in create_participation — so this is only for the two-versus-paid question. Kept in lockstep with NO_CHARGE_BILLING_MODES / isNoChargeBillingMode in src/lib/constants/billing.ts, which the admin groups panel reads to decide whether to draw the unassigned inbox.';


--
-- Name: FUNCTION is_no_charge(p_mode public.billing_mode); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_no_charge(p_mode public.billing_mode) FROM PUBLIC;


