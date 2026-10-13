import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * **Saving a holiday calendar, from the press to the write**, and **editing
 * one break in its dialog**.
 *
 * A calendar some club follows is previewed before it is saved, because the
 * save is live. What only a render can prove is the order of things: an edit
 * that changes no club saves on the press, one that does waits for the confirm
 * dialog, and a refusal from the preview lands as the form's own error rather
 * than as a dialog. A break is added or edited in a dialog that files it into
 * the draft on its own Save, so nothing it holds counts until then.
 * Translations echo their key and values, so nothing here depends on wording
 * in `messages/`.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useLocale: () => "en",
}));

import { HolidayCalendarForm } from "@/components/admin/holiday-calendars/holiday-calendar-form";
import type { HolidayCalendarDraft } from "@/components/admin/holiday-calendars/holiday-calendar-draft";
import type { HolidayImpactSummary } from "@/components/admin/holiday-calendars/holiday-calendar-impact";

const DRAFT: HolidayCalendarDraft = {
  name: "Helsinki schools",
  breaks: [{ key: "b1", id: "b1", startDate: "2030-10-14", endDate: "2030-10-20" }],
  names: { drafts: { en: { b1: "Autumn break" } }, active: "en" },
};

/** Two breaks in three languages: the second named in English alone. */
const PARTLY_NAMED: HolidayCalendarDraft = {
  ...DRAFT,
  breaks: [
    ...DRAFT.breaks,
    { key: "b2", id: "b2", startDate: "2031-02-17", endDate: "2031-02-23" },
  ],
  names: {
    drafts: {
      en: { b1: "Autumn break", b2: "Winter break" },
      fi: { b1: "Syysloma" },
      sv: { b1: "Höstlov" },
    },
    active: "en",
  },
};

const IMPACT: HolidayImpactSummary = {
  productId: "p1",
  productType: "municipality_club",
  name: "Minecraft club, Kallio",
  today: "2030-10-01",
  futureRemoved: ["2030-10-15", "2031-01-06"],
  futureRestored: [],
  pastRemoved: [],
  pastRestored: [],
  recordsHidden: 0,
  recordsShown: 0,
  requestsStopped: 2,
  requestsReopened: 0,
};

function renderForm(props: {
  onSubmit: (input: unknown) => Promise<void>;
  preview?: () => Promise<HolidayImpactSummary[]>;
  draft?: HolidayCalendarDraft;
}) {
  const utils = render(
    <HolidayCalendarForm
      initialDraft={props.draft ?? DRAFT}
      submitLabel="submit"
      today="2030-10-01"
      onSubmit={props.onSubmit}
      preview={props.preview}
      onCancel={() => {}}
    />,
  );
  return {
    ...utils,
    submit: () => fireEvent.submit(utils.container.querySelector("form")!),
  };
}

/** The open break dialog's form, found by its title. */
function breakDialog(title: "addBreak" | "dialog.editTitle"): HTMLFormElement {
  const form = screen.getByRole("heading", { name: title }).closest("form");
  if (!form) throw new Error("no break dialog");
  return form;
}

function setDate(id: "holiday-break-start" | "holiday-break-end", value: string) {
  const input = document.getElementById(id);
  if (!input) throw new Error(`no ${id}`);
  fireEvent.change(input, { target: { value } });
}

