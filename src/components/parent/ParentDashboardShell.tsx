"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AddGamerDialog } from "@/components/family/AddGamerDialog";
import { SwitchProfileDialog } from "@/components/family/SwitchProfileDialog";
import { useFamilyEnrollments } from "@/components/family/use-family-enrollments";
import type { FamilyMember } from "@/services/family";
import {
  useLeaveWaitlist,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
} from "@/services/participations";
import {
  ParentDashboardPageBody,
  type ParentEnrollmentAction,
  type ParentGamerEnrollmentAction,
} from "./parent-dashboard-page-body";

/**
 * The parent dashboard's **data shell**: everything the page body refuses to
 * know about.
 *
 * The body is presentational — it decides where a child's section sits, where
 * the add affordance goes and where a Join lands on a card, and it is handed
 * every action as a callback so that one component can serve both the live route
 * and the fixture-driven preview scene. This is the live half: the rows come in
 * server-prefetched, the roll-up runs here on the shared clock, and the three
 * things a parent can actually *do* on this page are wired to real backends.
 *
 * **The two dialogs live here, not in the sections that summon them.** Both are
 * overlays over the whole page, so neither belongs to any one part of it. The
 * add-gamer dialog is summoned from two places on this page — the quiet tile
 * after the last child, and the full-strength button on the no-children card —
 * and owning it in either would make the other reach across the page for it.
 *
 * The billing card arrives as a finished **node** from the server component
 * above, because it is one section with its own backend actions and nothing
 * about the page's shape depends on it. The children arrive as **rows** because
 * the shape of the page — how many sections, what they are called — is derived
 * from them, and that derivation has to happen where the clock and the viewer's
 * locale are.
 */
