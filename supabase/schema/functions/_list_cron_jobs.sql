--
-- Name: _list_cron_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._list_cron_jobs() RETURNS TABLE(jobname text, schedule text, command text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT j.jobname::text, j.schedule::text, j.command::text
  FROM cron.job j;
$$;


--
-- Name: FUNCTION _list_cron_jobs(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._list_cron_jobs() FROM PUBLIC;
GRANT ALL ON FUNCTION public._list_cron_jobs() TO service_role;


