"use client";

import { useTranslations } from "next-intl";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import {
  groupAssignmentsByType,
  type GeduActivityType,
} from "@/lib/gedu-assignment-rollup";
import {
  GeduAssignmentsSectionView,
  type GeduAssignmentCardData,
} from "./GeduAssignmentsSectionView";
import { UnverifiedVoiceNotice } from "./unverified-voice-notice";

/**
 * The message key naming each type noun, which doubles as the anchor id its
 * section scrolls to. `satisfies` rather than an annotation so the values stay
 * literal and the compiler checks them against the message catalogue.
 */
const ACTIVITY_HEADING_KEY = {
  club: "clubs",
  camp: "camps",
  event: "events",
} as const satisfies Record<GeduActivityType, string>;

/** Anchor id for the empty state, which belongs to no type noun. */
const EMPTY_ACTIVITIES_SECTION_ID = "activities";

/**
 * **Draft** gedu dashboard body — what the page becomes once the session feed
 * lands. Rendered today only by a full-page preview scene; at promotion it
 * replaces the live body and the route passes the wired assignments in.
 *
 * Three changes from the page it replaces, and the first drives the rest:
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
 *   headings do.
 * - **The sections are wider than the family dashboards', and the cards tile.**
 *   Gedu surfaces are desktop-default, and a roll-up card is small — a gedu with
 *   three activities on a laptop met one narrow column and a screen and a half
 *   of scrolling. Every section takes the same wider container so their left
 *   edges still line up under the section pill, and the cards grid inside it.
 *
 * The assignments arrive as **data**, not as a rendered node, and the instant
 * room stays a node. That split is not an inconsistency: the instant-room panel
 * is one section with backend actions behind it, so a shell can hand it over
 * finished, whereas the activity sections' *shape* — how many there are and what
 * they are called — is derived from the rows, and no single node can express it.
 * The body still queries nothing; it is a plain function of its props either way.
 */
export function GeduDashboardPageBodyDraft({
  assignments,
  verified,
  instantRoomCard,
}: {
  /** One roll-up per assignment, already sorted soonest-first. */
  assignments: readonly GeduAssignmentCardData[];
  /** Has an admin verified this gedu? Gates the instant-room panel. */
  verified: boolean;
  /** The instant-voice-room panel shown to a verified gedu. */
  instantRoomCard: React.ReactNode;
}) {
  const t = useTranslations("dashboardSections");

  const activityGroups = groupAssignmentsByType(
    assignments,
    (item) => item.assignment.productType,
  );

  const sections: DashboardSection[] = [
    ...activityGroups.map((group) => ({
      id: ACTIVITY_HEADING_KEY[group.type],
      label: t(ACTIVITY_HEADING_KEY[group.type]),
    })),
    { id: "instant-voice-room", label: t("instantVoiceRoom") },
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

      <div className="space-y-24 pb-24">
        {activityGroups.length === 0 ? (
          // No assignments at all: one unheaded section carrying the empty
          // state, and no pill entry for it. A heading here would have to pick
          // a noun, and every noun would be a lie about a gedu who runs none of
          // them.
          <section id={EMPTY_ACTIVITIES_SECTION_ID} className="scroll-mt-32">
            <div className="mx-auto max-w-5xl">
              <p className="text-muted-foreground">
                {t("myGroupsEmptyStateGedu")}
              </p>
            </div>
          </section>
        ) : (
          activityGroups.map((group) => (
            <section
              key={group.type}
              id={ACTIVITY_HEADING_KEY[group.type]}
              className="scroll-mt-32"
            >
              {/* `max-w-5xl`, not the family dashboards' `max-w-3xl`: this is a
                  desktop surface, and three roll-up cards need the room. Every
                  section shares the width so the headings line up down the
                  page — two different `mx-auto` caps would read as a broken
                  grid. */}
              <div className="mx-auto max-w-5xl space-y-6">
                <h2 className="text-3xl font-bold">
                  {t(ACTIVITY_HEADING_KEY[group.type])}
                </h2>
                <GeduAssignmentsSectionView items={group.items} />
              </div>
            </section>
          ))
        )}

        {/* Last section gets viewport-height min so clicking its pill can
            actually scroll it to the top — without this the page bottoms
            out mid-scroll and the heading stays in the middle of the
            viewport. Same shape as the parent dashboard's last section. */}
        <section
          id="instant-voice-room"
          className="scroll-mt-32 min-h-[calc(100svh-9rem)]"
        >
          <div className="mx-auto max-w-5xl space-y-6">
            <h2 className="text-3xl font-bold">{t("instantVoiceRoom")}</h2>
            {verified ? instantRoomCard : <UnverifiedVoiceNotice />}
          </div>
        </section>
      </div>
    </>
  );
}
