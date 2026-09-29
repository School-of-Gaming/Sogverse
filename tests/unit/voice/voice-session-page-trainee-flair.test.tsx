import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { useVoiceMemberFlair } from "@/components/voice/VoiceMemberFlairProvider";

/**
 * ============================================================================
 * The voice room's per-gamer dialog, as a trainee meets it.
 * ============================================================================
 *
 * The page is the seam: it picks which overlay to read from the standing the
 * token route answered, and which writes to hand the dialog. Pinned here:
 *
 *  1. **A trainee reads the trainee overlay, never the staff one**, and a
 *     member with a note gets a lit button whose dialog draws the note withheld.
 *  2. **The dialog's Save is the locked control**: pressing it explains itself
 *     and no write is issued.
 *  3. **An assigned gedu is unchanged**: the staff overlay, the note's text and
 *     a Save that writes.
 *
 * The room is stubbed down to one button per seat-holder, read through the real
 * flair context, so the dialog under test is the real one the page mounts.
 */

const MEMBER = "36bd113c-5a2f-444c-8d5c-199a47164706";
const NOTE = "Quiet in big groups, pair her rather than letting her pick.";
const GROUP_ID = "00000000-0000-4000-8000-000000000001";

const state = vi.hoisted(() => ({
  standing: "trainee" as "moderator" | "trainee" | "participant",
  staffEnabled: [] as boolean[],
  traineeEnabled: [] as boolean[],
  noteWrites: 0,
}));

const room = {
  joined: false,
  joining: false,
  isModerator: false,
  join: vi.fn(async () => {
    room.joined = true;
  }),
  leave: vi.fn(async () => {}),
};

vi.mock("@/components/voice/VoiceRoomProvider", () => ({
  VoiceRoomProvider: ({ children }: { children: React.ReactNode }) => children,
  useVoiceRoom: () => room,
}));

/** The rail, reduced to the flair button of every seat-holder. */
function StubRoom() {
  const flair = useVoiceMemberFlair();
  if (flair === null) return null;
  return (
    <>
      {[...flair.members].map((id) => (
        <button
          key={id}
          type="button"
          data-has-note={id in flair.notes}
          onClick={() => flair.onOpenFlair(id, "Siiri")}
        >
          flair-{id}
        </button>
      ))}
    </>
  );
}

vi.mock("@/components/voice/VoiceRoom", () => ({ VoiceRoom: StubRoom }));

vi.mock("@/components/voice/GroupSessionChat", () => ({
  GroupSessionChat: () => null,
}));

vi.mock("@/services/voice", () => ({
  useVoiceToken: () => ({
    mutateAsync: vi.fn(async () => ({
      token: "t",
      roomUrl: "https://example.invalid/room",
      sessionOpensAt: "2026-09-14T10:00:00Z",
      standing: state.standing,
    })),
  }),
}));

vi.mock("@/services/session-feedback", () => ({
  isEmptySessionFeedback: () => true,
  useOwnSessionFeedback: () => ({ data: undefined }),
  useSaveSessionFeedback: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/services/member-flair", () => ({
  useGroupStaffOverlay: (_groupId: string, enabled: boolean) => {
    state.staffEnabled.push(enabled);
    return {
      data: enabled
        ? {
            product_type: "consumer_club",
            members: {
              [MEMBER]: {
                group_joined_at: null,
                note: NOTE,
                note_updated_by_first_name: "Sanna",
                creations: [],
              },
            },
          }
        : undefined,
    };
  },
  useTraineeGroupOverlay: (_groupId: string, enabled: boolean) => {
    state.traineeEnabled.push(enabled);
    return {
      data: enabled
        ? {
            product_type: "consumer_club",
            members: {
              [MEMBER]: { group_joined_at: null, has_note: true, creations: [] },
            },
          }
        : undefined,
    };
  },
  useSetGamerGroupNote: () => ({
    mutateAsync: vi.fn(async () => {
      state.noteWrites += 1;
    }),
  }),
  useSetGamerGroupCreations: () => ({ mutateAsync: vi.fn(async () => {}) }),
}));

const { VoiceSessionPage } = await import("@/components/voice/VoiceSessionPage");

function renderPage() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoiceSessionPage groupId={GROUP_ID} backHref="/en/gedu" askForFeedback={false} />
    </NextIntlClientProvider>,
  );
}

async function openDialog(): Promise<HTMLElement> {
  const button = await screen.findByRole("button", { name: `flair-${MEMBER}` });
  expect(button.getAttribute("data-has-note")).toBe("true");
  fireEvent.click(button);
  // The shared dialog portals a plain div with no `role="dialog"`, so it is
  // found by its heading and held by the card around it.
  const heading = await screen.findByRole("heading", { name: "About Siiri" });
  const card = heading.parentElement?.parentElement;
  if (!card) throw new Error("The flair dialog did not render.");
  return card;
}

beforeEach(() => {
  room.joined = false;
  room.isModerator = false;
  state.staffEnabled.length = 0;
  state.traineeEnabled.length = 0;
  state.noteWrites = 0;
});

afterEach(() => {
  cleanup();
});

describe("the voice room's flair dialog for a trainee", () => {
  it("reads the trainee overlay and opens the dialog with the note withheld", async () => {
    state.standing = "trainee";
    renderPage();
    const dialog = await openDialog();

    expect(state.staffEnabled.every((enabled) => !enabled)).toBe(true);
    expect(state.traineeEnabled).toContain(true);
    expect(
      within(dialog).getByText(messages.gedu.groupWorkspace.staffNoteWithheld),
    ).toBeTruthy();
    expect(within(dialog).queryByRole("textbox", { name: /note/i })).toBeNull();
  });

  it("locks the Save: pressing it explains itself and writes nothing", async () => {
    state.standing = "trainee";
    renderPage();
    const dialog = await openDialog();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: messages.common.save,
        description: messages.gedu.trainee.lockedHint,
      }),
    );
    expect(await screen.findByText(messages.gedu.trainee.gamerWhat)).toBeTruthy();
    expect(screen.getByText(messages.gedu.trainee.whySave)).toBeTruthy();
    expect(state.noteWrites).toBe(0);
  });
});

describe("the voice room's flair dialog for an assigned gedu", () => {
  it("reads the staff overlay, shows the note and saves through the write", async () => {
    state.standing = "moderator";
    room.isModerator = true;
    renderPage();
    const dialog = await openDialog();

    expect(state.traineeEnabled.every((enabled) => !enabled)).toBe(true);
    const field = within(dialog).getByDisplayValue(NOTE);
    fireEvent.change(field, { target: { value: `${NOTE} More.` } });
    fireEvent.click(within(dialog).getByRole("button", { name: messages.common.save }));
    await waitFor(() => expect(state.noteWrites).toBe(1));
  });
});
