import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { GroupsPanel } from "@/components/admin/products/groups/groups-panel";
import { TimezoneProvider } from "@/providers";
import type {
  BillingMode,
  ProductGroupsSnapshot,
  ProductTopic,
  ProductType,
} from "@/types";

/**
 * The wiring the rules suite cannot see.
 *
 * `panel-rules` is pure and exhaustively tested on its own, so this file
 * deliberately does not re-test the decision table. What it pins is the three
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
 *  3. **The topic decides which identity every chip draws, and the whole page
 *     is resolved in one Roblox call.** Both are panel-level: `chipGameIdentity`
 *     is pure and cannot tell whether the panel ever asked it, and a per-chip
 *     lookup would render identically while draining a shared per-IP budget.
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
//
// The unassigned card is the one exception, and also deliberate: it is the
// cheapest place to see a real chip, and which identity a chip draws is a panel
// decision that only the rendered chip can prove. Every drag case below uses a
// grouped or waitlisted participation, so the real card changes nothing for
// them.
vi.mock("@/components/admin/products/groups/group-column", () => ({
  GroupColumn: () => <div data-testid="group-column" />,
}));
// Stubbed like its siblings, but this one records what it was handed: whether
// a product may offer seats at all is decided on the panel's side, from the
// billing prop and the group count, and a stub that dropped the props would let
// that decision be wrong with every rendering test still green.
vi.mock("@/components/admin/products/groups/waitlist-card", () => ({
  WaitlistCard: (props: {
    seatOffers: { kind: string; groupCount?: number };
    onSendSeatOffer?: (participationId: string) => Promise<void>;
  }) => {
    waitlistCard.props = props;
    return <div data-testid="waitlist-card" />;
  },
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

// What the waitlist card was last rendered with. `vi.hoisted` for the same
// reason the spies are: the mock factory is lifted above the imports.
const waitlistCard = vi.hoisted(() => ({
  props: null as {
    seatOffers: { kind: string; groupCount?: number };
    onSendSeatOffer?: (participationId: string) => Promise<void>;
  } | null,
}));

// The seat offer's mutation, and the mount-time expiry sweep beside it. The
// sweep is fire-and-forget housekeeping with no bearing on anything this file
// asserts; it is stubbed so the panel does not reach for a Supabase client.
const seatOffer = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/services/participations", () => ({
  useSeatOfferSweepOnMount: () => {},
}));

// The batched render lookup, stubbed at the hook the way every other service
// call in this file is: the real one is a React Query read behind a fetch to
// our own avatar route, and what this file is about is *what the panel asked
// for* and what it did with the answer.
const roblox = vi.hoisted(() => ({
  renders: vi.fn(),
  data: undefined as Record<string, string | null> | undefined,
}));

vi.mock("@/services/roblox", () => ({
  useRobloxRenders: (ids: readonly number[], figure: string) => {
    roblox.renders(ids, figure);
    return { data: roblox.data };
  },
}));

vi.mock("@/services/groups", () => {
  const stub = (pick: () => () => void) => () => ({
    mutate: pick(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
  return {
    useProductGroups: () => ({
      data: snapshotOverride ?? snapshot,
      isLoading: false,
    }),
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
    useSendSeatOffer: () => ({
      mutate: vi.fn(),
      mutateAsync: seatOffer.send,
      isPending: false,
    }),
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
    participant_roblox_username: null,
    participant_roblox_user_id: null,
    parent_first_name: null,
    parent_last_name: null,
    participant_email: null,
    status: "active",
    signed_up_at: "2026-01-01T00:00:00Z",
    has_live_subscription: false,
    has_payment_marker: false,
    // The staff-only flair (00203). The groups panel draws neither mark — a
    // chip there is a drag handle — so these ride the snapshot for shape parity
    // and every fixture here carries the null shape.
    group_joined_at: null,
    note: null,
    note_updated_by_first_name: null,
    seat_offer_sent_at: null,
    seat_offer_expiry_notified_at: null,
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

// The snapshot a single test wants instead — the identity cases need a chip in
// the unassigned inbox (the one card rendered for real). Reset per test.
let snapshotOverride: ProductGroupsSnapshot | null = null;

function renderPanel(
  productType: ProductType,
  billingMode: BillingMode,
  // Minecraft unless a case is about the topic: every drag case here predates
  // the identity row and is decided without it.
  topic: ProductTopic = "minecraft_java",
) {
  render(
    // The chip prints an age in the viewer's zone, so a real chip needs the
    // real provider. Nothing else in this file reads it.
    <TimezoneProvider initialTimezone="Europe/Helsinki">
      <GroupsPanel
        productId="product-1"
        productType={productType}
        billingMode={billingMode}
        topic={topic}
        // Irrelevant to every case here: the audience is read by the participant
        // picker alone (stubbed above), never by the drag rules under test.
        audience="gamers"
        seatCount={null}
        waitlistEnabled
        voiceAvailable={false}
        voiceIsOpen={false}
        opensDate=""
        opensTime=""
      />
    </TimezoneProvider>,
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
  snapshotOverride = null;
  waitlistCard.props = null;
  seatOffer.send.mockReset();
  seatOffer.send.mockResolvedValue(undefined);
  roblox.renders.mockReset();
  roblox.data = undefined;
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

describe("GroupsPanel — the topic decides which identity a chip draws", () => {
  // One child holding both handles, sitting in the inbox — so every case below
  // differs only in the topic the panel was rendered with.
  const ROBLOX_USER_ID = 261;
  const RENDER_URL = "https://tr.rbxcdn.com/aino-headshot";

  function seatOneChild() {
    snapshotOverride = {
      ...snapshot,
      unassigned: [
        participation("6ff4a1c1-5b0a-4a58-9d2f-1e0a7c9b3d51", {
          participant_minecraft_username: "Notch",
          participant_minecraft_uuid: "8f3a1c92-77de-4b01-9c2e-a1b2c3d4e5f6",
          participant_roblox_username: "AinoBuilds",
          participant_roblox_user_id: ROBLOX_USER_ID,
        }),
      ],
    };
  }

  it("draws the Minecraft handle on a Minecraft product, and asks Roblox nothing", () => {
    seatOneChild();
    renderPanel("consumer_club", "free", "minecraft_java");

    expect(screen.getByText("Notch")).toBeTruthy();
    expect(screen.queryByText("AinoBuilds")).toBeNull();
    // The face is derived from the name by the skin host — no lookup at all,
    // which is why the Roblox batch is called with an empty (disabled) list.
    expect(document.querySelector("img")?.getAttribute("src")).toContain(
      "Notch",
    );
    expect(roblox.renders).toHaveBeenCalledWith([], "head");
  });

  it("draws the Roblox handle on a Roblox product, and never the Minecraft one", () => {
    seatOneChild();
    roblox.data = { [String(ROBLOX_USER_ID)]: RENDER_URL };
    renderPanel("consumer_club", "free", "roblox_studio");

    expect(screen.getByText("AinoBuilds")).toBeTruthy();
    expect(screen.queryByText("Notch")).toBeNull();
  });

  it("resolves the whole page's renders in one batched call, keyed by id", () => {
    seatOneChild();
    roblox.data = { [String(ROBLOX_USER_ID)]: RENDER_URL };
    renderPanel("consumer_club", "free", "roblox_studio");

    // One call for the panel — never one per chip — for the head figure the
    // chip actually draws, and the answer reaches the chip by the id the
    // response named rather than by position.
    expect(roblox.renders).toHaveBeenCalledWith([ROBLOX_USER_ID], "head");
    expect(document.querySelector("img")?.getAttribute("src")).toBe(RENDER_URL);
  });

  it("keeps the silhouette while the batch is in flight", () => {
    // `data` undefined is both "in flight" and "the lookup failed" — renders are
    // never retried — and both draw the placeholder rather than an empty box.
    // The name is on screen from the first frame either way.
    seatOneChild();
    renderPanel("consumer_club", "free", "roblox_studio");

    expect(screen.getByText("AinoBuilds")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });

  it("draws no identity row at all on a topic about no game account", () => {
    seatOneChild();
    renderPanel("consumer_club", "free", "programming");

    expect(screen.queryByText("Notch")).toBeNull();
    expect(screen.queryByText("AinoBuilds")).toBeNull();
    // Not an empty row either: a chip with no platform is shorter by exactly
    // the row it does not draw, so the "(none)" label is absent too.
    expect(screen.queryByText("gameAccount.none")).toBeNull();
    expect(roblox.renders).toHaveBeenCalledWith([], "head");
  });
});

describe("GroupsPanel — the seat offer's two preconditions reach the waitlist", () => {
  /**
   * Both conditions live on the panel's side of the boundary and neither is
   * visible from `panel-rules`, which is handed the answers rather than the
   * product. Getting either wrong shows up as an Invite button an admin can
   * press on a product the database is bound to refuse — or, worse, as no
   * button on the one product shape the feature exists for.
   */

  it("offers seats on a no-charge product with exactly one group", () => {
    // The base snapshot has one group, and a free club is no-charge.
    renderPanel("consumer_club", "free");

    expect(waitlistCard.props?.seatOffers).toEqual({ kind: "available" });
    expect(waitlistCard.props?.onSendSeatOffer).toBeTypeOf("function");
  });

  it("refuses on a paid product, and says nothing about why", () => {
    // Same one group, opposite billing. `unavailable` is the answer that draws
    // no control and no explanation: nothing an admin does on this page would
    // change it, so a note per row would be noise on every paid queue there is.
    renderPanel("consumer_club", "paid");

    expect(waitlistCard.props?.seatOffers).toEqual({ kind: "unavailable" });
  });

  it("carries the group count when a no-charge product has the wrong number", () => {
    snapshotOverride = { ...snapshot, groups: [] };
    renderPanel("camp", "free");

    // The count rides along because the card states it: this refusal *is*
    // actionable, and the groups it is asking for are the columns above.
    expect(waitlistCard.props?.seatOffers).toEqual({
      kind: "needsOneGroup",
      groupCount: 0,
    });
  });

  it("sends the offer through the mutation, and answers back", async () => {
    renderPanel("consumer_club", "free");

    // The one action on this panel that returns something: the row's Invite
    // button needs to know whether to let the admin press again.
    const result = waitlistCard.props?.onSendSeatOffer?.(
      IDS.queuedParticipation,
    );
    expect(seatOffer.send).toHaveBeenCalledWith({
      participationId: IDS.queuedParticipation,
    });
    await expect(result).resolves.toBeUndefined();

    // And it grants nothing — no chip moved.
    expect(mutations.promote).not.toHaveBeenCalled();
    expect(mutations.move).not.toHaveBeenCalled();
  });
});
