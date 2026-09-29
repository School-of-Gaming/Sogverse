import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GroupsPanelView } from "@/components/admin/products/groups/groups-panel-view";
import type { GroupPending } from "@/services/groups";
import type { ProductGroupsSnapshot } from "@/types";

/**
 * The Trainees row on a group card, through the panel's intents.
 *
 * The claims are the ones a screen cannot tell apart from a broken build: that
 * the row's add, remove and promote each reach the shell with the right group
 * and gedu, and that **promote is offered only to a certified trainee** — an
 * assignment still needs certification, so an uncertified trainee's pill must
 * carry no control that could make one.
 *
 * Translations echo their keys, so nothing depends on English wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

// The board's drag machinery has nothing to do with the Trainees row.
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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

vi.mock("@/components/public/products/seat-availability-bar", () => ({
  SeatAvailabilityBar: () => <div data-testid="seat-bar" />,
}));

// Real UUIDs, hardcoded: each pill draws an identicon out of the id's hex bytes.
const IDS = {
  group: "e3b1c7a2-5d4f-4a8e-9b6c-1f2d3e4a5b6c",
  certified: "4c9e2a71-8b3d-4f6a-a5e1-7d2c9b8a6f34",
  uncertified: "a81f5d3c-2e9b-4c7a-b6d4-3e1f0a9c8b72",
} as const;

const SNAPSHOT: ProductGroupsSnapshot = {
  product_id: "product-1",
  groups: [
    {
      id: IDS.group,
      name: "Ryhmä A",
      created_at: "2026-01-01T00:00:00Z",
      gedus: [],
      trainees: [
        {
          id: IDS.certified,
          first_name: "Aino",
          email: "aino@example.test",
          certified: true,
        },
        {
          id: IDS.uncertified,
          first_name: "Onni",
          email: "onni@example.test",
          certified: false,
        },
      ],
      participations: [],
    },
  ],
  unassigned: [],
  waitlist: [],
};

const NO_PENDING: GroupPending = {
  moves: new Set<string>(),
  removes: new Set<string>(),
  renames: new Set<string>(),
  deletes: new Set<string>(),
  gedus: new Set<string>(),
  trainees: new Set<string>(),
  creating: false,
};

function renderPanel(
  overrides: {
    onRequestAddTrainee?: (groupId: string) => void;
    onRemoveTrainee?: (groupId: string, geduId: string) => void;
    onPromoteTrainee?: (groupId: string, geduId: string) => void;
  } = {},
) {
  render(
    <GroupsPanelView
      snapshot={SNAPSHOT}
      isLoading={false}
      pending={NO_PENDING}
      switchingParticipationId={null}
      productType="consumer_club"
      billingMode="paid"
      topic="minecraft_java"
      seatCount={null}
      waitlistEnabled={false}
      voiceAvailable={false}
      voiceIsOpen={false}
      opensDate=""
      opensTime=""
      robloxRenders={undefined}
      actions={{
        onMove: () => {},
        onPromote: () => {},
        onDemote: () => {},
        onRemoveParticipant: () => {},
        onRenameGroup: () => {},
        onDeleteGroup: () => {},
        onCreateGroup: () => {},
        onRemoveGedu: () => {},
        onRequestAddGedu: () => {},
        onRequestAddParticipant: () => {},
        onRequestAddTrainee: overrides.onRequestAddTrainee ?? (() => {}),
        onRemoveTrainee: overrides.onRemoveTrainee ?? (() => {}),
        onPromoteTrainee: overrides.onPromoteTrainee,
      }}
    />,
  );
}

const PROMOTE = "admin.products.groupsPanel.trainee.promoteAria";
const REMOVE = "admin.products.groupsPanel.trainee.removeAria";

describe("the Trainees row", () => {
  it("offers promotion to the certified trainee alone, and reports the pair", () => {
    const onPromoteTrainee = vi.fn();
    renderPanel({ onPromoteTrainee });

    // One pill in two carries the control: Onni is uncertified.
    const promote = screen.getAllByRole("button", { name: PROMOTE });
    expect(promote).toHaveLength(1);

    fireEvent.click(promote[0]);
    expect(onPromoteTrainee).toHaveBeenCalledWith(IDS.group, IDS.certified);
  });

  it("draws no promote control where the shell supplies no write", () => {
    renderPanel();

    expect(screen.queryByRole("button", { name: PROMOTE })).toBeNull();
    // The pills themselves still draw, removable.
    expect(screen.getAllByRole("button", { name: REMOVE })).toHaveLength(2);
  });

  it("removes the trainee it is pressed on", () => {
    const onRemoveTrainee = vi.fn();
    renderPanel({ onRemoveTrainee });

    fireEvent.click(screen.getAllByRole("button", { name: REMOVE })[1]);
    expect(onRemoveTrainee).toHaveBeenCalledWith(IDS.group, IDS.uncertified);
  });

  it("asks the shell for the trainee picker for this group", () => {
    const onRequestAddTrainee = vi.fn();
    renderPanel({ onRequestAddTrainee });

    fireEvent.click(
      screen.getByRole("button", {
        name: "admin.products.groupsPanel.trainee.add",
      }),
    );
    expect(onRequestAddTrainee).toHaveBeenCalledWith(IDS.group);
  });
});
