"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import type { FamilyEnrollmentSummary } from "@/components/family/enrollment-rollup";
import { GamerHelpFaq } from "@/components/help/help-faq";
import { ACTIVITY_HEADING_KEY, activityTypeSections } from "@/lib/activity-type";

/**
 * The greeting's face, size and weight — a literal class string, because
 * Tailwind scans source text and a size picked by template emits a class with
 * no rule behind it. The weight travels with the face here rather than sitting
 * on the element, so the settled SemiBold 600 does not have to out-argue a
 * `font-bold` written beside it.
 *
 * **It is Poppins, not Space Mono.** An earlier draft set this line in the
 * world's own face; the ruling that retired the pixel display face from the
 * product re-set every one of its sites in Poppins at the Guidebook's scale,
 * and the greeting went with them — it is the app welcoming a child by name,
 * which is the trust register Poppins carries, not the platform naming one of
 * its own places.
 *
 * **The size is the arithmetic at the 360px floor in the widest locale**: the
 * dashboard shell is `container p-6`, which is 312px of content there, and
 * Finnish sets the longest first word ("Tervetuloa," — 11 characters, against
 * French's "Bienvenue,"). At 30px Poppins that whole greeting is ~280px for a
 * typical first name and stays on one line. A long name (Aleksanteri) wraps at
 * the space, which `break-words` already handles. The 36px step from `md:` up
 * is the Guidebook's own H2.
 */
const GREETING_TYPE = "font-sans text-3xl font-semibold leading-[1.2] md:text-4xl";

/**
 * **The page's heading colour, under the ruled grammar.**
 *
 * - **The greeting is amber because the reader is a gamer**, not because a
 *   greeting is an act. The gamer family is amber, and this line names the one
 *   person the page belongs to — the same colour their parent reads their name
 *   in on the section heading over their cards (direction 25: reinforce the
 *   role colours wherever a role is understood, label or no label). It was
 *   already drawn in amber before the grammar existed; what changed is that the
 *   amber now means something and is written down.
 * - **Every activity heading takes valor, and every one takes the same valor.**
 *   What a child is signed up for is where they go and what they do, which is
 *   adventure's word. It is deliberately *one* family across Clubs, Camps and
 *   Events rather than a family each: colouring by product type is an
 *   admin-only tool (direction 15), because almost every family only ever holds
 *   clubs and a child who learned "camps are orange" would have learned
 *   something about our catalogue rather than about their week. Valor also had
 *   no presence at all on the family-facing surfaces, and the ensemble rule
 *   spends free colour on the families heard least.
 * - **Help is wit**, knowledge being what the section is for — the same word,
 *   in the same class, as the parent dashboard's Help heading.
 *
 * Ink takes the soft variant where a family has one (the element cards'
 * mechanism); amber has no split. Measured on the page ground: amber 9.58:1,
 * valor-soft 8.81:1, wit-soft 8.10:1, all clear of the 4.5:1 body bar — and the
 * headings are large text besides.
 *
 * Classes are literal strings because Tailwind scans source text.
 */
const HEADING_INK = {
  /** The greeting — role colour: the gamer family is amber. */
  greeting: "text-primary",
  /** Clubs, camps and events alike — adventure is valor's word. */
  activity: "text-yty-valor-soft",
  /** Help — knowledge is wit's word. */
  help: "text-yty-wit-soft",
} as const;

/**
 * The gamer dashboard's page body — everything below the route's data shell.
 *
 * One card per enrollment, in the same grammar the parent's page uses, so a
 * child and their parent are looking at the same object described the same way
 * — which matters here more than it looks like it does, because the two of them
 * are frequently looking at it *together*, on one phone, working out whether
 * tonight is a club night.
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
 * - **The greeting says the child's name.** This was the one page in the product
 *   that did not know who was reading it — it said "Welcome, Gamer!" to every
 *   child on the platform, on the one surface that belongs to exactly one of
 *   them. The name arrives as a prop rather than being read from a session here,
 *   so the body stays presentational and the shell around it decides where the
 *   name comes from.
 * - **No money at all.** Billing is a parent concern: a payment problem or a
 *   subscription winding down never badges a child's card here — the corner
 *   badges are parent-only by construction. A waitlist place shows its number
 *   in the footer and offers no way to leave the queue: that is a decision
 *   with a cost, and it is not this account's to make.
 * - **The last section is Help, and there is no Yty section.** Yty's four
 *   elements used to be tiled here as a decorative grid that did nothing; the
 *   feature behind it does nothing today either, and the explanation of what
 *   Yty *is* now lives on `/about`, which a child reaches from the header on
 *   every page. What a child on this page actually lacked was any way to ask
 *   for help at all, so the slot the grid occupied is where that went.
 */
