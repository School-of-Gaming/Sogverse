"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { EnrollmentCard } from "./EnrollmentCard";
import { ParentHelpSection } from "./ParentHelpSection";
import type { FamilyEnrollmentSummary } from "./enrollment-rollup";

/**
 * One child, with everything they are signed up for. Enrollments arrive
 * **already sorted** — soonest session first, finished runs beneath — because
 * the ordering is a fact about the data and belongs with whoever built it, not
 * with the component drawing it.
 */
export interface ParentDashboardGamer {
  /**
   * The gamer's profile id. It seeds the identicon, so it has to be the real
   * UUID: the pattern is derived from the id's hex bytes, and a readable
   * stand-in renders a degenerate grid rather than a different face.
   */
  id: string;
  firstName: string;
  enrollments: readonly FamilyEnrollmentSummary[];
}

/**
 * Above this many children the pill stops naming them one by one.
 *
 * Four fits on a phone alongside Billing and Help; five does not, and the fifth
 * child is exactly the family least able to afford a nav bar that has to be
 * scrolled sideways to be read. Past the threshold the entries collapse to a
 * single "Gamers" chip aimed at the first child's section — from there the page
 * itself is the index, which is what a long list wants anyway.
 */
const MAX_NAMED_GAMER_PILL_ENTRIES = 4;

/** The section id one child's block scrolls to. */
function gamerSectionId(gamer: ParentDashboardGamer): string {
  return `gamer-${gamer.id}`;
}

/**
 * The parent dashboard's page body — everything below the route's data shell.
 *
 * It lives apart from `app/(dashboard)/parent/page.tsx` so the page is only a
 * data shell (auth, prefetch) and the body is a plain component: that is what
 * lets a full-page preview scene render the dashboard exactly as a parent meets
 * it, with fixtures in place of the server reads.
 *
 * Three changes from the page it replaces, and the first drives the other two:
 *
 * - **The page is organised by child, not by kind of thing.** It used to be a
 *   row of gamer tiles, then one flat list of every session in the family, then
 *   billing, then help — so a parent with two children read one column of cards
 *   that alternated between them and carried a name on each card to say which
 *   was which. A parent does not think "what is my family's next session", they
 *   think "what is Aino doing this week". So each child gets a section of their
 *   own, headed by their face and their name, and every card under it is
 *   theirs by position rather than by a label.
 * - **The My Gamers row is absorbed into those headings.** It was a strip of
 *   avatars whose only job was to get you to a child, sitting above a list that
 *   then told you nothing about which child anything belonged to. The headings
 *   do both jobs at once and the strip has nothing left to do. Adding a child is
 *   the one thing it still owned, and that is now a single tile after the last
 *   section — where a parent looks when they have finished reading about the
 *   children they already have.
 * - **A card is an enrollment, not an occurrence.** A weekly club used to emit
 *   one card per upcoming session; now it emits one, with the cadence in words
 *   and the next session named by the Join button. A waitlist place is a card in
 *   the same list rather than a separate band above it — the family is *in*
 *   something either way, and splitting the page by our own status column asked
 *   the parent to learn it.
 *
 * The section pill names each child in turn, so the nav says the same words the
 * headings do — up to the point where a large family would push it off a phone
 * screen, at which point it says "Gamers" once. Names are user content, so those
 * entries are width-capped: no single name gets to decide how wide the bar is.
 *
 * The billing card arrives as a **node** while the children arrive as **data**.
 * That split is not an inconsistency: billing is one section with backend
 * actions behind it, so a shell can hand it over finished, whereas the shape of
 * the page — how many sections there are and what they are called — is derived
 * from the family, and no single node can express it.
 */
