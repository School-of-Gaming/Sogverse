"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import type { FamilyEnrollmentSummary } from "@/components/family/enrollment-rollup";
import { ACTIVITY_HEADING_KEY, activityTypeSections } from "@/lib/activity-type";
import { YTY_ELEMENTS } from "@/lib/constants/yty";

/**
 * The gamer dashboard's page body — everything below the route's data shell.
 *
 * The welcome header and the Yty grid are untouched; the session list is what
 * changed, and it changed the same way the parent's did. One card per
 * enrollment, in the same grammar, so a child and their parent are looking at
 * the same object described the same way — which matters here more than it looks
 * like it does, because the two of them are frequently looking at it *together*,
 * on one phone, working out whether tonight is a club night.
 *
 * What is different from the parent's page, and why:
 *
 * - **Grouped by type noun, not by child.** A gamer's dashboard has exactly one
 *   person on it, so the parent's organising idea has nothing to organise. The
 *   nouns take over — Clubs, Camps, Events — and only the ones this gamer
 *   actually has are rendered, so a child in one club never learns that events
 *   exist. That is the gedu dashboard's rule, for the same reason: an empty
 *   group on a personal page reads as something missing rather than absent.
 * - **Nothing on any card attributes it to anyone.** There is nobody else it
 *   could belong to.
 * - **No money at all.** Billing is a parent concern: a payment problem or a
 *   subscription winding down never badges a child's card here — the corner
 *   badges are parent-only by construction. A waitlist place shows its number
 *   in the footer and offers no way to leave the queue: that is a decision
 *   with a cost, and it is not this account's to make.
 */
export function GamerDashboardPageBody({
  enrollments,
}: {
  /** This gamer's enrollments, already sorted soonest-session-first. */
  enrollments: readonly FamilyEnrollmentSummary[];
}) {
  const t = useTranslations("gamer");
  const s = useTranslations("dashboardSections");
  const yty = useTranslations("yty");

  /**
   * The sections the page is made of: one per noun this gamer actually has, or
   * a single empty one when they have none — the gedu dashboard's rule, from
   * the same shared helper. The pill, the headings and the bodies all read from
   * this one list, so an empty dashboard cannot end up with a heading the nav
   * has no entry for.
   */
  const activitySections = activityTypeSections(
    enrollments,
    (enrollment) => enrollment.productType,
  );

  const sections: DashboardSection[] = [
    ...activitySections.map((group) => ({
      id: ACTIVITY_HEADING_KEY[group.type],
      label: s(ACTIVITY_HEADING_KEY[group.type]),
    })),
    { id: "yty", label: s("yty") },
  ];

  return (
    <>
      {/* Visually-hidden page title. The welcome line below is a greeting, not
          the document's heading — it says the same thing to every gamer and
          names nothing — so the sections stay equal-weight h2s under one silent
          h1, matching the parent and gedu dashboards. */}
      <h1 className="sr-only">{s("pageTitle")}</h1>

      <div className="space-y-12 pb-24">
        {/* The greeting comes before the nav, unlike the other two dashboards.
            It is this page's hero and it is three lines tall; a nav bar above it
            would be the first thing a child met on their own home page. The pill
            still sticks the moment it reaches the top of the viewport. */}
        <div className="text-center">
          {/* Two-size pattern matching the public Home heading:
              font-display (Press Start 2P) is monospaced ~1em-wide, so a
              long Finnish word like "Tervetuloa," overflows mobile at
              text-3xl. break-words is a safety net for longer translations. */}
          <h2 className="font-display text-xl font-bold text-primary break-words md:text-3xl">
            {t("welcome")}
          </h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <DashboardSectionPill sections={sections} ariaLabel={s("pageTitle")} />

        {/* The type nouns are subgroups of one thing — what this gamer is signed
            up for — so they sit close together, and Yty gets the wide gap. */}
        <div className="space-y-10">
          {activitySections.map((group) => (
            <section
              key={group.type}
              id={ACTIVITY_HEADING_KEY[group.type]}
              // Named by its own heading: a `<section>` is only a landmark once
              // it has an accessible name, and without one a screen-reader user
              // tabbing the cards is told nothing about which run of them they
              // are in.
              aria-labelledby={`${ACTIVITY_HEADING_KEY[group.type]}-heading`}
              className="scroll-mt-32"
            >
              <div className="mx-auto max-w-3xl space-y-6">
                <h2
                  id={`${ACTIVITY_HEADING_KEY[group.type]}-heading`}
                  className="text-3xl font-bold"
                >
                  {s(ACTIVITY_HEADING_KEY[group.type])}
                </h2>
                {group.items.length === 0 ? (
                  // Same dashed grammar as the parent page's empty cards: the
                  // section keeps the shape it will have the moment something
                  // lands in it, and nothing about it reads as a fault.
                  //
                  // Its own copy rather than the sessions list's empty state:
                  // that line promises a voice room for a session that is coming
                  // up, and on a dashboard with no enrollments at all there is
                  // no session and no room. This one says the true thing — ask a
                  // parent, and pick something together — which is also the only
                  // action available, since nothing on a child's account can
                  // book anything.
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <p className="text-sm text-muted-foreground">
                        {t("emptyDashboard")}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {group.items.map((enrollment) => (
                      <EnrollmentCard
                        key={enrollment.participationId}
                        enrollment={enrollment}
                        audience="gamer"
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Last section gets viewport-height min so clicking its pill can
            actually scroll it to the top — without this the page bottoms out
            mid-scroll and the heading stays in the middle of the viewport. */}
        <section
          id="yty"
          aria-labelledby="yty-heading"
          className="scroll-mt-32 min-h-[calc(100svh-9rem)]"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 id="yty-heading" className="text-3xl font-bold">
              {s("yty")}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {YTY_ELEMENTS.map((el) => (
                <Card
                  key={el.id}
                  className={`bg-gradient-to-br ${el.color.bgGradient}`}
                >
                  <CardHeader className="text-center pb-2">
                    <el.icon className={`mx-auto h-8 w-8 ${el.color.accent}`} />
                    <CardTitle className="text-base">
                      {yty(`elements.${el.id}.name`)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-center pt-0">
                    <p className="text-xs text-muted-foreground">
                      {yty(`elements.${el.id}.description`)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
