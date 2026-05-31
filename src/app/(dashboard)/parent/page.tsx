import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { MyGamersGrid } from "@/components/family";
import { ManageBillingCard } from "@/components/billing";
import { ParentHelpSection, ParentSessionsSection } from "@/components/parent";
import { createClient } from "@/lib/supabase/server";
import {
  ParticipationsService,
  type MyUpcomingSessionRow,
} from "@/services/participations";
import { resolveCustomerFamilyViaRls } from "@/services/family/family.server";
import type { FamilyMember } from "@/services/family";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("parentDashboard"), description: "Manage your gamers and enrollments" };
}

/**
 * Server-prefetch the parent's upcoming-session rows. The RLS-filtered
 * query is the same one `useMyUpcomingSessions` would fire client-side,
 * just one network hop earlier — the result seeds React Query's cache via
 * `initialRows`, so the section paints fully on first frame instead of
 * flashing a skeleton. Mutations elsewhere still cascade through
 * `participationKeys.all` to refetch normally; this prefetch only affects
 * the initial render.
 *
 * Returns `[]` on any failure (no session, RLS rejection, transient
 * Supabase error). The client hook will refetch on mount if so, which
 * keeps the page rendering even when the prefetch can't deliver.
 */
async function getInitialSessionRows(): Promise<MyUpcomingSessionRow[]> {
  try {
    const supabase = await createClient();
    const service = new ParticipationsService(supabase);
    return await service.getMyUpcomingSessions("customer");
  } catch {
    return [];
  }
}

/**
 * Server-prefetch the parent's family (themselves + their linked gamers) via
 * their own RLS-scoped client — no admin client. The `profiles` SELECT policies
 * `users_view_own_profile` + `parents_view_linked_gamers` already scope a
 * customer to {self, their gamers}, so Postgres RLS is the access gate and
 * there's no service-role bypass on this path (see `resolveCustomerFamilyViaRls`).
 * Seeds React Query so My Gamers paints without a skeleton flash; the client
 * `useFamily` still refetches on mount. Returns `[]` on any failure so the page
 * renders regardless.
 */
async function getInitialFamily(): Promise<FamilyMember[]> {
  try {
    const supabase = await createClient();
    return await resolveCustomerFamilyViaRls(supabase);
  } catch {
    return [];
  }
}

export default async function CustomerDashboardPage() {
  // Both reads run together: the page already blocks on the sessions fetch, so
  // adding the (cheaper) family read in parallel costs ~no extra wall-clock and
  // lets My Gamers paint populated on the first frame.
  const [initialSessionRows, initialFamily] = await Promise.all([
    getInitialSessionRows(),
    getInitialFamily(),
  ]);
  return (
    <CustomerDashboardPageBody
      initialSessionRows={initialSessionRows}
      initialFamily={initialFamily}
    />
  );
}

function CustomerDashboardPageBody({
  initialSessionRows,
  initialFamily,
}: {
  initialSessionRows: MyUpcomingSessionRow[];
  initialFamily: FamilyMember[];
}) {
  const t = useTranslations('dashboardSections');
  const p = useTranslations('parent.placeholders');
  const m = useTranslations('metadata.pages');

  const sections: DashboardSection[] = [
    { id: 'my-gamers', label: t('myGamers') },
    { id: 'sessions', label: t('upcomingSessions') },
    { id: 'billing', label: t('billing') },
    { id: 'help', label: t('help') },
  ];

  return (
    <>
      {/* Visually-hidden page title — the four sections below are equal-weight
          h2s under it, and the section pill is the visual nav. Gives screen
          readers a single "My SOG" page heading instead of four competing h1s. */}
      <h1 className="sr-only">{m('parentDashboard')}</h1>

      <DashboardSectionPill sections={sections} ariaLabel={t('myGamers')} />

      <div className="space-y-24 pb-24">
        <section id="my-gamers" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="space-y-1">
              <h2 className="text-3xl font-bold">{t('myGamers')}</h2>
              <p className="text-muted-foreground">{p('myGamersHint')}</p>
            </div>
            <MyGamersGrid initialFamily={initialFamily} />
          </div>
        </section>

        <section id="sessions" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t('upcomingSessions')}</h2>
            <ParentSessionsSection initialRows={initialSessionRows} />
          </div>
        </section>

        <section id="billing" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t('billing')}</h2>
            <ManageBillingCard />
          </div>
        </section>

        {/* Last section gets viewport-height min so clicking its pill can
            actually scroll it to the top — without this the page bottoms out
            mid-scroll and the heading stays in the middle of the viewport. */}
        <section id="help" className="scroll-mt-32 min-h-[calc(100svh-9rem)]">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t('help')}</h2>
            <ParentHelpSection />
          </div>
        </section>
      </div>
    </>
  );
}
