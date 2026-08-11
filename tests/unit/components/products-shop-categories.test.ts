import { describe, it, expect } from "vitest";
import {
  SHOP_CATEGORIES,
  parseCategories,
  visibleCategories,
} from "@/components/public/products/shop-categories";

describe("parseCategories", () => {
  it("reads an absent param as no selection", () => {
    expect(parseCategories(null)).toEqual([]);
  });

  it("reads an empty param as no selection", () => {
    expect(parseCategories("")).toEqual([]);
  });

  it("reads a legacy single value as a selection of one", () => {
    // `?category=clubs` is what ROUTES.shopBrowse emits and what every
    // pre-multi-select bookmark carries.
    expect(parseCategories("clubs")).toEqual(["clubs"]);
    expect(parseCategories("camps")).toEqual(["camps"]);
    expect(parseCategories("events")).toEqual(["events"]);
  });

  it("reads a comma list as the whole selection", () => {
    expect(parseCategories("clubs,camps")).toEqual(["clubs", "camps"]);
  });

  it("normalises order, whitespace, case and duplicates", () => {
    expect(parseCategories("events, CLUBS ,clubs")).toEqual([
      "clubs",
      "events",
    ]);
  });

  it("drops unknown tokens but keeps the valid ones", () => {
    expect(parseCategories("clubs,workshops")).toEqual(["clubs"]);
  });

  it("reads an all-invalid param as no selection", () => {
    // Which shows everything rather than an empty page — a hand-edited or
    // stale URL should never strand the parent on a blank storefront.
    expect(parseCategories("workshops,retreats")).toEqual([]);
    expect(parseCategories(",,")).toEqual([]);
  });
});

describe("visibleCategories", () => {
  it("expands an empty selection to every category", () => {
    expect(visibleCategories([])).toEqual([...SHOP_CATEGORIES]);
  });

  it("leaves a narrowed selection alone", () => {
    expect(visibleCategories(["camps"])).toEqual(["camps"]);
  });

  it("keeps sections in the fixed Clubs to Events order", () => {
    // The section order on the page is the parser's order, not the tap order,
    // so a parent who picks Events then Clubs still reads Clubs first.
    expect(visibleCategories(parseCategories("events,clubs"))).toEqual([
      "clubs",
      "events",
    ]);
  });
});
