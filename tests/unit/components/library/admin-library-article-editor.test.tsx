import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

/**
 * **The Library article editor, as an admin types into it while the page
 * refetches underneath.**
 *
 * Every Library write refetches the article, so the editor is handed a new
 * `article` prop while the admin is mid-sentence. What is pinned here is that
 * the form is seeded once per article and never per read — the product form
 * once lost a half-filled form to exactly this — and that the page's other
 * logic reads the saved copy: whether there is anything to save, and what the
 * Publish control says.
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
import type { AdminLibraryArticle } from "@/services/library";

const ARTICLE: AdminLibraryArticle = {
  draft: {
    id: "bb744329-6849-4d79-be8e-da6b5bdec6fa",
    title: "Setting up a family gaming agreement",
    summary: "",
    body: "## Why write it down\n\nA rule in one head is a rule to argue with.",
    category: "screen_time",
    coverImageId: null,
    coverPath: null,
    createdAt: "2026-09-12T11:00:00Z",
    updatedAt: "2026-09-15T08:05:00Z",
  },
  publication: null,
  hasUnpublishedChanges: false,
};

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

function renderEditor(
  article: AdminLibraryArticle,
  editorActions = actions(),
) {
  const utils = render(
    <LibraryArticleEditor
      article={article}
      actions={editorActions}
    />,
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
        ...ARTICLE.draft,
        title: "A title saved elsewhere",
        updatedAt: "2026-09-21T09:00:00Z",
      },
    });

    expect(summaryBox().value).toBe("Why a written agreement ends arguments.");
    expect(titleBox().value).toBe(ARTICLE.draft.title);
  });

  it("seeds afresh for a different article", () => {
    const { rerenderWith } = renderEditor(ARTICLE);
    fireEvent.change(summaryBox(), { target: { value: "Typed here" } });

    rerenderWith({
      ...ARTICLE,
      draft: {
        ...ARTICLE.draft,
        id: "70f64c69-1681-4b3b-8ab6-420642e48598",
        title: "What to ask a club before your child joins",
        summary: "Its own summary",
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
      expect.objectContaining({ summary: "A summary ", coverImageId: null }),
    );

    // The refetch after the save hands back the trimmed copy: nothing is
    // unsaved any more, and the typed text is still what is in the box.
    rerenderWith({
      ...ARTICLE,
      draft: { ...ARTICLE.draft, summary: "A summary" },
    });
    expect(saveButton().hasAttribute("disabled")).toBe(true);
    expect(summaryBox().value).toBe("A summary ");
  });

  it("refuses a save with no title, naming why", () => {
    const save = vi.fn(async () => {});
    renderEditor(ARTICLE, actions({ save }));

    fireEvent.change(titleBox(), { target: { value: "   " } });
    fireEvent.submit(saveButton().closest("form")!);

    expect(save).not.toHaveBeenCalled();
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent.includes("errors.titleRequired")),
    ).toBe(true);
  });

  it("names the fields publishing still needs and holds Publish back", () => {
    renderEditor(ARTICLE);

    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain(
      "readiness.missing fields=missing.summary",
    );
    // A cover is optional, so it is never among them.
    expect(document.body.textContent).not.toContain("missing.cover");
  });

  it("sets the reason Publish is held back beside it, and reads it out with it", () => {
    renderEditor(ARTICLE);

    const reasonId = publishButton().getAttribute("aria-describedby");
    expect(reasonId).toBeTruthy();
    const reason = document.getElementById(reasonId!);
    expect(reason?.textContent).toContain("readiness.missing");
    // On the row with the buttons, not in a line of its own beneath it.
    expect(reason?.parentElement?.contains(publishButton())).toBe(true);

    fireEvent.change(summaryBox(), { target: { value: "A summary" } });
    expect(
      document.getElementById(publishButton().getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("readiness.unsaved");
  });

  it("asks for a save before publishing, then publishes the saved copy", async () => {
    const publish = vi.fn(async () => {});
    const { rerenderWith } = renderEditor(ARTICLE, actions({ publish }));

    fireEvent.change(summaryBox(), { target: { value: "A summary" } });
    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(document.body.textContent).toContain("readiness.unsaved");

    rerenderWith({
      ...ARTICLE,
      draft: { ...ARTICLE.draft, summary: "A summary" },
    });
    expect(publishButton().hasAttribute("disabled")).toBe(false);

    await act(async () => {
      fireEvent.click(publishButton());
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("offers the changes, the public page and Unpublish on a live article", () => {
    renderEditor({
      ...ARTICLE,
      draft: { ...ARTICLE.draft, summary: "A summary" },
      publication: {
        id: ARTICLE.draft.id,
        title: "The title readers see",
        summary: "A summary",
        body: ARTICLE.draft.body,
        category: "screen_time",
        coverPath: null,
        firstPublishedAt: "2026-09-16T08:00:00Z",
        publishedAt: "2026-09-16T08:00:00Z",
      },
      hasUnpublishedChanges: true,
    });

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

  describe("the status beside the publishing controls", () => {
    const PUBLICATION = {
      id: ARTICLE.draft.id,
      title: ARTICLE.draft.title,
      summary: "A summary",
      body: ARTICLE.draft.body,
      category: "screen_time" as const,
      coverPath: null,
      firstPublishedAt: "2026-09-16T08:00:00Z",
      publishedAt: "2026-09-16T08:00:00Z",
    };
    const panel = () =>
      screen.getByRole("region", { name: "statusPanel.label" });

    it.each([
      ["draft", ARTICLE],
      [
        "published",
        {
          ...ARTICLE,
          draft: { ...ARTICLE.draft, summary: "A summary" },
          publication: PUBLICATION,
        },
      ],
    ] as const)(
      "names a %s article with the list's chip and nothing more",
      (status, article) => {
        renderEditor(article);

        expect(within(panel()).getByText(status)).toBeTruthy();
        expect(panel().textContent).not.toContain("statusPanel.changedLine");
      },
    );

    it("says which version readers see while saved changes wait", () => {
      renderEditor({
        ...ARTICLE,
        draft: { ...ARTICLE.draft, summary: "A summary" },
        publication: PUBLICATION,
        hasUnpublishedChanges: true,
      });

      expect(within(panel()).getByText("changed")).toBeTruthy();
      expect(panel().textContent).toContain(
        "statusPanel.changedLine date=September 16, 2026",
      );
    });
  });

  it("stays committed on a new article's save, whose page is leaving", async () => {
    const save = vi.fn(async () => {});
    render(
      <LibraryArticleEditor
        article={null}
        actions={{ save }}
        />,
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

  it("holds the preview back while changes are unsaved, and says so", () => {
    const { rerenderWith } = renderEditor(ARTICLE);

    fireEvent.change(titleBox(), { target: { value: "A retitled article" } });
    expect(screen.queryByRole("link", { name: "preview" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "preview" }).hasAttribute("disabled"),
    ).toBe(true);
    // Publish is still held back by what is missing, so the line is the
    // preview's alone.
    expect(document.body.textContent).toContain("readiness.previewUnsaved");
    expect(document.body.textContent).not.toContain("readiness.unsaved");

    // Saved: the preview is a link again, and the line is gone.
    rerenderWith({
      ...ARTICLE,
      draft: { ...ARTICLE.draft, title: "A retitled article" },
    });
    expect(screen.getByRole("link", { name: "preview" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("readiness.previewUnsaved");
  });
});
