import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GeduPill } from "@/components/admin/products/groups/gedu-pill";
import { GroupsPanelView } from "@/components/admin/products/groups/groups-panel-view";
import type { ProductGroupsSnapshot } from "@/types";

/**
 * The pay class on a group assignment, in the two places it is decided.
 *
 * **On the pill**, because that is where it is read and written: a select whose
 * value is the role the assignment carries, so nothing has to be opened to find
 * out what somebody is. The claim worth pinning is that the control reports the
 * *narrowed* value — a `<select>` hands its handler a bare string, and a pill
 * that passed it straight through would compile only behind an assertion and
 * would post whatever the DOM happened to hold.
 *
 * **Through the panel's intent**, because the pill is three components away
 * from the mutation and every one of them has to thread the callback. A role
 * select that renders and reaches nothing looks identical on screen to one that
 * works, which is the defect this half exists to catch.
 *
 * The add flow deliberately has no role step — an add assigns as `primary` and
 * the select is where the other value is chosen — so there is nothing to assert
 * about the picker here, and the picker's own file substitutions what it does refuse.
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

// dnd-kit is replaced wholesale: the board's drag machinery has nothing to do
// with a select on a pill, and rendering it for real would drag a pointer-sensor
// stack into a file about one callback.
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

// Real UUIDs, hardcoded: the pill draws an identicon out of the id's hex bytes.
const IDS = {
  group: "b1b5cb9a-9d5a-4e16-9a4e-3b48a1a6a19f",
  gedu: "6ae64ce6-1f3e-4f9a-9d7c-9c41dcbb4e0e",
} as const;

const SNAPSHOT: ProductGroupsSnapshot = {
  product_id: "product-1",
  groups: [
    {
      id: IDS.group,
      name: "Ryhmä A",
      created_at: "2026-01-01T00:00:00Z",
      gedus: [
        {
          id: IDS.gedu,
          first_name: "Eeli",
          email: "eeli@example.test",
          role: "primary",
        },
      ],
      participations: [],
    },
  ],
  unassigned: [],
  waitlist: [],
};

const NO_PENDING = {
  moves: new Set<string>(),
  removes: new Set<string>(),
  renames: new Set<string>(),
  deletes: new Set<string>(),
  gedus: new Set<string>(),
  creating: false,
};

const INERT_ACTIONS = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the role control on a gedu pill", () => {
  it("shows the role it holds and reports the narrowed value back", () => {
    const onRoleChange = vi.fn();
    render(
      <GeduPill
        geduId={IDS.gedu}
        firstName="Eeli"
        email="eeli@example.test"
        role="primary"
        onRoleChange={onRoleChange}
      />,
    );

    const select = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "admin.geduRole.selectAria",
    });
    expect(select.value).toBe("primary");

    fireEvent.change(select, { target: { value: "assistant" } });

    expect(onRoleChange).toHaveBeenCalledTimes(1);
    expect(onRoleChange).toHaveBeenCalledWith("assistant");
  });

  it("ignores a value the enum does not carry rather than posting it", () => {
    const onRoleChange = vi.fn();
    render(
      <GeduPill
        geduId={IDS.gedu}
        firstName="Eeli"
        role="primary"
        onRoleChange={onRoleChange}
      />,
    );

    const select = screen.getByRole("combobox", {
      name: "admin.geduRole.selectAria",
    });
    fireEvent.change(select, { target: { value: "supervisor" } });

    expect(onRoleChange).not.toHaveBeenCalled();
  });

  it("draws the role as a label where the surface supplies no write", () => {
    render(<GeduPill geduId={IDS.gedu} firstName="Eeli" role="assistant" />);

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("admin.geduRole.assistant")).toBeTruthy();
  });
});

describe("the panel's role intent", () => {
  it("reaches the shell with the group, the gedu and the new role", () => {
    const onSetGeduRole = vi.fn();
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
        actions={{ ...INERT_ACTIONS, onSetGeduRole }}
      />,
    );

    act(() =>
      fireEvent.change(
        screen.getByRole("combobox", { name: "admin.geduRole.selectAria" }),
        { target: { value: "assistant" } },
      ),
    );

    expect(onSetGeduRole).toHaveBeenCalledWith(
      IDS.group,
      IDS.gedu,
      "assistant",
    );
  });

  it("draws no control at all when the shell supplies no role write", () => {
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
        actions={INERT_ACTIONS}
      />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("admin.geduRole.primary")).toBeTruthy();
  });
});
