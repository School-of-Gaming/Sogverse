"use client";

import { useTranslations } from "next-intl";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { ACTIVITY_HEADING_KEY, activityTypeSections } from "@/lib/activity-type";
import {
  GeduAssignmentsSectionView,
  type GeduAssignmentCardData,
} from "./GeduAssignmentsSectionView";
import { UncertifiedToolsNotice } from "./uncertified-notice";

/**
 * The gedu dashboard's page body — everything below the route's data shell.
 *
 * It lives apart from `app/(dashboard)/gedu/page.tsx` so the page is only a
 * data shell (auth, prefetch) and the body is a plain component: that is what
 * lets a full-page preview scene render the dashboard exactly as a gedu meets
 * it, with fixtures in place of the server reads.
 *
 * Three changes from the page it replaced, and the first drives the rest:
 *
 * - **The dashboard rolls up to the assignment.** It used to enumerate every
 *   upcoming occurrence, which is eight near-identical rows for one weekly club.
 *   Per-session detail now lives in the product page's feed, so the future
 *   horizon belongs there and only there; the dashboard shows one card per
 *   activity the gedu runs, with its next session and its outstanding-write-up
 *   count.
 * - **The cards are grouped under the type nouns, and there is no umbrella
 *   heading.** "Clubs", "Camps", "Events" — the words a gedu already uses for the
 *   things they run. It was one section called "My Activities", which was chosen
 *   because it was the only umbrella that stayed honest across all three types;
 *   the trouble with an honest umbrella is that it is honest by being vague, and
 *   a gedu with two clubs and a camp read a heading that told them nothing and
 *   then had to read every card's eyebrow to sort them. Only the nouns a gedu
 *   actually has are rendered, so a camp gedu never learns that events exist, and
 *   the section pill gains one entry per noun so the nav says the same words the
 *   headings do. The single exception is the gedu who has none of them, whose
 *   page is headed with the default noun rather than with nothing — which is the
 *   shared type-noun section helper's rule, not this page's.
 * - **The sections are wider than the family dashboards', and the cards tile.**
 *   Gedu surfaces are desktop-default, and a roll-up card is small — a gedu with
 *   three activities on a laptop met one narrow column and a screen and a half
 *   of scrolling. Every section takes the same wider container so their left
 *   edges still line up under the section pill, and the cards grid inside it.
 *
 * The assignments arrive as **data**, not as a rendered node, while the two
 * tool panels — the instant room and the password reset — stay nodes. That
 * split is not an inconsistency: each panel is a self-contained thing with
 * backend actions behind it, so a shell can hand it over finished, whereas the
 * activity sections' *shape* — how many there are and what they are called — is
 * derived from the rows, and no single node can express it. The body still
 * queries nothing; it is a plain function of its props either way.
 */
