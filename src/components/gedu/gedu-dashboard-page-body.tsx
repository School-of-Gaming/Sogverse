"use client";

import { useTranslations } from "next-intl";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { GeduHelpFaq } from "@/components/help/help-faq";
import { ACTIVITY_HEADING_KEY, activityTypeSections } from "@/lib/activity-type";
import {
  GeduContractNotice,
  GeduCriminalRecordCheckNotice,
} from "./gedu-next-step-notice";
import {
  GeduAssignmentsSectionView,
  type GeduAssignmentCardData,
} from "./GeduAssignmentsSectionView";
import { UncertifiedToolsNotice } from "./uncertified-notice";

/**
 * The section headings' ink — the third of the three My SOG dashboards, drawn
 * from the same map the parent's and the gamer's are.
 *
 * The treatment is universal by construction, not by coincidence: a heading
 * takes the family whose word it names, and a heading naming nothing the grammar
 * has a word for stays neutral. What differs here is only which headings exist.
 *
 * - **The activity nouns take valor, and all of them take the same valor** —
 *   Clubs, Camps, Events are where a gedu goes and what they do, which is
 *   adventure's word. One family across the three rather than a family each, for
 *   the reason the gamer dashboard states: colouring by product type is an
 *   admin-only tool (direction 15), and a gedu who learned "camps are orange"
 *   would have learned something about the catalogue rather than about their
 *   week. It is also the same colour the child in that club reads over the same
 *   noun on their own page.
 * - **Help is wit**, knowledge being what the section is for — the same word, in
 *   the identical class, as both family dashboards' Help heading. That it is
 *   also the gedu role's own colour is a coincidence of one hue serving two
 *   jobs, not a role mark: nothing on this page names a role, and the heading
 *   would be wit on a page for anybody.
 * - **Tools stays neutral, deliberately.** Spinning up a room and putting a
 *   child back into their Minecraft account are neither an adventure, a person,
 *   a piece of knowledge nor growth — the grammar has no word for a utility, and
 *   inventing one would spend colour on the section where it means least. Same
 *   call, for the same reason, as the parent dashboard's Billing.
 *
 * Ink takes the soft variant where a family has one (the element cards'
 * mechanism). Measured on the page ground: valor-soft 8.81:1, wit-soft 8.10:1,
 * both clear of the 4.5:1 body bar — and these headings are large text besides.
 *
 * Classes are literal strings because Tailwind scans source text.
 */
const HEADING_INK = {
  /** Clubs, camps and events alike — adventure is valor's word. */
  activity: "text-yty-valor-soft",
  /** Help & feedback — knowledge is wit's word. */
  help: "text-yty-wit-soft",
} as const;

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
  contractAccepted,
  criminalRecordCheckPassed,
  toolsCard,
  instantRoomCard,
  helpForm,
}: {
  /** One roll-up per assignment, already sorted soonest-first. */
  assignments: readonly GeduAssignmentCardData[];
  /**
   * Has this gedu accepted the contract version in force? `false` puts the
   * notice band above everything else on the page.
   *
   * **A prop rather than a query, because it has to be settled before the first
   * paint.** The band sits at the top of the body, so one that arrived with a
   * client read would push the entire dashboard down a frame after the reader
   * started looking at it. The shell resolves it server-side and hands over the
   * answer.
   *
   * It is deliberately *not* paired with `certified` into one "standing" flag:
   * they are two independent facts written by two different actors, and
   * acceptance gates nothing while certification gates the Tools section.
   */
  contractAccepted: boolean;
  /**
   * Has an admin recorded seeing this gedu's criminal record extract? `false`
   * puts the second next-step band above everything — but only once the
   * contract is signed and only while they are uncertified, which is the
   * window in which presenting it is the thing left to do.
   *
   * A prop for the same reason `contractAccepted` is: it decides a band at the
   * top of the body and has to be settled before the first paint. It is
   * deliberately not folded into that flag either — two facts written by two
   * different actors, and a single "standing" boolean could not say which band
   * to show.
   */
  criminalRecordCheckPassed: boolean;
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
  /**
   * The ask-for-help-or-send-feedback form, shown to every gedu — certified or
   * not. A node for the same reason the two tool panels are: it is a
   * self-contained panel with a backend action behind it, and handing it in is
   * what lets the preview scene render the real form with the submit inert.
   */
  helpForm: React.ReactNode;
}) {
  const t = useTranslations("dashboardSections");
  const h = useTranslations("helpSection");

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
    // Last, and unconditional: it is the one section an uncertified gedu — the
    // person on this platform who most needs a way to ask what happens next —
    // can actually use.
    { id: "help", label: t("help") },
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

      {/* Above the pill, and above everything a gedu came here to do. These are
          the errands on this page that are not optional, so whichever is
          outstanding is the first thing on it — and it is gone entirely once
          done, leaving no hole where it used to be.

          One at a time, in the order the two steps happen: the terms are
          agreed to on the platform when an educator registers, the extract is
          presented afterwards. The record check's band also waits on
          certification, because for an already-certified educator the step it
          is nudging toward has been overtaken by the decision it was informing
          — and a band pushing somebody toward a thing that no longer changes
          anything is noise on the dashboard of somebody already working. */}
      {!contractAccepted ? (
        <GeduContractNotice />
      ) : !criminalRecordCheckPassed && !certified ? (
        <GeduCriminalRecordCheckNotice />
      ) : null}

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
                  className={`text-3xl font-semibold ${HEADING_INK.activity}`}
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
            somebody adds a button is a nav that stops fitting on a phone. */}
        <section
          id="tools"
          aria-labelledby="tools-heading"
          className="scroll-mt-32"
        >
          <div className="mx-auto max-w-5xl space-y-6">
            {/* Neutral, and it is the one heading on this page that is — see
                `HEADING_INK`: the grammar has no word for a utility, and the
                parent dashboard's Billing heading makes the same call. */}
            <h2 id="tools-heading" className="text-3xl font-semibold">
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

        {/* Help & feedback — the same section the two family dashboards carry,
            in the same order: the message form, with the support address inside
            its lead paragraph, and this role's own FAQ beneath it.

            **A sibling of Tools rather than a card inside it, which is what
            puts it outside the certification gate by construction.** An
            uncertified gedu reads the awaiting-certification notice above and
            then has somewhere to ask about it; a card inside Tools would have
            been hidden by the same flag that hides the two moderator tools, on
            the one dashboard with nothing else on it.

            Now the last section, so the viewport-height min moves here from
            Tools: without it the page bottoms out mid-scroll and clicking this
            chip leaves the heading in the middle of the viewport. */}
        <section
          id="help"
          aria-labelledby="help-heading"
          className="scroll-mt-32 min-h-[calc(100svh-9rem)]"
        >
          <div className="mx-auto max-w-5xl space-y-6">
            <h2
              id="help-heading"
              className={`text-3xl font-semibold ${HEADING_INK.help}`}
            >
              {h("heading")}
            </h2>
            {helpForm}
            <GeduHelpFaq />
          </div>
        </section>
      </div>
    </>
  );
}
