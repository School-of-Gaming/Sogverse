"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AlertTriangle, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { SeatAvailabilityBar } from "@/components/public/products/seat-availability-bar";
import { BlockedMoveDialog } from "./blocked-move-dialog";
import { ParticipantChip } from "./participant-chip";
import { GroupColumn } from "./group-column";
import {
  canCompEnroll,
  chipGameIdentity,
  dragSubjectsFrom,
  isSubscriptionShaped,
  readDropData,
  readChipDragData,
  resolveDrop,
  showUnassignedSection,
  type BlockedDropReason,
} from "./panel-rules";
import { UnassignedCard } from "./unassigned-card";
import { WaitlistCard } from "./waitlist-card";
import type { RobloxRenderMap } from "@/services/roblox";
import { platformForTopic } from "@/lib/products/topics";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type { GroupPending } from "@/services/groups";
import type {
  BillingMode,
  ProductGroupsSnapshot,
  ProductTopic,
  ProductType,
} from "@/types";

/**
 * Everything the groups panel *does*, as callbacks the caller owns.
 *
 * The panel used to bind these to mutation hooks itself, which made it the one
 * page-sized component on the admin product surface that could not be fed a
 * fixture — and therefore the one that could not be looked at in a preview
 * scene. That is the separation-of-concerns smell the scene system exists to
 * catch, so the split is the fix rather than a workaround: the view resolves a
 * drag into an *intent* and says what it is, and whether that intent becomes an
 * RPC, a local `setState`, or nothing at all belongs to whoever mounted it.
 */
export interface GroupsPanelActions {
  onMove: (participationId: string, toGroupId: string | null) => void;
  onPromote: (participationId: string, toGroupId: string | null) => void;
  onDemote: (participationId: string) => void;
  onRemoveParticipant: (participationId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onCreateGroup: (name: string) => void;
  onRemoveGedu: (groupId: string, geduId: string) => void;
  /** Ask the shell to open its gedu picker for this group. */
  onRequestAddGedu: (groupId: string) => void;
  /** Ask the shell to open its participant picker. */
  onRequestAddParticipant: () => void;
}

interface GroupsPanelViewProps {
  /**
   * The product's groups, inbox and waitlist. `undefined` is "not here yet" and
   * is what the loading skeleton renders from; an empty snapshot is a real,
   * different state and renders the empty card.
   */
  snapshot: ProductGroupsSnapshot | undefined;
  isLoading: boolean;
  /** Which rows have a write in flight — greys and disables them. */
  pending: GroupPending;
  productType: ProductType;
  /**
   * How the product is paid for. Only ever read together with the type, and
   * only to answer one question: is this a subscription-shaped seat (a club that
   * charges monthly)? That decides whether an admin may comp-enroll, and it is
   * half of the promote refusal.
   */
  billingMode: BillingMode;
  /** What the product is about, and therefore which identity its chips carry. */
  topic: ProductTopic;
  seatCount: number | null;
  waitlistEnabled: boolean;
  voiceAvailable: boolean;
  voiceIsOpen: boolean;
  opensDate: string;
  opensTime: string;
  /** The shell's one batched Roblox lookup; undefined until (or unless) it lands. */
  robloxRenders?: RobloxRenderMap;
  /**
   * Where a group's own details page lives, given its id. Omitted on a shell
   * with no such page to point at, and each column then renders no link — the
   * board keeps working as a board.
   */
  groupHref?: (groupId: string) => string;
  actions: GroupsPanelActions;
  /**
   * The shell's own overlays — the participant and gedu pickers.
   *
   * Rendered here as a **sibling of the DndContext**, never inside it: dnd-kit
   * re-renders subscribed children on every pointer move, and a heavy
   * always-mounted subtree under it tanks drag responsiveness. Taking them as a
   * slot is what lets the shell own the reference queries they need while this
   * component keeps deciding where in the tree they may sit.
   */
  overlays?: ReactNode;
}

// The drag/drop payload readers and the rule deciding what a drop does live in
// ./panel-rules — pure, and tested there.

// Renders the chip in the floating overlay during a drag. Reads `active` from
// dnd-kit context so we don't propagate it through props (which would re-render
// the entire panel on every pointer move).
function DragOverlayContent({
  snapshot,
  gamePlatform,
  robloxRenders,
}: {
  snapshot: ProductGroupsSnapshot | undefined;
  gamePlatform: GamePlatform | null;
  robloxRenders: RobloxRenderMap | undefined;
}) {
  const { active } = useDndContext();

  const overlay = useMemo(() => {
    if (!active || !snapshot) return null;
    const data = readChipDragData(active.data.current);
    if (!data) return null;

    const all = [
      ...snapshot.unassigned,
      ...snapshot.groups.flatMap((g) => g.participations),
      ...snapshot.waitlist,
    ];
    return all.find((p) => p.id === data.participationId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on active?.id rather than the ref-changing `active` object
  }, [active?.id, snapshot]);

  if (!overlay) return null;

  // `drag-ghost` (globals.css) makes the lifted chip read as grabbing — it's the
  // element under the pointer mid-drag, and overrides the chip's own grab.
  return (
    <div className="drag-ghost">
      <ParticipantChip
        participationId={overlay.id}
        participantId={overlay.participant_id}
        participantEmail={overlay.participant_email}
        firstName={overlay.participant_first_name}
        dateOfBirth={overlay.participant_date_of_birth}
        gender={overlay.participant_gender}
        parentFirstName={overlay.parent_first_name}
        parentLastName={overlay.parent_last_name}
        // The lifted chip is the same chip: same identity, resolved from the
        // same batch, so nothing about it changes as it leaves the column.
        {...chipGameIdentity(overlay, gamePlatform, robloxRenders)}
      />
    </div>
  );
}

// The enrolment action in the panel header. At rest it's the "Add participant"
// button; the moment a chip is being dragged it becomes a destructive "Remove"
// drop zone. The swap is user-initiated (by the drag itself), so it doesn't
// violate the no-in-place-reflow rule. It lives inside the DndContext and
// subscribes to dnd state, so only this node re-renders on pointer move — not
// the whole panel.
function HeaderParticipantAction({ onAdd }: { onAdd: () => void }) {
  const t = useTranslations("admin.products.groupsPanel");
  const { active } = useDndContext();
  const draggingChip = readChipDragData(active?.data.current) !== null;

  const { setNodeRef, isOver } = useDroppable({
    id: "remove-gamer-zone",
    data: { remove: true },
  });

  if (draggingChip) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-dashed border-destructive px-3 py-1.5 text-sm font-medium text-destructive transition-colors",
          isOver && "bg-destructive/10",
        )}
      >
        <Trash2 className="h-4 w-4" />
        {t("unassigned.removeParticipant")}
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={onAdd}>
      <UserPlus className="mr-1 h-4 w-4" />
      {t("unassigned.addParticipant")}
    </Button>
  );
}