describe("the holiday calendar form", () => {
  it("saves straight away when there is nothing to preview", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { submit } = renderForm({ onSubmit });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Helsinki schools" });
  });

  it("saves straight away when the preview changes no club", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const preview = vi.fn().mockResolvedValue([]);
    const { submit } = renderForm({ onSubmit, preview });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(preview).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("title")).toBeNull();
  });

  it("asks first when a club changes, and saves only on confirm", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const preview = vi.fn().mockResolvedValue([IMPACT]);
    const { submit } = renderForm({ onSubmit, preview });
    submit();

    expect(await screen.findByText("title")).toBeTruthy();
    expect(screen.getByText("Minecraft club, Kallio")).toBeTruthy();
    // A date in the club's current year goes without its year; one in another
    // year says which.
    expect(
      screen.getByText("futureRemoved count=2 dates=15 Oct, 6 Jan 2031"),
    ).toBeTruthy();
    expect(screen.getByText("requestsStopped count=2")).toBeTruthy();
    // Nothing that did not change is said.
    expect(screen.queryByText(/^recordsHidden/)).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("shows a refusal from the preview as the form's error, in the database's words", async () => {
    const onSubmit = vi.fn();
    const preview = vi
      .fn()
      .mockRejectedValue({ code: "23514", message: "The breaks from A to B and from C to D overlap" });
    const { submit } = renderForm({ onSubmit, preview });
    submit();

    expect(
      await screen.findByText(
        "errors.saveFailedWithReason reason=The breaks from A to B and from C to D overlap",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("title")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("refuses a draft before asking anything, naming the break by its name and dates", async () => {
    const onSubmit = vi.fn();
    const preview = vi.fn();
    const { submit } = renderForm({ onSubmit, preview, draft: PARTLY_NAMED });
    submit();

    expect(
      await screen.findByText(
        /^errors\.breakNameMissing name=Winter break \(.*Feb.*\) language=Finnish$/,
      ),
    ).toBeTruthy();
    expect(preview).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves without a tab left blank", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { submit } = renderForm({
      onSubmit,
      draft: {
        ...DRAFT,
        names: { drafts: { en: { b1: "Autumn break" }, sv: {} }, active: "sv" },
      },
    });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      breaks: [{ names: [{ locale: "en", name: "Autumn break" }] }],
    });
  });
});

describe("the holiday calendar form's list of breaks", () => {
  it("lists each break by first day, saying which languages it is named in", () => {
    renderForm({
      onSubmit: vi.fn(),
      draft: { ...PARTLY_NAMED, breaks: [...PARTLY_NAMED.breaks].reverse() },
    });
    const rows = screen.getAllByRole("button", { name: /^editBreak/ });
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "editBreak name=Autumn break",
      "editBreak name=Winter break",
    ]);
    const winter = rows[1].closest("li");
    if (!winter) throw new Error("no row");
    const languages = within(winter).getByRole("list", { name: "fields.languages" });
    expect(within(languages).getByText(/English/).textContent).toContain("complete");
    expect(within(languages).getByText(/Suomi/).textContent).toContain("notComplete");
  });
});

describe("the break dialog", () => {
  it("marks only the tabs this break is named in complete, and flags no fault before a save", () => {
    renderForm({ onSubmit: vi.fn(), draft: PARTLY_NAMED });
    fireEvent.click(screen.getByRole("button", { name: "editBreak name=Winter break" }));
    const dialog = breakDialog("dialog.editTitle");
    const english = within(dialog).getByRole("button", { name: /^English/ }).textContent;
    expect(english).toContain("complete");
    expect(english).not.toContain("notComplete");
    // Work in progress shows the not-complete mark only; the attention mark is
    // kept for a fault, as on the other per-locale editors.
    const finnish = within(dialog).getByRole("button", { name: /^Suomi/ }).textContent;
    expect(finnish).toContain("notComplete");
    expect(finnish).not.toContain("breakErrors.");
  });

  it("checks one break on its Save, and files nothing it refuses", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "addBreak" }));
    const dialog = breakDialog("addBreak");
    fireEvent.click(within(dialog).getByRole("button", { name: "save" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("breakErrors.datesRequired");

    setDate("holiday-break-start", "2031-02-23");
    setDate("holiday-break-end", "2031-02-17");
    expect(within(dialog).getByRole("alert").textContent).toBe("breakErrors.endBeforeStart");

    setDate("holiday-break-start", "2031-02-17");
    setDate("holiday-break-end", "2031-02-23");
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "breakErrors.nameMissing language=English",
    );
    // The fault sits on the tab too, since it may be one not being shown.
    expect(
      within(dialog).getByRole("button", { name: /^English/ }).textContent,
    ).toContain("breakErrors.nameMissing");
    expect(guarded()).toBe(false);
  });

  it("files the break on Save and opens a fresh one for Save and add another", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "addBreak" }));
    setDate("holiday-break-start", "2031-02-17");
    setDate("holiday-break-end", "2031-02-23");
    fireEvent.change(screen.getByLabelText("fields.breakName language=English"), {
      target: { value: "Winter break" },
    });
    fireEvent.click(screen.getByRole("button", { name: "dialog.saveAndAddAnother" }));

    expect(screen.getByRole("button", { name: "editBreak name=Winter break" })).toBeTruthy();
    const fresh = breakDialog("addBreak");
    expect(fresh.querySelector<HTMLInputElement>("#holiday-break-start")?.value).toBe("");
    expect(document.activeElement?.id).toBe("holiday-break-start");

    fireEvent.click(within(fresh).getByRole("button", { name: "cancel" }));
    expect(screen.queryByRole("heading", { name: "addBreak" })).toBeNull();
  });

  it("saves on Enter in the name, and never submits the calendar with it", () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    fireEvent.click(screen.getByRole("button", { name: "editBreak name=Autumn break" }));
    const name = screen.getByLabelText("fields.breakName language=English");
    fireEvent.change(name, { target: { value: "Fall break" } });
    // jsdom does not submit a form on Enter; the browser does, and the field
    // sits in the dialog's own form.
    fireEvent.submit(breakDialog("dialog.editTitle"));
    expect(screen.queryByRole("heading", { name: "dialog.editTitle" })).toBeNull();
    expect(screen.getByRole("button", { name: "editBreak name=Fall break" })).toBeTruthy();
    // The dialog sits inside the page's form in React's tree; one break's Save
    // must never save the whole calendar.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("leaves Escape to an open date picker, and closes on the next one", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "addBreak" }));
    fireEvent.click(screen.getAllByRole("button", { name: "openCalendar" })[0]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "addBreak" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "addBreak" })).toBeNull();
  });
});

