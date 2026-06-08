-- Supersedes get_my_payment_problem_participations (00085). That function
-- answered a single question — "which of my participations are past_due?" — by
-- returning bare participation ids. The dashboard now needs a second, closely
-- related signal: which of the caller's participations have a *canceling* sub,
-- and when their paid access actually ends (current_period_end). With that the
-- session list can hide occurrences past the paid window, and the parent gets
-- an "access until {date}" badge confirming their cancellation was fulfilled.
--
-- Both signals are the same projection — family_subscriptions.status mapped
-- onto the caller's participations, read under the same owner-scoping. Rather
-- than a second SECURITY DEFINER function (a second RLS-bypassing surface to
-- audit, a second owner-scoping clause to keep correct forever), we widen this
-- one to return the row's status + period end and let the client derive both
-- flags: past_due -> payment problem, canceling -> access-until. One door, one
-- audit.
--
-- Still money-free: returns status + current_period_end only — never Stripe
-- ids, amounts, or currency. current_period_end is a date the parent
-- themselves set in the Stripe portal, and the gamer side needs it too (the
-- post-cancellation session-hiding runs for both audiences), so handing it back
-- exposes nothing a child shouldn't see. A gamer account has no SELECT on
-- family_subscriptions (customer-only RLS, by design — billing is off the kid's
-- account at the data layer), so this SECURITY DEFINER function remains the one
-- narrow door. The WHERE clause restricts results to rows the caller OWNS
-- (customer_id OR gamer_id = auth.uid()), so definer rights can't leak another
-- family's data. Both dashboards derive their badges from this one function
-- reading the one source of truth, so they can never disagree.
--
-- Filter: status IN ('past_due', 'canceling') — the only two states the
-- dashboard reacts to.
--   * 'past_due'  — a failed renewal sitting in Stripe's ~3-week dunning
--     retries (see 00085: the past_due-only contract depends on the Stripe
--     "cancel the subscription when all retries fail" dashboard setting; if
--     that is ever switched to "mark as unpaid", add 'unpaid' here too).
--   * 'canceling' — parent cancelled in the portal (cancel_at_period_end);
--     access continues through current_period_end, after which Stripe fires
--     customer.subscription.deleted and the participation is hard-deleted.
-- 'active' is healthy and excluded; a fully cancelled sub leaves no row.

DROP FUNCTION IF EXISTS public.get_my_payment_problem_participations();

CREATE OR REPLACE FUNCTION public.get_my_participation_subscription_states()
  RETURNS TABLE (
    participation_id uuid,
    status text,
    current_period_end timestamptz
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT fs.participation_id, fs.status, fs.current_period_end
  FROM public.family_subscriptions fs
  JOIN public.participations p ON p.id = fs.participation_id
  WHERE fs.status IN ('past_due', 'canceling')
    AND (
      p.customer_id = (SELECT auth.uid())
      OR p.gamer_id = (SELECT auth.uid())
    );
$function$;

-- Private by default, then granted to authenticated: callable from the browser
-- client by both parents and gamers (it self-scopes via auth.uid()). Added to
-- the AUTHENTICATED_ALLOWLIST in tests/db/access-control.test.ts.
REVOKE EXECUTE ON FUNCTION public.get_my_participation_subscription_states() FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_participation_subscription_states() TO authenticated;
