import { describe, it, expect } from "vitest";
import messages from "@/../messages/en.json";
import { Constants } from "@/types/database.types";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  MUNICIPALITY_TOPIC_CHIPS,
  type TopicMeta,
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
// derivation back to itself (that the shop chips cover the tuple, say, when
// they are mapped straight off it) is not a test — it cannot fail short of
// someone deleting the line, and it makes the file look better covered than
// it is.

describe("product topics", () => {
  it("contains exactly the enum's values, each exactly once", () => {
    // Set-equal, order-independent: the tuple's order is a deliberate display
    // choice and is NOT the enum's own order, which is just the order values
    // were added to the type. So the ordering is intentionally unchecked here
    // — only membership is.
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

  it("gives every topic a non-empty label, and every info block exactly one way to get it", () => {
    for (const topic of PRODUCT_TOPIC_VALUES) {
      // Widen to the declared shape: the const map's literal types make
      // `info` ever-present today, but the contract is that it is optional
      // and its presence drives the product page's About card.
      const meta: TopicMeta = PRODUCT_TOPICS[topic];

      expect(meta.label.trim().length).toBeGreaterThan(0);

      const info = meta.info;
      if (!info) continue;

      // A rating is optional (Roblox Studio is an unrated creation tool), but
      // a present one must be a real PEGI age.
      if (info.pegi !== undefined) {
        expect(info.pegi).toBeGreaterThan(0);
      }

      // An info block points at a single page OR a per-device store list —
      // never both, and never neither, because the card renders one shape or
      // the other and would show an empty link area otherwise. TopicMeta
      // permits both fields and requires neither, so this is a genuine check
      // rather than one the types already make.
      expect("url" in info).not.toBe("stores" in info);

      if (info.stores) {
        expect(info.stores.length).toBeGreaterThan(0);
        for (const store of info.stores) {
          expect(store.name.trim().length).toBeGreaterThan(0);
          expect(store.url.startsWith("https://")).toBe(true);
        }
      } else {
        expect(info.url?.startsWith("https://")).toBe(true);
      }
    }
  });

  // Nothing else binds info-bearing topics to the message catalog. The card
  // resolves `topicInfo.topics.<topic>.<key>` through a template literal,
  // which the compiler checks against the *shape* of en.json — but a topic
  // whose entry is absent from every locale alike is not a type error and is
  // not a translation parity error either, because check-translations.mjs
  // measures the other locales against en and a gap present in all of them is
  // uniform. The failure that leaks is the worst-looking kind: a parent reads
  // the literal string "topicInfo.topics.roblox_studio.description" on the
  // product page, in every language at once. en is the catalog that has to
  // actually hold the prose; the checker fans it out from there.
  it("gives every info-bearing topic its English prose under productDetail.topicInfo.topics", () => {
    const prose: Record<string, Record<string, string> | undefined> =
      messages.productDetail.topicInfo.topics;

    for (const topic of PRODUCT_TOPIC_VALUES) {
      const meta: TopicMeta = PRODUCT_TOPICS[topic];
      if (!meta.info) continue;

      const entry = prose[topic];
      expect(
        entry,
        `messages/en.json has no productDetail.topicInfo.topics.${topic}`,
      ).toBeDefined();

      for (const key of ["description", "note", "linkLabel"] as const) {
        const value = entry?.[key];
        expect(
          value,
          `messages/en.json is missing topicInfo.topics.${topic}.${key}`,
        ).toBeTypeOf("string");
        expect(
          value?.trim().length ?? 0,
          `messages/en.json has a blank topicInfo.topics.${topic}.${key}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("covers every topic with exactly one municipality chip", () => {
    // MINECRAFT_TOPICS is hand-maintained inside the module and collapses the
    // three editions behind one chip, so this is the one chip assertion that
    // isn't self-referential: a new Minecraft edition added to the enum but not
    // to that list would surface as its own stray chip beside the group.
    expect(MUNICIPALITY_TOPIC_CHIPS.flatMap((c) => c.topics).sort()).toEqual(
      [...PRODUCT_TOPIC_VALUES].sort(),
    );
    // Chip keys feed React lists and the URL membership check.
    const keys = MUNICIPALITY_TOPIC_CHIPS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
