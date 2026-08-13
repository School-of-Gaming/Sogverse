import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { GroupsPanel } from "@/components/admin/products/groups/groups-panel";
import type {
  BillingMode,
  ProductGroupsSnapshot,
  ProductType,
} from "@/types";

/**
 * The wiring the rules suite cannot see.
 *
 * `panel-rules` is pure and exhaustively tested on its own, so this file
 * deliberately does not re-test the decision table. What it pins is the two
 * things that live only in the panel and that no amount of rule testing would
 * catch:
 *
 *  1. **The product's own facts reach the rule.** The panel receives
 *     `productType` and `billingMode` as props and has to fold them into the
 *     one question `resolveDrop` asks. Drop the fold and every drag would be
 *     decided as if the product were a paid club (or as if it were never one),
 *     with the rules suite still green.
 *  2. **A blocked outcome writes nothing.** The refusal is only worth anything
 *     if the drag handler stops before the mutation — a dialog rendered *after*
 *     a promote had already fired would look identical on screen.
 *
 * Everything a drag needs to know is read off the snapshot, so the drag itself
 * is delivered by calling the handler dnd-kit would call. Simulating pointer
 * events would be testing dnd-kit.
 */

// --------------------------------------------------------------------------
// dnd-kit: replaced wholesale. `DndContext` hands its onDragEnd out through
// this ref so a test can deliver a drop directly.
// --------------------------------------------------------------------------
type DragEnd = (event: unknown) => void;
const dnd: { onDragEnd: DragEnd | null } = { onDragEnd: null };

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: ReactNode;
    onDragEnd: DragEnd;
  }) => {
    dnd.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PointerSensor: function PointerSensor() {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  useDraggable: () => ({
    setNodeRef: () => {},
    attributes: {},
    listeners: {},
    transform: null,
    isDragging: false,
  }),
  useDndContext: () => ({ active: null }),
}));

// Keys echo, so assertions name the copy the panel reached for rather than the
// wording in messages/.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

// The presentational children are not what is under test, and stubbing them
// keeps this file about the drag handler. The refusal dialog is deliberately
// NOT stubbed: "the dialog opened" is half the claim.
vi.mock("@/components/admin/products/groups/group-column", () => ({
  GroupColumn: () => <div data-testid="group-column" />,
}));
vi.mock("@/components/admin/products/groups/unassigned-card", () => ({
  UnassignedCard: () => <div data-testid="unassigned-card" />,
}));
vi.mock("@/components/admin/products/groups/waitlist-card", () => ({
  WaitlistCard: () => <div data-testid="waitlist-card" />,
}));
vi.mock("@/components/admin/products/participant-picker-sheet", () => ({
  ParticipantPickerSheet: () => null,
}));
vi.mock("@/components/admin/products/gedu-picker-sheet", () => ({
  GeduPickerSheet: () => null,
}));
vi.mock("@/components/public/products/seat-availability-bar", () => ({
  SeatAvailabilityBar: () => <div data-testid="seat-bar" />,
}));

// `vi.hoisted` because `vi.mock` factories are lifted above the imports, and
// the spies have to exist by then. The hook stubs read `mutations` lazily (at
// render, not at factory time) for the same reason.
const mutations = vi.hoisted(() => ({
  move: vi.fn(),
  promote: vi.fn(),
  demote: vi.fn(),
  removeGamer: vi.fn(),
  addGamer: vi.fn(),
  other: vi.fn(),
}));

