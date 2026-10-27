import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { JoinVoiceButton } from "@/components/voice/JoinVoiceButton";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import type { FamilyEnrollmentSummary } from "@/components/family/enrollment-rollup";
import type { ProductVoiceRoom } from "@/lib/products/voice-room";
import { INERT_HREF, ROUTES } from "@/lib/constants/routes";

/**
 * The Join button across a product's three voice rooms.
 *
 * The mode changes only what the *open* button does: outside the window every
 * mode shows the same locked "Opens …" button. Open, a Sogverse room links to
 * the session page, an external meeting opens its link in a new tab, and a
 * product with no room opens a dialog of the reader's-locale instructions. On a
 * parent's view of a child's seat the switch-to-gamer handler wins in every
 * mode, so whoever joins is the child.
 */

// Keys echo, so an assertion names the copy the button reached for rather than
// the wording in messages/.
const reader = vi.hoisted(() => ({ locale: "en" }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const full = namespace ? `${namespace}.${key}` : key;
      return values ? `${full}(${JSON.stringify(values)})` : full;
    };
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => reader.locale,
}));

const clock = vi.hoisted(() => ({ now: new Date("2026-02-11T12:00:00.000Z") }));
vi.mock("@/providers", () => ({
  useNow: () => clock.now,
  useTimezone: () => "Europe/Helsinki",
  useAuth: () => ({ user: { id: "9c1f0f2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f", email: undefined } }),
}));

afterEach(() => {
  cleanup();
  reader.locale = "en";
});

const GROUP_ID = "5b6f0d1e-2c3a-4f5b-8d7e-9a0b1c2d3e4f";
const MEETING_URL = "https://meet.example.com/abc-defg-hij";

const SOGVERSE: ProductVoiceRoom = { mode: "sogverse" };
const EXTERNAL: ProductVoiceRoom = { mode: "external", url: MEETING_URL };
const NONE: ProductVoiceRoom = {
  mode: "none",
  instructions: [
    { locale: "en", text: "Open Minecraft.\nJoin the server play.example.com." },
    { locale: "fi", text: "Avaa Minecraft.\nLiity palvelimelle play.example.com." },
  ],
};

function renderButton(
  voiceRoom: ProductVoiceRoom,
  {
    voiceIsOpen = true,
    onJoinClick,
  }: { voiceIsOpen?: boolean; onJoinClick?: () => void } = {},
) {
  return render(
    <JoinVoiceButton
      voiceRoom={voiceRoom}
      voiceIsOpen={voiceIsOpen}
      voiceHref={ROUTES.voice.groupSession(GROUP_ID)}
      opensDate="Wed, Feb 11"
      opensTime="17:55"
      onJoinClick={onJoinClick}
    />,
  );
}