export function ParentDashboardPageBody({
  gamers,
  billingCard,
}: {
  /** The parent's children, in the order their sections appear. */
  gamers: readonly ParentDashboardGamer[];
  /** The Stripe portal card. A node, so the shell owns its actions. */
  billingCard: React.ReactNode;
}) {
  const t = useTranslations("dashboardSections");
  const f = useTranslations("family");

  const firstGamerId = gamers[0] ? gamerSectionId(gamers[0]) : null;
  const namedGamerEntries = gamers.length <= MAX_NAMED_GAMER_PILL_ENTRIES;

  const gamerSections: DashboardSection[] = namedGamerEntries
    ? gamers.map((gamer) => ({
        id: gamerSectionId(gamer),
        label: gamer.firstName,
        truncateLabel: true,
      }))
    : firstGamerId === null
      ? []
      : [{ id: firstGamerId, label: t("myGamersShort") }];

  const sections: DashboardSection[] = [
    ...gamerSections,
    { id: "billing", label: t("billing") },
    { id: "help", label: t("help") },
  ];

  return (
    <>
      {/* Visually-hidden page title — the sections below are equal-weight h2s
          under it, and the section pill is the visual nav. Read from
          `dashboardSections` rather than `metadata`: the metadata namespace is
          server-only (stripped before the client provider), and page copy
          belongs in a page namespace regardless — `metadata` names documents,
          not headings. */}
      <h1 className="sr-only">{t("pageTitle")}</h1>

      {/* The pill names the page rather than any one section: with the heading
          set varying per family, borrowing the first section's label would make
          the nav's accessible name a child's first name. */}
      <DashboardSectionPill sections={sections} ariaLabel={t("pageTitle")} />

      {/* Two rhythms, because there are two kinds of gap here. The children are
          subgroups of one thing — this family — so a full section break between
          them read as several unrelated pages stacked up. Billing and help
          genuinely are different sections and keep the wide gap. */}
      <div className="space-y-24 pb-24">
        <div className="space-y-16">
          {gamers.map((gamer) => (
            <section
              key={gamer.id}
              id={gamerSectionId(gamer)}
              className="scroll-mt-32"
            >
              {/* `max-w-3xl`, the family surfaces' width: these pages are
                  designed for a phone first and the column is what widens on a
                  laptop, not the number of columns. Every section shares the cap
                  so the headings line up down the page. */}
              <div className="mx-auto max-w-3xl space-y-6">
                {/* The heading is a real heading row, not a decorated label: the
                    face is how a parent finds their child's block while
                    scrolling past three of them, and it is the same identicon
                    the tile strip used, so nothing about recognising a child
                    changed — only where it happens. */}
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <Identicon id={gamer.id} size={40} />
                  </Avatar>
                  <h2 className="min-w-0 break-words text-3xl font-bold">
                    {gamer.firstName}
                  </h2>
                </div>

                {gamer.enrollments.length === 0 ? (
                  <EmptyGamerCard firstName={gamer.firstName} />
                ) : (
                  <div className="space-y-3">
                    {gamer.enrollments.map((enrollment) => (
                      <EnrollmentCard
                        key={enrollment.participationId}
                        enrollment={enrollment}
                        audience="customer"
                        gamerFirstName={gamer.firstName}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}

          {/* Adding a child sits after the last of them, deliberately quiet: it
              is a once-a-year action, and a full-strength button at the top of a
              page about the children you already have would compete with them
              for the first thing read. */}
          <div className="mx-auto max-w-3xl">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              {f("addGamer")}
            </button>
          </div>
        </div>

        <section id="billing" className="scroll-mt-32">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t("billing")}</h2>
            {billingCard}
          </div>
        </section>

        {/* Last section gets viewport-height min so clicking its pill can
            actually scroll it to the top — without this the page bottoms out
            mid-scroll and the heading stays in the middle of the viewport. */}
        <section id="help" className="scroll-mt-32 min-h-[calc(100svh-9rem)]">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-3xl font-bold">{t("help")}</h2>
            <ParentHelpSection />
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * A child who is signed up for nothing yet.
 *
 * Dashed and quiet rather than an alarm: nothing is wrong, there is simply
 * nothing to show, and the one useful thing the page can do is point at the
 * shop. It is a card so the section has the same shape it will have the moment
 * something lands in it — a heading with a card under it — rather than a
 * paragraph floating where a card is about to appear.
 */
function EmptyGamerCard({ firstName }: { firstName: string }) {
  const t = useTranslations("parent.enrollment");

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("emptyState", { name: firstName })}
        </p>
        <button
          type="button"
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          {t("emptyStateCta")}
        </button>
      </CardContent>
    </Card>
  );
}
