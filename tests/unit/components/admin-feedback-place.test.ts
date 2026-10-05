import { describe, expect, it } from "vitest";
import { PATHNAMES } from "@/i18n/pathnames";
import {
  defaultBackPlace,
  FEEDBACK_ORIGIN_PARAM,
  feedbackHref,
  feedbackScopeId,
  parseFeedbackOrigin,
  placeOfOrigin,
} from "@/components/admin/feedback/feedback-place";

const ID = "0e899757-d789-4fe0-a083-7ef9185e4a72";

describe("feedback places", () => {
  it("round-trips every origin through a detail page's query", () => {
    const origins = [
      [{ kind: "list", dimension: "gedu" }, "gedus"],
      [{ kind: "responses" }, "responses"],
      [{ kind: "detail", scope: { kind: "group", id: ID } }, `group:${ID}`],
    ] as const;
    for (const [origin, token] of origins) {
      expect(feedbackHref({ view: "detail", scope: { kind: "gamer", id: ID }, origin })).toEqual({
        pathname: "/admin/feedback/gamers/[id]",
        params: { id: ID },
        query: { [FEEDBACK_ORIGIN_PARAM]: token },
      });
      expect(parseFeedbackOrigin(token)).toEqual(origin);
    }
  });

  it("carries no query where there is no origin", () => {
    expect(feedbackHref({ view: "overview" })).toBe("/admin/feedback");
    expect(feedbackHref({ view: "detail", scope: { kind: "gamer", id: ID }, origin: null })).not.toHaveProperty("query");
  });

  it("returns a gamer opened from what gamers said to that page", () => {
    expect(placeOfOrigin({ kind: "responses" })).toEqual({ view: "responses" });
  });

  it("has no groups list: groups are a product's breakdown, and a group's page goes back to its product", () => {
    expect(parseFeedbackOrigin("groups")).toBeNull();
    expect(Object.keys(PATHNAMES)).not.toContain("/admin/feedback/groups");
    expect(Object.keys(PATHNAMES)).toContain("/admin/feedback/groups/[id]");
    expect(defaultBackPlace({ kind: "group", id: ID }, "product-a")).toEqual({
      view: "detail",
      scope: { kind: "product", id: "product-a" },
      origin: null,
    });
  });

  it("drops an origin it cannot use", () => {
    expect(parseFeedbackOrigin("teams")).toBeNull();
    expect(parseFeedbackOrigin("group:not-a-uuid")).toBeNull();
    expect(parseFeedbackOrigin(`school:${ID}`)).toBeNull();
    expect(parseFeedbackOrigin("2026-09-01")).toBeNull();
    expect(parseFeedbackOrigin(undefined)).toBeNull();
  });

  it("reads a route's id as the dataset spells it, and refuses one that names nothing", () => {
    expect(feedbackScopeId(ID)).toBe(ID);
    expect(feedbackScopeId(ID.toUpperCase())).toBe(ID);
    expect(feedbackScopeId("not-a-uuid")).toBeNull();
  });
});
