import { describe, expect, it } from "vitest";
import type { SupportedLocale } from "@/lib/constants/locales";
import type {
  AdminLandingPage,
  LandingPageDraftVersion,
} from "@/services/landing-pages/landing-pages.contracts";
import { landingPublishForecast } from "@/services/landing-pages/landing-pages.forecast";

/**
 * **What a publish would do**, as the status page and the MCP tools both read
 * it. Pinned here: which languages go live, are left out and are taken down,
 * and which live addresses change — a language live now that stays live with
 * a different saved slug, never one going live for the first time.
 */

function version(
  locale: SupportedLocale,
  slug: string,
  complete = true,
): LandingPageDraftVersion {
  return {
    locale,
    title: `Title ${locale}`,
    summary: complete ? "Summary" : "",
    slug,
    sectionTexts: {},
    missing: complete ? [] : ["summary"],
  };
}

function page(
  versions: LandingPageDraftVersion[],
  live: [SupportedLocale, string][] | null,
): Pick<AdminLandingPage, "draft" | "publication"> {
  return {
    draft: {
      id: "page",
      sections: [],
      imagePaths: {},
      versions,
      createdAt: "2026-10-01T08:00:00Z",
      updatedAt: "2026-10-01T08:00:00Z",
      lastSavedBy: null,
      lastSavedVia: null,
    },
    publication:
      live === null
        ? null
        : {
            id: "page",
            firstPublishedAt: "2026-10-01T08:00:00Z",
            publishedAt: "2026-10-01T08:00:00Z",
            sections: [],
            imagePaths: {},
            versions: live.map(([locale, slug]) => ({
              locale,
              title: `Title ${locale}`,
              summary: "Summary",
              slug,
              sectionTexts: {},
            })),
          },
  };
}

describe("landingPublishForecast", () => {
  it("names no address change on a first publish", () => {
    const forecast = landingPublishForecast(
      page([version("en", "clubs"), version("sv", "klubbar", false)], null),
    );
    expect(forecast).toEqual({
      canPublish: true,
      wouldPutLive: ["en"],
      wouldLeaveOut: ["sv"],
      wouldTakeDown: [],
      slugsChanging: [],
    });
  });

  it("names each live language whose saved slug differs from its live one", () => {
    const forecast = landingPublishForecast(
      page(
        [version("en", "gaming-clubs"), version("fi", "pelikerhot"), version("sv", "klubbar")],
        [
          ["en", "clubs"],
          ["fi", "pelikerhot"],
        ],
      ),
    );
    // Finnish keeps its address, and Swedish goes live for the first time.
    expect(forecast.slugsChanging).toEqual([{ locale: "en", from: "clubs", to: "gaming-clubs" }]);
  });

  it("names no change for a live language the publish takes down", () => {
    const forecast = landingPublishForecast(
      page(
        [version("en", "clubs"), version("fi", "uusi-osoite", false)],
        [
          ["en", "clubs"],
          ["fi", "vanha"],
        ],
      ),
    );
    expect(forecast.wouldTakeDown).toEqual(["fi"]);
    expect(forecast.slugsChanging).toEqual([]);
  });
});
