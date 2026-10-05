import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * **The landing page editor, as an admin builds and writes a page while it is
 * read again underneath.**
 *
 * Pinned here: the form is seeded once per page and never per read; each
 * section says, per language, what it still needs by the shared rule; a
 * language's slug follows its title until typed over and is fixed once that
 * language has been published; Publish is held back with the languages a
 * publish would leave out or take off the site — a section added to a live
 * page among them; and sections are added, moved and removed, a removal only
 * after a confirm, with what the save sends following the structure.
 *
 * Translations echo their key plus the values they were handed. The picture
 * picker is replaced by a button that picks one fixed picture, since nothing
 * here looks inside the catalogue.
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

vi.mock("@/components/admin/products/image-picker", () => ({
  ImagePicker: ({
    label,
    onChange,
  }: {
    label: string;
    onChange: (id: string | null, image: { label: string; path: string } | null) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange("0bfc2918-48f2-41bb-aae2-ad28a755a581", { label: "Castle", path: "castle.jpg" })
      }
    >
      {`pick ${label}`}
    </button>
  ),
}));

import {
  LandingPageEditor,
  type LandingPageEditorActions,
} from "@/components/admin/landing-pages/landing-page-editor";
import type {
  AdminLandingPage,
  LandingPageDraftVersion,
  PublishedLandingPage,
} from "@/services/landing-pages";

const PAGE_ID = "746388a7-2edd-456b-b7d1-4e9828f85af9";
const HERO_ID = "9d1f06bf-9895-4f04-9ec5-3d86382afb8e";
const TEXT_ID = "94f2a395-3c9f-49f6-8770-f9f4c28bfd91";
const CTA_ID = "b8bcfc83-4826-41c9-a965-7f38149a6fd2";

/** English, complete for a hero and a text section. */
const EN: LandingPageDraftVersion = {
  locale: "en",
  title: "Gaming clubs in Espoo",
  summary: "Clubs in Minecraft, Roblox and more, after school in Espoo.",
  slug: "gaming-clubs-in-espoo",
  sectionTexts: {
    [HERO_ID]: { headline: "Clubs in Espoo" },
    [TEXT_ID]: { heading: "How a club runs", body: "Every week, the same **Gedu**." },
  },
  missing: [],
  slugFixed: false,
};

const PAGE: AdminLandingPage = {
  draft: {
    id: PAGE_ID,
    sections: [
      { id: HERO_ID, type: "hero" },
      { id: TEXT_ID, type: "text", imageSide: "end" },
    ],
    imagePaths: {},
    versions: [EN],
    createdAt: "2026-10-01T08:00:00Z",
    updatedAt: "2026-10-02T08:00:00Z",
    lastSavedBy: "Aino Admin",
    lastSavedVia: { clientId: "client", name: "Claude" },
  },
  publication: null,
  hasUnpublishedChanges: false,
};

const PUBLICATION: PublishedLandingPage = {
  id: PAGE_ID,
  firstPublishedAt: "2026-10-03T08:00:00Z",
  publishedAt: "2026-10-03T08:00:00Z",
  sections: PAGE.draft.sections,
  imagePaths: {},
  versions: [
    {
      locale: "en",
      title: EN.title,
      summary: EN.summary,
      slug: EN.slug,
      sectionTexts: EN.sectionTexts,
    },
  ],
};

/** Live in English, exactly as saved. */
const LIVE: AdminLandingPage = {
  ...PAGE,
  draft: { ...PAGE.draft, versions: [{ ...EN, slugFixed: true }] },
  publication: PUBLICATION,
};

function actions(overrides: Partial<LandingPageEditorActions> = {}): LandingPageEditorActions {
  return {
    save: vi.fn(async () => {}),
    publish: vi.fn(async () => {}),
    unpublish: vi.fn(async () => {}),
    ...overrides,
  };
}

function withQueryClient() {
  const client = new QueryClient();
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function renderEditor(page: AdminLandingPage, editorActions = actions()) {
  const utils = render(<LandingPageEditor page={page} actions={editorActions} />, {
    wrapper: withQueryClient(),
  });
  const rerenderWith = (next: AdminLandingPage) =>
    utils.rerender(<LandingPageEditor page={next} actions={editorActions} />);
  return { ...utils, rerenderWith };
}

function textBox(label: string): HTMLInputElement | HTMLTextAreaElement {
  const element = screen.getByLabelText(label);
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
    throw new Error(`${label} is not a text box`);
  }
  return element;
}

const titleBox = () => textBox("fields.title");
const slugBox = () => textBox("fields.slug");
const saveButton = () => screen.getByRole("button", { name: "actions.save" });
const publishButton = () => screen.getByRole("button", { name: /^publish/ });
const structure = () => screen.getByRole("region", { name: "structure.title" });
const words = () => screen.getByRole("region", { name: "words.title" });
const sectionName = (number: number, type: string) =>
  `structure.sectionName number=${number} type=sectionTypes.${type}`;

