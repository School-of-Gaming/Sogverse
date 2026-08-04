import { describe, it, expect } from "vitest";
import { Constants } from "@/types/database.types";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  GAME_TOPICS,
  SUBJECT_TOPICS,
  MUNICIPALITY_BROWSE_TOPICS,
  GAME_TOPIC_CHIPS,
  MUNICIPALITY_TOPIC_CHIPS,
  isGameTopic,
} from "@/lib/products/topics";

// The topic module is the one place where the generated enum and hand-written
// display data have to agree, and the compiler only checks one direction of
// that. `PRODUCT_TOPICS` is `satisfies Record<ProductTopic, TopicMeta>`, so a
// missing key there IS a type error — but `PRODUCT_TOPIC_VALUES` is only
// `satisfies readonly ProductTopic[]`, which checks that every element is a
// topic and says nothing about every topic being an element.
//
// That asymmetry is the trap this file exists for: a new enum value added to
// the DB and given a `PRODUCT_TOPICS` entry, but forgotten in the ordering
// tuple, type-checks and tests green while silently never appearing in the
// admin picker, the shop chips or the municipality chips. Nothing else in the
// suite touches the tuple, so without this it fails as "the new topic just
// isn't there", found by hand, in review or later.

describe("product topics", () => {
  it("lists every enum value exactly once in display order", () => {
    const fromDb = [...Constants.public.Enums.product_topic];

    // Set-equal, order-independent: the tuple's order is a deliberate display
    // choice (games first, then subjects) and is NOT the enum's own order,
    // which is just the order values were added to the type.
    expect([...PRODUCT_TOPIC_VALUES].sort()).toEqual([...fromDb].sort());
    expect(new Set(PRODUCT_TOPIC_VALUES).size).toBe(
      PRODUCT_TOPIC_VALUES.length,
    );
  });

  it("gives every enum value a PRODUCT_TOPICS entry", () => {
    for (const topic of Constants.public.Enums.product_topic) {
      expect(PRODUCT_TOPICS[topic]).toBeDefined();
    }
  });

  it("splits cleanly into games and subjects with nothing left over", () => {
    expect([...GAME_TOPICS, ...SUBJECT_TOPICS].sort()).toEqual(
      [...PRODUCT_TOPIC_VALUES].sort(),
    );
    expect(GAME_TOPICS.every(isGameTopic)).toBe(true);
    expect(SUBJECT_TOPICS.some(isGameTopic)).toBe(false);
  });

  it("gives every game a non-empty label and exactly one way to get it", () => {
    for (const topic of GAME_TOPICS) {
      const meta = PRODUCT_TOPICS[topic];
      // Narrow off the subject arm; GAME_TOPICS is typed as ProductTopic[].
      if (meta.kind !== "game") throw new Error(`${topic} is not a game`);

      expect(meta.label.trim().length).toBeGreaterThan(0);
      expect(meta.pegi).toBeGreaterThan(0);

      // A game points at a single page OR a per-device store list — never
      // both, and never neither, because the card renders one shape or the
      // other and would show an empty link area otherwise. TopicMeta permits
      // both fields and requires neither, so this is a genuine check rather
      // than one the types already make.
      expect("url" in meta).not.toBe("stores" in meta);

      if ("stores" in meta) {
        expect(meta.stores.length).toBeGreaterThan(0);
        for (const store of meta.stores) {
          expect(store.name.trim().length).toBeGreaterThan(0);
          expect(store.url.startsWith("https://")).toBe(true);
        }
      } else {
        expect(meta.url.startsWith("https://")).toBe(true);
      }
    }
  });

  it("surfaces every topic but webinar on the municipality page", () => {
    expect([...MUNICIPALITY_BROWSE_TOPICS].sort()).toEqual(
      PRODUCT_TOPIC_VALUES.filter((t) => t !== "webinar").sort(),
    );
  });

  it("covers every game with a shop chip and every browse topic with a municipality chip", () => {
    expect(GAME_TOPIC_CHIPS.flatMap((c) => c.topics).sort()).toEqual(
      [...GAME_TOPICS].sort(),
    );

    // The municipality chips collapse the Minecraft editions behind one chip,
    // so assert coverage of the union rather than a chip-per-topic count.
    expect(MUNICIPALITY_TOPIC_CHIPS.flatMap((c) => c.topics).sort()).toEqual(
      [...MUNICIPALITY_BROWSE_TOPICS].sort(),
    );
    // Chip keys feed React lists and the URL membership check.
    const keys = MUNICIPALITY_TOPIC_CHIPS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