vi.mock("@/services/groups", () => {
  const stub = (pick: () => () => void) => () => ({
    mutate: pick(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  return {
    useProductGroups: () => ({ data: snapshot, isLoading: false }),
    useGroupPending: () => ({
      moves: new Set<string>(),
      removes: new Set<string>(),
      renames: new Set<string>(),
      deletes: new Set<string>(),
      gedus: new Set<string>(),
      creating: false,
    }),
    useMoveParticipation: stub(() => mutations.move),
    usePromoteFromWaitlist: stub(() => mutations.promote),
    useDemoteToWaitlist: stub(() => mutations.demote),
    useAdminRemoveParticipantFromProduct: stub(() => mutations.removeGamer),
    useAdminAddParticipantToProduct: stub(() => mutations.addGamer),
    useRenameGroup: stub(() => mutations.other),
    useCreateGroup: stub(() => mutations.other),
    useAddGedu: stub(() => mutations.other),
    useRemoveGedu: stub(() => mutations.other),
    useDeleteGroup: stub(() => mutations.other),
  };
});

// --------------------------------------------------------------------------
// One product as the panel receives it: a queued family that never paid, and a
// seated one whose seat is behind a live subscription. Ids are real generated
// UUIDs per the fixture rule.
// --------------------------------------------------------------------------
const IDS = {
  group: "2cf1cb0b-e2d5-4f50-9da9-4c3172a88d80",
  queuedParticipation: "c6ea0b42-1ecf-45a1-9602-4d49cdf2f6c4",
  subscribedParticipation: "afc496e5-57fa-4c19-9eb9-55300b9ddc54",
  gamer: "373fc20a-a548-41a8-9af9-44eb67e34c0e",
} as const;

type Participation = ProductGroupsSnapshot["unassigned"][number];

function participation(
  id: string,
  overrides: Partial<Participation> = {},
): Participation {
  return {
    id,
    participant_id: IDS.gamer,
    participant_first_name: "Aino",
    participant_date_of_birth: null,
    participant_gender: null,
    participant_minecraft_username: null,
    participant_minecraft_uuid: null,
    parent_first_name: null,
    parent_last_name: null,
    participant_email: null,
    status: "active",
    signed_up_at: "2026-01-01T00:00:00Z",
    has_live_subscription: false,
    has_payment_marker: false,
    ...overrides,
  };
}

const snapshot: ProductGroupsSnapshot = {
  product_id: "product-1",
  groups: [
    {
      id: IDS.group,
      name: "Group A",
      created_at: "2026-01-01T00:00:00Z",
      gedus: [],
      participations: [
        participation(IDS.subscribedParticipation, {
          has_live_subscription: true,
          has_payment_marker: true,
        }),
      ],
    },
  ],
  unassigned: [],
  waitlist: [
    participation(IDS.queuedParticipation, { status: "waitlisted" }),
  ],
};

function renderPanel(productType: ProductType, billingMode: BillingMode) {
  render(
    <GroupsPanel
      productId="product-1"
      productType={productType}
      billingMode={billingMode}
      // Irrelevant to every case here: the audience is read by the participant
      // picker alone (stubbed above), never by the drag rules under test.
      audience="gamers"
      seatCount={null}
      waitlistEnabled
      voiceAvailable={false}
      voiceIsOpen={false}
      opensDate=""
      opensTime=""
    />,
  );
}

/** Delivers the drop dnd-kit would have delivered. */
function drop(participationId: string, over: Record<string, unknown>) {
  act(() => {
    dnd.onDragEnd?.({
      active: { data: { current: { participationId, firstName: "Aino" } } },
      over: { data: { current: over } },
    });
  });
}

function noMutationFired() {
  for (const [name, fn] of Object.entries(mutations)) {
    expect(fn, name).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  dnd.onDragEnd = null;
  for (const fn of Object.values(mutations)) fn.mockReset();
});

describe("GroupsPanel — the product's shape reaches the rule", () => {
  it("blocks a never-paid promotion on a paid consumer club", () => {
    renderPanel("consumer_club", "paid");
    drop(IDS.queuedParticipation, { toGroupId: IDS.group });

    noMutationFired();
    expect(
      screen.getByText(
        "admin.products.groupsPanel.blockedMove.promoteUnpaid.title",
      ),
    ).toBeTruthy();
  });

  it("lets the same promotion through on a FREE club — the billing prop is read", () => {
    // Identical product type, identical chip, opposite answer. If billingMode
    // never reached the rule this case would block too, and the failure would
    // be invisible to the rules suite.
    renderPanel("consumer_club", "free");
    drop(IDS.queuedParticipation, { toGroupId: IDS.group });

    expect(mutations.promote).toHaveBeenCalledWith({
      participationId: IDS.queuedParticipation,
      toGroupId: IDS.group,
    });
  });

  it("lets it through on a PAID camp — the type prop is read too", () => {
    // The other half of the fold. Same billing as the blocked case, different
    // type: a camp's seat is a one-off settled out of band, so the drag is
    // trusted. Only the pair (consumer_club, paid) refuses.
    renderPanel("camp", "paid");
    drop(IDS.queuedParticipation, { toGroupId: IDS.group });

    expect(mutations.promote).toHaveBeenCalledTimes(1);
  });
});

describe("GroupsPanel — a blocked drop writes nothing", () => {
  it("refuses to remove a member whose seat has a live subscription", () => {
    renderPanel("consumer_club", "paid");
    drop(IDS.subscribedParticipation, { remove: true });

    // Not even the confirm dialog: the refusal is decided before the panel
    // stages the removal, so there is nothing for an admin to confirm.
    noMutationFired();
    expect(
      screen.queryByText(
        "admin.products.groupsPanel.removeParticipant.confirmCta",
      ),
    ).toBeNull();
    expect(
      screen.getByText(
        "admin.products.groupsPanel.blockedMove.removeSubscribed.title",
      ),
    ).toBeTruthy();
  });

  it("refuses to demote that member, and still writes nothing", () => {
    renderPanel("consumer_club", "paid");
    drop(IDS.subscribedParticipation, { waitlist: true });

    noMutationFired();
    expect(
      screen.getByText(
        "admin.products.groupsPanel.blockedMove.demoteSubscribed.title",
      ),
    ).toBeTruthy();
  });

  it("stages the confirm dialog when there is no subscription in the way", () => {
    // The contrast case: removal is not refused per se, it is confirmed. The
    // mutation still must not fire from the drop alone.
    renderPanel("consumer_club", "paid");
    drop(IDS.queuedParticipation, { remove: true });

    expect(mutations.removeGamer).not.toHaveBeenCalled();
    expect(
      screen.getByText("admin.products.groupsPanel.removeParticipant.confirmCta"),
    ).toBeTruthy();
  });
});
