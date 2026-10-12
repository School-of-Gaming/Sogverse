import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * **Saving a holiday calendar, from the press to the write.**
 *
 * A calendar some club follows is previewed before it is saved, because the
 * save is live. What only a render can prove is the order of things: an edit
 * that changes no club saves on the press, one that does waits for the confirm
 * dialog, and a refusal from the preview lands as the form's own error rather
 * than as a dialog. Translations echo their key and values, so nothing here
 * depends on wording in `messages/`.
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
      screen.getByText("futureRemoved count=2 dates=Oct 15, Jan 6, 2031"),
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

  it("refuses a draft before asking anything, naming the break by its number", async () => {
    const onSubmit = vi.fn();
    const preview = vi.fn();
    const { submit } = renderForm({
      onSubmit,
      preview,
      draft: { ...DRAFT, names: { drafts: { en: { b1: "" } }, active: "en" } },
    });
    submit();

    expect(
      await screen.findByText("errors.breakNameMissing number=1 language=English"),
    ).toBeTruthy();
    expect(preview).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("the holiday calendar form's language tabs", () => {
  it("marks only a fully named tab complete, and flags no fault on a partly named one", () => {
    renderForm({
      onSubmit: vi.fn(),
      draft: {
        ...DRAFT,
        breaks: [
          ...DRAFT.breaks,
          { key: "b2", id: "b2", startDate: "2031-02-17", endDate: "2031-02-23" },
        ],
        names: {
          drafts: {
            en: { b1: "Autumn break", b2: "Winter break" },
            fi: { b1: "Syysloma" },
            sv: {},
          },
          active: "en",
        },
      },
    });
    // Work in progress shows the not-complete mark only; the attention mark is
    // kept for a fault, as on the other per-locale editors.
    const finnish = screen.getByRole("button", { name: /^Suomi/ }).textContent;
    expect(finnish).toContain("notComplete");
    expect(finnish).not.toContain("errors.");
    expect(screen.getByRole("button", { name: /^Svenska/ }).textContent).not.toContain(
      "errors.",
    );
    expect(screen.getByRole("button", { name: /^English/ }).textContent).toContain(
      "complete",
    );
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

  it("goes up for a date", () => {
    const { container } = renderForm({ onSubmit: vi.fn() });
    const start = container.querySelector<HTMLInputElement>("#holiday-break-b1-start");
    if (!start) throw new Error("no start date");
    fireEvent.change(start, { target: { value: "2030-10-13" } });
    expect(guarded()).toBe(true);
  });

  it("goes up for a break added, and for a break removed", () => {
    const first = renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "addBreak" }));
    expect(guarded()).toBe(true);
    first.unmount();

    renderForm({ onSubmit: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "removeBreak number=1" }));
    expect(guarded()).toBe(true);
  });

  it("stays down for a language added and left blank, and goes up once a break is named in it", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.change(screen.getByLabelText("addLanguage"), { target: { value: "fi" } });
    expect(guarded()).toBe(false);
    fireEvent.change(screen.getByLabelText("fields.breakName language=Finnish"), {
      target: { value: "Syysloma" },
    });
    expect(guarded()).toBe(true);
  });

  it("goes up for a break's name changed in a tab", () => {
    renderForm({ onSubmit: vi.fn() });
    fireEvent.change(screen.getByLabelText("fields.breakName language=English"), {
      target: { value: "Fall break" },
    });
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
    expect(guarded()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "saveChanges" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(guarded()).toBe(false);
  });
});
