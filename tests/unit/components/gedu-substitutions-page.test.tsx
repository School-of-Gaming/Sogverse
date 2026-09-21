import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduFileAbsenceEntry } from "@/components/gedu/GeduFileAbsenceEntry";
import { GeduSubstitutionPoolSectionView } from "@/components/gedu/GeduSubstitutionPoolSectionView";
import { GeduSubstitutionsPageBody } from "@/components/gedu/gedu-substitutions-page-body";
import {
  buildGeduSubstitutionsFixture,
  type GeduSubstitutionsScenario,
} from "@/components/gedu/mock-substitutions-fixtures";
import { buttonVariants } from "@/components/ui/button";
import { NowProvider, TimezoneProvider } from "@/providers";

/**
 * ============================================================================
 * The Substitutions page: what it shows, in what order, and what it marks
 * ============================================================================
 *
 * Three things about this page are decisions rather than consequences, and each
 * is invisible to every other test:
 *
 * - **The open queue comes first and is ordered by how close each session is.**
 *   That is the page's whole job — finding somebody before the session runs
 *   without one — and a grid read in two dimensions makes the order easy to
 *   lose in a tidy-up.
 * - **A session inside the next day is marked, and one further out is not.**
 *   The mark is the app's existing warning status, so what has to hold is
 *   *which* cards wear it, and it is driven by a seeded clock rather than by
 *   real time.
 * - **Offering wears the act colour.** It was the world colour, which is the
 *   brand's other half and not what a press is drawn in. Asserted against the
 *   Button primitive's own output, so a token rename moves both together.
 */

const TIME_ZONE = "Europe/Helsinki";

/**
 * Tuesday 17 March 2026, 11:00 in Helsinki — before that month's DST step, so
 * the fixture's own clock faces are not straddling one.
 *
 * The fixture is derived from this instant and the page is rendered against it,
 * which is what makes "inside the next day" a fact this file controls rather
 * than one it waits for.
 */
const NOW = new Date("2026-03-17T09:00:00Z");

