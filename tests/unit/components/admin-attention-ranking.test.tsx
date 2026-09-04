import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import {
  PRODUCT_ISSUE_KINDS,
  type ProductAttention,
  type ProductIssue,
} from "@/components/admin/dashboard/admin-dashboard-data";
import {
  ISSUE_PRESENTATION,
  ProductAttentionGrid,
} from "@/components/admin/dashboard/product-attention-grid";

/**
 * **The ranking, which is the whole design of the attention queue and until now
 * the only part of it nothing asserted.**
 *
 * `PRODUCT_ISSUE_KINDS` is not a list of kinds, it is an order: the grid sorts a
 * card's lines by a kind's index in it, sorts the products against each other by
 * their worst line's index, and the tone map is read against the same order. So
 * moving one entry changes what every card says about itself and what the page
 * says about which product needs an admin first — a large, entirely silent
 * change. The builder's own tests pin the order it *emits* issues in, and the
 * grid re-sorts underneath them, so they would stay green through all of it.
 *
 * Three things are pinned here, and they are deliberately different in kind:
 *
 *  1. **The order itself, as a blunt equality.** There is nothing to derive it
 *     from — the order *is* the design — so the test is a copy of it, and its
 *     job is to make a reordering something somebody had to type twice.
 *  2. **The prefix invariant** the tone map's doc comment states as a hard rule:
 *     the `warning` kinds are a prefix of the ranking and the `muted` ones are
 *     the rest. Nothing in the type system holds it, so it is written as a
 *     property over both structures rather than as a list of which kind is
 *     which — a seventh kind has to *satisfy* it rather than be added to it.
 *  3. **The sort as a reader meets it**, by rendering the real grid and reading
 *     the DOM back. The helpers doing the sorting are module-private and worth
 *     keeping that way: what matters is the order of lines on a card and of
 *     cards on the page, and asserting a comparator's return value would leave
 *     a grid that forgot to call it entirely green.
 */

/** The instant-free, provider-free frame the grid needs: one message catalogue. */
function renderGrid(products: readonly ProductAttention[]): HTMLElement {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProductAttentionGrid products={products} />
    </NextIntlClientProvider>,
  );
  return container;
}

/** Every card on the page, in the order it is painted. */
function cards(container: HTMLElement): HTMLAnchorElement[] {
  return Array.from(container.querySelectorAll("a"));
}

/**
 * A card's product name. It is the first child of the link — a span holding the
 * type glyph and the name, and the glyph is `aria-hidden` and wordless.
 */
function cardName(card: HTMLAnchorElement): string {
  return card.firstElementChild?.textContent ?? "";
}

/** A card's issue sentences, in the order they are painted. */
function issueLines(card: HTMLAnchorElement): string[] {
  return Array.from(card.querySelectorAll("ul > li")).map(
    (line) => line.textContent,
  );
}

function product(
  productId: string,
  name: string,
  issues: readonly ProductIssue[],
): ProductAttention {
  return {
    productId,
    name,
    productType: "consumer_club",
    href: `/admin/consumer-clubs/${productId}`,
    issues,
  };
}

afterEach(cleanup);

