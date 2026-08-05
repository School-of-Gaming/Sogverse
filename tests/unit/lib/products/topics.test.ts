import { describe, it, expect } from "vitest";
import messages from "@/../messages/en.json";
import { Constants } from "@/types/database.types";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  GAME_TOPICS,
  MUNICIPALITY_BROWSE_TOPICS,
  MUNICIPALITY_TOPIC_CHIPS,
} from "@/lib/products/topics";

// The topic module is where the generated enum, hand-written display data and
// the message catalog have to agree, and the compiler only checks some of
// that. `PRODUCT_TOPICS` is `satisfies Record<ProductTopic, TopicMeta>`, so a
// missing key there IS a type error — but `PRODUCT_TOPIC_VALUES` is only
// `satisfies readonly ProductTopic[]`, which checks that every element is a
// topic and says nothing about every topic being an element.
//
// That asymmetry is the trap this file exists for: a new enum value added to
// the DB and given a `PRODUCT_TOPICS` entry, but forgotten in the ordering
// tuple, type-checks and tests green while silently never appearing in the
// admin picker, the shop chips or the municipality chips.
//
// Everything here asserts a link the compiler does not make. Restating a
// derivation back to itself (that `GAME_TOPICS` contains only games, say, when
// it is defined as a filter for exactly that) is not a test — it cannot fail
// short of someone deleting the line, and it makes the file look better covered
// than it is.

describe("product topics", () => {
  it("contains exactly the enum's values, each exactly once", () => {
    // Set-equal, order-independent: the tuple's order is a deliberate display
    // choice (games first, then subjects) and is NOT the enum's own order,
    // which is just the order values were added to the type. So the ordering
    // is intentionally unchecked here — only membership is.
    expect([...PRODUCT_TOPIC_VALUES].sort()).toEqual(
      [...Constants.public.Enums.product_topic].sort(),
    );
    expect(new Set(PRODUCT_TOPIC_VALUES).size).toBe(
      PRODUCT_TOPIC_VALUES.length,
    );
  });

  it("gives every enum value a PRODUCT_TOPICS entry", () => {
    for (const topic of Constants.public.Enums.product_topic) {
      expect(PRODUCT_TOPICS[topic]).toBeDefined();
    }
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

  // Nothing else binds GAME_TOPICS to the message catalog. The card resolves
  // `gameInfo.games.<topic>.<key>` through a template literal, which the
  // compiler checks against the *shape* of en.json — but a game whose entry is
  // absent from every locale alike is not a type error and is not a translation
  // parity error either, because check-translations.mjs measures the other
  // locales against en and a gap present in all of them is uniform. The
  // failure that leaks is the worst-looking kind: a parent reads the literal
  // string "gameInfo.games.pokemon_go.description" on the product page, in
  // every language at once. en is the catalog that has to actually hold the
  // prose; the checker fans it out from there.
  it("gives every game its English prose under productDetail.gameInfo.games", () => {
    const games: Record<string, Record<string, string> | undefined> =
      messages.productDetail.gameInfo.games;

    for (const topic of GAME_TOPICS) {
      const entry = games[topic];
      expect(
        entry,
        `messages/en.json has no productDetail.gameInfo.games.${topic}`,
      ).toBeDefined();

      for (const key of ["description", "note", "linkLabel"] as const) {
        const value = entry?.[key];
        expect(
          value,
          `messages/en.json is missing gameInfo.games.${topic}.${key}`,
        ).toBeTypeOf("string");
        expect(
          value?.trim().length ?? 0,
          `messages/en.json has a blank gameInfo.games.${topic}.${key}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("covers every browseable topic with exactly one municipality chip", () => {
    // MINECRAFT_TOPICS is hand-maintained inside the module and collapses the
    // three editions behind one chip, so this is the one chip assertion that
    // isn't self-referential: a new Minecraft edition added to the enum but not
    // to that list would surface as its own stray chip beside the group.
    expect(MUNICIPALITY_TOPIC_CHIPS.flatMap((c) => c.topics).sort()).toEqual(
      [...MUNICIPALITY_BROWSE_TOPICS].sort(),
    );
    // Chip keys feed React lists and the URL membership check.
    const keys = MUNICIPALITY_TOPIC_CHIPS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