function renderPage(scenario: GeduSubstitutionsScenario) {
  const fixture = buildGeduSubstitutionsFixture(NOW, scenario, "en", TIME_ZONE);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone={TIME_ZONE}>
        <NowProvider initialNow={NOW}>
          <GeduSubstitutionsPageBody
            fileAbsence={
              <GeduFileAbsenceEntry
                sessions={fixture.upcomingSessions}
                filedSessionKeys={fixture.filedSessionKeys}
                resolveWorkspaceHref={() => null}
                onFile={inertWrite}
              />
            }
            // The real section view over the real fixture rows, with the two
            // writes inert — the same split the preview scene takes.
            pool={
              <GeduSubstitutionPoolSectionView
                rows={fixture.pool}
                committingRequestId={null}
                error={null}
                onOffer={inertWrite}
                onWithdraw={noop}
              />
            }
            substitutions={fixture.substitutions}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

function noop() {}

/** The offer's write, never settled: no test here presses through it. */
function inertWrite(): Promise<void> {
  return new Promise(() => {});
}

const copy = messages.gedu.substitution;

describe("the substitutions page, populated", () => {
  it("renders both sections, open queue first", () => {
    const { container } = renderPage("populated");
    const text = container.textContent;

    expect(text).toContain(copy.poolHeading);
    expect(text).toContain(copy.mineHeading);
    expect(text.indexOf(copy.poolHeading)).toBeLessThan(
      text.indexOf(copy.mineHeading),
    );
  });

  it("orders the open cards soonest first", () => {
    const { container } = renderPage("populated");
    const text = container.textContent;

    const order = [
      "Minecraft Redstone Club",
      "Roblox Studio Camp",
      "Fortnite Creative Club",
      "Winter LAN Afternoon",
      "Creator Studio Club",
      "Fortnite Builders Club",
    ].map((name) => {
      const at = text.indexOf(name);
      expect(at, name).toBeGreaterThan(-1);
      return at;
    });

    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("marks only the sessions inside the next day", () => {
    const { container } = renderPage("populated");
    const fixture = buildGeduSubstitutionsFixture(NOW, "populated", "en", TIME_ZONE);

    // Two of the six, by construction: one a couple of hours out and one twenty
    // hours out, against four that are a day or more away.
    const due = fixture.pool.filter(
      (row) =>
        row.startsAt !== null &&
        row.startsAt.getTime() - NOW.getTime() < 24 * 60 * 60 * 1000,
    );
    expect(due).toHaveLength(2);

    // The status ink the warning mark is drawn in — the app's own token, spent
    // on the glyph. Nothing else on this page wears it.
    expect(container.querySelectorAll(".text-warning")).toHaveLength(2);
  });

  it("draws the offer in the act colour, not the world one", () => {
    const { container } = renderPage("populated");

    const offer = [...container.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === copy.poolOfferAction,
    );
    expect(offer).toBeDefined();

    // Whatever the primary variant emits that the world-coloured one does not.
    // Derived from the primitive rather than typed out, so the assertion
    // follows a rename of the class instead of failing on one.
    const classesOf = (value: string) => value.split(/\s+/).filter(Boolean);
    const secondary = new Set(classesOf(buttonVariants({ variant: "secondary" })));
    const primaryOnly = classesOf(buttonVariants({ variant: "default" })).filter(
      (className) => !secondary.has(className),
    );
    // Label only: the glyph went because the words are the whole control, and
    // the two resting states of this one button have to read alike.
    expect(offer!.querySelector("svg")).toBeNull();
    expect(primaryOnly.length).toBeGreaterThan(0);
    for (const className of primaryOnly) {
      expect(offer!.className, className).toContain(className);
    }
    for (const className of secondary) {
      if (primaryOnly.includes(className)) continue;
      // Only the classes the two variants disagree on: the shared base is on
      // every button and proves nothing either way.
      if (classesOf(buttonVariants({ variant: "default" })).includes(className)) {
        continue;
      }
      expect(offer!.className).not.toContain(className);
    }
  });

  it("offers the withdrawal on the card already offered on", () => {
    const { container } = renderPage("populated");
    const labels = [...container.querySelectorAll("button")].map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toContain(copy.poolWithdrawAction);
    expect(labels.filter((l) => l === copy.poolWithdrawAction)).toHaveLength(1);
  });

  it("shows what the gedu has already taken, locked card included", () => {
    const { container } = renderPage("populated");
    const text = container.textContent;

    expect(text).toContain(copy.cardEyebrow);
    // The locked state's line — a substitution is on the page from approval,
    // and its workspace opens 48 hours out.
    expect(text).toContain(copy.accessOpens.split("{")[0].trim());
  });

  /**
   * A `<p>` may not contain a `<div>`: the browser closes the paragraph at the
   * block child, so the server's HTML and the client's tree disagree and React
   * throws a hydration error. This branch shipped exactly that bug once.
   */
  it("puts no block element inside a paragraph", () => {
    const { container } = renderPage("populated");
    expect(container.querySelectorAll("p div")).toHaveLength(0);
    expect(container.querySelectorAll("p p")).toHaveLength(0);
  });
});

/**
 * ============================================================================
 * "Can't make a session?" — the page's own way into filing an absence
 * ============================================================================
 *
 * The second of the feature's two entry points (the first is each session
 * card's overflow menu), and the one with a question to ask first: *which*
 * session. Four things here are decisions rather than consequences:
 *
 * - **It is quiet.** The act colour on this page belongs to "Offer to
 *   substitute", which is what the page is asking of whoever is reading it, so
 *   this control is outlined. Asserted against the Button primitive's own
 *   output, exactly as the offer's colour is above.
 * - **It is absent where there is nothing to file against** — an account
 *   awaiting certification holds no assignments, and a button that could only
 *   ever open an empty list is worse than no button.
 * - **A session already asked for is shown disabled with the reason in place**,
 *   rather than reached and refused, which is what every picker over products
 *   in this app owes its reader.
 * - **The write is pressed once however many times the button is.** The flag is
 *   inline because the dialog carries form content, and it is set before the
 *   render in which a second press could land.
 */
const feedCopy = messages.gedu.sessionFeed;

function entryFixture() {
  return buildGeduSubstitutionsFixture(NOW, "populated", "en", TIME_ZONE);
}

/** The component's own signature, so a mock of the write is typed by it. */
type FileAbsenceProps = ComponentProps<typeof GeduFileAbsenceEntry>;

function renderEntry({
  sessions,
  filedSessionKeys = [],
  onFile = () => Promise.resolve(),
}: {
  sessions: ReturnType<typeof entryFixture>["upcomingSessions"];
  filedSessionKeys?: string[];
  onFile?: FileAbsenceProps["onFile"];
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone={TIME_ZONE}>
        <NowProvider initialNow={NOW}>
          <GeduFileAbsenceEntry
            sessions={sessions}
            filedSessionKeys={filedSessionKeys}
            resolveWorkspaceHref={() => null}
            onFile={onFile}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** The session rows on screen, in DOM order across the weeks. */
function pickerRows(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>("[data-session-key]")];
}

/** The week headings on screen, in order. */
function weekHeadings(): string[] {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: copy.fileAction }));
}

/** One group's worth of the fixture — the gedu who teaches a single club. */
function oneGroup(
  sessions: ReturnType<typeof entryFixture>["upcomingSessions"],
) {
  return sessions.filter((session) => session.groupId === sessions[0].groupId);
}

describe("the page's file-an-absence entry", () => {
  it("is outlined rather than drawn in the act colour", () => {
    const { container } = renderEntry({
      sessions: entryFixture().upcomingSessions,
    });
    const button = [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent.trim() === copy.fileAction,
    );
    expect(button).toBeDefined();

    // Whole class tokens, never substrings: `shadow` is a prefix of the
    // `shadow-sm` the outlined variant legitimately wears, and a substring
    // check would read one as the other.
    const classesOf = (value: string) => new Set(value.split(/\s+/).filter(Boolean));
    const outline = classesOf(buttonVariants({ variant: "outline" }));
    const filled = classesOf(buttonVariants({ variant: "default" }));
    const worn = classesOf(button!.className);

    const outlineOnly = [...outline].filter((className) => !filled.has(className));
    expect(outlineOnly.length).toBeGreaterThan(0);
    for (const className of outlineOnly) {
      expect(worn.has(className), className).toBe(true);
    }
    // And none of the filled variant's own classes: two act-coloured buttons on
    // one page is two things competing for the same press.
    for (const className of filled) {
      if (outline.has(className)) continue;
      expect(worn.has(className), className).toBe(false);
    }
  });

  it("is absent for a gedu with nothing to file against", () => {
    const { container } = renderEntry({ sessions: [] });
    expect(container.textContent).toBe("");
  });

  it("opens on this week and next, in the order the sessions run", () => {
    const sessions = entryFixture().upcomingSessions;
    // The order is the builder's; what this asserts is that the picker draws it
    // and that the builder really is ascending.
    const starts = sessions.map((session) => session.startsAt.getTime());
    expect(starts).toEqual([...starts].sort((a, b) => a - b));

    renderEntry({ sessions });
    openPicker();

    // Five weekly clubs and a camp is a term of rows; what opens is the
    // fortnight almost every absence is in.
    const rows = pickerRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(sessions.length);
    expect(weekHeadings()).toEqual([copy.filePickWeekThis, copy.filePickWeekNext]);
    rows.forEach((row, index) => {
      expect(row.textContent).toContain(sessions[index].productName);
    });
    expect(
      screen.getByRole("button", { name: copy.filePickShowLater }),
    ).toBeTruthy();
  });

  it("reveals the rest below, and hands focus to the first new row", () => {
    const sessions = entryFixture().upcomingSessions;
    renderEntry({ sessions });
    openPicker();

    const before = pickerRows();
    fireEvent.click(
      screen.getByRole("button", { name: copy.filePickShowLater }),
    );

    const after = pickerRows();
    expect(after.length).toBe(sessions.length);
    // Appended below: every row that was on screen is still where it was.
    expect(after.slice(0, before.length).map((row) => row.dataset.sessionKey)).toEqual(
      before.map((row) => row.dataset.sessionKey),
    );
    // The control has nothing left to do and goes.
    expect(
      screen.queryByRole("button", { name: copy.filePickShowLater }),
    ).toBeNull();
    // The keyboard lands on the first row that was not there a moment ago,
    // rather than back at the top of the dialog.
    expect(document.activeElement).toBe(after[before.length]);
    expect(weekHeadings().length).toBeGreaterThan(2);
  });

  it("filters to one group, with every week of it and no gate", () => {
    const sessions = entryFixture().upcomingSessions;
    renderEntry({ sessions });
    openPicker();

    const group = sessions[0].groupId;
    const mine = sessions.filter((session) => session.groupId === group);
    expect(mine.length).toBeGreaterThan(2);

    fireEvent.change(screen.getByLabelText(copy.filePickGroupLabel), {
      target: { value: group },
    });

    // One club's term is a dozen rows — a scroll rather than a wall — so the
    // whole of it is on screen and there is nothing left to reveal.
    expect(pickerRows().map((row) => row.dataset.sessionKey)).toEqual(
      mine.map((session) => session.key),
    );
    expect(
      screen.queryByRole("button", { name: copy.filePickShowLater }),
    ).toBeNull();
  });

  it("has no filter for a gedu who teaches one group", () => {
    renderEntry({ sessions: oneGroup(entryFixture().upcomingSessions) });
    openPicker();
    expect(screen.queryByLabelText(copy.filePickGroupLabel)).toBeNull();
    // And no gate either: one group is never long enough to need one.
    expect(
      screen.queryByRole("button", { name: copy.filePickShowLater }),
    ).toBeNull();
  });

  it("disables a session already asked for and says why, inside its week", () => {
    const sessions = entryFixture().upcomingSessions;
    const filed = sessions[1];
    renderEntry({ sessions, filedSessionKeys: [filed.key] });
    openPicker();

    const rows = pickerRows();
    expect(rows[1].dataset.sessionKey).toBe(filed.key);
    expect(rows[1].hasAttribute("disabled")).toBe(true);
    expect(rows[1].textContent).toContain(copy.fileAlreadyRequested);
    expect(rows[0].hasAttribute("disabled")).toBe(false);
    expect(rows[0].textContent).not.toContain(copy.fileAlreadyRequested);
  });

  it("goes from the picker to the one shared form, and writes once", async () => {
    const sessions = entryFixture().upcomingSessions;
    const onFile = vi.fn<FileAbsenceProps["onFile"]>(() => Promise.resolve());
    renderEntry({ sessions, onFile });

    fireEvent.click(screen.getByRole("button", { name: copy.fileAction }));
    fireEvent.click(pickerRows()[0]);

    // The card's own dialog, reached the other way round: same title, same
    // questions, same confirm.
    expect(
      screen.getByText(feedCopy.substitutionRequestDialogTitle),
    ).toBeTruthy();

    const confirm = screen.getByRole("button", {
      name: feedCopy.substitutionRequestConfirm,
    });
    // Two presses, each its own discrete event, exactly as a fast double-tap
    // arrives: the flag is set before the render the second one lands in, so
    // the second finds a disabled button and nothing happens.
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(confirm.hasAttribute("disabled")).toBe(true);
    await act(async () => {});

    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0]).toBe(sessions[0]);
    // The dialog closes itself, and what is left on the page says where the
    // absence now shows.
    expect(
      screen.queryByText(feedCopy.substitutionRequestDialogTitle),
    ).toBeNull();
    expect(screen.getByText(/It now shows on that session’s card\./)).toBeTruthy();
  });

  it("will not offer the same session twice in one visit", async () => {
    const sessions = entryFixture().upcomingSessions;
    renderEntry({ sessions });

    fireEvent.click(screen.getByRole("button", { name: copy.fileAction }));
    fireEvent.click(pickerRows()[0]);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: feedCopy.substitutionRequestConfirm }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: copy.fileAction }));
    const rows = pickerRows();
    expect(rows[0].hasAttribute("disabled")).toBe(true);
    expect(rows[0].textContent).toContain(copy.fileAlreadyRequested);
  });

  it("keeps a refused write inside the dialog, with the draft intact", async () => {
    const sessions = entryFixture().upcomingSessions;
    renderEntry({
      sessions,
      onFile: () => Promise.reject(new Error("nope")),
    });

    fireEvent.click(screen.getByRole("button", { name: copy.fileAction }));
    fireEvent.click(pickerRows()[0]);
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: feedCopy.substitutionRequestConfirm }),
      );
    });

    expect(screen.getByText(copy.fileFailed)).toBeTruthy();
    const confirm = screen.getByRole("button", {
      name: feedCopy.substitutionRequestConfirm,
    });
    expect(confirm.hasAttribute("disabled")).toBe(false);
    // Nothing has been confirmed, so nothing is claimed on the page behind it.
    expect(
      screen.queryByText(/It now shows on that session’s card\./),
    ).toBeNull();
  });
});

describe("the substitutions page, with nothing outstanding", () => {
  it("answers both sections in one line each", () => {
    const { container } = renderPage("empty");
    const text = container.textContent;

    expect(text).toContain(copy.poolAllClear);
    expect(text).toContain(copy.mineAllClear);
  });

  it("still carries the page's own chrome, which waits on nothing", () => {
    const { container } = renderPage("empty");
    const text = container.textContent;

    expect(text).toContain(copy.pageTitle);
    expect(text).toContain(copy.poolHeading);
    expect(text).toContain(copy.mineHeading);
    expect(text).toContain(copy.back);
  });
});