describe("the attention queue's ranking", () => {
  it("is these six kinds in this order, with the empty group below the waitlist and above the fees", () => {
    expect(PRODUCT_ISSUE_KINDS).toEqual([
      "unassigned-gamers",
      "group-without-gedu",
      "waitlist-open-seats",
      "empty-group-without-gedu",
      "missing-gedu-fee",
      "missing-municipality-fee",
    ]);
    // Spelled out separately because it is the claim the two unstaffed-group
    // kinds are built on: the same fact about a group ranks near the top when
    // somebody is in it and near the bottom when nobody is.
    expect(PRODUCT_ISSUE_KINDS.indexOf("empty-group-without-gedu")).toBe(3);
  });

  it("keeps the warning kinds a prefix of the ranking and the muted ones the rest", () => {
    const tones = PRODUCT_ISSUE_KINDS.map(
      (kind) => ISSUE_PRESENTATION[kind].tone,
    );
    const bandBreak = tones.indexOf("muted");

    // Both bands have to be non-empty, or the property below holds vacuously
    // and a map that had quietly become all one tone would pass.
    expect(bandBreak).toBeGreaterThan(0);
    expect(bandBreak).toBeLessThan(tones.length);

    // Rebuilt from where the break actually falls rather than compared against
    // a hand-written list of which kind wears which tone. A seventh kind has to
    // land on the correct side of the break to pass; adding it to a list here
    // would not be an option, because there is no list.
    expect(tones).toEqual([
      ...tones.slice(0, bandBreak).map(() => "warning"),
      ...tones.slice(bandBreak).map(() => "muted"),
    ]);
  });
});

describe("the attention grid's sort", () => {
  it("paints a card's lines worst first, whatever order they arrive in", () => {
    // Handed over scrambled on purpose: the grid sorts rather than trusting the
    // feed, so a fixture already in rank order could not tell the two apart.
    const container = renderGrid([
      product("club", "Minecraft-klubi Espoo", [
        { id: "a", kind: "missing-municipality-fee" },
        {
          id: "b",
          kind: "empty-group-without-gedu",
          values: { group: "Tiistai C" },
        },
        { id: "c", kind: "unassigned-gamers", values: { count: 1 } },
        { id: "d", kind: "missing-gedu-fee" },
        {
          id: "e",
          kind: "waitlist-open-seats",
          values: { waiting: 3, open: 2, offers: 0 },
        },
        {
          id: "f",
          kind: "group-without-gedu",
          values: { group: "Tiistai A" },
        },
      ]),
    ]);

    expect(issueLines(cards(container)[0])).toEqual([
      "1 unassigned gamer",
      "Group Tiistai A has no Gedu",
      "3 waitlisted · 2 seats open",
      "Empty group Tiistai C has no Gedu",
      "Gedu fee not set",
      "Municipality fee not set",
    ]);
  });

  it("paints the product with the worst single problem first", () => {
    const container = renderGrid([
      product("p-empty", "Espoo", [
        {
          id: "a",
          kind: "empty-group-without-gedu",
          values: { group: "Ryhmä" },
        },
      ]),
      product("p-fee", "Vantaa", [{ id: "b", kind: "missing-municipality-fee" }]),
      product("p-unassigned", "Helsinki", [
        { id: "c", kind: "unassigned-gamers", values: { count: 2 } },
      ]),
      product("p-group", "Turku", [
        { id: "d", kind: "group-without-gedu", values: { group: "Kerho 1" } },
      ]),
    ]);

    // Worst line first, and nothing else consulted: each product carries one
    // line and the names are in a different order again, so a sort reading the
    // name or the feed's order lands somewhere else.
    expect(cards(container).map(cardName)).toEqual([
      "Helsinki",
      "Turku",
      "Espoo",
      "Vantaa",
    ]);
  });

  it("breaks a tie on the worst line by how many problems a product has, then by name", () => {
    const container = renderGrid([
      product("one-problem-a", "Tampere", [
        { id: "a", kind: "unassigned-gamers", values: { count: 9 } },
      ]),
      product("two-problems", "Oulu", [
        { id: "b", kind: "unassigned-gamers", values: { count: 1 } },
        { id: "c", kind: "missing-gedu-fee" },
      ]),
      product("one-problem-b", "Kuopio", [
        { id: "d", kind: "unassigned-gamers", values: { count: 4 } },
      ]),
    ]);

    // The count on the line is deliberately no help: the product with nine
    // unassigned gamers sorts below the one with one of them and a missing fee,
    // because the queue ranks kinds and never magnitudes.
    expect(cards(container).map(cardName)).toEqual([
      "Oulu",
      "Kuopio",
      "Tampere",
    ]);
  });
});
