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
 * addresses changing — before it calls the write; Unpublish confirms first;
 * and each products section says which of its picks readers are not shown,
 * by name in the admin's language, and why.
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
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useTimezone: () => "Europe/Helsinki",
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");

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
} from "@/services/landing-pages/landing-pages.contracts";

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
  shareTitle: "",
  shareImageId: null,
  shareImageAlt: "",
  missing: [],
};

/** Swedish, missing a summary, a text section's heading and an answer. */
const SV: LandingPageDraftVersion = {
  locale: "sv",
  title: "Spelklubbar i Esbo",
  summary: "",
  slug: "spelklubbar-i-esbo",
  sectionTexts: {},
  shareTitle: "",
  shareImageId: null,
  shareImageAlt: "",
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
  shareTitle: "",
  shareImageId: null,
  shareImageAlt: "",
  missing: [],
};

const SECTIONS: AdminLandingPage["draft"]["sections"] = [
  { id: HERO_ID, type: "hero" },
  { id: TEXT_ID, type: "text", background: "default", imageSide: "end" },
  { id: FAQ_ID, type: "faq", background: "default", items: [{ id: QUESTION_ID }] },
];

function draftPage(versions: LandingPageDraftVersion[]): AdminLandingPage {
  return {
    draft: {
      id: PAGE_ID,
      sections: SECTIONS,
      pictures: {},
      versions,
      createdAt: "2026-10-01T08:00:00Z",
      updatedAt: "2026-10-02T08:00:00Z",
      lastSavedBy: "Aino Admin",
      lastSavedVia: { clientId: "client", name: "Claude" },
    },
    publication: null,
    hasUnpublishedChanges: false,
    testimonials: {},
    productPicks: [],
  };
}