export function GeduDashboardPageBody({
  assignments,
  certified,
  toolsCard,
  instantRoomCard,
}: {
  /** One roll-up per assignment, already sorted soonest-first. */
  assignments: readonly GeduAssignmentCardData[];
  /**
   * Has an admin certified this gedu? Gates the whole Tools section, because
   * every tool in it is a moderator power an unapproved account does not hold
   * and every one of them refuses it server-side. One flag, one notice: the
   * section is gated as a unit, so an uncertified gedu reads the reason once
   * rather than once per panel.
   */
  certified: boolean;
  /** The Minecraft Education password-reset panel, shown to a certified gedu. */
  toolsCard: React.ReactNode;
  /**
   * The instant-voice-room panel, shown to a certified gedu. Two props rather
   * than one node for the pair: they are separate self-contained panels that
   * happen to share a heading, and a shell that had to compose them would own a
   * slice of this page's layout.
   */
  instantRoomCard: React.ReactNode;
}) {
  const t = useTranslations("dashboardSections");

  /**
   * The sections the page is made of: one per noun the gedu actually runs, or a
   * single empty one when they run none. Everything below reads from this — the
   * pill, the headings and the bodies are three views of one list, so an empty
   * dashboard cannot end up with a heading the nav has no entry for.
   */
  const activitySections = activityTypeSections(
    assignments,
    (item) => item.assignment.productType,
  );

  /**
   * **Pill labels are their own strings, not the section headings reused.**
   *
   * The pill is a row of small chips in a rounded bar that has to fit on a
   * phone; a heading is a line of its own on a wide page. Borrowing one for the
   * other worked in English by luck — the type nouns happen to be one short
   * word each — and broke the moment a locale disagreed: a section headed
   * "Instant Voice Room" wrapped its own chip onto a second line in French and
   * pushed every other chip off the bar. That section is now a panel inside
   * Tools rather than a chip of its own, so the bar happens to be all short
   * words again — but the separation stays, because it is what lets a heading
   * be as long as it reads best. The type nouns pass the same key to both
   * because in every locale they are already the shortest true word for the
   * thing.
   */
  const sections: DashboardSection[] = [
    ...activitySections.map((group) => ({
      id: ACTIVITY_HEADING_KEY[group.type],
      label: t(ACTIVITY_HEADING_KEY[group.type]),
    })),
    { id: "tools", label: t("tools") },
  ];

  return (
    <>
      {/* Visually-hidden page title — the sections below are equal-weight
          h2s under it, and the section pill is the visual nav. Matches the
          parent dashboard so screen readers get a single "My SOG" page
          heading instead of competing h1s.

          Read from `dashboardSections`, the same key the live body reads: the
          `metadata` namespace is server-only (stripped before the client
          provider) so reading it from a client component throws at render, and
          this body is a client component. Page copy belongs in a page namespace
          regardless — `metadata` names documents, not headings. */}
      <h1 className="sr-only">{t("pageTitle")}</h1>

      {/* The pill names the page rather than any one section: with the heading
          set now varying per gedu, borrowing the first section's label would
          have made the nav's accessible name change between two people looking
          at the same page. */}
      <DashboardSectionPill sections={sections} ariaLabel={t("pageTitle")} />

      {/* Two rhythms, because there are two kinds of gap here. The type nouns
          are subgroups of one thing — the activities this gedu runs — so a full
          section break between Clubs and Camps read as three unrelated pages
          stacked up and put a screen of nothing between a gedu's two cards.
          Tools genuinely is a different section and keeps the wide gap. */}
      <div className="space-y-24 pb-24">
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
              {/* `max-w-5xl`, not the family dashboards' `max-w-3xl`: this is a
                  desktop surface, and three roll-up cards need the room. Every
                  section shares the width so the headings line up down the
                  page — two different `mx-auto` caps would read as a broken
                  grid. */}
              <div className="mx-auto max-w-5xl space-y-6">
                <h2
                  id={`${ACTIVITY_HEADING_KEY[group.type]}-heading`}
                  className="text-3xl font-bold"
                >
                  {t(ACTIVITY_HEADING_KEY[group.type])}
                </h2>
                {/* Empty only on the dashboard of a gedu with nothing assigned
                    at all — a populated section always has items, because the
                    grouping drops the nouns nobody runs. The copy says a group
                    will appear here rather than naming clubs, so the sentence
                    stays true when the first assignment is a camp. */}
                {group.items.length === 0 ? (
                  <p className="text-muted-foreground">
                    {t("myGroupsEmptyStateGedu")}
                  </p>
                ) : (
                  <GeduAssignmentsSectionView items={group.items} />
                )}
              </div>
            </section>
          ))}
        </div>

        {/* Tools — everything a gedu does *around* a session rather than in
            one: spinning up a room to talk in, and putting a child back into
            their Minecraft account. They were two sections until the second
            tool arrived and made it obvious they were one: a heading per tool
            means a pill chip per tool, and a nav that grows a chip every time
            somebody adds a button is a nav that stops fitting on a phone.

            Last section, so it gets the viewport-height min: without it the
            page bottoms out mid-scroll and clicking the Tools chip leaves the
            heading in the middle of the viewport. Same shape as the parent
            dashboard's last section. */}
        <section
          id="tools"
          aria-labelledby="tools-heading"
          className="scroll-mt-32 min-h-[calc(100svh-9rem)]"
        >
          <div className="mx-auto max-w-5xl space-y-6">
            <h2 id="tools-heading" className="text-3xl font-bold">
              {t("tools")}
            </h2>
            {/* One notice for the section, not one per panel. Certification is
                a single fact about the account and the same sentence answered
                both panels, so two of them stacked said the same thing twice
                to a gedu whose page has nothing else on it. */}
            {certified ? (
              <>
                {toolsCard}
                {instantRoomCard}
              </>
            ) : (
              <UncertifiedToolsNotice />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