/** Whether leaving now would be asked about: the page's `beforeunload` answer. */
function guarded(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("the holiday calendar form's unsaved-changes guard", () => {
  const nameBox = () => screen.getByLabelText<HTMLInputElement>("fields.name");

  it("stays down untouched, goes up for the name, and down when it is put back", () => {
    renderForm({ onSubmit: vi.fn() });
    expect(guarded()).toBe(false);
    fireEvent.change(nameBox(), { target: { value: "Espoo schools" } });
    expect(guarded()).toBe(true);
    fireEvent.change(nameBox(), { target: { value: "Helsinki schools" } });
    expect(guarded()).toBe(false);
  });

  it("goes up for a date once the dialog saves it, and not before", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "editBreak name=Autumn break" }));
    setDate("holiday-break-start", "2030-10-13");
    expect(guarded()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(guarded()).toBe(true);
  });

  it("stays down when the dialog is cancelled", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "editBreak name=Autumn break" }));
    fireEvent.change(screen.getByLabelText("fields.breakName language=English"), {
      target: { value: "Fall break" },
    });
    fireEvent.click(
      within(breakDialog("dialog.editTitle")).getByRole("button", { name: "cancel" }),
    );
    expect(guarded()).toBe(false);
    expect(screen.getByRole("button", { name: "editBreak name=Autumn break" })).toBeTruthy();
  });

  it("goes up for a break added, and for a break removed", () => {
    const first = renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "addBreak" }));
    setDate("holiday-break-start", "2031-02-17");
    setDate("holiday-break-end", "2031-02-23");
    fireEvent.change(screen.getByLabelText("fields.breakName language=English"), {
      target: { value: "Winter break" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(guarded()).toBe(true);
    first.unmount();

    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "removeBreak name=Autumn break" }));
    expect(guarded()).toBe(true);
  });

  it("goes up for a language added in the dialog once the break is named in it", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "editBreak name=Autumn break" }));
    fireEvent.change(screen.getByLabelText("addLanguage"), { target: { value: "fi" } });
    fireEvent.change(screen.getByLabelText("fields.breakName language=Finnish"), {
      target: { value: "Syysloma" },
    });
    expect(guarded()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(guarded()).toBe(true);
  });

  it("stands down once a save is pressed", async () => {
    // A save that never settles: the page is on its way out.
    const { submit } = renderForm({ onSubmit: () => new Promise(() => {}) });
    fireEvent.change(nameBox(), { target: { value: "Espoo schools" } });
    expect(guarded()).toBe(true);
    submit();
    await waitFor(() => expect(guarded()).toBe(false));
  });

  it("stays up while the confirm dialog waits, and stands down once it is confirmed", async () => {
    const onSubmit = vi.fn(() => new Promise<void>(() => {}));
    const preview = vi.fn().mockResolvedValue([IMPACT]);
    const { submit } = renderForm({ onSubmit, preview });
    fireEvent.change(nameBox(), { target: { value: "Espoo schools" } });
    submit();
    expect(await screen.findByText("title")).toBeTruthy();
    // The guard is down while the preview runs and is armed again by an effect
    // of the render that opens the dialog, so it lands just after the title.
    await waitFor(() => expect(guarded()).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(guarded()).toBe(false);
  });
});