export function ParentDashboardShell({
  initialSessionRows,
  initialWaitlistRows,
  initialFamily,
  billingCard,
}: {
  /*
   * `null` on any of the three means that prefetch failed, and the roll-up hook
   * turns it into a stale seed so the client goes and asks again. Flattening it
   * to `[]` here would throw away the only thing distinguishing "signed up for
   * nothing" from "we could not find out" — and the dashboard would settle on
   * the first while meaning the second.
   */
  initialSessionRows: MyUpcomingSessionRow[] | null;
  initialWaitlistRows: MyWaitlistRow[] | null;
  initialFamily: FamilyMember[] | null;
  /** The Stripe portal card, rendered by the server component above. */
  billingCard: React.ReactNode;
}) {
  const t = useTranslations("parent");
  const { gamers, self } = useFamilyEnrollments({
    initialSessionRows,
    initialWaitlistRows,
    initialFamily,
  });
  const leaveWaitlist = useLeaveWaitlist();

  const [addGamerOpen, setAddGamerOpen] = useState(false);

  /**
   * The join a parent clicked, held until the switch dialog resolves it.
   *
   * Captured at click time rather than looked up when the dialog confirms: the
   * destination is derived from the enrollment the parent actually clicked, and
   * a refetch landing in between could reorder the list under them.
   */
  const [switchTarget, setSwitchTarget] = useState<{
    gamerId: string;
    gamerFirstName: string;
    productName: string;
    redirectUrl: string;
  } | null>(null);

  /**
   * Which cards have a leave in flight. Each id is added synchronously *before*
   * `mutate()` so it is live for the very next render, and deliberately not
   * derived from `leaveWaitlist.isPending` — that flips false the moment React
   * Query dispatches success, which is before `onSuccess` invalidates and well
   * before the refetch drops the row. See the "Loading & Disabled State" rule.
   *
   * An id is released on **either** outcome, and in both cases only once the
   * outcome is known. On an error the parent has to try again, so the card comes
   * back to life where it already was. On success the release happens after the
   * awaited invalidation has settled, by which point the ordinary path has
   * already dropped the row and unmounted the card — the release is a no-op and
   * the unmount did the work. The one path it exists for is the DELETE that
   * succeeds while its refetch fails: React Query keeps the previous rows, the
   * card is still on screen, and without this it would sit dimmed and
   * unclickable until the parent reloaded the page.
   *
   * A set, not one id: a family can be queued for several things at once, and a
   * single id would clear the first card's flag the moment a second leave
   * started — un-dimming a card whose DELETE was still running, which is exactly
   * the re-enable the rule forbids. Every update is functional so two clicks
   * landing in the same tick don't overwrite each other.
   */
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  /**
   * Release one card, leaving any sibling leave still in flight untouched. The
   * identity short-circuit keeps a release on an already-released id (or on a
   * card that has since unmounted) from pushing a pointless re-render through
   * every card on the page.
   */
  function stopLeaving(participationId: string) {
    setLeavingIds((prev) => {
      if (!prev.has(participationId)) return prev;
      const next = new Set(prev);
      next.delete(participationId);
      return next;
    });
  }

  function handleJoinClick({ gamer, enrollment }: ParentGamerEnrollmentAction) {
    // `"#"` is what the roll-up emits when there is no room to reach — an
    // in-person product, or a seat nobody has been placed in yet. The card
    // renders no live Join in either case, so this is a guard against the
    // dialog ever opening with nowhere to land rather than a path a parent
    // can take.
    if (enrollment.voiceHref === "#") return;
    setSwitchTarget({
      gamerId: gamer.id,
      gamerFirstName: gamer.firstName,
      productName: enrollment.productName,
      redirectUrl: enrollment.voiceHref,
    });
  }

  function handleLeaveWaitlist({ enrollment }: ParentEnrollmentAction) {
    // The card has already asked. This fires past its confirm dialog, so there
    // is nothing left to check — only to do.
    const { participationId } = enrollment;
    setLeavingIds((prev) => new Set(prev).add(participationId));
    leaveWaitlist.mutate(
      { participationId },
      {
        // Runs after the hook's invalidation has settled, so by here the row is
        // normally gone and this card with it. It matters when the refetch
        // failed and the card is still standing — see `stopLeaving`.
        onSuccess: () => stopLeaving(participationId),
        // Un-dim in place, and only this card — a sibling's leave may still be
        // in flight. With no toast anywhere in the app there is nothing else to
        // say what happened, so the card simply comes back to life where it
        // already was and stays clickable.
        onError: () => stopLeaving(participationId),
      },
    );
  }

  return (
    <>
      <ParentDashboardPageBody
        gamers={gamers}
        // `null` on the overwhelmingly common account: the reader gets a
        // section of their own only once they hold a seat themselves, which
        // only a for-parents product can give them.
        self={self}
        billingCard={billingCard}
        onAddGamer={() => setAddGamerOpen(true)}
        // No `onOpenPortal`: the payment badge opens the portal session for the
        // failing participation itself, which is the behaviour this page wants.
        // The prop exists for surfaces that must not reach a backend at all.
        onJoinClick={handleJoinClick}
        onLeaveWaitlist={handleLeaveWaitlist}
        leavingParticipationIds={leavingIds}
      />

      <AddGamerDialog open={addGamerOpen} onOpenChange={setAddGamerOpen} />

      {switchTarget && (
        <SwitchProfileDialog
          open
          onOpenChange={(open) => {
            if (!open) setSwitchTarget(null);
          }}
          target={{
            id: switchTarget.gamerId,
            role: "gamer",
            first_name: switchTarget.gamerFirstName,
          }}
          // The dialog POSTs the account switch and then does the full-page
          // `window.location.href` itself — the house auth rule, since the
          // cookies that route sets never reach the browser client's in-memory
          // session and a soft navigation would land the room on a stale one.
          redirectUrl={switchTarget.redirectUrl}
          title={t("switchToGamer.title", {
            name: switchTarget.gamerFirstName,
            productName: switchTarget.productName,
          })}
          oneWayWarning={t("switchToGamer.oneWayWarning")}
        />
      )}
    </>
  );
}
