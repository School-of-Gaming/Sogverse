"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  CalendarClock,
  Hourglass,
  Loader2,
  MailPlus,
  MailQuestion,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";
import { seatOfferRemaining, seatOfferState } from "@/lib/seat-offer-state";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type { GroupParticipationDetail } from "@/types";
import { ParticipantChip } from "./participant-chip";
import type { RobloxRenderMap } from "@/services/roblox";
import { chipGameIdentity, type SeatOfferAvailability } from "./panel-rules";

interface WaitlistCardProps {
  /** Waitlisted gamers in derived order (waitlisted_at, id) — already ordered. */
  participations: GroupParticipationDetail[];
  /** participation ids with an in-flight transition (greyed/undraggable). */
  pendingChipIds: Set<string>;
  /** Which identity this product's chips draw, or null for a topic with none. */
  gamePlatform: GamePlatform | null;
  /** The panel's one batched Roblox lookup; undefined until it lands. */
  robloxRenders: RobloxRenderMap | undefined;
  /**
   * Whether this product can offer a queued family the seat that opened, and
   * why not when it cannot. Decided by the panel from the product's billing and
   * its group count — see `seatOfferAvailability`.
   */
  seatOffers: SeatOfferAvailability;
  /**
   * Send the offer. Omitted on a shell with no mutation behind it (a fixture),
   * and the Invite control is then absent rather than inert.
   *
   * **The one action in this panel that answers back**, and the only one that
   * needs to: everything else moves a chip, so a failure is visible as the chip
   * snapping home, while a failed invite leaves the row looking exactly as it
   * did. The promise is what tells the row's button whether the admin has to
   * press again — it rejects on failure and resolves once the snapshot carrying
   * the new stamp has landed.
   */
  onSendSeatOffer?: (participationId: string) => Promise<void>;
}

/**
 * The admin waitlist section. Renders the product's waitlisted gamers as a
 * numbered 1..N list (position = derived order, computed here as the array
 * index + 1 — never stored), reusing the same draggable ParticipantChip as the groups
 * and unassigned inbox. Three things an admin can do from here, two via drag:
 *  - drag a chip OUT to a group / the unassigned inbox → promote (seat them), or
 *    to the header's remove zone → cancel them off the product entirely;
 *  - drop an active gamer ONTO this card → demote them to the back of the line;
 *  - press **Invite** on a row → offer that family the seat that opened, and let
 *    them answer. Promotion seats somebody whether or not they can still come;
 *    an invite asks first, which is why it is a button rather than a drag.
 * This whole section is only rendered for a product that opens a waitlist (any
 * type, any billing), so every chip shown here is genuinely draggable. Whether
 * a given drag is *allowed* is the panel's call: promoting a waitlister who
 * never paid onto a paid product is refused with an explanation.
 */
