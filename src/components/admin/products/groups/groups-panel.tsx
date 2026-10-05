"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  useAddGedu,
  useAddTrainee,
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
  useRemoveTrainee,
  useRenameGroup,
  useSendSeatOffer,
} from "@/services/groups";
import { useSeatOfferSweepOnMount } from "@/services/participations";
import type { ProductAudience } from "@/lib/products/product-audience";
import { ParticipantPickerSheet } from "../participant-picker-sheet";
import {
  GeduPickerSheet,
  type GeduPickerSeat,
  type GeduPickerUnavailability,
} from "../gedu-picker-sheet";
import { GroupsPanelView, type GroupsPanelActions } from "./groups-panel-view";
import { SwitchClubSheet } from "./switch-club-sheet";
import { robloxIdsFrom } from "./panel-rules";
import { useRobloxRenders } from "@/services/roblox";
import { platformForTopic } from "@/lib/products/topics";
import { computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type {
  BillingMode,
  GeduQualification,
  ProductTag,
  ProductTopic,
  ProductType,
} from "@/types";
import { ROUTES } from "@/lib/constants";
import { productRequiredQualifications } from "@/lib/products/required-qualifications";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MissingQualificationsWarning } from "@/components/admin/missing-qualifications-warning";

interface GroupsPanelProps {
  productId: string;
  productType: ProductType;
  /**
   * The product's tag, null when untagged. Read only together with the type,
   * for the gedu qualifications a staff seat on it requires.
   */
  tag: ProductTag | null;
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
 * people of their own — a page at a time off the shared admin people list,
 * searched and filtered server-side, and **not until each sheet has been opened
 * once**. They are in the tree from this component's first render so they can
 * animate open and closed, and each latches "has been opened" to keep its read
 * off a product page where nobody touched it. They are handed to the view
 * through its `overlays` slot rather than rendered around it, so the view keeps
 * deciding where in the dnd tree an always-mounted subtree may sit.
 */
export function GroupsPanel({
  productId,
  productType,
  tag,
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
  const addTrainee = useAddTrainee(productId);
  const removeTrainee = useRemoveTrainee(productId);
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
  // Which kind of seat the gedu picker is filling. Set on the request and
  // never cleared on close, so a sheet animating out keeps the rows it opened
  // with rather than re-deciding which of them are selectable mid-exit.
  const [pickerSeat, setPickerSeat] = useState<GeduPickerSeat>("staff");
  // A staff pick lacking a required qualification, held for the confirm that
  // names the gap — the one add that is asked about before it is made.
  const [unqualifiedAssignment, setUnqualifiedAssignment] = useState<{
    assignment: Parameters<typeof addGedu.mutate>[0];
    missing: readonly GeduQualification[];
  } | null>(null);
  const requiredQualifications = useMemo(
    () => productRequiredQualifications({ product_type: productType, tag }),
    [productType, tag],
  );
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

  // One seat per gedu per product, whichever kind — assigned or trainee — so
  // the picker refuses anyone already seated on any group, in either mode, and
  // says which seat they hold, which is what the reason in this map is for.
  // Removals aren't optimistic, so a gedu mid-removal stays refused until the
  // settle refetch — correct.
  const alreadySeated = useMemo(() => {
    const byId = new Map<string, GeduPickerUnavailability>();
    if (!snapshot) return byId;
    for (const g of snapshot.groups) {
      for (const ge of g.gedus) byId.set(ge.id, "assigned");
      for (const tr of g.trainees) byId.set(tr.id, "trainee");
    }
    return byId;
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
    // A role change IS an add: the assignment writer upserts on (group, gedu)
    // and updates the role, so the pill's select posts through the same
    // mutation the picker does — which is also why the optimistic patch moves
    // an existing pill's role rather than no-opping on a duplicate id. The
    // name and address come off the snapshot the pill was drawn from, so the
    // patch redraws the same person rather than blanking them for a frame.
    onSetGeduRole: (groupId, geduId, role) => {
      const gedu = snapshot?.groups
        .find((g) => g.id === groupId)
        ?.gedus.find((ge) => ge.id === geduId);
      if (!gedu) return;
      addGedu.mutate({
        groupId,
        geduId,
        firstName: gedu.first_name,
        email: gedu.email,
        role,
      });
    },
    onRequestAddGedu: (groupId) => {
      setPickerSeat("staff");
      setPickerForGroupId(groupId);
    },
    onRequestAddTrainee: (groupId) => {
      setPickerSeat("trainee");
      setPickerForGroupId(groupId);
    },
    onRemoveTrainee: (groupId, geduId) =>
      removeTrainee.mutate({ groupId, geduId }),
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
        ROUTES.admin.productGroup(productType, productId, id)
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
            title={
              pickerSeat === "trainee"
                ? t("picker.addTraineeTitle", {
                    name: groupBeingStaffed?.name ?? "",
                  })
                : t("picker.addTitle", {
                    name: groupBeingStaffed?.name ?? "",
                  })
            }
            description={
              pickerSeat === "trainee"
                ? t("picker.addTraineeDescription")
                : t("picker.addDescription")
            }
            unavailable={alreadySeated}
            seat={pickerSeat}
            offerTraineeInstead
            requiredQualifications={requiredQualifications}
            onSelect={(gedu, missing) => {
              if (!pickerForGroupId) return;
              if (pickerSeat === "trainee") {
                addTrainee.mutate({
                  groupId: pickerForGroupId,
                  geduId: gedu.id,
                  firstName: gedu.first_name,
                  email: gedu.email,
                });
                setPickerForGroupId(null);
                return;
              }
              // No role step: an add assigns as `primary`, which is what every
              // assignment was before roles existed and what nearly all of them
              // stay. The pill's own select is where the other value is chosen,
              // one press later, rather than in a question every add has to
              // answer.
              const assignment: Parameters<typeof addGedu.mutate>[0] = {
                groupId: pickerForGroupId,
                geduId: gedu.id,
                firstName: gedu.first_name,
                email: gedu.email,
                role: "primary",
              };
              setPickerForGroupId(null);
              // A gedu lacking a qualification the product requires is
              // assigned over a confirm that names the gap; anyone else is
              // assigned on the press, as every add always was.
              if (missing.length > 0) {
                setUnqualifiedAssignment({ assignment, missing });
                return;
              }
              addGedu.mutate(assignment);
            }}
          />

          {/* Not held: the assignment is optimistic, so the pill is on the
              group the moment the press lands and the dialog has nothing left
              to wait for. Mounted only while asked, which is what clears the
              question for the next pick. */}
          {unqualifiedAssignment !== null && (
            <ConfirmDialog
              open
              onOpenChange={(next) => {
                if (!next) setUnqualifiedAssignment(null);
              }}
              title={t("unqualified.title")}
              description={t("unqualified.body")}
              confirmLabel={t("unqualified.action")}
              confirmVariant="default"
              onConfirm={() => addGedu.mutate(unqualifiedAssignment.assignment)}
            >
              <MissingQualificationsWarning
                missing={unqualifiedAssignment.missing}
              />
            </ConfirmDialog>
          )}

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