export function GamerDashboardPageBody({
  firstName,
  enrollments,
  helpForm,
}: {
  /** The child's own first name, for the greeting. */
  firstName: string;
  /** This gamer's enrollments, already sorted soonest-session-first. */
  enrollments: readonly FamilyEnrollmentSummary[];
  /**
   * The ask-for-help-or-send-feedback form, in its child-facing wording. A node
   * so the shell owns the POST behind it and a preview scene can hand over an
   * inert one — a scene must never gain a live submit that emails every admin.
   */
  helpForm: React.ReactNode;
}) {
  const t = useTranslations("gamer");
  const s = useTranslations("dashboardSections");
  const h = useTranslations("helpSection");

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
    // Last, and at most the fourth chip: three activity nouns plus this one is
    // the widest this bar gets, and it fits the 360px budget in every locale.
    { id: "help", label: s("help") },
  ];

  return (
    <>
      {/* Visually-hidden page title. The welcome line below is a greeting, not
          the document's heading — it names the reader rather than the page — so
          the sections stay equal-weight h2s under one silent h1, matching the
          parent and gedu dashboards. */}
      <h1 className="sr-only">{s("pageTitle")}</h1>

      <div className="space-y-12 pb-24">
        {/* The greeting comes before the nav, unlike the other two dashboards.
            It is this page's hero and it is three lines tall; a nav bar above it
            would be the first thing a child met on their own home page. The pill
            still sticks the moment it reaches the top of the viewport. */}
        <div className="text-center">
          {/* Two-size pattern matching the public Home heading: a long Finnish
              word like "Tervetuloa," overflows mobile at the next size up.
              break-words is a safety net for longer translations —
              and for the name too, which is the longest thing that can land in
              this line and the one part of it no translator controls. */}
          <h2 className={`${GREETING_TYPE} ${HEADING_INK.greeting} break-words`}>
            {t("welcomeNamed", { name: firstName })}
          </h2>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        <DashboardSectionPill sections={sections} ariaLabel={s("pageTitle")} />

        {/* The type nouns are subgroups of one thing — what this gamer is signed
            up for — so they sit close together, and Help gets the wide gap. */}
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
                {/* Valor on every one of these headings, whichever noun it is
                    — see `HEADING_INK` for why the family is the same across
                    all three. */}
                <h2
                  id={`${ACTIVITY_HEADING_KEY[group.type]}-heading`}
                  className={`text-3xl font-semibold ${HEADING_INK.activity}`}
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

        {/* Help — the form and the gamer FAQ, and deliberately **no support
            address anywhere in it**: a gamer account has no mailbox of its own,
            and the form already resolves a reply to the linked parent. The
            adult roles' form carries the address in its lead paragraph; the
            child-facing copy of that same paragraph does not, which is the one
            difference between the three sections and lives in the copy rather
            than in a prop on the form.

            The heading is written to a child while the pill chip above stays
            the short shared word.

            Last section gets viewport-height min so clicking its pill can
            actually scroll it to the top — without this the page bottoms out
            mid-scroll and the heading stays in the middle of the viewport. */}
        <section
          id="help"
          aria-labelledby="help-heading"
          className="scroll-mt-32 min-h-[calc(100svh-9rem)]"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <h2
              id="help-heading"
              className={`text-3xl font-semibold ${HEADING_INK.help}`}
            >
              {h("gamerHeading")}
            </h2>
            {helpForm}
            <GamerHelpFaq />
          </div>
        </section>
      </div>
    </>
  );
}