export function WaitlistCard({
  participations,
  pendingChipIds,
  gamePlatform,
  robloxRenders,
  seatOffers,
  onSendSeatOffer,
}: WaitlistCardProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const { setNodeRef, isOver } = useDroppable({
    id: "waitlist-target",
    data: { waitlist: true },
  });

  const canInvite = seatOffers.kind === "available" && onSendSeatOffer;

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        "border-dashed transition-colors",
        isOver && "bg-act/5",
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="h-5 w-5 text-muted-foreground" />
          {t("waitlist.title")}
          {participations.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {participations.length}
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t("waitlist.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {participations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("waitlist.empty")}</p>
        ) : (
          <ol className="space-y-2">
            {participations.map((p, index) => (
              <li key={p.id} className="flex items-center gap-2.5">
                {/* tabular-nums keeps the rank column from reflowing as the
                    list grows past single digits. */}
                <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                {/* The chip keeps its natural, content-driven width — the same
                    size it is in a group or the unassigned inbox, so it doesn't
                    visibly resize when dragged between sections. */}
                <ParticipantChip
                  participationId={p.id}
                  participantId={p.participant_id}
                  participantEmail={p.participant_email}
                  firstName={p.participant_first_name}
                  dateOfBirth={p.participant_date_of_birth}
                  gender={p.participant_gender}
                  parentFirstName={p.parent_first_name}
                  parentLastName={p.parent_last_name}
                  {...chipGameIdentity(p, gamePlatform, robloxRenders)}
                  isPending={pendingChipIds.has(p.id)}
                />
                {/* **The seat-offer group is LAST in this row, and the order is
                    load-bearing — do not tidy it earlier.** An offer's standing
                    arrives with the snapshot and changes on refetch (a press of
                    Invite adds it; the window closing swaps it), so anything
                    rendered after it would be shoved sideways every time. Kept
                    right-packed at the end of the run, each state grows leftward
                    into the row's own slack and the rank and the chip — the two
                    things an admin is reading and pointing at — hold their
                    positions to the pixel. */}
                {seatOffers.kind === "available" && (
                  <SeatOfferControl
                    sentAt={p.seat_offer_sent_at}
                    onInvite={
                      canInvite ? () => onSendSeatOffer(p.id) : undefined
                    }
                  />
                )}
              </li>
            ))}
          </ol>
        )}

        {/* Why there is no Invite on any of these rows — said once, below the
            list rather than above it, so a group being added or deleted while
            the panel is open cannot push the queue down the page. Only worth
            saying when there is a queue to say it about, and only when it is
            actionable: the groups it is asking for are the columns directly
            above this card. A product that charges for its seat says nothing at
            all, because nothing an admin does here would change the answer. */}
        {seatOffers.kind === "needsOneGroup" && participations.length > 0 && (
          // Info tone, not muted: this line explains why the Invite control the
          // admin may be looking for is absent, and the fix it names is on this
          // very page — the owner wants that legible as guidance, not footnote.
          <p className="mt-3 flex items-start gap-1.5 text-xs text-info">
            <MailQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {t("waitlist.seatOffer.needsOneGroup", {
                count: seatOffers.groupCount,
              })}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One queued row's offer state: the Invite button, the live offer that replaces
 * it, or the silence that brings it back.
 *
 * **The live state is the double-send guard an admin can see.** There is a
 * refusal inside the RPC too, but a button that is simply not there while a
 * family is deciding says more than one that would explain itself after the
 * fact — and re-pressing would not move the deadline anyway, because a replay
 * deliberately reports the original stamp.
 */
function SeatOfferControl({
  sentAt,
  onInvite,
}: {
  sentAt: string | null;
  onInvite?: () => Promise<void>;
}) {
  const t = useTranslations("admin.products.groupsPanel.waitlist.seatOffer");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();
  // Set synchronously before the mutation, and cleared on the one outcome that
  // needs the admin to press again — a failure. On success the promise resolves
  // only after the refetched snapshot has landed, and that snapshot's row is
  // live and carries no button at all, so the flag stays set right through the
  // swap and a fast admin cannot fire a second invite into the gap.
  const [committing, setCommitting] = useState(false);

  const offer = seatOfferState(sentAt, now);

  // The deadline in the admin's own zone, with the zone named. The family's
  // mail states the same instant in the product's zone, so an admin comparing
  // the two needs to see which clock each is on.
  const deadlineLabel =
    offer.kind === "none"
      ? null
      : formatDate(offer.deadline, locale, {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone,
          timeZoneName: "short",
        });

  if (offer.kind === "live") {
    const left = seatOfferRemaining(offer.remainingMs);
    return (
      <span
        // The absolute deadline lives in the title rather than in the row: the
        // remaining time is what an admin scanning a queue actually reads, and
        // the exact instant is one hover away when they need it.
        title={t("liveTitle", { deadline: deadlineLabel ?? "" })}
        className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-info"
      >
        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {left.unit === "lastHour"
          ? t("leftLastHour")
          : left.unit === "hours"
            ? t("leftHours", { count: left.value })
            : t("leftDays", { count: left.value })}
      </span>
    );
  }

  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
      {offer.kind === "expired" && (
        <span
          title={t("expiredTitle", { deadline: deadlineLabel ?? "" })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <MailQuestion className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("noAnswer")}
        </span>
      )}
      {onInvite !== undefined && (
        <Button
          variant="outline"
          size="sm"
          disabled={committing}
          onClick={() => {
            setCommitting(true);
            onInvite().catch(() => setCommitting(false));
          }}
        >
          {committing ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <MailPlus aria-hidden />
          )}
          {offer.kind === "expired" ? t("inviteAgain") : t("invite")}
        </Button>
      )}
    </span>
  );
}
