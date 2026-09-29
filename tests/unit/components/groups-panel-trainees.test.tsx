import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GroupsPanelView } from "@/components/admin/products/groups/groups-panel-view";
import type { GroupPending } from "@/services/groups";
import type { ProductGroupsSnapshot } from "@/types";

/**
 * Trainees on a group card, through the panel's intents.
 *
 * A trainee is listed in the Gedus row, after the assigned Gedus, in the same
 * pill: where a Gedu's pill has the role select, a trainee's draws "Trainee"
 * in a select that looks identical and never acts; where the Gedu's role is a
 * label, so is the trainee's. A trainee's seat ends when an admin removes it;
 * certification happens only on the admin user page. The other claims are the ones a screen cannot tell apart from a broken build:
 * that add and remove each reach the shell with the right group and gedu.
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

// The board's drag machinery has nothing to do with the Gedus row.
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
  gedu: "0d7f3b95-6c1e-4a2d-8f4b-5e9a2c7d1b36",
  aino: "4c9e2a71-8b3d-4f6a-a5e1-7d2c9b8a6f34",
  onni: "a81f5d3c-2e9b-4c7a-b6d4-3e1f0a9c8b72",
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
      trainees: [
        {
          id: IDS.aino,
          first_name: "Aino",
          email: "aino@example.test",
        },
        {
          id: IDS.onni,
          first_name: "Onni",
          email: "onni@example.test",
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

const PANEL_PROPS = {
  snapshot: SNAPSHOT,
  isLoading: false,
  pending: NO_PENDING,
  switchingParticipationId: null,
  productType: "consumer_club",
  billingMode: "paid",
  topic: "minecraft_java",
  seatCount: null,
  waitlistEnabled: false,
  voiceAvailable: false,
  voiceIsOpen: false,
  opensDate: "",
  opensTime: "",
  robloxRenders: undefined,
} as const;

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
  onRequestAddTrainee: () => {},
  onRemoveTrainee: () => {},
};

function renderPanel(
  overrides: {
    onRequestAddTrainee?: (groupId: string) => void;
    onRemoveTrainee?: (groupId: string, geduId: string) => void;
  } = {},
) {
  render(
    <GroupsPanelView
      {...PANEL_PROPS}
      actions={{ ...INERT_ACTIONS, ...overrides }}
    />,
  );
}

const REMOVE = "admin.products.groupsPanel.trainee.removeAria";
const TRAINEE_ROLE = "admin.products.groupsPanel.trainee.role";

describe("trainees in the Gedus row", () => {
  it("lists them after the assigned Gedus, as a label where the role select would be", () => {
    renderPanel();

    const names = screen
      .getAllByText(/^(Eeli|Aino|Onni)$/)
      .map((node) => node.textContent);
    expect(names).toEqual(["Eeli", "Aino", "Onni"]);

    // The assigned Gedu has no role write here, so its role is a label — and
    // the trainees' is the same label, with no select drawn anywhere.
    expect(document.querySelector("select")).toBeNull();
    expect(screen.getAllByText(TRAINEE_ROLE)).toHaveLength(2);
    // No separate Trainees heading.
    expect(
      screen.queryByText("admin.products.groupsPanel.trainee.label"),
    ).toBeNull();
  });

  it("draws the trainee's role as a select that looks like the Gedu's and never acts", () => {
    render(
      <GroupsPanelView
        {...PANEL_PROPS}
        actions={{ ...INERT_ACTIONS, onSetGeduRole: () => {} }}
      />,
    );

    // One real combobox: the Gedu's. The trainees' look-alikes are hidden
    // from assistive technology and inert.
    const selects = Array.from(document.querySelectorAll("select"));
    expect(selects).toHaveLength(3);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    const [gedu, ...trainees] = selects;
    for (const lookalike of trainees) {
      expect(lookalike.hasAttribute("inert")).toBe(true);
      expect(lookalike.getAttribute("aria-hidden")).toBe("true");
      expect(lookalike.tabIndex).toBe(-1);
      // Same box as the real control, with no disabled greying.
      expect(lookalike.className).toBe(
        gedu.className
          .replace(/\s*disabled:\S+/g, "")
          .trim(),
      );
      expect(lookalike.disabled).toBe(false);
    }
    // Each trainee's word reaches a screen reader as text (the option's copy
    // is hidden with its select, so the readable one is the sibling).
    expect(
      screen
        .getAllByText(TRAINEE_ROLE)
        .filter((node) => node.tagName === "SPAN"),
    ).toHaveLength(2);
  });

  it("puts Add trainee beside and after Add Gedu", () => {
    renderPanel();

    const addGedu = screen.getByRole("button", {
      name: "admin.products.groupsPanel.group.addGedu",
    });
    const addTrainee = screen.getByRole("button", {
      name: "admin.products.groupsPanel.trainee.add",
    });
    expect(addGedu.parentElement).toBe(addTrainee.parentElement);
    expect(addGedu.nextElementSibling).toBe(addTrainee);
  });

  it("gives a trainee pill no way to become a Gedu — only the way off the group", () => {
    render(
      <GroupsPanelView
        {...PANEL_PROPS}
        actions={{ ...INERT_ACTIONS, onSetGeduRole: () => {} }}
      />,
    );

    // Each pill's only button is its remove: the Gedu's and both trainees'.
    const pills = screen
      .getAllByText(/^(Eeli|Aino|Onni)$/)
      .map((name) => name.closest("div.rounded-md"));
    for (const pill of pills) {
      expect(pill).not.toBeNull();
      expect(pill!.querySelectorAll("button")).toHaveLength(1);
    }
    expect(screen.getAllByRole("button", { name: REMOVE })).toHaveLength(2);
  });

  it("removes the trainee it is pressed on", () => {
    const onRemoveTrainee = vi.fn();
    renderPanel({ onRemoveTrainee });

    fireEvent.click(screen.getAllByRole("button", { name: REMOVE })[1]);
    expect(onRemoveTrainee).toHaveBeenCalledWith(IDS.group, IDS.onni);
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
