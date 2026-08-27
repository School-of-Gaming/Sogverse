"use client";

import Link from "next/link";
import { UserCog, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { DashboardSectionPill, type DashboardSection } from "@/components/layout";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import type {
  FamilyEnrollmentSummary,
  FamilyParticipantEnrollments,
} from "@/components/family/enrollment-rollup";
import type { SeatOfferRespondResponse } from "@/services/participations/seat-offer.contracts";
import { MAX_GAMERS_PER_PARENT, ROUTES } from "@/lib/constants";
import { ParentHelpSection } from "./ParentHelpSection";

/**
 * One person's section, with everything they are signed up for. Enrollments
 * arrive **already sorted** — soonest session first, finished runs beneath —
 * because the ordering is a fact about the data and belongs with whoever built
 * it, not with the component drawing it.
 *
 * An alias rather than a second declaration: this is exactly what the roll-up
 * emits, and two identical interfaces either side of one hand-off is a drift
 * waiting to happen. The name stays because the prop is the parent page's own
 * vocabulary; the shape belongs to the roll-up.
 *
 * The same type serves a child's section and the parent's own — see the
 * roll-up's own note for why one shape covers both.
 */
export type ParentDashboardParticipant = FamilyParticipantEnrollments;

/**
 * One card on a **child's** section, plus the child it belongs to — what an
 * action needing a second account has to know.
 *
 * **The pair, not either half.** The join has to name the gamer to switch into,
 * the product to explain the switch, and the room to land in. Handing the shell
 * one object with both is what lets the body stay ignorant of what the action
 * involves — it knows where the affordance sits and nothing about switch
 * dialogs.
 *
 * The gamer half is deliberately the section's own `{id, firstName}` rather
 * than a richer profile: the switch dialog wants exactly an id, a role and a
 * first name, and the role is `"gamer"` by the fact that this is a child's
 * section.
 */
export interface ParentGamerEnrollmentAction {
  gamer: { id: string; firstName: string };
  enrollment: FamilyEnrollmentSummary;
}

/**
 * One card and whose seat it is — what the actions that work on **any** seat on
 * this page receive.
 *
 * A discriminated union rather than an optional gamer, because the difference
 * decides whether an account switch is even a coherent idea. The join is typed
 * against the `"gamer"` arm alone (see `ParentGamerEnrollmentAction`), so "you
 * cannot open the switch dialog for a seat with nobody to switch into" is a
 * compile-time fact rather than a guard somebody has to remember to write. The
 * leave takes the whole union: giving up a place in line is the same act
 * whoever is standing in it.
 *
 * The discriminant is `seat`, not `audience`, on purpose: the card's own
 * `audience` prop is a different vocabulary with an overlapping value set
 * (`"gamer"` means "the child's own dashboard" there and "a child's seat"
 * here), and the two appear lines apart at the call sites — same-named
 * discriminants would make them silently interchangeable to the compiler.
 */
export type ParentEnrollmentAction =
  | ({ seat: "gamer" } & ParentGamerEnrollmentAction)
  | { seat: "self"; enrollment: FamilyEnrollmentSummary };

/**
 * Above this many **named** entries the pill stops naming the children one by
 * one.
 *
 * Three fits on a typical parent's phone alongside Billing and Help; four
 * forces the bar into sideways scrolling (measured on an iPhone 12 Pro's
 * 390px), and the fourth child is exactly the family least able to afford a
 * nav that has to be scrolled to be read. Past the threshold the child entries
 * collapse to a single "Gamers" chip aimed at the first child's section — from
 * there the page itself is the index, which is what a long list wants anyway.
 *
 * **The parent's own section counts against the same three**, and that is one
 * cap rather than two on purpose: what the number measures is how many
 * variable-width, user-content chips fit on a phone beside the two fixed ones,
 * and a parent's first name occupies the bar exactly as a child's does. So a
 * parent with three children and a seat of their own collapses at three
 * children where they would have named them without it. **What never collapses
 * is the parent chip itself** — collapsing it would have to fold it into the
 * "Gamers" label, which is a lie about who is in the section, and there is only
 * ever one of it so it cannot be the thing that overflows a bar.
 *
 * The cap is a fixed count rather than a measurement on purpose: the server
 * has to render the pill's final shape on first paint, so the decision must be
 * arithmetic both ends run identically. A breakpoint-doubled pill (named list
 * on desktop, collapsed on phone, toggled by CSS alone) is the legitimate way
 * to make this width-aware if the desktop trade ever hurts — measuring and
 * correcting after hydration is not.
 *
 * One caveat to "final shape on first paint": the count includes the parent
 * chip, whose existence derives from the *enrollment* rows, not the family
 * list. On the seeded-stale error path (initial reads failed, the page paints
 * from empty seeds and refetches on mount) a parent with three children and a
 * seat of their own paints named and collapses when the refetch lands. That is
 * this page's already-accepted degradation for failed initial reads — every
 * section revises then, not just the pill — and not a license for
 * measurement: the decision stays arithmetic, and on the healthy path it is
 * final.
 */
const MAX_NAMED_PILL_ENTRIES = 3;

/** The section id one child's block scrolls to. */
function gamerSectionId(gamer: ParentDashboardParticipant): string {
  return `gamer-${gamer.id}`;
}

/** The section id the no-children-yet empty state scrolls to. */
const EMPTY_GAMERS_SECTION_ID = "gamers";

/**
 * The section id the parent's own enrollments scroll to.
 *
 * A fixed word rather than `self-{id}` like the children's: there is exactly
 * one of these per page and it is the reader's own, so an id in the fragment
 * would put their user id in the URL bar to distinguish it from nothing.
 */
const SELF_SECTION_ID = "self";

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
 *   do both jobs at once and the strip has nothing left to do. The tile's link
 *   to the child's identity page survives as a quiet Manage affordance on the
 *   heading row, and adding a child — the one other thing the strip owned — is
 *   now a single tile after the last section, where a parent looks when they
 *   have finished reading about the children they already have.
 * - **A card is an enrollment, not an occurrence.** A weekly club used to emit
 *   one card per upcoming session; now it emits one, with the cadence in words
 *   and the next session named by the Join button. A waitlist place is a card in
 *   the same list rather than a separate band above it — the family is *in*
 *   something either way, and splitting the page by our own status column asked
 *   the parent to learn it.
 *
 * **A parent can be in the seat too, and then they are a section like anybody
 * else** — headed by their own face and their own first name, after every
 * child's and before billing, and present only when they hold something. It is
 * their first name rather than "You" because the sections on this page are
 * named for people, and one chip reading "You" beside three reading Aino, Otso
 * and Venla would be the one entry that had stopped being a name. What that
 * section does *not* get is a Manage link (their identity lives in Settings)
 * or an empty-state card (it does not exist when there is nothing in it).
 *
 * The section pill names each child in turn, so the nav says the same words the
 * headings do — up to the point where a large family would push it off a phone
 * screen, at which point it says "Gamers" once. Names are user content, so those
 * entries are width-capped: no single name gets to decide how wide the bar is.
 * The parent's own chip counts against the same limit as the children's, which
 * is what keeps the bar one bar rather than two independently-capped halves.
 *
 * The billing card arrives as a **node** while the children arrive as **data**.
 * That split is not an inconsistency: billing is one section with backend
 * actions behind it, so a shell can hand it over finished, whereas the shape of
 * the page — how many sections there are and what they are called — is derived
 * from the family, and no single node can express it.
 *
 * **Every action on the cards is a seam, and every one of them is parent-only.**
 * Joining has to switch account first, and leaving a waitlist is a decision with
 * a cost — so both arrive as optional callbacks the shell fills, and the child's
 * own dashboard is not merely not passed them: the card's props make them
 * unreachable from a `"gamer"` audience. The body decides *where* those
 * affordances sit and knows nothing about switch dialogs, DELETE routes or
 * portal sessions.
 */
export function ParentDashboardPageBody({
  gamers,
  self = null,
  billingCard,
  onAddGamer,
  onOpenPortal,
  onJoinClick,
  onLeaveWaitlist,
  leavingParticipationIds,
  onRespondToSeatOffer,
}: {
  /** The parent's children, in the order their sections appear. */
  gamers: readonly ParentDashboardParticipant[];
  /**
   * The parent's **own** seats, or `null` when they hold none.
   *
   * A separate prop rather than another entry in `gamers`, because the section
   * it draws is genuinely a different section: no Manage link (their identity
   * lives in Settings, not on a child's page), no empty-state card, and cards
   * whose Join goes straight to the room because the reader is already the
   * person it is gated on. Optional so every existing caller keeps compiling
   * as the plain no-parent-seats page it already was.
   */
  self?: ParentDashboardParticipant | null;
  /** The Stripe portal card. A node, so the shell owns its actions. */
  billingCard: React.ReactNode;
  /**
   * Open the add-gamer flow. The body owns *where* the two add affordances sit
   * — the quiet tile after the last child, and the full-strength button on the
   * no-children card — and nothing about what adding a child involves, which is
   * a dialog with a form and a mutation behind it. The live shell passes the
   * dialog's opener; a preview scene passes a no-op. Optional so the prop can
   * be here before the shell that fills it, which is what keeps the signature
   * from changing at promotion.
   */
  onAddGamer?: () => void;
  /**
   * Open Stripe's Customer Portal for a failing card, intercepting the corner
   * badge's own click. Same reason as above: the live page passes nothing and
   * the badge opens a real portal session, a preview passes a no-op.
   */
  onOpenPortal?: () => void;
  /**
   * A parent clicked Join on one of their children's cards.
   *
   * It has to be intercepted here and nowhere else: the parent is signed in as
   * themselves, and the voice room is gated on the *gamer's* enrollment, so a
   * direct navigation is refused every time. The shell opens the switch-profile
   * dialog and does a full-page navigation once the switch lands — the house
   * auth rule, since a cookie a server route set never reaches the browser
   * client's in-memory session. The child's own dashboard passes nothing and
   * gets a plain link, because there is nobody to switch into.
   *
   * **Typed against the child arm only**, and the parent's own cards are never
   * handed it: their room is gated on the person clicking, so a switch dialog
   * there would be asking them to become themselves.
   */
  onJoinClick?: (action: ParentGamerEnrollmentAction) => void;
  /**
   * A parent confirmed giving up a place in line. Fires **after** the card's
   * own confirm dialog, so the shell receives a decision rather than an intent
   * and has nothing left to ask.
   */
  onLeaveWaitlist?: (action: ParentEnrollmentAction) => void;
  /**
   * Which participations have a leave in flight.
   *
   * A set rather than a single id, and held by the shell rather than derived
   * from the mutation's pending flag: a family can be queued for several things
   * at once, and a single id would clear the first card's flag the moment a
   * second leave started — un-dimming a card whose DELETE was still running,
   * which is exactly the re-enable the disabled-state rule forbids.
   */
  leavingParticipationIds?: ReadonlySet<string>;
  /**
   * A parent answered a seat offer — yes or no — on one of these cards.
   *
   * Unlike every other action on this page it **returns** something, because
   * two of the server's four answers ("the window closed", "already answered")
   * are not failures and the card has to draw them as a lapsed offer rather
   * than as an error. The card owns the decline confirmation and the committed
   * state; the shell owns the mutation. There is no in-flight set beside this
   * one for the same reason: the block that fired it keeps its own flag and
   * stays committed until the answer resolves.
   */
  onRespondToSeatOffer?: (
    action: ParentEnrollmentAction,
    accept: boolean,
  ) => Promise<SeatOfferRespondResponse["outcome"]>;
}) {
  const t = useTranslations("dashboardSections");
  const f = useTranslations("family");

  // One cap over both kinds of named chip: the parent's own chip takes a slot
  // from the children rather than getting one of its own. See
  // `MAX_NAMED_PILL_ENTRIES`.
  const namedGamerEntries =
    gamers.length + (self === null ? 0 : 1) <= MAX_NAMED_PILL_ENTRIES;

  /**
   * The Steven Brown Rule — see `MAX_GAMERS_PER_PARENT` for the lore.
   *
   * A UI-only cap the tile strip this page absorbed used to enforce, and which
   * has to be enforced *here* now that this page owns every add affordance: the
   * API accepts an eighth child, so a page that keeps offering the button past
   * the limit is offering a parent an error message.
   */
  const canAddGamer = gamers.length < MAX_GAMERS_PER_PARENT;

  // With no children yet, the empty state is still a *section* — "Gamers",
  // with its own pill entry — rather than a card floating unattached while the
  // scroll-spy highlights Billing beneath it. The moment the first child is
  // added, the heading becomes their name and the pill follows; a one-time
  // renaming the parent themselves just caused.
  const gamerSections: DashboardSection[] =
    gamers.length === 0
      ? [{ id: EMPTY_GAMERS_SECTION_ID, label: t("myGamersShort") }]
      : namedGamerEntries
        ? gamers.map((gamer) => ({
            id: gamerSectionId(gamer),
            label: gamer.firstName,
            truncateLabel: true,
          }))
        : // Still the *first child's* section, which is still the first thing
          // on the page: the parent's own section sits below the children, so
          // gaining one reorders nothing above the collapse and the chip goes
          // on meaning "the top of the gamers, and scroll from there".
          [{ id: gamerSectionId(gamers[0]), label: t("myGamersShort") }];

  const sections: DashboardSection[] = [
    ...gamerSections,
    // Named for the reader, never "You" — the sections on this page are named
    // for people, and a section called "You" among three called Aino, Otso and
    // Venla would be the one heading that stopped being a name.
    ...(self === null
      ? []
      : [
          {
            id: SELF_SECTION_ID,
            label: self.firstName,
            truncateLabel: true,
          },
        ]),
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
        {gamers.length === 0 ? (
          // No children linked yet, so the page's first job is getting the
          // first one added. A full **section** — heading and pill entry —
          // rather than a page-filling empty state, which is what lets a
          // childless parent who has bought a seat of their own still have a
          // section below this one: an empty state that owned the whole page
          // would have swallowed it. The add affordance is promoted to full
          // strength here, because the quiet-tile reasoning below only holds
          // when there are children above it competing for the first read.
          <section
            id={EMPTY_GAMERS_SECTION_ID}
            aria-labelledby={`${EMPTY_GAMERS_SECTION_ID}-heading`}
            className="scroll-mt-32"
          >
            <div className="mx-auto max-w-3xl space-y-6">
              <h2
                id={`${EMPTY_GAMERS_SECTION_ID}-heading`}
                className="text-3xl font-bold"
              >
                {t("myGamers")}
              </h2>
              <NoGamersCard onAddGamer={onAddGamer} />
            </div>
          </section>
        ) : (
          <div className="space-y-16">
            {gamers.map((gamer) => (
              <section
                key={gamer.id}
                id={gamerSectionId(gamer)}
                // Named by the heading that carries the child's name — which is
                // the only thing distinguishing one of these sections from the
                // next, and which a screen-reader user tabbing the cards would
                // otherwise never be told.
                aria-labelledby={`${gamerSectionId(gamer)}-heading`}
                className="scroll-mt-32"
              >
                {/* `max-w-3xl`, the family surfaces' width: these pages are
                    designed for a phone first and the column is what widens on
                    a laptop, not the number of columns. Every section shares the
                    cap so the headings line up down the page. */}
                <div className="mx-auto max-w-3xl space-y-6">
                  {/* The heading is a real heading row, not a decorated label:
                      the face is how a parent finds their child's block while
                      scrolling past three of them, and it is the same identicon
                      the tile strip used, so nothing about recognising a child
                      changed — only where it happens. */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <Identicon id={gamer.id} size={40} />
                    </Avatar>
                    <h2
                      id={`${gamerSectionId(gamer)}-heading`}
                      className="min-w-0 break-words text-3xl font-bold"
                    >
                      {gamer.firstName}
                    </h2>
                    {/* The identity page — name, game accounts — kept as a quiet
                        affordance beside the heading: managing a child is a
                        sometimes action, and a loud button here would compete
                        with the cards for the first thing read. `ml-auto` so a
                        long name wraps against the heading's space, not the
                        link's. */}
                    <Link
                      href={`${ROUTES.customer.gamers}/${gamer.id}`}
                      aria-label={f("manageGamerAria", {
                        name: gamer.firstName,
                      })}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                        className: "ml-auto shrink-0 text-muted-foreground",
                      })}
                    >
                      <UserCog className="h-4 w-4" aria-hidden />
                      {f("manageGamer")}
                    </Link>
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
                          // Only inside the leave dialog, never on the card
                          // face: the heading two rows up already says whose
                          // this is, and the dialog is an overlay that cannot
                          // borrow it.
                          gamerFirstName={gamer.firstName}
                          onOpenPortal={onOpenPortal}
                          // Both are handed the pair, so the shell never has to
                          // re-derive which child a card belongs to from an id
                          // it would have to look up.
                          onJoinClick={
                            onJoinClick &&
                            (() => onJoinClick({ gamer, enrollment }))
                          }
                          onLeaveWaitlist={
                            onLeaveWaitlist &&
                            (() =>
                              onLeaveWaitlist({
                                seat: "gamer",
                                gamer,
                                enrollment,
                              }))
                          }
                          leavingWaitlist={leavingParticipationIds?.has(
                            enrollment.participationId,
                          )}
                          onRespondToSeatOffer={
                            onRespondToSeatOffer &&
                            ((accept) =>
                              onRespondToSeatOffer(
                                { seat: "gamer", gamer, enrollment },
                                accept,
                              ))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ))}

            {/* Adding a child sits after the last of them, deliberately quiet:
                it is a once-a-year action, and a full-strength button at the top
                of a page about the children you already have would compete with
                them for the first thing read.

                Absent at the cap rather than disabled. A disabled button is a
                promise that something would happen if the condition cleared,
                and nothing clears this one — a parent at seven children is not
                waiting for a seat, they are done. Nothing survives the change
                either way, since the count only moves when the parent
                themselves adds a child, so removing the tile shifts only what
                sits below it and only in direct answer to their own action. */}
            {canAddGamer && (
              <div className="mx-auto max-w-3xl">
                <button
                  type="button"
                  onClick={onAddGamer}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  {f("addGamer")}
                </button>
              </div>
            )}
          </div>
        )}

        {/* The parent's own seats, **after** every child's and before billing.
            The page is about the children first — that is what a parent opens
            it for — and a section about the reader placed above them would
            reorder the page around the rarest thing on it. It renders only
            when there is something in it: a standing empty heading with the
            reader's own face would be the page telling them they have signed
            up for nothing, every week, forever.

            No Manage link beside the heading. The children's goes to their
            identity page, which is a page a parent has *about a child*; the
            reader's own name, email and password live in Settings, reachable
            from the header on every page of the product, and duplicating that
            here would put two doors on one room. */}
        {self !== null && (
          <section
            id={SELF_SECTION_ID}
            aria-labelledby={`${SELF_SECTION_ID}-heading`}
            className="scroll-mt-32"
          >
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <Identicon id={self.id} size={40} />
                </Avatar>
                <h2
                  id={`${SELF_SECTION_ID}-heading`}
                  className="min-w-0 break-words text-3xl font-bold"
                >
                  {self.firstName}
                </h2>
              </div>

              <div className="space-y-3">
                {self.enrollments.map((enrollment) => (
                  <EnrollmentCard
                    key={enrollment.participationId}
                    enrollment={enrollment}
                    audience="self"
                    onOpenPortal={onOpenPortal}
                    // No `onJoinClick`, and the omission is the feature: the
                    // room is gated on the person clicking, so the button
                    // stays the plain link it is on a child's own dashboard
                    // and the Join navigates straight there.
                    onLeaveWaitlist={
                      onLeaveWaitlist &&
                      (() => onLeaveWaitlist({ seat: "self", enrollment }))
                    }
                    leavingWaitlist={leavingParticipationIds?.has(
                      enrollment.participationId,
                    )}
                    onRespondToSeatOffer={
                      onRespondToSeatOffer &&
                      ((accept) =>
                        onRespondToSeatOffer({ seat: "self", enrollment }, accept))
                    }
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        <section
          id="billing"
          aria-labelledby="billing-heading"
          className="scroll-mt-32"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 id="billing-heading" className="text-3xl font-bold">
              {t("billing")}
            </h2>
            {billingCard}
          </div>
        </section>

        {/* Last section gets viewport-height min so clicking its pill can
            actually scroll it to the top — without this the page bottoms out
            mid-scroll and the heading stays in the middle of the viewport. */}
        <section
          id="help"
          aria-labelledby="help-heading"
          className="scroll-mt-32 min-h-[calc(100svh-9rem)]"
        >
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 id="help-heading" className="text-3xl font-bold">
              {t("help")}
            </h2>
            <ParentHelpSection />
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * The Gamers section before the first child exists — usually the whole
 * dashboard, and not always: a parent who has bought a seat for themselves has
 * a section of their own beneath this one.
 *
 * Same dashed, quiet grammar as the per-child empty card — nothing is wrong,
 * there is simply nothing yet — but the add button is full strength rather
 * than a muted tile, because here it is not competing with anything above it:
 * it *is* the next step. The copy names the shop as the step *after* that one
 * and offers no link to it: a family with no child yet has nothing to enroll a
 * child in, so a browse button here would send them somewhere they cannot
 * finish.
 */
function NoGamersCard({ onAddGamer }: { onAddGamer?: () => void }) {
  const t = useTranslations("familyEnrollment");
  const f = useTranslations("family");

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("noGamers")}
        </p>
        <button
          type="button"
          onClick={onAddGamer}
          className={buttonVariants({ size: "default" })}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {f("addGamer")}
        </button>
      </CardContent>
    </Card>
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
 *
 * The CTA is a real `Link` to the storefront rather than a handler the shell
 * passes down: browsing is plain navigation to a public page, so it works
 * identically in a preview scene and after promotion, and routing it through a
 * prop would only give the live page a chance to forget to pass one.
 */
function EmptyGamerCard({ firstName }: { firstName: string }) {
  const t = useTranslations("familyEnrollment");

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("emptyState", { name: firstName })}
        </p>
        <Link
          href={ROUTES.shop}
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          {t("emptyStateCta")}
        </Link>
      </CardContent>
    </Card>
  );
}
