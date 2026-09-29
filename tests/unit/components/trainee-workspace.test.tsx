import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { TraineeWorkspace } from "@/components/gedu/session-details/TraineeProductPage";
import { buildTraineeWorkspaceFixture } from "@/components/gedu/session-details/mock-trainee-fixtures";
import {
  traineeFlairMaps,
  traineeSite,
  traineeWorkspaceData,
} from "@/components/gedu/session-details/trainee-workspace";
import { buildGroupWorkspaceFixture } from "@/components/group-workspace/mock-workspace-fixtures";
import { isNamedOnlyGroup } from "@/components/group-workspace/types";
import { buildGeduSessionFeed } from "@/lib/gedu-session-feed";
import { isWithheld, WITHHELD } from "@/lib/withheld";
import { installFakeIntersectionObserver } from "../../mocks/intersection-observer";

vi.mock("@/services/roblox", () => ({
  useRobloxRenders: () => ({ data: undefined }),
}));

/**
 * The trainee shell: the same workspace an assigned gedu sees, fed the
 * redacted documents, with every write handed in locked.
 *
 * The fixture is the club scenario redacted the way the two trainee reads
 * redact it, so the staff-only strings the club fixture carries are exactly
 * the strings that must be nowhere on this page.
 */

const NOW = new Date("2026-03-16T12:00:00.000Z");

// The feed's history reveals behind a scroll sentinel, and jsdom has no observer.
beforeEach(installFakeIntersectionObserver);
afterEach(cleanup);

describe("the trainee shell's mapping", () => {
  const { product, feed } = buildTraineeWorkspaceFixture(NOW);

  it("draws its own group from the feed's roster and headcount, siblings by name only", () => {
    const data = traineeWorkspaceData(product, feed);
    const own = data.groups.find((group) => group.id === data.my_group_id);
    expect(own).toBeDefined();
    expect(own && !isNamedOnlyGroup(own) && own.roster).toBe(feed.roster);
    expect(own && !isNamedOnlyGroup(own) && own.participant_count).toBe(
      feed.roster.length,
    );
    const siblings = data.groups.filter((g) => g.id !== data.my_group_id);
    expect(siblings.length).toBeGreaterThan(0);
    for (const sibling of siblings) {
      expect(isNamedOnlyGroup(sibling)).toBe(true);
      expect(sibling).not.toHaveProperty("gedus");
      expect(sibling).not.toHaveProperty("participant_count");
    }
  });

  it("withholds a note where one exists, and invents nothing where none does", () => {
    const maps = traineeFlairMaps(
      [
        { ...feed.roster[0], has_note: true },
        { ...feed.roster[1], has_note: false },
      ],
      true,
    );
    expect(maps.notes[feed.roster[0].participant_id]).toBe(WITHHELD);
    expect(maps.notes).not.toHaveProperty(feed.roster[1].participant_id);
    expect(maps.noteEditors).toEqual({});
    expect(maps.creations).toEqual({});
  });

  it("gates newcomer stamps on the caller's clubs-only answer", () => {
    const roster = [
      { ...feed.roster[0], group_joined_at: "2026-03-10T12:00:00.000Z" },
      { ...feed.roster[1], group_joined_at: null },
    ];
    expect(traineeFlairMaps(roster, false).newcomers).toEqual({});
    expect(traineeFlairMaps(roster, true).newcomers).toEqual({
      [roster[0].participant_id]: "2026-03-10T12:00:00.000Z",
    });
  });

  it("withholds the site's staff note whether or not one was written", () => {
    expect(traineeSite(null)).toBeNull();
    const site = traineeSite({
      location_id: "loc",
      name: "Kallion kirjasto",
      address: null,
      public_note: null,
    });
    expect(site && isWithheld(site.staffNote)).toBe(true);
  });

  it("builds a redacted feed: every gedu note withheld, nothing owed", () => {
    const entries = buildGeduSessionFeed({
      groupId: feed.group.id,
      timezone: feed.product.timezone,
      slots: feed.product.schedule_slots.map((slot) => ({
        weekday: slot.weekday,
        startTime: slot.start_time,
        durationMinutes: slot.duration_minutes,
      })),
      startDate: feed.product.start_date,
      endDate: feed.product.end_date,
      sessions: feed.sessions,
      gedus: feed.gedus,
      substitutions: [],
      cancellations: feed.cancellations,
      now: NOW,
      reach: "redacted",
    });
    let recorded = 0;
    for (const entry of entries) {
      if (entry.kind !== "past" && entry.kind !== "future") continue;
      recorded += 1;
      expect(isWithheld(entry.staffNote)).toBe(true);
      if (entry.kind === "past") expect(entry.owed).toBe(false);
    }
    expect(recorded).toBeGreaterThan(0);
  });
});

describe("the trainee workspace, rendered", () => {
  function renderTrainee() {
    const fixture = buildTraineeWorkspaceFixture(NOW);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <TimezoneProvider initialTimezone="Europe/Helsinki">
          <NowProvider initialNow={NOW}>
            <TraineeWorkspace product={fixture.product} feed={fixture.feed} />
          </NowProvider>
        </TimezoneProvider>
      </NextIntlClientProvider>,
    );
    return fixture;
  }

  it("never puts a staff-only string on the page", () => {
    const club = buildGroupWorkspaceFixture(NOW, "club");
    renderTrainee();
    const page = document.body.textContent;

    if (club.groupNotes.staffNote) {
      expect(page).not.toContain(club.groupNotes.staffNote);
    }
    for (const note of Object.values(club.memberFlair.notes)) {
      expect(page).not.toContain(note);
    }
    const own = club.data.groups.find((g) => g.id === club.data.my_group_id);
    for (const member of own?.roster ?? []) {
      if ("parent_email" in member && member.parent_email) {
        expect(page).not.toContain(member.parent_email);
      }
    }
  });

  it("keeps each seat's contact line as withheld filler", () => {
    const { feed } = renderTrainee();
    expect(
      screen.getAllByText(
        messages.gedu.groupWorkspace.contactWithheld,
      ),
    ).toHaveLength(feed.roster.length);
  });

  it("chips the group's trainees among its gedus, tagged Trainee", () => {
    renderTrainee();
    const chips = screen
      .getAllByText("Veera")
      .filter((name) => name.parentElement?.textContent === "VeeraTrainee");
    expect(chips).toHaveLength(1);
  });

  it("opens the group notes editor, and its Save explains itself instead of saving", () => {
    renderTrainee();
    const heading = screen.getByText(messages.gedu.groupNotes.heading);
    // The panel is the heading row's parent: the row holds the pencil, and
    // the editor opens beneath it inside the same element.
    const panel = heading.parentElement?.parentElement;
    if (!panel) throw new Error("The group notes panel did not render.");
    fireEvent.click(within(panel).getByRole("button", { name: /Edit/ }));

    fireEvent.click(
      within(panel).getByRole("button", {
        name: messages.gedu.groupNotes.save,
        description: messages.gedu.trainee.lockedHint,
      }),
    );
    expect(
      screen.getByText(messages.gedu.trainee.groupNotesWhat),
    ).toBeTruthy();
    expect(screen.getByText(messages.gedu.trainee.whySave)).toBeTruthy();
  });
});
