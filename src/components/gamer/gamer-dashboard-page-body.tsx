"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import type { FamilyEnrollmentSummary } from "@/components/family/enrollment-rollup";
import { GamerHelpFaq } from "@/components/help/help-faq";
import { ACTIVITY_HEADING_KEY, activityTypeSections } from "@/lib/activity-type";
import type { YtyPalette } from "@/lib/constants/yty";
import type { DisplayFace } from "@/components/preview/palette-scenarios";

/**
 * The greeting's face and its size, as one choice per face — literal class
 * strings, because Tailwind scans source text and a size picked by template
 * emits a class with no rule behind it.
 *
 * **The size is not shared, because the two faces are not the same width.**
 * Press Start 2P advances a full em per character; Space Mono advances ~0.6em
 * at the same cap height, so keeping the numbers would shrink the greeting by
 * two fifths. The draft's numbers are the arithmetic at the 360px floor, in the
 * widest locale: the dashboard shell is `container p-6`, which is 312px of
 * content there, and Finnish sets the longest first word ("Tervetuloa," — 11
 * characters, against French's "Bienvenue,"). At 24px Space Mono that whole
 * greeting is ~245px for a typical first name and stays on one line; today's
 * 20px Press Start 2P is ~340px and wraps. A long name (Aleksanteri) wraps
 * under either, at the space, which `break-words` already handles.
 *
 * Retires with the draft: promotion picks one row and deletes the map.
 */
const GREETING_FACE: Record<DisplayFace, string> = {
  display: "font-display text-xl md:text-3xl",
  mono: "font-brand-mono text-2xl md:text-4xl",
};

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
  palette = "current",
  greetingFace = "display",
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
  /**
   * Which Yty palette the draft doses draw in. Defaults to the live one, so
   * `/gamer` is untouched; the preview scene's `brand-palette` scenario passes
   * `"brand"` to show the design-pass draft. Retires when the draft promotes.
   */
  palette?: YtyPalette;
  /**
   * Which face the greeting is set in — same shape and same default rule as
   * `palette`: today's Press Start 2P unless the draft scenario asks otherwise.
   * See `GREETING_FACE` above for why each face carries its own size.
   */
  greetingFace?: DisplayFace;
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
          {/* Two-size pattern matching the public Home heading: the face is
              monospaced either way, so a long Finnish word like "Tervetuloa,"
              overflows mobile at the next size up. break-words is a safety net
              for longer translations — and for the name too, which is the
              longest thing that can land in this line and the one part of it no
              translator controls. */}
          <h2
            className={`${GREETING_FACE[greetingFace]} font-bold text-primary break-words`}
          >
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
                      // The draft scenario is the whole proposal rather than
                      // one axis of it, so the cards take the palette here just
                      // as they do on the parent's page — a child's My SOG and
                      // a parent's have to agree about what a Live badge is.
                      <EnrollmentCard
                        key={enrollment.participationId}
                        enrollment={enrollment}
                        palette={palette}
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
            <h2 id="help-heading" className="text-3xl font-bold">
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