/** The section rows of a pane, by their names, in order. */
function sectionsIn(pane: HTMLElement): string[] {
  return within(pane)
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label") ?? "")
    .filter((name) => name.startsWith("structure.sectionName"));
}

/** The reasons beside Publish: the element the button points at. */
function reasons(): string {
  const id = publishButton().getAttribute("aria-describedby");
  return document.getElementById(id ?? "")?.textContent ?? "";
}

function addSection(type: string) {
  fireEvent.change(within(structure()).getByRole("combobox", { name: "structure.add" }), {
    target: { value: type },
  });
}

describe("the landing page editor", () => {
  it("keeps what is being typed when the page is read again, and seeds afresh for another page", () => {
    const { rerenderWith } = renderEditor(PAGE);
    fireEvent.change(titleBox(), { target: { value: "Clubs for Espoo schools" } });

    rerenderWith({
      ...PAGE,
      draft: {
        ...PAGE.draft,
        versions: [{ ...EN, title: "Saved by an AI app" }],
        updatedAt: "2026-10-04T08:00:00Z",
      },
    });
    expect(titleBox().value).toBe("Clubs for Espoo schools");

    rerenderWith({
      ...PAGE,
      draft: {
        ...PAGE.draft,
        id: "5bcd84a8-c50f-4aff-8ace-8366993be3c6",
        versions: [{ ...EN, title: "Clubs in Vantaa" }],
      },
    });
    expect(titleBox().value).toBe("Clubs in Vantaa");
  });

  it("names what each section still needs in the language being written", () => {
    renderEditor({
      ...PAGE,
      draft: {
        ...PAGE.draft,
        versions: [{ ...EN, sectionTexts: { [HERO_ID]: { headline: "Clubs in Espoo" } } }],
      },
    });

    const textWords = within(words()).getByRole("listitem", { name: sectionName(2, "text") });
    expect(textWords.textContent).toContain(
      "words.stillNeeded fields=fields.heading + fields.body",
    );
    const heroWords = within(words()).getByRole("listitem", { name: sectionName(1, "hero") });
    expect(heroWords.textContent).not.toContain("words.stillNeeded");

    // The structure pane marks the section incomplete in English.
    const textRow = within(structure()).getByRole("listitem", { name: sectionName(2, "text") });
    expect(textRow.textContent).toContain("versionIncomplete");
  });

  it("derives the slug from the title until it is typed over", () => {
    renderEditor(PAGE);

    fireEvent.change(titleBox(), { target: { value: "Clubs in Espoo for 2027" } });
    expect(slugBox().value).toBe("clubs-in-espoo-for-2027");

    fireEvent.change(slugBox(), { target: { value: "espoo" } });
    fireEvent.change(titleBox(), { target: { value: "Clubs in Espoo" } });
    expect(slugBox().value).toBe("espoo");
  });

  it("fixes the slug of a language that has been published, and says why", () => {
    renderEditor(LIVE);

    expect(slugBox().readOnly).toBe(true);
    expect(screen.getByText("hints.slugFixed")).toBeTruthy();

    fireEvent.change(titleBox(), { target: { value: "A new title" } });
    expect(slugBox().value).toBe(EN.slug);
  });

  it("holds Publish back while no language is complete", () => {
    renderEditor({
      ...PAGE,
      draft: { ...PAGE.draft, versions: [{ ...EN, summary: "" }] },
    });

    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(reasons()).toBe("readiness.noCompleteLanguage");
  });

  it("publishes a complete saved page", async () => {
    const publish = vi.fn(async () => {});
    renderEditor(PAGE, actions({ publish }));

    expect(publishButton().hasAttribute("disabled")).toBe(false);
    await act(async () => {
      fireEvent.click(publishButton());
    });
    expect(publish).toHaveBeenCalled();
  });

  it("says a section added to a live page would take its live languages down", () => {
    renderEditor(LIVE);
    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(reasons()).toBe("");

    // A section with no words yet: English is no longer complete. With no
    // language complete, a publish would be refused outright.
    addSection("cta");
    expect(reasons()).toBe("readiness.noCompleteLanguage");
  });

  it("names the live languages a publish would take off the site", () => {
    const fi: LandingPageDraftVersion = {
      ...EN,
      locale: "fi",
      title: "Kerhot Espoossa",
      summary: "Kerhoja Espoossa koulun jälkeen.",
      slug: "kerhot-espoossa",
      slugFixed: true,
    };
    renderEditor({
      ...LIVE,
      draft: { ...LIVE.draft, versions: [...LIVE.draft.versions, fi] },
      publication: {
        ...PUBLICATION,
        versions: [
          ...PUBLICATION.versions,
          { locale: "fi", title: fi.title, summary: fi.summary, slug: fi.slug, sectionTexts: fi.sectionTexts },
        ],
      },
    });

    // A new section, written in Finnish only: a publish would go ahead, and
    // take English down until its words are written.
    addSection("cta");
    fireEvent.click(screen.getByRole("button", { name: /^Suomi/ }));
    const cta = within(words()).getByRole("listitem", { name: sectionName(3, "cta") });
    fireEvent.change(within(cta).getByLabelText("fields.heading"), {
      target: { value: "Tule mukaan" },
    });
    fireEvent.change(within(cta).getByLabelText("fields.buttonLabel"), {
      target: { value: "Kauppaan" },
    });
    expect(reasons()).toBe("readiness.takenDown languages=English count=1");
  });
  it("adds, moves and removes sections, removing only after a confirm", async () => {
    const save = vi.fn(async () => {});
    renderEditor(PAGE, actions({ save }));

    addSection("cta");
    addSection("faq");
    expect(sectionsIn(structure())).toEqual([
      sectionName(1, "hero"),
      sectionName(2, "text"),
      sectionName(3, "cta"),
      sectionName(4, "faq"),
    ]);

    // The hero is first and stays there: it has no controls of its own.
    const hero = within(structure()).getByRole("listitem", { name: sectionName(1, "hero") });
    expect(within(hero).queryByRole("button", { name: /structure\.moveUp/ })).toBeNull();
    // Nothing moves above it.
    expect(
      screen
        .getByRole("button", { name: `structure.moveUp section=${sectionName(2, "text")}` })
        .hasAttribute("disabled"),
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: `structure.moveDown section=${sectionName(2, "text")}` }),
    );
    expect(sectionsIn(structure())).toEqual([
      sectionName(1, "hero"),
      sectionName(2, "cta"),
      sectionName(3, "text"),
      sectionName(4, "faq"),
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: `structure.remove section=${sectionName(3, "text")}` }),
    );
    // Asked first; nothing is gone yet.
    expect(sectionsIn(structure())).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "structure.removeConfirm.confirm" }));
    expect(sectionsIn(structure())).toEqual([
      sectionName(1, "hero"),
      sectionName(2, "cta"),
      sectionName(3, "faq"),
    ]);

    // The new call to action needs an address before the page can be saved.
    fireEvent.submit(saveButton().closest("form")!);
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("errors.needsAddress number=2");

    fireEvent.change(
      within(structure()).getByLabelText("shared.buttonAddress"),
      { target: { value: "https://example.com/camps" } },
    );
    await act(async () => {
      fireEvent.submit(saveButton().closest("form")!);
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({
      sections: [
        expect.objectContaining({ type: "hero" }),
        {
          id: expect.any(String),
          type: "cta",
          button: { kind: "external", url: "https://example.com/camps" },
        },
        expect.objectContaining({ type: "faq" }),
      ],
      // The removed section's words went with it.
      versions: [
        expect.objectContaining({
          locale: "en",
          sectionTexts: { [HERO_ID]: { headline: "Clubs in Espoo" } },
        }),
      ],
    });
  });

  it("names who last saved, and through which AI app", () => {
    renderEditor(PAGE);
    expect(
      screen.getByText(/statusPanel\.savedByViaLine .*name=Aino Admin app=Claude/),
    ).toBeTruthy();
  });

  it("re-seeds from the stored copy after its own save, showing a canonical button target", async () => {
    const withButton: AdminLandingPage = {
      ...PAGE,
      draft: {
        ...PAGE.draft,
        sections: [...PAGE.draft.sections, { id: CTA_ID, type: "cta", button: { kind: "internal", path: "/shop" } }],
      },
    };
    const save = vi.fn(async () => {});
    const { rerenderWith } = renderEditor(withButton, actions({ save }));
    const address = () => {
      const element = within(structure()).getByLabelText("shared.buttonAddress");
      if (!(element instanceof HTMLInputElement)) throw new Error("not an input");
      return element;
    };
    expect(address().value).toBe("/shop");

    fireEvent.change(address(), { target: { value: "https://sogverse.example/fi/kauppa/1" } });
    await act(async () => {
      fireEvent.submit(saveButton().closest("form")!);
    });

    // The read after the save: the service stored the address canonical.
    rerenderWith({
      ...withButton,
      draft: {
        ...withButton.draft,
        sections: [
          ...PAGE.draft.sections,
          { id: CTA_ID, type: "cta", button: { kind: "internal", path: "/shop/1" } },
        ],
        updatedAt: "2026-10-05T08:00:00Z",
      },
    });
    expect(address().value).toBe("/shop/1");
    expect(saveButton().hasAttribute("disabled")).toBe(true);
  });
});
