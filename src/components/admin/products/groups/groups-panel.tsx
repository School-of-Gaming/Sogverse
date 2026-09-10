"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useAddGedu,
  useAdminAddParticipantToProduct,
  useAdminRemoveParticipantFromProduct,
  useCreateGroup,
  useDeleteGroup,
  useDemoteToWaitlist,
  useGroupPending,
  useMoveParticipation,
  useProductGroups,
  usePromoteFromWaitlist,
  useRemoveGedu,
  useRenameGroup,
  useSendSeatOffer,
} from "@/services/groups";
import { useSeatOfferSweepOnMount } from "@/services/participations";
import type { ProductAudience } from "@/lib/products/product-audience";
import { ParticipantPickerSheet } from "../participant-picker-sheet";
import { GeduPickerSheet } from "../gedu-picker-sheet";
import { GroupsPanelView, type GroupsPanelActions } from "./groups-panel-view";
import { SwitchClubSheet } from "./switch-club-sheet";
import { PRODUCT_TYPE_CONFIG } from "../product-type-config";
import { robloxIdsFrom } from "./panel-rules";
import { useRobloxRenders } from "@/services/roblox";
import { platformForTopic } from "@/lib/products/topics";
import { computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { BillingMode, ProductTopic, ProductType } from "@/types";

interface GroupsPanelProps {
  productId: string;
  productType: ProductType;
  /**
   * How the product is paid for — read only together with the type, to decide
   * whether this is a subscription-shaped seat. Passed straight through.
   */
  billingMode: BillingMode;
  /**
   * What the product is about — and therefore which game identity, if any, its
   * chips carry, and which platform the batched avatar lookup asks about.
   */
  topic: ProductTopic;
  /**
   * Who the product may seat. Read for one thing only: the participant picker
   * offers its Add button to the people this admits and to nobody else, so an
   * admin is never handed an action the enrollment RPC is bound to refuse.
   */
  audience: ProductAudience;
  /** Capacity cap, or null for uncapped — drives the seat-availability bar. */
  seatCount: number | null;
  /** Whether the product opens a waitlist once full — drives the seat bar copy. */
  waitlistEnabled: boolean;
  /**
   * True when this product has a joinable voice room: remote, and with a
   * session still ahead of it.
   */
  voiceAvailable: boolean;
  /** Whether the shared session window is currently open. */
  voiceIsOpen: boolean;
  /** Pre-formatted "next open" date label for the locked Join button. */
  opensDate: string;
  /** Pre-formatted "next open" time label for the locked Join button. */
  opensTime: string;
}

/**
 * The **live** groups panel: the snapshot query, the mutation hooks, the two
 * reference-data pickers, and nothing about how any of it looks.
 *
 * Everything visual moved next door to `GroupsPanelView`, which takes the
 * snapshot and an `actions` object. The split is not cosmetic: this component
 * bound eleven hooks inside itself, so the seating panel could not be rendered
 * from plain data at all — every state it can be in was reachable only by
 * driving the live app into it. With the hooks held on this side, the view is a
 * function of its props, which is what makes those states inspectable and what
 * would let a fixture-fed shell mount it later. Behaviour is unchanged; what
 * moved is only which side of the boundary each piece sits on.
 *
 * The two picker sheets stay here, because they are the only parts that read
 * reference data of their own (every gedu, every eligible participant). They are
 * handed to the view through its `overlays` slot rather than rendered around it,
 * so the view keeps deciding where in the dnd tree an always-mounted subtree may
 * sit.
 */
export function GroupsPanel({
  productId,
  productType,
  billingMode,
  topic,
  audience,
  seatCount,
  waitlistEnabled,
  voiceAvailable,
  voiceIsOpen,
  opensDate,
  opensTime,
}: GroupsPanelProps) {
  const t = useTranslations("admin.products.groupsPanel");
  const timeZone = useTimezone();
  const { data: snapshot, isLoading } = useProductGroups(productId);
  const pending = useGroupPending(productId);

  const move = useMoveParticipation(productId);
  const rename = useRenameGroup(productId);
  const createGroup = useCreateGroup(productId);
  const addGedu = useAddGedu(productId);
  const removeGedu = useRemoveGedu(productId);
  const deleteGroup = useDeleteGroup(productId);
  const addParticipant = useAdminAddParticipantToProduct(productId);
  const removeParticipant = useAdminRemoveParticipantFromProduct(productId);
  const promote = usePromoteFromWaitlist(productId);
  const demote = useDemoteToWaitlist(productId);
  const sendSeatOffer = useSendSeatOffer(productId);

  // Opening this panel is one of the two observations that notice a seat offer
  // has run out — there is no cron job, by design, and this is an admin looking
  // at the exact queue an unanswered offer is sitting in. Fire-and-forget: it
  // claims and mails nothing in the common case, and invalidates on its own
  // when it does claim something.
  useSeatOfferSweepOnMount();

  const [pickerForGroupId, setPickerForGroupId] = useState<string | null>(null);
  const [participantPickerOpen, setParticipantPickerOpen] = useState(false);
  // The seat whose club switch is open, and — separately — whether that switch
  // is currently moving money. The sheet reports the second back rather than
  // the panel inferring it: React Query's pending flag clears before the sheet
  // closes, and a chip that un-greys a frame early is one an admin can start
  // dragging mid-switch.
  //
  // The seat and the open flag are two pieces of state rather than one nullable
  // id, because the sheet is always mounted and closes by animating out: the
  // seat it was about has to stay readable for as long as the exit runs, so
  // closing clears the flag and leaves the id where it is.
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchCommitting, setSwitchCommitting] = useState(false);

  // The seat the switch sheet is about, read off the same snapshot that drew
  // its chip — so the sheet's age line and the chip are one fact. It outlives
  // the close on purpose (see above), which is what keeps the gamer's name in
  // the description from blanking mid-animation. Only active seats are
  // searched: a waitlisted row never carries a subscription and never offers
  // the control.
  const switching = useMemo(() => {
    if (!snapshot || switchingId === null) return null;
    const active = [
      ...snapshot.groups.flatMap((g) => g.participations),
      ...snapshot.unassigned,
    ];
    const row = active.find((p) => p.id === switchingId);
    if (!row) return null;
    return {
      id: row.id,
      participantId: row.participant_id,
      name: row.participant_first_name,
      // Null on an adult seat, which carries no date of birth — the sheet then
      // states the club's age range alone rather than beside a guessed age.
      age:
        row.participant_date_of_birth === null
          ? null
          : computeAge(row.participant_date_of_birth, timeZone),
    };
  }, [snapshot, switchingId, timeZone]);


  // Anyone already holding a seat blocks a re-add via the picker.
  const enrolledParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    if (!snapshot) return ids;
    for (const g of snapshot.groups) {
      for (const p of g.participations) ids.add(p.participant_id);
    }
    for (const p of snapshot.unassigned) ids.add(p.participant_id);
    return ids;
  }, [snapshot]);

  // One Gedu per product (DB unique constraint), so the picker excludes anyone
  // already assigned to any group. Removals aren't optimistic, so a Gedu mid-
  // removal stays excluded until the settle refetch — correct.
  const allAssignedGeduIds = useMemo(() => {
    if (!snapshot) return [];
    const ids = new Set<string>();
    for (const g of snapshot.groups) {
      for (const ge of g.gedus) ids.add(ge.id);
    }
    return Array.from(ids);
  }, [snapshot]);

  // One batched lookup for the entire snapshot — groups, inbox and waitlist
  // together — and only on a Roblox product; every other platform hands back an
  // empty list, which disables the query outright. Per-chip resolution is the
  // shape this panel exists as the counter-example to: fifty-plus chips against
  // a per-IP budget the whole serverless fleet shares.
  const gamePlatform = platformForTopic(topic);
  const robloxIds = useMemo(
    () => robloxIdsFrom(snapshot, gamePlatform),
    [snapshot, gamePlatform],
  );
  const { data: robloxRenders } = useRobloxRenders(robloxIds, "head");

  const actions: GroupsPanelActions = {
    onMove: (participationId, toGroupId) =>
      move.mutate({ participationId, toGroupId }),
    onPromote: (participationId, toGroupId) =>
      promote.mutate({ participationId, toGroupId }),
    onDemote: (participationId) => demote.mutate({ participationId }),
    onRemoveParticipant: (participationId) =>
      removeParticipant.mutate({ participationId }),
    onRenameGroup: (groupId, name) => rename.mutate({ groupId, name }),
    onDeleteGroup: (groupId) => deleteGroup.mutate({ groupId }),
    onCreateGroup: (name) => createGroup.mutate({ name }),
    onRemoveGedu: (groupId, geduId) => removeGedu.mutate({ groupId, geduId }),
    onRequestAddGedu: setPickerForGroupId,
    onRequestAddParticipant: () => setParticipantPickerOpen(true),
    // `mutateAsync`, unlike every intent above it: the row's Invite button has
    // to know whether the offer went out, because a failed one leaves the row
    // looking exactly as it did and the admin has to be able to press again.
    onSendSeatOffer: (participationId) =>
      sendSeatOffer.mutateAsync({ participationId }),
    onRequestSwitchClub: (participationId) => {
      setSwitchingId(participationId);
      setSwitchOpen(true);
    },
  };

  const groupBeingStaffed = snapshot?.groups.find(
    (g) => g.id === pickerForGroupId,
  );

  return (
    <GroupsPanelView
      snapshot={snapshot}
      isLoading={isLoading}
      pending={pending}
      switchingParticipationId={switchCommitting ? switchingId : null}
      productType={productType}
      billingMode={billingMode}
      topic={topic}
      seatCount={seatCount}
      waitlistEnabled={waitlistEnabled}
      voiceAvailable={voiceAvailable}
      voiceIsOpen={voiceIsOpen}
      opensDate={opensDate}
      opensTime={opensTime}
      robloxRenders={robloxRenders}
      // Built from the type's own route slug, exactly as this page's other
      // admin links are: `/admin/<slug>/<product>/groups/<group>`.
      groupHref={(id) =>
        `/admin/${PRODUCT_TYPE_CONFIG[productType].routeSlug}/${productId}/groups/${id}`
      }
      actions={actions}
      overlays={
        <>
          <ParticipantPickerSheet
            open={participantPickerOpen}
            onOpenChange={setParticipantPickerOpen}
            audience={audience}
            enrolledParticipantIds={enrolledParticipantIds}
            onAddParticipant={async (participantId) => {
              await addParticipant.mutateAsync(participantId);
            }}
          />

          <GeduPickerSheet
            open={pickerForGroupId !== null}
            onOpenChange={(open) => {
              if (!open) setPickerForGroupId(null);
            }}
            title={t("picker.addTitle", {
              name: groupBeingStaffed?.name ?? "",
            })}
            description={t("picker.addDescription")}
            excludeIds={allAssignedGeduIds}
            onSelect={(gedu) => {
              if (!pickerForGroupId) return;
              addGedu.mutate({
                groupId: pickerForGroupId,
                geduId: gedu.id,
                firstName: gedu.first_name,
                email: gedu.email,
              });
              setPickerForGroupId(null);
            }}
          />

          {/* The club switch. An overlay like the two pickers above it, and
              here for the same reason: it reads reference data of its own
              (every consumer club on the platform) and talks to Stripe, neither
              of which the presentational panel knows anything about. Mounted
              from the start and driven by `open`, exactly as they are — a sheet
              mounted already open plays no enter animation and, unmounted on
              close, no exit one either. */}
          <SwitchClubSheet
            open={switchOpen}
            onOpenChange={(next) => {
              if (!next) {
                setSwitchOpen(false);
                setSwitchCommitting(false);
              }
            }}
            productId={productId}
            participationId={switching?.id ?? ""}
            participantId={switching?.participantId ?? ""}
            gamerName={switching?.name ?? ""}
            gamerAge={switching?.age ?? null}
            onCommittingChange={setSwitchCommitting}
          />
        </>
      }
    />
  );
}
