import { describe, it, expect } from "vitest";
import messages from "@/../messages/en.json";
import { Constants } from "@/types/database.types";
import {
  PRODUCT_TOPICS,
  PRODUCT_TOPIC_VALUES,
  TOPIC_FILTER_CHIPS,
  platformForTopic,
  resolveTopicPrep,
  topicHasInfoCard,
  topicHasPrep,
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

  // ---------------------------------------------------------------------
  // Prep: the "Before the first session" guide
  // ---------------------------------------------------------------------
  //
  // Everything here is a link the compiler does not make. The registry's step
  // keys ARE checked against the catalog's shape where a component composes
  // them — but only for the topics a component happens to render, and the
  // catalog gap that actually leaks is the one present in every locale at
  // once: uniform, so the translation checker says nothing, and visible to a
  // family as a raw message key on a confirmation page in every language.
  describe("prep", () => {
    const prep = messages.topicPrep;
    /** The one step no topic declares — see the registry's header note. */
    const REMOTE_SESSION_KEY = "remoteSession";

    it("gives prep to exactly the topics that have an About card", () => {
      // Same seven, and the reason is the same: the five label-only topics
      // name subject matter rather than one piece of software, so there is
      // nothing single to install or sign into. Asserting the two sets are
      // equal is what makes splitting them a deliberate decision later.
      expect(PRODUCT_TOPIC_VALUES.filter(topicHasPrep).sort()).toEqual(
        PRODUCT_TOPIC_VALUES.filter(topicHasInfoCard).sort(),
      );
      expect(PRODUCT_TOPIC_VALUES.filter((t) => !topicHasPrep(t)).length)
        .toBeGreaterThan(0);
    });

    it("gives every step a unique key, a real scope and a real URL", () => {
      const seen = new Set<string>();

      for (const topic of PRODUCT_TOPIC_VALUES) {
        const meta: TopicMeta = PRODUCT_TOPICS[topic];
        if (!meta.prep) continue;

        expect(meta.prep.steps.length).toBeGreaterThan(0);

        for (const step of meta.prep.steps) {
          // Globally unique, because the catalog holds step prose flat rather
          // than nested under its topic — the only shape a composed message
          // key can be checked against. Two topics sharing a key would share
          // a step's words without either one saying so.
          expect(seen.has(step.key), `duplicate step key ${step.key}`).toBe(
            false,
          );
          seen.add(step.key);

          // The shared step is declared outside the topics, so a topic
          // claiming its key would silently take its words.
          expect(step.key, "a topic declares the shared step's key").not.toBe(
            REMOTE_SESSION_KEY,
          );

          expect(["always", "ownDevice"]).toContain(step.scope);
          if (step.url !== undefined) {
            expect(step.url.startsWith("https://")).toBe(true);
          }
        }
      }
    });

    it("gives every prep-bearing topic and every step its English prose", () => {
      const topics: Record<string, { intro?: string } | undefined> = prep.topics;
      const steps: Record<
        string,
        { title?: string; body?: string; linkLabel?: string } | undefined
      > = prep.steps;
      const notes: Record<
        string,
        { title?: string; body?: string } | undefined
      > = prep.platformNotes;
      const checklist: Record<string, string | undefined> = prep.checklist;

      const nonEmpty = (value: unknown, what: string) => {
        expect(value, `messages/en.json is missing ${what}`).toBeTypeOf(
          "string",
        );
        expect(
          typeof value === "string" ? value.trim().length : 0,
          `messages/en.json has a blank ${what}`,
        ).toBeGreaterThan(0);
      };

      // The shared remote-session step is declared outside every topic, so the
      // loop below would never reach it — and a missing body there is the gap
      // that shows up on every remote product at once.
      nonEmpty(
        steps[REMOTE_SESSION_KEY]?.title,
        `topicPrep.steps.${REMOTE_SESSION_KEY}.title`,
      );
      nonEmpty(
        steps[REMOTE_SESSION_KEY]?.body,
        `topicPrep.steps.${REMOTE_SESSION_KEY}.body`,
      );

      for (const topic of PRODUCT_TOPIC_VALUES) {
        const meta: TopicMeta = PRODUCT_TOPICS[topic];
        if (!meta.prep) continue;

        nonEmpty(topics[topic]?.intro, `topicPrep.topics.${topic}.intro`);

        for (const step of meta.prep.steps) {
          nonEmpty(steps[step.key]?.title, `topicPrep.steps.${step.key}.title`);
          nonEmpty(steps[step.key]?.body, `topicPrep.steps.${step.key}.body`);

          // A step with a URL needs a label for it, and a step without one
          // must not carry a label nothing renders.
          if (step.url === undefined) {
            expect(
              steps[step.key]?.linkLabel,
              `topicPrep.steps.${step.key}.linkLabel labels no URL`,
            ).toBeUndefined();
          } else {
            nonEmpty(
              steps[step.key]?.linkLabel,
              `topicPrep.steps.${step.key}.linkLabel`,
            );
          }

          for (const note of step.platformNotes ?? []) {
            nonEmpty(notes[note]?.title, `topicPrep.platformNotes.${note}.title`);
            nonEmpty(notes[note]?.body, `topicPrep.platformNotes.${note}.body`);
          }
          for (const item of step.checklist ?? []) {
            nonEmpty(checklist[item], `topicPrep.checklist.${item}`);
          }
        }
      }
    });

    it("pairs the accounts-only intro with the topics that actually filter", () => {
      // The two have to agree in both directions. A topic that loses steps in
      // person and has no second intro opens a shortened guide by promising
      // software to install; a topic that declares one and never filters has
      // paid five locales to translate a paragraph nobody can reach.
      const filters: string[] = [];
      const declares: string[] = [];

      for (const topic of PRODUCT_TOPIC_VALUES) {
        const meta: TopicMeta = PRODUCT_TOPICS[topic];
        if (!meta.prep) continue;

        const kept = meta.prep.steps.filter((s) => s.scope === "always");
        // Nothing kept is the third case and needs no intro at all: the guide
        // does not render in person. The three Minecraft topics are that case
        // — we supply the machines and the Minecraft logins alike.
        if (kept.length > 0 && kept.length < meta.prep.steps.length) {
          filters.push(topic);
        }
        if (meta.prep.accountsOnlyIntro === true) declares.push(topic);
      }

      expect(declares.sort()).toEqual(filters.sort());

      const intros: Record<string, string | undefined> = prep.accountsOnlyIntro;
      expect(Object.keys(intros).sort()).toEqual([...declares].sort());
      for (const topic of declares) {
        expect(intros[topic]?.trim().length ?? 0).toBeGreaterThan(0);
      }
    });

    it("drops the ownDevice steps in person and keeps the always ones", () => {
      // The rule the whole scope axis exists for: at an in-person product
      // School of Gaming brings the machines, so only the account steps are
      // the family's to do.
      for (const topic of PRODUCT_TOPIC_VALUES) {
        if (!topicHasPrep(topic)) continue;

        const inPerson = resolveTopicPrep(topic, false);
        if (inPerson === null) continue;
        expect(
          inPerson.steps.every((s) => s.scope === "always"),
          `${topic} renders an ownDevice step at an in-person product`,
        ).toBe(true);
        expect(
          inPerson.steps.map((s) => s.key),
          `${topic} carries the remote-session step at an in-person product`,
        ).not.toContain(REMOTE_SESSION_KEY);

        const declared: TopicMeta = PRODUCT_TOPICS[topic];
        const remote = resolveTopicPrep(topic, true);
        expect(remote).not.toBeNull();
        expect(remote?.steps.map((s) => s.key)).toEqual([
          ...(declared.prep?.steps.map((s) => s.key) ?? []),
          REMOTE_SESSION_KEY,
        ]);
      }
    });

    it("ends every remote guide on the shared voice-room step, and no in-person one", () => {
      // The step belongs to the product rather than to the topic, so the
      // assertion is over every topic at once: remote guides all end on it,
      // in-person guides never mention it, and it is declared once — which is
      // what the global-uniqueness check above is worth here.
      for (const topic of PRODUCT_TOPIC_VALUES) {
        const remote = resolveTopicPrep(topic, true);
        expect(remote, `${topic} renders no guide on a remote product`).not
          .toBeNull();
        expect(remote?.steps.at(-1)?.key, topic).toBe(REMOTE_SESSION_KEY);
        expect(
          remote?.steps.filter((s) => s.key === REMOTE_SESSION_KEY),
          `${topic} appends the shared step more than once`,
        ).toHaveLength(1);
      }
    });

    it("gives a label-only topic a one-step guide remotely and none in person", () => {
      // The five topics that name subject matter rather than one piece of
      // software bring no steps of their own. Remotely there is still the room
      // to get ready for, and it is the whole guide — under the generic intro,
      // because there is no topic sentence to open with.
      for (const topic of PRODUCT_TOPIC_VALUES.filter((t) => !topicHasPrep(t))) {
        expect(resolveTopicPrep(topic, false), topic).toBeNull();

        const remote = resolveTopicPrep(topic, true);
        expect(remote?.form, topic).toBe("remoteOnly");
        expect(remote?.steps.map((s) => s.key), topic).toEqual([
          REMOTE_SESSION_KEY,
        ]);
      }

      expect(messages.topicPrep.remoteOnlyIntro.trim().length).toBeGreaterThan(0);
    });

    it("renders nothing in person for a topic with no guide, and none for any Minecraft topic", () => {
      expect(resolveTopicPrep("programming", false)).toBeNull();
      expect(resolveTopicPrep("esports", false)).toBeNull();

      // The case the null answer was written for, and all three Minecraft
      // topics are in it: we supply the machines AND the logins — School of
      // Gaming's own Minecraft accounts at our venues, School of Gaming's
      // Minecraft Education accounts in municipality clubs — so a family has
      // genuinely nothing to do beforehand and a guide saying so would be
      // furniture. It is an in-person answer alone: remotely the room is
      // always there to get ready for, and remotely the accounts are the
      // family's own.
      expect(resolveTopicPrep("minecraft_education", false)).toBeNull();
      expect(resolveTopicPrep("minecraft_java", false)).toBeNull();
      expect(resolveTopicPrep("minecraft_bedrock", false)).toBeNull();

      expect(
        resolveTopicPrep("minecraft_education", true)?.steps.map((s) => s.key),
      ).toEqual(["minecraftEducationInstall", REMOTE_SESSION_KEY]);
      expect(
        resolveTopicPrep("minecraft_java", true)?.steps.map((s) => s.key),
      ).toEqual([
        "minecraftJavaAccount",
        "minecraftJavaInstall",
        "minecraftJavaLaunch",
        REMOTE_SESSION_KEY,
      ]);
      expect(resolveTopicPrep("minecraft_java", true)?.form).toBe("full");
      expect(
        resolveTopicPrep("minecraft_bedrock", true)?.steps.map((s) => s.key),
      ).toEqual([
        "minecraftBedrockAccount",
        "minecraftBedrockInstall",
        "minecraftBedrockOnline",
        REMOTE_SESSION_KEY,
      ]);
      expect(resolveTopicPrep("minecraft_bedrock", true)?.form).toBe("full");
    });

    it("keeps every Pokémon GO step in person", () => {
      // The phone is the family's wherever the session happens — we supply
      // computers, not a child's own phone — so nothing here is ours to
      // provide and nothing filters out. That also makes it the one prep
      // topic whose accounts-only form never renders.
      const meta: TopicMeta = PRODUCT_TOPICS.pokemon_go;
      const declared = meta.prep?.steps;
      const inPerson = resolveTopicPrep("pokemon_go", false);

      expect(inPerson?.form).toBe("full");
      expect(inPerson?.steps.map((s) => s.key)).toEqual(
        declared?.map((s) => s.key),
      );
    });

    it("takes the accounts-only intro exactly when steps were dropped", () => {
      expect(resolveTopicPrep("roblox_studio", true)?.form).toBe("full");

      const inPerson = resolveTopicPrep("roblox_studio", false);
      expect(inPerson?.form).toBe("accountsOnly");
      expect(inPerson?.steps.map((s) => s.key)).toEqual([
        "robloxStudioAccount",
      ]);
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
