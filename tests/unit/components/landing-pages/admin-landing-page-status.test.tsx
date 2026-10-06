import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * **A landing page's status page, as an admin reads it and publishes from it.**
 *
 * Pinned here: each written language says whether it is complete and, when it
 * is not, what it still needs — built from the structured description, never
 * the English sentence; each has its preview, its live link only while live,
 * and its address, with a warning exactly where the publish forecast moves a
 * live address; Publish is held back with a reason when nothing is complete or nothing
 * has changed, and shows the forecast — live, left out, taken down, live
 * addresses changing — before it calls the write; Unpublish confirms first.
 *
 * Translations echo their key plus the values they were handed; a language is
 * named by its English label.
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

vi.mock("@/hooks/use-language-names", () => ({
  useLanguageNames: () => (code: string, fallback?: string) => fallback ?? code,
}));

import {
  LandingPageStatusPage,
  type LandingPageStatusActions,
} from "@/components/admin/landing-pages/landing-page-status-page";
import type {
  AdminLandingPage,
  LandingPageDraftVersion,
  PublishedLandingPage,
} from "@/services/landing-pages";

const PAGE_ID = "746388a7-2edd-456b-b7d1-4e9828f85af9";
const HERO_ID = "9d1f06bf-9895-4f04-9ec5-3d86382afb8e";
const TEXT_ID = "94f2a395-3c9f-49f6-8770-f9f4c28bfd91";
const FAQ_ID = "b8bcfc83-4826-41c9-a965-7f38149a6fd2";
const QUESTION_ID = "3f0d1c55-6a9e-4c1b-9d0a-1b2e4f6a8c3d";

/** English, complete, with a slug someone wrote. */
const EN: LandingPageDraftVersion = {
  locale: "en",
  title: "Gaming clubs in Espoo",
  summary: "Clubs in Minecraft, Roblox and more, after school in Espoo.",
  slug: "espoo-clubs",
  sectionTexts: {},
  missing: [],
};

/** Swedish, missing a summary, a text section's heading and an answer. */
const SV: LandingPageDraftVersion = {
  locale: "sv",
  title: "Spelklubbar i Esbo",
  summary: "",
  slug: "spelklubbar-i-esbo",
  sectionTexts: {},
  missing: [
    "summary",
    `sections.${TEXT_ID}.heading`,
    `sections.${FAQ_ID}.items.${QUESTION_ID}.answer`,
  ],
};

/** Finnish, complete, not yet live. */
const FI: LandingPageDraftVersion = {
  locale: "fi",
  title: "Pelikerhot Espoossa",
  summary: "Kerhoja koulun jälkeen.",
  slug: "pelikerhot-espoossa",
  sectionTexts: {},
  missing: [],
};

const SECTIONS: AdminLandingPage["draft"]["sections"] = [
  { id: HERO_ID, type: "hero" },
  { id: TEXT_ID, type: "text", imageSide: "end" },
  { id: FAQ_ID, type: "faq", items: [{ id: QUESTION_ID }] },
];

function draftPage(versions: LandingPageDraftVersion[]): AdminLandingPage {
  return {
    draft: {
      id: PAGE_ID,
      sections: SECTIONS,
      imagePaths: {},
      versions,
      createdAt: "2026-10-01T08:00:00Z",
      updatedAt: "2026-10-02T08:00:00Z",
      lastSavedBy: "Aino Admin",
      lastSavedVia: { clientId: "client", name: "Claude" },
    },
    publication: null,
    hasUnpublishedChanges: false,
  };
}

function publication(locales: readonly string[]): PublishedLandingPage {
  return {
    id: PAGE_ID,
    firstPublishedAt: "2026-10-03T08:00:00Z",
    publishedAt: "2026-10-03T08:00:00Z",
    sections: SECTIONS,
    imagePaths: {},
    versions: [EN, SV]
      .filter((v) => locales.includes(v.locale))
      .map((v) => ({
        locale: v.locale,
        title: v.title,
        summary: v.summary,
        slug: v.slug,
        sectionTexts: {},
      })),
  };
}

function actions(): LandingPageStatusActions {
  return { publish: vi.fn(async () => {}), unpublish: vi.fn(async () => {}) };
}

function renderStatus(page: AdminLandingPage, pageActions = actions()) {
  render(<LandingPageStatusPage page={page} actions={pageActions} />);
  return pageActions;
}

/** A language's card, named by its heading. */
const card = (language: string) => screen.getByRole("region", { name: language });

const publishButton = () => screen.getAllByRole("button", { name: /^publish/ })[0];

/** The open confirm, found by its title: the panel holding the title's header. */
async function dialogTitled(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name: title });
  const panel = heading.parentElement?.parentElement;
  if (!panel) throw new Error(`no dialog titled ${title}`);
  return panel;
}

