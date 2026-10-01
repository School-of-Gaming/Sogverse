import { describe, expect, it, vi } from "vitest";
import {
  findBySlug,
  parseIdOrSlug,
  resolveIdOrSlug,
  slugAddressOf,
  slugify,
} from "@/lib/slug";

describe("slugify", () => {
  it("folds diacritics into lowercase ASCII", () => {
    expect(slugify("Ähtäri")).toBe("ahtari");
    expect(slugify("Åsa Öberg")).toBe("asa-oberg");
    expect(slugify("Hélène Çelik")).toBe("helene-celik");
    expect(slugify("Ñuño")).toBe("nuno");
  });

  it("spells out the letters NFD cannot split rather than dropping them", () => {
    expect(slugify("Søren Æbelø")).toBe("soren-aebelo");
    expect(slugify("Straße")).toBe("strasse");
    expect(slugify("Łukasz")).toBe("lukasz");
    expect(slugify("Þóra")).toBe("thora");
  });

  it("joins words with single hyphens and trims both ends", () => {
    expect(slugify("Eetu CreeperHug")).toBe("eetu-creeperhug");
    expect(slugify("  Mia  “xX_Builder_Xx”!  ")).toBe("mia-xx-builder-xx");
    expect(slugify("O'Brien -- the 2nd")).toBe("obrien-the-2nd");
  });

  it("drops apostrophes rather than hyphenating them, in every locale", () => {
    expect(slugify("What's on")).toBe("whats-on");
    expect(slugify("A parent\u2019s guide")).toBe("a-parents-guide");
    expect(slugify("l'école")).toBe("lecole");
    expect(slugify("\u2018Quoted\u2019 l\u2019été")).toBe("quoted-lete");
    expect(slugify("o\u02bcclock")).toBe("oclock");
  });

  it("slugs text with no Latin letter or digit to nothing", () => {
    expect(slugify("李雷")).toBe("");
    expect(slugify("—")).toBe("");
  });
});

describe("parseIdOrSlug", () => {
  it("reads a UUID as an id and anything else as a slug", () => {
    const id = "eadea095-24f1-40cd-bc31-e898edc9ab3a";
    expect(parseIdOrSlug(id)).toEqual({ id });
    expect(parseIdOrSlug("eetu-creeperhug")).toEqual({ slug: "eetu-creeperhug" });
    // Hex and hyphens, but not a UUID's shape.
    expect(parseIdOrSlug("eadea095-24f1")).toEqual({ slug: "eadea095-24f1" });
  });
});

interface Item {
  id: string;
  name: string;
}
const slugOf = (item: Item) => slugify(item.name);
const ITEMS: Item[] = [
  { id: "a", name: "Eetu Creeperhug" },
  { id: "b", name: "Saana" },
  // Derives the first one's slug: the first in list order keeps it.
  { id: "c", name: "Eetu CREEPERHUG" },
  { id: "d", name: "李雷" },
];

describe("findBySlug", () => {
  it("finds the first item in the list's order that derives the slug", () => {
    expect(findBySlug(ITEMS, "eetu-creeperhug", slugOf)?.id).toBe("a");
    expect(findBySlug(ITEMS, "saana", slugOf)?.id).toBe("b");
  });

  it("answers null for a slug nobody derives, and for the empty slug", () => {
    expect(findBySlug(ITEMS, "nobody", slugOf)).toBeNull();
    expect(findBySlug(ITEMS, "", slugOf)).toBeNull();
  });
});

describe("slugAddressOf", () => {
  it("is the item's own slug when it is the first to derive it", () => {
    expect(slugAddressOf(ITEMS, "a", slugOf)).toBe("eetu-creeperhug");
    expect(slugAddressOf(ITEMS, "b", slugOf)).toBe("saana");
  });

  it("is null for the item a collision leaves on its id", () => {
    expect(slugAddressOf(ITEMS, "c", slugOf)).toBeNull();
  });

  it("is null for an item deriving no slug, or one not in the list", () => {
    expect(slugAddressOf(ITEMS, "d", slugOf)).toBeNull();
    expect(slugAddressOf(ITEMS, "z", slugOf)).toBeNull();
  });
});

describe("resolveIdOrSlug", () => {
  const ID = "eadea095-24f1-40cd-bc31-e898edc9ab3a";

  it("looks a UUID up by id, and never by slug", async () => {
    const byId = vi.fn(async () => "by id");
    const bySlug = vi.fn(async () => "by slug");

    await expect(resolveIdOrSlug(ID, { byId, bySlug })).resolves.toBe("by id");
    expect(byId).toHaveBeenCalledWith(ID);
    expect(bySlug).not.toHaveBeenCalled();
  });

  it("looks anything else up by slug, and never by id", async () => {
    const byId = vi.fn(async () => "by id");
    const bySlug = vi.fn(async () => "by slug");

    await expect(
      resolveIdOrSlug("eetu-creeperhug", { byId, bySlug }),
    ).resolves.toBe("by slug");
    expect(bySlug).toHaveBeenCalledWith("eetu-creeperhug");
    expect(byId).not.toHaveBeenCalled();
  });

  it("passes a lookup's null through", async () => {
    await expect(
      resolveIdOrSlug(ID, { byId: async () => null, bySlug: async () => "x" }),
    ).resolves.toBeNull();
  });
});
