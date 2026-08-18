import { describe, it, expect } from "vitest";
import messages from "@/../messages/en.json";
import { Constants } from "@/types/database.types";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  TOPIC_FILTER_CHIPS,
  platformForTopic,
  topicHasInfoCard,
  type TopicMeta,
} from "@/lib/products/topics";
import { SUPPORTED_GAME_PLATFORMS } from "@/lib/constants/game-platforms";

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
//
// The `info` block is optional and, since the subject-matter topics arrived,
// genuinely absent on several entries — so the checks below that only make
// sense for a topic with a card skip the ones without, and one of them asserts
// that both kinds still exist. That last one is not bookkeeping: the product
// page decides whether to render the About card's *grid wrapper* from the same
// condition, and a registry that drifted back to "every topic has info" would
// leave that branch unexercised everywhere.

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
      // Widen to the declared shape rather than reading the const map's
      // literal member types, which say per-entry whether `info` is there.
      // The contract is that it is optional and its presence drives the
      // product page's About card, so the loop below is written against that.
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

  it("keeps both sides of the About-card condition populated, with the subject-matter topics on the no-card side", () => {
    const withCard = PRODUCT_TOPIC_VALUES.filter(topicHasInfoCard);
    const withoutCard = PRODUCT_TOPIC_VALUES.filter(
      (t) => !topicHasInfoCard(t),
    );

    // The product page renders the card's grid wrapper only when this predicate
    // is true, so both branches have to be reachable from the real registry —
    // otherwise one of them is dead code nobody is looking at.
    expect(withCard.length).toBeGreaterThan(0);
    expect(withoutCard.length).toBeGreaterThan(0);

    // Which topics land on the no-card side is a product decision, not an
    // oversight: none of these five is one piece of software a family installs,
    // so what they need is written into that product's own description by an
    // admin instead. Giving one of them an info block is a decision to revisit,
    // and naming them here is what makes it a deliberate move rather than a
    // quiet one.
    expect([...withoutCard].sort()).toEqual([
      "ai",
      "creator_studio",
      "esports",
      "game_studio",
      "programming",
    ]);
  });

  // `platformForTopic` decides whether a product surface shows a game username
  // at all, and which one. The compiler already forces every *enum* value
  // through the switch — a new topic makes the function fall off its end, which
  // its declared return type forbids — so the checks here are the ones the
  // compiler cannot make: that the answers are real platforms, and that the two
  // topics which map to one still do.
  describe("platformForTopic", () => {
    it("answers every enum value with a real platform or null", () => {
      for (const topic of Constants.public.Enums.product_topic) {
        const platform = platformForTopic(topic);
        if (platform === null) continue;
        expect(
          (SUPPORTED_GAME_PLATFORMS as readonly string[]).includes(platform),
          `platformForTopic(${topic}) returned "${platform}", which is not a platform`,
        ).toBe(true);
      }
    });

    it("maps minecraft_java to Minecraft and roblox_studio to Roblox", () => {
      expect(platformForTopic("minecraft_java")).toBe("minecraft");
      expect(platformForTopic("roblox_studio")).toBe("roblox");
    });

    // The other two Minecraft editions are the trap this test exists for: they
    // are Minecraft, and they still map to nothing, because our
    // minecraft_accounts row is a Java/Mojang identity and neither edition has
    // a Mojang account behind it. Drawing a Java handle on a Bedrock club would
    // assert an identity nobody verified.
    it("maps the non-Java Minecraft editions to no platform", () => {
      expect(platformForTopic("minecraft_bedrock")).toBeNull();
      expect(platformForTopic("minecraft_education")).toBeNull();
    });

    // Both sides have to stay populated for the same reason the About-card
    // check above says so: a surface branches on this, and a registry that
    // drifted to "every topic has a platform" would leave the no-identity
    // branch unexercised everywhere.
    it("keeps both sides of the show-an-identity decision populated", () => {
      const withPlatform = PRODUCT_TOPIC_VALUES.filter(
        (t) => platformForTopic(t) !== null,
      );
      const without = PRODUCT_TOPIC_VALUES.filter(
        (t) => platformForTopic(t) === null,
      );

      expect(withPlatform.sort()).toEqual(["minecraft_java", "roblox_studio"]);
      expect(without.length).toBeGreaterThan(0);
    });
  });

  it("covers every topic with exactly one filter chip", () => {
    // MINECRAFT_TOPICS is hand-maintained inside the module and collapses the
    // three editions behind one chip, so this is the one chip assertion that
    // isn't self-referential: a new Minecraft edition added to the enum but not
    // to that list would surface as its own stray chip beside the group.
    expect(TOPIC_FILTER_CHIPS.flatMap((c) => c.topics).sort()).toEqual(
      [...PRODUCT_TOPIC_VALUES].sort(),
    );
    // Chip keys feed React lists and the URL membership check.
    const keys = TOPIC_FILTER_CHIPS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