/**
 * The groups panel, **presentational**: a snapshot in, intents out.
 *
 * It owns everything about how seating looks and how a drag resolves — the
 * columns, the inbox, the waitlist, the drag overlay, the refusal dialog and the
 * removal confirm — and nothing about where the data came from or what a
 * confirmed action writes. That is what makes it renderable from plain data: a
 * snapshot and a set of callbacks are the whole of its input, so any state it
 * can be in can be constructed rather than driven to. Today one shell mounts it
 * — the live panel beside it, which binds every action to its mutation hook —
 * and a fixture-fed one is left for whenever the design next needs iterating on.
 */
export function GroupsPanelView({
  snapshot,
  isLoading,
  pending,
  productType,
  billingMode,
  topic,
  seatCount,
  waitlistEnabled,
  voiceAvailable,
  voiceIsOpen,
  opensDate,
  opensTime,
  robloxRenders,
  groupHref,
  actions,
  overlays,
}: GroupsPanelViewProps) {
  const t = useTranslations("admin.products.groupsPanel");

  // The gamer pending removal-confirmation (id + name for the dialog copy), or
  // null when the confirm dialog is closed. The action only fires on confirm.
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(
    null,
  );
  // A drop the panel refused, held only to explain itself. Nothing was written
  // when this is set — the dialog is acknowledge-only.
  const [blocked, setBlocked] = useState<{
    reason: BlockedDropReason;
    name: string;
  } | null>(null);

  // The type and the billing meet here and nowhere else in the panel: both the
  // add-gamer affordance and the promote refusal ask the same question of them
  // — is this seat one that only a Stripe subscription can create?
  const subscriptionShaped = isSubscriptionShaped(productType, billingMode);
  const canAddGamer = canCompEnroll(productType, billingMode);

  // Everything a drop needs to know about each chip — where it sits, whether a
  // live subscription stands behind its seat, whether money ever arrived for it
  // — read off the one snapshot.
  const dragSubjects = useMemo(() => dragSubjectsFrom(snapshot), [snapshot]);

  // Which identity every chip on this panel is about — one answer for the whole
  // product, from its topic. Most topics resolve to `null` and the chips simply
  // carry no identity row.
  const gamePlatform = platformForTopic(topic);

  // Seats taken = every active participation (groups + unassigned; the snapshot
  // only ever holds active rows there).
  const activeCount = useMemo(() => {
    if (!snapshot) return 0;
    return (
      snapshot.groups.reduce((n, g) => n + g.participations.length, 0) +
      snapshot.unassigned.length
    );
  }, [snapshot]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { over, active } = event;
    if (!over) return;

    const dragData = readChipDragData(active.data.current);
    const dropData = readDropData(over.data.current);
    if (!dragData || !dropData) return;

    const { participationId, firstName } = dragData;
    // Every chip on screen came out of this snapshot, so a miss here means the
    // drag outlived the row it started on — write nothing.
    const subject = dragSubjects.get(participationId);
    if (!subject) return;

    const outcome = resolveDrop(dropData, subject, subscriptionShaped);

    switch (outcome.kind) {
      case "none":
        return;
      case "remove":
        // Admin removal is a hard delete with no refund — confirm before
        // acting. Stash the chip's identity for the dialog copy.
        setRemoving({ id: participationId, name: firstName });
        return;
      case "blocked":
        // The money says no. Nothing is written; the dialog explains the manual
        // path and the chip snaps back to where it was.
        setBlocked({ reason: outcome.reason, name: firstName });
        return;
      case "demote":
        actions.onDemote(participationId);
        return;
      case "promote":
        // Give them a seat. No confirm: the header's seat count already shows
        // the admin where capacity stands (over-capacity included), and the
        // action is reversible.
        actions.onPromote(participationId, outcome.toGroupId);
        return;
      case "move":
        actions.onMove(participationId, outcome.toGroupId);
        return;
    }
  };

  const handleAddGroup = () => {
    // Default name: "Group A", "Group B", … indexed by the current group count
    // (which includes any optimistic cards already on screen).
    const liveCount = snapshot?.groups.length ?? 0;
    const letter = String.fromCharCode(65 + liveCount);
    actions.onCreateGroup(t("group.defaultName", { letter }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
            <div className="h-20 animate-pulse rounded-lg bg-muted" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const groups = snapshot?.groups ?? [];
  const unassigned = snapshot?.unassigned ?? [];
  const waitlist = snapshot?.waitlist ?? [];
  const hasGroups = groups.length > 0;

  // Capacity context. The bar renders nothing when uncapped (seatCount null).
  const seatsLeft = seatCount !== null ? Math.max(0, seatCount - activeCount) : 0;

  // Over-capacity is a legitimate state: a paid product's cap is soft (anyone
  // who passed the gate and completed Checkout keeps their seat), and an admin
  // may promote past it deliberately. The shared bar clamps at zero because it
  // serves families, so the panel states the honest numbers itself instead.
  const overfill =
    seatCount !== null && activeCount > seatCount
      ? { total: seatCount, over: activeCount - seatCount }
      : null;

  // Greyed/undraggable chips: an in-flight move/promote/demote OR removal.
  const busyChipIds = new Set<string>([...pending.moves, ...pending.removes]);

  // Whether the inbox card is drawn at all. On a product where every arriving
  // seat is written straight into its only group, an empty inbox is a box
  // nothing can land in, so it is simply not there — the rule is said by the
  // absence rather than by a caption. Anyone actually waiting brings it back.
  //
  // Read from the snapshot itself rather than from the `groups` fallback above:
  // with no snapshot (the query errored) an empty list is the absence of an
  // answer, not "this product has no groups", so the card is drawn and the
  // panel's own error/empty state is what the admin reads.
  //
  // The two inputs that can HIDE the card — the group count and the inbox count
  // — both come out of the one snapshot this render drew, so they cannot
  // disagree with each other and the first paint is already right. `billingMode`
  // is a prop off the product row, a *separate* cache entry that may be stale
  // relative to the snapshot, but it can never hide anything by itself: the
  // inbox count is consulted first. A stale "paid" only draws a card that did
  // not need drawing, which is harmless; a stale "free" cannot hide rows the
  // database really left unassigned, because those rows are in this snapshot
  // and their presence short-circuits to true before billing is read at all.
  // A row's own presence outranks the billing half, in every staleness
  // direction.
  const showUnassigned = snapshot
    ? showUnassignedSection(
        billingMode,
        snapshot.groups,
        snapshot.unassigned.length,
      )
    : true;

  return (
    <div className="space-y-3">
      {/* The header is inside the DndContext so the "Add participant" button can
          swap to a "Remove participant" drop zone mid-drag
          (HeaderParticipantAction). The shell's picker sheets are deliberately
          kept OUTSIDE it — see the `overlays` slot below. */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Users className="h-5 w-5 text-muted-foreground" />
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Capacity context — the same bar the shop shows, fed from the live
                snapshot's active count. Past the cap the bar has nothing left to
                say ("0 remaining" is true of 20/20 and 22/20 alike), so the
                overfill line takes the same slot — same width, same row, so
                nothing beside it moves. */}
            {overfill ? (
              <p className="hidden w-80 items-center gap-1.5 text-xs font-medium text-warning sm:flex">
                <Users className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate tabular-nums">
                  {t("seatsOverfilled", {
                    count: activeCount,
                    total: overfill.total,
                    over: overfill.over,
                  })}
                </span>
              </p>
            ) : (
              <SeatAvailabilityBar
                seatCount={seatCount}
                seatsLeft={seatsLeft}
                waitlistEnabled={waitlistEnabled}
                className="hidden w-80 sm:block"
              />
            )}
            {canAddGamer && (
              <HeaderParticipantAction onAdd={actions.onRequestAddParticipant} />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddGroup}
              disabled={pending.creating}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("addGroup")}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {/* Hidden only on a product that auto-places into its single group
              with nobody waiting — which also removes the inbox drop target
              there, deliberately: a member dragged off a column has the remove
              zone (and the waitlist, where one is open) and nowhere else, and
              resolveDrop is never asked about a target that isn't mounted. To
              park a gamer on such a product an admin adds a second group (the
              card reappears), drags them into the card, and deletes the extra
              group — the card then stays, because it is no longer empty.

              The card sits ABOVE the group columns, so mounting or unmounting
              it moves the whole board, and it does so at two moments: at drop
              time, when the optimistic move of the last inbox chip unmounts the
              card in the same commit; and at settle time, when a group delete
              or a participant removal refetches and pulls the board up. Both
              are the direct result of the admin's own action, which the layout
              rules permit, and the jump is deliberately left unanimated. The
              honest edge: with refetch-on-focus, another admin seating the last
              inbox row makes the card vanish on this admin's next window focus.
              That is the same class as the chip reordering this panel already
              does on refocus, and is accepted on the same terms. */}
          {showUnassigned && (
            <UnassignedCard
              participations={unassigned}
              pendingChipIds={busyChipIds}
              gamePlatform={gamePlatform}
              robloxRenders={robloxRenders}
            />
          )}

          {hasGroups ? (
            groups.map((g) => (
              <GroupColumn
                key={g.id}
                group={g}
                pending={pending}
                gamePlatform={gamePlatform}
                robloxRenders={robloxRenders}
                voiceAvailable={voiceAvailable}
                voiceIsOpen={voiceIsOpen}
                opensDate={opensDate}
                opensTime={opensTime}
                groupHref={groupHref}
                onRename={actions.onRenameGroup}
                onDelete={actions.onDeleteGroup}
                onAddGedu={actions.onRequestAddGedu}
                onRemoveGedu={actions.onRemoveGedu}
              />
            ))
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-sm font-medium">{t("empty.title")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("empty.description")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleAddGroup}
                  disabled={pending.creating}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("empty.addFirst")}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Waitlist — rendered for any product that opens one, whatever its
              type or billing. Gating on the capability rather than the type
              keeps a product with the waitlist toggle off from exposing a drop
              target that would demote actives onto a waitlist it doesn't offer. */}
          {waitlistEnabled && (
            <WaitlistCard
              participations={waitlist}
              pendingChipIds={busyChipIds}
              gamePlatform={gamePlatform}
              robloxRenders={robloxRenders}
            />
          )}
        </div>

        <DragOverlay>
          <DragOverlayContent
            snapshot={snapshot}
            gamePlatform={gamePlatform}
            robloxRenders={robloxRenders}
          />
        </DragOverlay>
      </DndContext>

      {/* The shell's pickers, as siblings of the DndContext rather than children
          of it — dnd-kit re-renders subscribed children on every pointer move. */}
      {overlays}

      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          title={t("removeParticipant.confirmTitle", { name: removing.name })}
          description={t("removeParticipant.confirmDescription", {
            name: removing.name,
          })}
          confirmLabel={t("removeParticipant.confirmCta")}
          onConfirm={() => actions.onRemoveParticipant(removing.id)}
        >
          <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-2.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{t("removeParticipant.noRefundWarning")}</span>
          </div>
        </ConfirmDialog>
      )}

      {blocked && (
        <BlockedMoveDialog
          reason={blocked.reason}
          gamerName={blocked.name}
          onClose={() => setBlocked(null)}
        />
      )}
    </div>
  );
}
