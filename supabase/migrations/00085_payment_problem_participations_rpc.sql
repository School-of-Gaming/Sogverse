-- Read-time signal for the "payment problem" badge on the dashboard session
-- cards. The source of truth is `family_subscriptions.status` (written by the
-- Stripe webhook on customer.subscription.updated). This function lets a caller
-- — parent OR gamer — learn which of THEIR participations currently have a
-- billing problem, WITHOUT exposing any money: it returns only participation
-- ids, never Stripe ids, amounts, currency, or period dates.
--
-- That money-free shape is the whole point. A gamer account has no SELECT
-- access to `family_subscriptions` at all (customer-only RLS, by design — we
-- keep billing off the kid's account at the data layer, not just the UI). So
-- the gamer can't read the status directly; this function is the one narrow
-- door, and it hands back nothing a child shouldn't see.
--
-- SECURITY DEFINER so it can read `family_subscriptions` on the gamer's behalf;
-- the WHERE clause restricts results to rows the caller OWNS
-- (`customer_id` or `gamer_id` = auth.uid()), so definer rights can't leak
-- another family's data. Both parent and gamer dashboards derive the badge from
-- this one function reading the one source of truth, so they can never disagree.
--
-- 'past_due' is the only "problem" status surfaced. Per the Stripe dunning
-- behaviour: a failed renewal sits `past_due` for ~3 weeks of retries before
-- Stripe cancels the subscription (which hard-deletes the participation and the
-- family_subscriptions row with it, so a cancelled enrollment simply disappears
-- — there's no row left for this function to return).
--
-- This `past_due`-only filter is correct ONLY because of a Stripe dashboard
-- setting: Settings → Billing → Subscriptions and emails → "Manage failed
-- payments" → Subscription status = "cancel the subscription" when all retries
-- fail (verified in live, 2026-06). With that setting a sub only ever ends in
-- `past_due` (during retries) → cancelled (deleted). If that dropdown is ever
-- changed to "mark the subscription as unpaid", failed renewals will terminate
-- in `unpaid` instead — a real payment problem this filter would silently miss.
-- If you flip it, widen the filter to status IN ('past_due', 'unpaid').

CREATE OR REPLACE FUNCTION public.get_my_payment_problem_participations()
  RETURNS TABLE (participation_id uuid)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT fs.participation_id
  FROM public.family_subscriptions fs
  JOIN public.participations p ON p.id = fs.participation_id
  WHERE fs.status = 'past_due'
    AND (
      p.customer_id = (SELECT auth.uid())
      OR p.gamer_id = (SELECT auth.uid())
    );
$function$;

-- Private by default, then granted to authenticated: callable from the browser
-- client by both parents and gamers (it self-scopes via auth.uid()). Added to
-- the AUTHENTICATED_ALLOWLIST in tests/db/access-control.test.ts.
REVOKE EXECUTE ON FUNCTION public.get_my_payment_problem_participations() FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_payment_problem_participations() TO authenticated;