describe("the landing page status page", () => {
  it("says per language whether it is complete, and what an incomplete one still needs", () => {
    renderStatus(draftPage([EN, SV]));

    expect(within(card("English")).getByText("statusPage.language.complete")).toBeTruthy();
    expect(within(card("English")).queryByText("statusPage.language.stillNeeded")).toBeNull();

    const swedish = card("Swedish");
    expect(within(swedish).getByText("statusPage.language.incomplete")).toBeTruthy();
    const needs = within(swedish)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(needs).toEqual([
      "fields.summary",
      "statusPage.missing.inSection number=2 type=sectionTypes.text field=fields.heading",
      "statusPage.missing.inItem number=3 type=sectionTypes.faq item=items.faq number=1 field=fields.answer",
    ]);
  });

  it("links each language's preview in that language, and its live page only while it is live", () => {
    const page = { ...draftPage([EN, SV]), publication: publication(["en"]) };
    renderStatus({
      ...page,
      draft: { ...page.draft, versions: [EN, SV] },
    });

    const preview = within(card("Swedish")).getByRole("link", { name: "preview" });
    expect(preview.getAttribute("href")).toBe(`/discover/${PAGE_ID}/preview`);
    expect(preview.getAttribute("locale")).toBe("sv");
    expect(within(card("Swedish")).queryByRole("link", { name: "viewLive" })).toBeNull();

    const live = within(card("English")).getByRole("link", { name: "viewLive" });
    expect(live.getAttribute("href")).toBe("/discover/espoo-clubs");
    expect(live.getAttribute("locale")).toBe("en");
  });

  it("shows each address, warning where the saved one differs from the live one", () => {
    renderStatus({
      ...draftPage([{ ...EN, slug: "espoo-gaming-clubs" }, SV]),
      publication: publication(["en", "sv"]),
      hasUnpublishedChanges: true,
    });

    expect(within(card("English")).getByText("/discover/espoo-gaming-clubs")).toBeTruthy();
    expect(
      within(card("English")).getByText(
        "statusPage.language.addressChanging address=/discover/espoo-clubs",
      ),
    ).toBeTruthy();
    // Swedish is live at the address it has saved: nothing to warn about.
    expect(within(card("Swedish")).getByText("/discover/spelklubbar-i-esbo")).toBeTruthy();
    expect(within(card("Swedish")).queryByText(/addressChanging/)).toBeNull();
  });

  it("warns of no address change for an incomplete live language, which the publish takes down instead", () => {
    renderStatus({
      ...draftPage([EN, { ...SV, slug: "esbo-spelklubbar" }]),
      publication: publication(["en", "sv"]),
      hasUnpublishedChanges: true,
    });

    expect(within(card("Swedish")).getByText("/discover/esbo-spelklubbar")).toBeTruthy();
    expect(within(card("Swedish")).queryByText(/addressChanging/)).toBeNull();
  });

  it("says who last saved the page and through which AI app", () => {
    renderStatus(draftPage([EN]));
    expect(screen.getByText(/^savedByViaLine .*name=Aino Admin app=Claude$/)).toBeTruthy();
  });

  it("holds Publish back while no language is complete", () => {
    renderStatus(draftPage([SV]));
    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("statusPage.readiness.noCompleteLanguage")).toBeTruthy();
  });

  it("holds Publish back while readers already see the latest saved version", () => {
    renderStatus({ ...draftPage([EN]), publication: publication(["en"]) });
    expect(publishButton().hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("statusPage.readiness.upToDate")).toBeTruthy();
  });

  it("shows what a publish would do before it publishes", async () => {
    // English and Swedish are live; English has a new address, Swedish is no
    // longer complete, and Finnish goes live for the first time.
    const page: AdminLandingPage = {
      ...draftPage([{ ...EN, slug: "espoo-gaming-clubs" }, FI, SV]),
      publication: publication(["en", "sv"]),
      hasUnpublishedChanges: true,
    };
    const pageActions = renderStatus(page);

    fireEvent.click(publishButton());
    const dialog = await dialogTitled("publishConfirm.changesTitle");

    expect(within(dialog).getByText("goesLive languages=English + Finnish")).toBeTruthy();
    expect(within(dialog).getByText("takenDown languages=Swedish count=1")).toBeTruthy();
    // Swedish is named once, as taken down, not again as left out.
    expect(within(dialog).queryByText(/^leftOut/)).toBeNull();
    // Only English changes a live address; Finnish has none to change.
    expect(within(dialog).getByText("changing count=1")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "changingItem language=English from=/discover/espoo-clubs to=/discover/espoo-gaming-clubs",
      ),
    ).toBeTruthy();
    expect(pageActions.publish).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "publishChanges" }));
    await waitFor(() => expect(pageActions.publish).toHaveBeenCalledTimes(1));
  });

  it("names a language left out, and no address change, on a first publish", async () => {
    renderStatus(draftPage([EN, SV]));

    fireEvent.click(publishButton());
    const dialog = await dialogTitled("publishConfirm.title");

    expect(within(dialog).getByText("leftOut languages=Swedish count=1")).toBeTruthy();
    expect(within(dialog).queryByText(/^takenDown/)).toBeNull();
    expect(within(dialog).queryByText(/^changing/)).toBeNull();
  });

  it("unpublishes only after a confirm", async () => {
    const pageActions = renderStatus({
      ...draftPage([EN]),
      publication: publication(["en"]),
    });

    fireEvent.click(screen.getByRole("button", { name: "unpublish" }));
    expect(pageActions.unpublish).not.toHaveBeenCalled();
    const dialog = await dialogTitled("unpublishConfirm.title");

    fireEvent.click(within(dialog).getByRole("button", { name: "unpublishConfirm.confirm" }));
    await waitFor(() => expect(pageActions.unpublish).toHaveBeenCalledTimes(1));
  });

  it("offers no Unpublish while the page is not live", () => {
    renderStatus(draftPage([EN]));
    expect(screen.queryByRole("button", { name: "unpublish" })).toBeNull();
  });
});
