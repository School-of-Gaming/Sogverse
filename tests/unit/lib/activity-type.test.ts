import { describe, expect, it } from "vitest";
import {
  ACTIVITY_TYPE_ORDER,
  activityTypeOf,
  activityTypeSections,
  groupByActivityType,
} from "@/lib/activity-type";
import { Constants } from "@/types/database.types";
import type { ProductType } from "@/types";

/**
 * The dashboard stopped having one umbrella heading and now renders one section
 * per type noun. Which sections exist, and in what order, is entirely this
 * function's answer — so an empty group leaking through would put a heading on
 * the page with nothing under it, and a reordering would move a gedu's clubs
 * below their events between two deploys.
 */
describe("activityTypeOf", () => {
  it("folds both club types into one noun", () => {
    // A gedu standing in the room cannot tell a consumer club from a
    // municipality one, and has no reason to: the difference is who pays.
    expect(activityTypeOf("consumer_club")).toBe("club");
    expect(activityTypeOf("municipality_club")).toBe("club");
  });

  it("maps the other two product types to themselves", () => {
    expect(activityTypeOf("camp")).toBe("camp");
    expect(activityTypeOf("event")).toBe("event");
  });

  it("covers every product type the schema can produce", () => {
    // Derived from the generated enum rather than a hand-kept list, so a fifth
    // product type fails here instead of silently falling out of the dashboard.
    for (const type of Constants.public.Enums.product_type) {
      expect(ACTIVITY_TYPE_ORDER, type).toContain(activityTypeOf(type));
    }
  });
});

describe("groupByActivityType", () => {
  const typed = (id: string, productType: ProductType) => ({ id, productType });
  const typeOf = (item: { productType: ProductType }) => item.productType;

  it("emits clubs, then camps, then events", () => {
    const groups = groupByActivityType(
      [typed("e", "event"), typed("c", "camp"), typed("k", "consumer_club")],
      typeOf,
    );
    expect(groups.map((g) => g.type)).toEqual(["club", "camp", "event"]);
  });

  it("skips the nouns a gedu does not run rather than emitting empties", () => {
    // An empty heading on a personal dashboard reads as something missing; a
    // club gedu should never learn that events exist.
    const groups = groupByActivityType(
      [typed("k1", "consumer_club"), typed("k2", "municipality_club")],
      typeOf,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("club");
    expect(groups[0].items.map((i) => i.id)).toEqual(["k1", "k2"]);
  });

  it("preserves the caller's order inside each group", () => {
    // The roll-up already sorted soonest-first; regrouping must not reshuffle.
    const groups = groupByActivityType(
      [
        typed("k1", "consumer_club"),
        typed("c1", "camp"),
        typed("k2", "consumer_club"),
        typed("c2", "camp"),
      ],
      typeOf,
    );
    expect(groups[0].items.map((i) => i.id)).toEqual(["k1", "k2"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c1", "c2"]);
  });

  it("returns nothing at all for a gedu with no assignments", () => {
    expect(groupByActivityType([], typeOf)).toEqual([]);
  });
});

/**
 * The sections a type-noun dashboard renders are the grouping plus one rule: a
 * dashboard with nothing on it is still headed. Both the gedu's page and the
 * gamer's read this one list for their pill, their headings and their bodies,
 * so the fallback landing in only one of them is exactly what having a single
 * helper prevents.
 */
describe("activityTypeSections", () => {
  const typed = (id: string, productType: ProductType) => ({ id, productType });
  const typeOf = (item: { productType: ProductType }) => item.productType;

  it("heads an empty dashboard with clubs, holding no items", () => {
    // An unheaded paragraph floating where the sections go reads as a page that
    // failed to render rather than one with nothing in it yet.
    expect(activityTypeSections([], typeOf)).toEqual([
      { type: "club", items: [] },
    ]);
  });

  it("is the plain grouping the moment anything exists", () => {
    const sections = activityTypeSections([typed("c", "camp")], typeOf);
    expect(sections.map((s) => s.type)).toEqual(["camp"]);
    expect(sections[0].items.map((i) => i.id)).toEqual(["c"]);
  });
});