function publication(locales: readonly string[]): PublishedLandingPage {
  return {
    id: PAGE_ID,
    firstPublishedAt: "2026-10-03T08:00:00Z",
    publishedAt: "2026-10-03T08:00:00Z",
    sections: SECTIONS,
    pictures: {},
    versions: [EN, SV]
      .filter((v) => locales.includes(v.locale))
      .map((v) => ({
        locale: v.locale,
        title: v.title,
        summary: v.summary,
        slug: v.slug,
        sectionTexts: {},
        shareTitle: v.shareTitle,
        shareImageId: v.shareImageId,
        shareImageAlt: v.shareImageAlt,
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

    expect(within(dialog).getByText("goesLive languages=English and Finnish")).toBeTruthy();
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

  describe("picked products", () => {
    const SHOWN = "6a3f8a54-0c43-4c55-9b59-3f6f6a0b7a01";
    const ENDED = "6a3f8a54-0c43-4c55-9b59-3f6f6a0b7a02";
    const MUNI = "6a3f8a54-0c43-4c55-9b59-3f6f6a0b7a03";
    const GONE = "6a3f8a54-0c43-4c55-9b59-3f6f6a0b7a04";

    function withPicks(productPicks: AdminLandingPage["productPicks"]): AdminLandingPage {
      return { ...draftPage([EN]), productPicks };
    }

    it("says nothing about products on a page without a products section", () => {
      renderStatus(draftPage([EN]));
      expect(screen.queryByRole("heading", { name: "statusPage.products.heading" })).toBeNull();
    });

    it("names each pick readers are not shown, with every reason", () => {
      renderStatus(
        withPicks([
          {
            sectionId: "s1",
            sectionNumber: 3,
            shownCount: 1,
            picks: [
              { productId: SHOWN, names: [{ locale: "en", name: "Autumn club" }], shown: true, reasons: [] },
              {
                productId: ENDED,
                names: [
                  { locale: "en", name: "Summer camp" },
                  { locale: "fi", name: "Kesäleiri" },
                ],
                shown: false,
                reasons: ["notListed", "ended"],
              },
              { productId: GONE, names: [], shown: false, reasons: ["gone"] },
            ],
          },
        ]),
      );
      const section = screen.getByRole("region", { name: "statusPage.products.heading" });
      expect(
        within(section).getByText("statusPage.products.section number=3 type=sectionTypes.products"),
      ).toBeTruthy();
      expect(within(section).getByText("statusPage.products.someHidden shown=1 total=3")).toBeTruthy();
      const items = within(section).getAllByRole("listitem").map((item) => item.textContent);
      expect(items).toEqual([
        "hiddenItem name=Summer camp reasons=reasons.notListed and reasons.ended",
        "hiddenItem name=unnamed reasons=reasons.gone",
      ]);
      expect(within(section).queryByText(/Autumn club/)).toBeNull();
    });

    it("warns when a section shows none of its picks, and says so when it shows them all", () => {
      renderStatus(
        withPicks([
          {
            sectionId: "s1",
            sectionNumber: 2,
            shownCount: 0,
            picks: [
              { productId: ENDED, names: [{ locale: "en", name: "Summer camp" }], shown: false, reasons: ["ended"] },
            ],
          },
          {
            sectionId: "s2",
            sectionNumber: 4,
            shownCount: 2,
            picks: [
              { productId: SHOWN, names: [{ locale: "en", name: "Autumn club" }], shown: true, reasons: [] },
              // A listed municipality club is shown like any other pick.
              { productId: MUNI, names: [{ locale: "en", name: "Espoo club" }], shown: true, reasons: [] },
            ],
          },
        ]),
      );
      const section = screen.getByRole("region", { name: "statusPage.products.heading" });
      expect(within(section).getByText("statusPage.products.noneShown")).toBeTruthy();
      expect(within(section).getByText("hiddenItem name=Summer camp reasons=reasons.ended")).toBeTruthy();
      expect(within(section).getByText("statusPage.products.allShown count=2")).toBeTruthy();
      expect(within(section).queryByText(/Espoo club/)).toBeNull();
    });
  });
});

describe("the landing page status page's testimonials", () => {
  const QUOTES_ID = "c4a7e2f1-5b3d-4e8a-9c6f-2d1b0a9e8f7c";
  const ONE = "0e6b9a52-31d4-4c7e-8f20-6a5d4c3b2a19";
  const TWO = "7c2d1e0f-9a8b-4c6d-8e5f-4a3b2c1d0e9f";

  it("shows each testimonials section's arrangement and its quotes, each opening its editor", () => {
    const page = draftPage([EN]);
    renderStatus({
      ...page,
      draft: {
        ...page.draft,
        sections: [
          ...SECTIONS,
          { id: QUOTES_ID, type: "testimonials", background: "default", arrangement: "pair", testimonialIds: [ONE, TWO] },
        ],
      },
      testimonials: {
        [ONE]: { id: ONE, versions: [{ locale: "en", from: "Mum, Finland", quote: "Gaming is fun." }] },
        [TWO]: { id: TWO, versions: [{ locale: "fi", from: "Äiti", quote: "Hauskaa." }] },
      },
    });

    const block = screen.getByRole("region", { name: "statusPage.testimonials.heading" });
    expect(
      within(block).getByText(
        "statusPage.testimonials.section number=4 type=sectionTypes.testimonials arrangement=statusPage.testimonials.arrangements.pair",
      ),
    ).toBeTruthy();
    const links = within(block).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Gaming is fun.Mum, Finland",
      // No English version: the admin reads the first one written.
      "Hauskaa.Äiti",
    ]);
    expect(links[0].getAttribute("href")).toContain(`/admin/testimonials/${ONE}`);
  });

  it("is not shown for a page with no testimonials section", () => {
    renderStatus(draftPage([EN]));
    expect(screen.queryByRole("region", { name: "statusPage.testimonials.heading" })).toBeNull();
  });
});

describe("the link preview it states", () => {
  const SHARE_PICTURE = "5c3b7a52-0d9e-4f0b-a6d2-8e1f4c7b9a30";
  const HERO_PICTURE = "e2a4c6d8-1b3f-4a5c-8e7d-9f0a1b2c3d4e";

  /** The link preview's section, named by its heading. */
  const preview = () => screen.getByRole("region", { name: "heading" });
  /** One language's row of it: its lines of text, and its picture's source. */
  const row = (language: string) => {
    const item = within(preview()).getByRole("listitem", { name: language });
    return {
      lines: Array.from(item.querySelectorAll("p")).map((line) => line.textContent),
      picture: item.querySelector("img")?.getAttribute("src") ?? null,
    };
  };

  it("shows each language's derived card, with no warning, while nothing is overridden", () => {
    renderStatus(draftPage([EN, FI]));

    // The fixture's hero has no picture, so the site-wide card stands in.
    expect(row("English")).toEqual({
      lines: ["English", "Gaming clubs in Espoo", "picture.site", "title.page"],
      picture: null,
    });
    expect(row("Finnish").lines).toEqual([
      "Finnish",
      "Pelikerhot Espoossa",
      "picture.site",
      "title.page",
    ]);
    expect(within(preview()).getByText("description")).toBeTruthy();
    expect(within(preview()).queryByText("stale")).toBeNull();
  });

  it("shows the hero's picture when the hero has one", () => {
    const page = draftPage([EN]);
    renderStatus({
      ...page,
      draft: {
        ...page.draft,
        sections: [{ id: HERO_ID, type: "hero", imageId: HERO_PICTURE }, ...SECTIONS.slice(1)],
        pictures: { [HERO_PICTURE]: { path: "hero.jpg", purpose: "landing_image" } },
      },
    });

    expect(row("English").lines[2]).toBe("picture.hero");
    expect(row("English").picture).toContain("hero.jpg");
  });

  it("shows each language's own overrides, the others derived, and warns they do not follow the page", () => {
    const page = draftPage([
      { ...EN, shareTitle: "Join a club in Espoo", shareImageId: SHARE_PICTURE },
      FI,
    ]);
    renderStatus({
      ...page,
      draft: {
        ...page.draft,
        sections: [{ id: HERO_ID, type: "hero", imageId: HERO_PICTURE }, ...SECTIONS.slice(1)],
        pictures: {
          [HERO_PICTURE]: { path: "hero.jpg", purpose: "landing_image" },
          [SHARE_PICTURE]: { path: "share.jpg", purpose: "landing_image" },
        },
      },
    });

    expect(row("English").lines).toEqual([
      "English",
      "Join a club in Espoo",
      "picture.custom",
      "title.custom",
    ]);
    expect(row("English").picture).toContain("share.jpg");
    expect(row("Finnish").lines).toEqual([
      "Finnish",
      "Pelikerhot Espoossa",
      "picture.hero",
      "title.page",
    ]);
    expect(row("Finnish").picture).toContain("hero.jpg");
    expect(within(preview()).getByText("stale")).toBeTruthy();
  });

  it("warns for a custom title alone", () => {
    renderStatus(draftPage([{ ...EN, shareTitle: "Join a club in Espoo" }]));

    expect(row("English").lines.slice(1)).toEqual([
      "Join a club in Espoo",
      "picture.site",
      "title.custom",
    ]);
    expect(within(preview()).getByText("stale")).toBeTruthy();
  });
});
