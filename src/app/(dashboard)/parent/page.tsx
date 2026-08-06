import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ManageBillingCard } from "@/components/billing";
import { ParentDashboardShell } from "@/components/parent/ParentDashboardShell";
import { createClient } from "@/lib/supabase/server";
import {
  ParticipationsService,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
} from "@/services/participations";
import { resolveCustomerFamilyViaRls } from "@/services/family/family.server";
import type { FamilyMember } from "@/services/family";
import { resolveBillingAccountsViaRls } from "@/services/billing/billing.server";
import type { BillingAccount } from "@/services/billing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("parentDashboard"),
    description: t("parentDashboardDescription"),
  };
}

/**
 * Server-prefetch the parent's `status='active'` participation rows. The
 * RLS-filtered query is the same one the client hook would fire, one network hop
 * earlier — the result seeds React Query's cache as `initialData`, so the cards
 * paint on the first frame. Mutations elsewhere still cascade through
 * `participationKeys.all` and refetch normally; this prefetch only affects the
 * initial render.
 *
 * **Returns `null` on any failure (no session, RLS rejection, transient
 * Supabase error) — which is deliberately not `[]`.** Seeded data is stamped as
 * fetched *now*, so against the 60-second `staleTime` an empty seed is one the
 * client never asks about again. Flattened, a transient failure told a parent
 * they had signed nobody up for anything and then left that on screen, with
 * nothing to correct it — the comment here used to claim the hook refetched on
 * mount, and it does not. The shell marks a `null` seed stale so it does; a
 * genuine `[]` stays cached, because it is a real answer.
 */
async function getInitialSessionRows(): Promise<MyUpcomingSessionRow[] | null> {
  try {
    const supabase = await createClient();
    const service = new ParticipationsService(supabase);
    return await service.getMyUpcomingSessions("customer");
  } catch {
    return null;
  }
}

/**
 * Server-prefetch the parent's waitlisted participations and their live
 * positions, the same way and for the same reason as the session rows above.
 * These are cards in the same per-child lists rather than a band of their own,
 * so arriving late would insert rows above ones the parent was already reaching
 * for. `null` on failure, with the same meaning as above.
 */
async function getInitialWaitlistRows(): Promise<MyWaitlistRow[] | null> {
  try {
    const supabase = await createClient();
    const service = new ParticipationsService(supabase);
    return await service.getMyWaitlistEntries("customer");
  } catch {
    return null;
  }
}

/**
 * Server-prefetch the parent's family (themselves + their linked gamers) via
 * their own RLS-scoped client — no admin client. The `profiles` SELECT policies
 * `users_view_own_profile` + `parents_view_linked_gamers` already scope a
 * customer to {self, their gamers}, so Postgres RLS is the access gate and
 * there's no service-role bypass on this path (see `resolveCustomerFamilyViaRls`).
 *
 * This one is load-bearing beyond speed: the children *are* the page's sections,
 * so without it the first frame would be a dashboard with no headings that then
 * grew several.
 *
 * **`null` on failure**, for the reason given on the session rows — and it
 * matters most here, because an empty family is the one seed that rewrites the
 * whole page rather than one section of it. The shell passes no `initialData`
 * at all in that case, so the query fetches on mount instead of settling on a
 * childless dashboard for a minute.
 */
async function getInitialFamily(): Promise<FamilyMember[] | null> {
  try {
    const supabase = await createClient();
    return await resolveCustomerFamilyViaRls(supabase);
  } catch {
    return null;
  }
}

/**
 * Server-resolve the parent's Stripe billing accounts, again via their own
 * RLS-scoped client. Resolved here rather than client-side because the count
 * decides how many buttons the billing card renders: fetching it after paint
 * would turn one rendered button into several under the parent's cursor, which
 * the "rendered content must not move" rule forbids.
 *
 * **`[]` on failure, and unlike the three reads above that is the end of it.**
 * This one is not a query seed — the card is handed down as a finished node,
 * with no client query behind it and therefore nothing that could refetch. So
 * there is no stale-seed trick available and none needed: `[]` renders the
 * ordinary single button, which is the right thing to show a parent whose
 * account count we could not read, and the next navigation asks again.
 */
async function getInitialBillingAccounts(): Promise<BillingAccount[]> {
  try {
    const supabase = await createClient();
    return await resolveBillingAccountsViaRls(supabase);
  } catch {
    return [];
  }
}

/**
 * The parent dashboard's route is a **data shell and nothing else**: it reads,
 * and it hands what it read to a client shell that hands it to a page body. The
 * body is the same component the preview scene renders over fixtures, which is
 * the whole point of the split — the page a parent meets and the page the design
 * was signed off from cannot drift apart.
 *
 * **Everything that decides the page's geometry is prefetched here**, and that
 * is the criterion, not "everything that is cheap". The family read decides how
 * many child sections there are and what they are called; the enrollment rows
 * decide how many cards sit under each and how tall they are; the billing
 * accounts decide how many buttons the billing card renders. Any one of them
 * arriving after the first paint would resize a page the parent is already
 * reading — the reflow the layout rule exists to prevent — so the first frame is
 * final and there is no skeleton anywhere on this route.
 *
 * What is emphatically *not* prefetched is the roll-up from rows to cards. That
 * needs the viewer's locale, the viewer's zone and a clock that keeps ticking,
 * so it runs client-side; see `useFamilyEnrollments`.
 */
export default async function CustomerDashboardPage() {
  // All four reads run together: the page blocks on the slowest of them either
  // way, so running the cheaper three alongside the sessions read costs ~no
  // extra wall-clock and is what lets every section paint populated at once.
  const [
    initialSessionRows,
    initialWaitlistRows,
    initialFamily,
    billingAccounts,
  ] = await Promise.all([
    getInitialSessionRows(),
    getInitialWaitlistRows(),
    getInitialFamily(),
    getInitialBillingAccounts(),
  ]);

  return (
    <ParentDashboardShell
      initialSessionRows={initialSessionRows}
      initialWaitlistRows={initialWaitlistRows}
      initialFamily={initialFamily}
      // Handed over finished rather than as data: billing is one self-contained
      // section with its own backend actions, and nothing about the shape of the
      // page depends on what is inside it.
      billingCard={<ManageBillingCard accounts={billingAccounts} />}
    />
  );
}