const LOCKED = /^voiceButton\.locked\(/;

describe("outside the session window", () => {
  it.each([
    ["sogverse", SOGVERSE],
    ["external", EXTERNAL],
    ["none", NONE],
  ] as const)("shows the same locked button for a %s room", (_, room) => {
    renderButton(room, { voiceIsOpen: false });

    const locked = screen.getByRole("button");
    expect(locked.textContent).toMatch(LOCKED);
    expect(locked.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("a Sogverse room, open", () => {
  it("links to the group's session page in this tab", () => {
    renderButton(SOGVERSE);

    const link = screen.getByRole("link");
    expect(link.textContent).toBe("voiceButton.joinVoice");
    expect(link.getAttribute("href")).toContain(`/voice/group/${GROUP_ID}`);
    expect(link.getAttribute("target")).toBeNull();
  });
});

describe("an external meeting, open", () => {
  it("opens the meeting in a new tab and says so", () => {
    renderButton(EXTERNAL);

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(MEETING_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.textContent).toContain("voiceButton.joinMeeting");
    expect(link.textContent).toContain("voiceButton.opensInNewTab");
  });

  it("still hands the click to a switch handler when one is passed", () => {
    const onJoinClick = vi.fn();
    renderButton(EXTERNAL, { onJoinClick });

    expect(screen.queryByRole("link")).toBeNull();
    const button = screen.getByRole("button");
    expect(button.textContent).toBe("voiceButton.joinMeeting");
    act(() => button.click());
    expect(onJoinClick).toHaveBeenCalledOnce();
  });
});

describe("no room, open", () => {
  it("opens the instructions in a dialog, line breaks kept", () => {
    renderButton(NONE);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => screen.getByText("voiceButton.howToJoin").click());

    const dialog = screen.getByRole("dialog");
    const body = dialog.querySelector("p");
    expect(body?.textContent).toBe(
      "Open Minecraft.\nJoin the server play.example.com.",
    );
    expect(body?.className).toContain("whitespace-pre-line");
  });

  it("shows the reader's locale", () => {
    reader.locale = "fi";
    renderButton(NONE);
    act(() => screen.getByText("voiceButton.howToJoin").click());

    expect(screen.getByRole("dialog").textContent).toContain("Avaa Minecraft.");
  });

  it("falls back to English when the reader's locale has none", () => {
    reader.locale = "sv";
    renderButton(NONE);
    act(() => screen.getByText("voiceButton.howToJoin").click());

    expect(screen.getByRole("dialog").textContent).toContain("Open Minecraft.");
  });

  it("falls back to the earliest written locale when English has none", () => {
    reader.locale = "sv";
    renderButton({
      mode: "none",
      instructions: [
        { locale: "fr", text: "Ouvrez Minecraft." },
        { locale: "fi", text: "Avaa Minecraft." },
      ],
    });
    act(() => screen.getByText("voiceButton.howToJoin").click());

    expect(screen.getByRole("dialog").textContent).toContain("Avaa Minecraft.");
  });

  it("hands the click to a switch handler when one is passed", () => {
    const onJoinClick = vi.fn();
    renderButton(NONE, { onJoinClick });

    act(() => screen.getByText("voiceButton.howToJoin").click());

    expect(onJoinClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes from its Close button", () => {
    renderButton(NONE);
    act(() => screen.getByText("voiceButton.howToJoin").click());
    act(() => screen.getByText("common.close").click());

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("a parent's card for their child's seat, mid-session", () => {
  const NOW = clock.now;

  function enrollment(voiceRoom: ProductVoiceRoom): FamilyEnrollmentSummary {
    return {
      participationId: "e0b5b0c3-7c8f-4b3e-9a11-5f2c6d7e8a90",
      productName: "Minecraft Club",
      productType: "consumer_club",
      topic: "minecraft_java",
      deliveryMode: "online",
      voiceRoom,
      prepWindowEnd: new Date(NOW.getTime() - 86_400_000),
      nextSessionStart: new Date(NOW.getTime() - 600_000),
      nextSessionEnd: new Date(NOW.getTime() + 3_000_000),
      cancelledAhead: [],
      hasVoiceRoom: true,
      voiceHref: INERT_HREF,
      siteName: null,
      openHref: INERT_HREF,
      endDate: null,
      timezone: "Europe/Helsinki",
      waitlistPosition: null,
      seatOfferSentAt: null,
      awaiting: false,
      paymentProblem: false,
      cancellation: null,
      scheduleLines: [],
    };
  }

  function renderChildCard(voiceRoom: ProductVoiceRoom, onJoinClick: () => void) {
    return render(
      <EnrollmentCard
        enrollment={enrollment(voiceRoom)}
        prepDismissed={new Set()}
        audience="customer"
        gamerFirstName="Aino"
        onJoinClick={onJoinClick}
      />,
    );
  }

  it("switches account before an external meeting", () => {
    const onJoinClick = vi.fn();
    renderChildCard(EXTERNAL, onJoinClick);

    act(() => screen.getByText("voiceButton.joinMeeting").click());

    expect(onJoinClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: /joinMeeting/ })).toBeNull();
  });

  it("switches account before the instructions", () => {
    const onJoinClick = vi.fn();
    renderChildCard(NONE, onJoinClick);

    act(() => screen.getByText("voiceButton.howToJoin").click());

    expect(onJoinClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
