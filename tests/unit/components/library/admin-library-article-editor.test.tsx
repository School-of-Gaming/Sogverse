import { describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * **The Library article editor, as an admin types into it while the page
 * refetches underneath.**
 *
 * Every Library write refetches the article, so the editor is handed a new
 * `article` prop while the admin is mid-sentence. What is pinned here is that
 * the form is seeded once per article and never per read — the product form
 * once lost a half-filled form to exactly this — and that the page's other
 * logic reads the saved copy: whether there is anything to save, and what the
 * Publish control says. Also pinned is the page's shape — the status on top,
 * every action in one row beneath the form with the reasons Publish waits
 * beside them, a row that typing never adds to or takes from, and never more
 * than one filled button — and the ask before unsaved work is left.
 *
 * Translations echo their key plus the values they were handed; the rich
 * editor is replaced by a textarea, since nothing here looks inside it.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useFormatter: () => ({ list: (items: string[]) => items.join(" + ") }),
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

vi.mock("@/components/admin/library/article-body-editor", () => ({
  ArticleBodyEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (markdown: string) => void;
    ariaLabel: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      defaultValue={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import {
  LibraryArticleEditor,
  type LibraryArticleEditorActions,
} from "@/components/admin/library/library-article-editor";
import type {
  AdminLibraryArticle,
  LibraryArticleDraft,
  LibraryArticleDraftVersion,
} from "@/services/library";

const EN: LibraryArticleDraftVersion = {
  locale: "en",
  title: "Setting up a family gaming agreement",
  summary: "",
  body: "## Why write it down\n\nA rule in one head is a rule to argue with.",
};

const ARTICLE: AdminLibraryArticle = {
  draft: {
    id: "bb744329-6849-4d79-be8e-da6b5bdec6fa",
    versions: [EN],
    category: "screen_time",
    coverImageId: null,
    coverPath: null,
    coverLabel: null,
    createdAt: "2026-09-12T11:00:00Z",
    updatedAt: "2026-09-15T08:05:00Z",
  },
  publication: null,
  hasUnpublishedChanges: false,
};

/** The article's saved copy with its English version changed. */
function enDraft(patch: Partial<LibraryArticleDraftVersion>): LibraryArticleDraft {
  return { ...ARTICLE.draft, versions: [{ ...EN, ...patch }] };
}

function actions(
  overrides: Partial<LibraryArticleEditorActions> = {},
): LibraryArticleEditorActions {
  return {
    save: vi.fn(async () => {}),
    publish: vi.fn(async () => {}),
    unpublish: vi.fn(async () => {}),
    ...overrides,
  };
}

/** The cover field's upload is a mutation, so the editor needs a query client. */
function withQueryClient() {
  const client = new QueryClient();
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function renderEditor(
  article: AdminLibraryArticle,
  editorActions = actions(),
) {
  const utils = render(
    <LibraryArticleEditor
      article={article}
      actions={editorActions}
    />,
    { wrapper: withQueryClient() },
  );
  const rerenderWith = (next: AdminLibraryArticle) =>
    utils.rerender(
      <LibraryArticleEditor
        article={next}
        actions={editorActions}
        />,
    );
  return { ...utils, rerenderWith };
}

/** Unmount whatever is on screen and render the editor afresh. */
function cleanupAndRender(article: AdminLibraryArticle) {
  cleanup();
  return renderEditor(article);
}

/** A text box by its label, narrowed by what it is rather than by a cast. */
function textBox(label: string): HTMLInputElement | HTMLTextAreaElement {
  const element = screen.getByLabelText(label);
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement)
  ) {
    throw new Error(`${label} is not a text box`);
  }
  return element;
}

const titleBox = () => textBox("fields.title");
const summaryBox = () => textBox("fields.summary");
const saveButton = () =>
  screen.getByRole("button", { name: "actions.save" });
const publishButton = () =>
  screen.getByRole("button", { name: "publish" });

/** The status row at the top of the page. */
const panel = () => screen.getByRole("region", { name: "statusPanel.label" });

/** The row of actions beneath the form: the form's second child, after the card. */
function bottomRow(): HTMLElement {
  const row = saveButton().closest("form")!.children[1];
  if (!(row instanceof HTMLElement)) throw new Error("the form has no action row");
  return row;
}

/**
 * The reasons Publish is held back — the one element in the bottom row with
 * an id, the one the buttons point at. It is there, empty, when nothing is.
 */
function reasons(): HTMLElement {
  const element = bottomRow().querySelector<HTMLElement>("[id]");
  if (element === null) throw new Error("the bottom row holds no reasons");
  return element;
}

/** The accessible names of the bottom row's controls, in DOM order. */
function actionRow(): string[] {
  return Array.from(bottomRow().querySelectorAll("button, a")).map(
    (control) => control.textContent.trim(),
  );
}

/** Whether a control is drawn as the filled, amber affirmative. */
const isFilled = (control: HTMLElement) =>
  control.className.split(" ").includes("bg-act");

const PUBLICATION = {
  id: ARTICLE.draft.id,
  versions: [{ locale: "en" as const, title: EN.title, summary: "A summary", body: EN.body }],
  category: "screen_time" as const,
  coverPath: null,
  firstPublishedAt: "2026-09-16T08:00:00Z",
  publishedAt: "2026-09-16T08:00:00Z",
};

/** Live, and exactly as saved: nothing new to publish. */
const LIVE: AdminLibraryArticle = {
  ...ARTICLE,
  draft: enDraft({ summary: "A summary" }),
  publication: PUBLICATION,
};

describe("the Library article editor", () => {
  it("keeps what is being typed when the article is read again", () => {
    const { rerenderWith } = renderEditor(ARTICLE);

    fireEvent.change(summaryBox(), {
      target: { value: "Why a written agreement ends arguments." },
    });

    // The same article, read again after somebody else's save.
    rerenderWith({
      ...ARTICLE,
      draft: {
        ...enDraft({ title: "A title saved elsewhere" }),
        updatedAt: "2026-09-21T09:00:00Z",
      },
    });

    expect(summaryBox().value).toBe("Why a written agreement ends arguments.");
    expect(titleBox().value).toBe(EN.title);
  });

  it("seeds afresh for a different article", () => {
    const { rerenderWith } = renderEditor(ARTICLE);
    fireEvent.change(summaryBox(), { target: { value: "Typed here" } });

    rerenderWith({
      ...ARTICLE,
      draft: {
        ...enDraft({
          title: "What to ask a club before your child joins",
          summary: "Its own summary",
        }),
        id: "70f64c69-1681-4b3b-8ab6-420642e48598",
      },
    });

    expect(titleBox().value).toBe("What to ask a club before your child joins");
    expect(summaryBox().value).toBe("Its own summary");
  });

  it("offers Save only while the form differs from the saved copy", async () => {
    const save = vi.fn(async () => {});
    const { rerenderWith } = renderEditor(ARTICLE, actions({ save }));
    expect(saveButton().hasAttribute("disabled")).toBe(true);

    fireEvent.change(summaryBox(), { target: { value: "A summary " } });
    expect(saveButton().hasAttribute("disabled")).toBe(false);

    await act(async () => {
      fireEvent.submit(saveButton().closest("form")!);
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        versions: [{ ...EN, summary: "A summary" }],
        coverImageId: null,
      }),
    );

    // The refetch after the save hands back the trimmed copy: nothing is
    // unsaved any more, and the typed text is still what is in the box.
    rerenderWith({
      ...ARTICLE,
      draft: enDraft({ summary: "A summary" }),
    });
    expect(saveButton().hasAttribute("disabled")).toBe(true);
    expect(summaryBox().value).toBe("A summary ");
  });

  it("refuses a save with a language left without its title, naming it", () => {
    const save = vi.fn(async () => {});
    renderEditor(ARTICLE, actions({ save }));

    fireEvent.change(titleBox(), { target: { value: "   " } });
    fireEvent.submit(saveButton().closest("form")!);

    expect(save).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) =>
          alert.textContent.includes("errors.versionTitleRequired language=English"),
        ),
    ).toBe(true);
  });

  it("names the fields publishing still needs and holds Publish back", () => {
    renderEditor(ARTICLE);

    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(reasons().textContent).toBe(
      "readiness.missing fields=missing.completeVersion",
    );
  });

  it("sets the reasons beside the buttons, and reads them out with Publish", () => {
    renderEditor(ARTICLE);

    const reasonId = publishButton().getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    const reason = document.getElementById(reasonId!);
    expect(reason).toBe(reasons());
    expect(reason?.textContent).toContain("readiness.missing");
    // Read once, where the buttons are, and nowhere near the status.
    expect(screen.getAllByText(/readiness\./)).toHaveLength(1);
    expect(panel().textContent).not.toContain("readiness.");

    // Unsaved changes need no sentence: the reason stays what is missing.
    fireEvent.change(titleBox(), { target: { value: "A retitled article" } });
    expect(reasons().textContent).toContain("readiness.missing");
    expect(screen.getAllByText(/readiness\./)).toHaveLength(1);
  });

  it("asks for a save before publishing, then publishes the saved copy", async () => {
    const publish = vi.fn(async () => {});
    const { rerenderWith } = renderEditor(ARTICLE, actions({ publish }));

    fireEvent.change(summaryBox(), { target: { value: "A summary" } });
    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(reasons().textContent).toBe("");

    rerenderWith({
      ...ARTICLE,
      draft: enDraft({ summary: "A summary" }),
    });
    expect(publishButton().hasAttribute("disabled")).toBe(false);
    expect(reasons().textContent).toBe("");

    await act(async () => {
      fireEvent.click(publishButton());
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("offers the changes, the public page and Unpublish on a live article", () => {
    renderEditor({ ...LIVE, hasUnpublishedChanges: true });

    expect(
      screen
        .getByRole("button", { name: "publishChanges" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.getByRole("button", { name: "unpublish" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "viewLive" }).getAttribute("href"),
    ).toBe(`/library/${ARTICLE.draft.id}`);
  });

  describe("the bottom row", () => {
    it("holds every action beside Save, Unpublish first and Publish last", () => {
      renderEditor(LIVE);

      expect(actionRow()).toEqual([
        "unpublish",
        "preview",
        "viewLive",
        "actions.save",
        "publishChanges",
      ]);
      // The status row above holds no control at all.
      expect(within(panel()).queryAllByRole("button")).toHaveLength(0);
      expect(within(panel()).queryAllByRole("link")).toHaveLength(0);
    });

    it("sets the reasons after Unpublish and before the right-hand group", () => {
      renderEditor({
        ...LIVE,
        draft: enDraft({ summary: "" }),
        hasUnpublishedChanges: true,
      });

      const unpublish = screen.getByRole("button", { name: "unpublish" });
      const preview = screen.getByRole("link", { name: "preview" });
      const reason = screen.getByText(/readiness\.missing/);
      const follows = (a: Node, b: Node) =>
        (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(follows(unpublish, reason)).toBe(true);
      expect(follows(reason, preview)).toBe(true);
      expect(bottomRow().contains(reason)).toBe(true);
    });

    it("keeps Save and Publish together, apart from the controls that may wrap", () => {
      renderEditor(LIVE);

      const pair = saveButton().parentElement!;
      expect(
        Array.from(pair.children).map((control) => control.textContent.trim()),
      ).toEqual(["actions.save", "publishChanges"]);
    });

    it("fills only whichever of Save and Publish can be pressed", () => {
      const publishChanges = () =>
        screen.getByRole("button", { name: "publishChanges" });

      // A clean draft still missing a field: neither can be pressed.
      const draft = renderEditor(ARTICLE);
      expect(isFilled(saveButton())).toBe(false);
      expect(isFilled(publishButton())).toBe(false);

      // Unsaved changes: Save is the next step.
      fireEvent.change(summaryBox(), { target: { value: "A summary" } });
      expect(isFilled(saveButton())).toBe(true);
      expect(isFilled(publishButton())).toBe(false);
      draft.unmount();

      // Clean, live, with saved changes waiting: Publish is.
      renderEditor({ ...LIVE, hasUnpublishedChanges: true });
      expect(isFilled(saveButton())).toBe(false);
      expect(isFilled(publishChanges())).toBe(true);
    });

    it("keeps Publish changes on a live article with nothing new, disabled", () => {
      renderEditor(LIVE);

      const publishChanges = screen.getByRole("button", {
        name: "publishChanges",
      });
      expect(publishChanges.hasAttribute("disabled")).toBe(true);
      // Nothing is held back, so there is no reason to read out.
      expect(publishChanges.hasAttribute("aria-describedby")).toBe(false);
      expect(reasons().textContent).toBe("");
    });

    it("neither adds nor removes a control while the admin types", () => {
      renderEditor(LIVE);
      const before = actionRow();

      fireEvent.change(summaryBox(), { target: { value: "A new summary" } });
      expect(actionRow()).toEqual(before);

      fireEvent.change(summaryBox(), { target: { value: "" } });
      expect(actionRow()).toEqual(before);
    });

    it("sets a draft's row without the live article's controls", () => {
      renderEditor(ARTICLE);
      expect(actionRow()).toEqual(["preview", "actions.save", "publish"]);
    });
  });

  describe("the status row", () => {
    it("names a draft with the list's chip and nothing more", () => {
      renderEditor(ARTICLE);

      expect(within(panel()).getByText("draft")).toBeTruthy();
      expect(panel().textContent).not.toContain("statusPanel.");
    });

    it("dates a published article", () => {
      renderEditor(LIVE);

      expect(within(panel()).getByText("published")).toBeTruthy();
      expect(panel().textContent).toContain(
        "statusPanel.publishedLine date=September 16, 2026",
      );
      expect(panel().textContent).not.toContain("statusPanel.changedLine");
    });

    it("says which version readers see while saved changes wait", () => {
      renderEditor({ ...LIVE, hasUnpublishedChanges: true });

      expect(within(panel()).getByText("changed")).toBeTruthy();
      expect(panel().textContent).toContain(
        "statusPanel.changedLine date=September 16, 2026",
      );
      expect(panel().textContent).not.toContain("statusPanel.publishedLine");
    });
  });

  describe("leaving with unsaved changes", () => {
    /** Whether the browser would ask before unloading the page. */
    function unloadIsHeld(): boolean {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }

    it("asks while the form differs from the saved copy, and not once it is saved", () => {
      const { rerenderWith } = renderEditor(ARTICLE);
      expect(unloadIsHeld()).toBe(false);

      fireEvent.change(summaryBox(), { target: { value: "A summary" } });
      expect(unloadIsHeld()).toBe(true);

      rerenderWith({
        ...ARTICLE,
        draft: enDraft({ summary: "A summary" }),
      });
      expect(unloadIsHeld()).toBe(false);
    });

    it("does not ask about a new article nobody has written in, nor its save", async () => {
      const save = vi.fn(async () => {});
      render(<LibraryArticleEditor article={null} actions={{ save }} />, {
        wrapper: withQueryClient(),
      });
      expect(unloadIsHeld()).toBe(false);

      fireEvent.change(titleBox(), { target: { value: "A new article" } });
      expect(unloadIsHeld()).toBe(true);

      await act(async () => {
        fireEvent.submit(titleBox().closest("form")!);
      });
      expect(unloadIsHeld()).toBe(false);
    });
  });

  it("stays committed on a new article's save, whose page is leaving", async () => {
    const save = vi.fn(async () => {});
    render(
      <LibraryArticleEditor
        article={null}
        actions={{ save }}
        />,
      { wrapper: withQueryClient() },
    );

    fireEvent.change(titleBox(), { target: { value: "A new article" } });
    await act(async () => {
      fireEvent.submit(titleBox().closest("form")!);
    });

    expect(save).toHaveBeenCalledTimes(1);
    const submit = screen.getByRole("button", {
      name: "newPage.submit",
    });
    expect(submit.hasAttribute("disabled")).toBe(true);
  });

  it("offers a draft's preview, opening its saved copy's page in a new tab", () => {
    renderEditor(ARTICLE);

    const preview = screen.getByRole("link", { name: "preview" });
    expect(preview.getAttribute("href")).toBe(
      `/library/${ARTICLE.draft.id}/preview`,
    );
    expect(preview.getAttribute("target")).toBe("_blank");
    // A draft is not live, so there is nothing else to open.
    expect(screen.queryByRole("link", { name: "viewLive" })).toBeNull();
  });

  it("holds the preview back while changes are unsaved", () => {
    const { rerenderWith } = renderEditor(ARTICLE);

    fireEvent.change(titleBox(), { target: { value: "A retitled article" } });
    expect(screen.queryByRole("link", { name: "preview" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "preview" }).hasAttribute("disabled"),
    ).toBe(true);

    // Saved: the preview is a link again.
    rerenderWith({
      ...ARTICLE,
      draft: enDraft({ title: "A retitled article" }),
    });
    expect(screen.getByRole("link", { name: "preview" })).toBeTruthy();
  });

  describe("the language tabs", () => {
    /** The tab that opens a language, by the locale's own name. */
    const tab = (name: RegExp) => screen.getByRole("button", { name });

    function addLanguage(locale: string) {
      fireEvent.change(screen.getByRole("combobox", { name: "addLocale" }), {
        target: { value: locale },
      });
    }

    it("opens on the saved language and marks whether it is complete", () => {
      renderEditor(LIVE);
      expect(tab(/^English/).getAttribute("aria-pressed")).toBe("true");
      expect(tab(/^English/).textContent).toContain("versionComplete");

      cleanupAndRender(ARTICLE);
      expect(tab(/^English/).textContent).toContain("versionIncomplete");
    });

    it("keeps what was typed in each language across a switch", () => {
      renderEditor(LIVE);
      addLanguage("fi");
      expect(tab(/^Suomi/).getAttribute("aria-pressed")).toBe("true");
      expect(titleBox().value).toBe("");
      fireEvent.change(titleBox(), { target: { value: "Pelisopimus" } });

      fireEvent.click(tab(/^English/));
      expect(titleBox().value).toBe(EN.title);
      fireEvent.click(tab(/^Suomi/));
      expect(titleBox().value).toBe("Pelisopimus");
    });

    it("saves every language written, and leaves an untouched tab out", async () => {
      const save = vi.fn(async () => {});
      renderEditor(LIVE, actions({ save }));
      addLanguage("fi");
      fireEvent.change(titleBox(), { target: { value: "Pelisopimus" } });
      addLanguage("sv");

      await act(async () => {
        fireEvent.submit(saveButton().closest("form")!);
      });
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          versions: [
            { ...EN, summary: "A summary" },
            { locale: "fi", title: "Pelisopimus", summary: "", body: "" },
          ],
        }),
      );
    });

    it("refuses a language written without its title, naming it", () => {
      const save = vi.fn(async () => {});
      renderEditor(LIVE, actions({ save }));
      addLanguage("fi");
      fireEvent.change(summaryBox(), { target: { value: "Tiivistelmä" } });
      fireEvent.submit(saveButton().closest("form")!);

      expect(save).not.toHaveBeenCalled();
      expect(
        screen
          .getAllByRole("alert")
          .some((alert) =>
            alert.textContent.includes("errors.versionTitleRequired language=Finnish"),
          ),
      ).toBe(true);
    });

    it("says which languages a publish would leave out", () => {
      renderEditor({
        ...LIVE,
        draft: {
          ...LIVE.draft,
          versions: [
            LIVE.draft.versions[0],
            { locale: "fi", title: "Pelisopimus", summary: "", body: "" },
          ],
        },
        hasUnpublishedChanges: false,
      });
      // The half-written Finnish is no change to readers, so nothing is
      // waiting to publish and nothing is said.
      expect(reasons().textContent).toBe("");

      fireEvent.change(summaryBox(), { target: { value: "Edited" } });
      expect(reasons().textContent).toBe(
        "readiness.leftOut languages=Finnish count=1",
      );
    });

    it("removes a language, and keeps the last one", () => {
      renderEditor(LIVE);
      addLanguage("fi");
      fireEvent.click(screen.getByRole("button", { name: "removeLocale language=Finnish" }));
      expect(screen.queryByRole("button", { name: /^Suomi/ })).toBeNull();
      expect(
        screen.queryByRole("button", { name: /^removeLocale/ }),
      ).toBeNull();
    });
  });
});
