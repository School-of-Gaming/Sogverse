import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { FamilyCreationsCard } from "@/components/family/product-page/FamilyCreationsCard";
import {
  FamilyProductPageBody,
  type FamilyProductPageAudience,
} from "@/components/family/product-page/FamilyProductPageBody";
import type { FamilyCreation } from "@/components/family/product-page/types";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";

/**
 * ============================================================================
 * The family Creations card: when it exists at all, and when a title is a link.
 * ============================================================================
 *
 * Two rules, and both of them are the whole feature:
 *
 *   - **Nothing to show means no card and no space held for one.** Almost every
 *     enrollment has no creations, so an empty card would be the state most
 *     families actually met.
 *   - **A title becomes an anchor only when its stored URL parses as http(s),
 *     and otherwise renders as plain text.** The column is stored raw and
 *     unvalidated on purpose (staff are trusted), which makes this the half of
 *     that decision keeping a `javascript:` value on a parent's browser from
 *     being stored XSS. The degrade is to a label, never to an anchor with
 *     nowhere to go — a blank `href` resolves to the current page.
 *
 * The card carries one copy for every audience, so there is nothing here keyed
 * to who is reading; the body decides nothing about it either way.
 */

const NEW_TAB = messages.familyProduct.creationOpensInNewTab;

/**
 * The card's heading, in both of the forms it has.
 *
 * It is a plural expression rather than a fixed noun, because the staff editor
 * authors **one** creation: a page reading "Creations" over a single entry
 * would be the one place the family's word and the gedu's came apart. Spelled
 * out here rather than formatted through the ICU machinery — with the message
 * itself asserted below to still carry both forms — so a copy change fails
 * loudly instead of quietly matching nothing.
 */
const HEADING_ONE = "Creation";
const HEADING_MANY = "Creations";

/**
 * The accessible name of a linked entry: its title plus the new-tab warning.
 *
 * Concatenated with no separator because that is what the name algorithm
 * produces — it strips whitespace at each node, so a space authored between the
 * title and the visually-hidden label does not survive into the name.
 */
function linkName(title: string): string {
  return `${title}${NEW_TAB}`;
}

function renderCard(creations: readonly FamilyCreation[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FamilyCreationsCard creations={creations} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("suppression", () => {
  it("renders nothing at all for a participant with no creations", () => {
    const { container, queryByRole } = renderCard([]);
    expect(queryByRole("heading")).toBeNull();
    // Not an empty card, not a heading over nothing: no DOM at all, which is
    // what "reserves no space" has to mean.
    expect(container.firstChild).toBeNull();
  });

  it("renders the card as soon as there is one", () => {
    const { queryByText } = renderCard([
      { title: "The castle gate", url: "https://example.com/castle" },
    ]);
    expect(queryByText(HEADING_ONE)).not.toBeNull();
  });
});

describe("the heading", () => {
  it("is singular over the one entry the editor can author", () => {
    const { queryByText } = renderCard([
      { title: "The castle gate", url: "https://example.com/castle" },
    ]);
    expect(queryByText(HEADING_ONE)).not.toBeNull();
    expect(queryByText(HEADING_MANY)).toBeNull();
  });

  it("is plural over a list the wire shape still allows", () => {
    // The column, the RPC and every document that carries this field hold an
    // array; only the editor is single. So the plural form is reachable by
    // data even though no Gedu can type it, and it has to be right.
    const { queryByText } = renderCard([
      { title: "One", url: "https://example.com/one" },
      { title: "Two", url: "https://example.com/two" },
    ]);
    expect(queryByText(HEADING_MANY)).not.toBeNull();
  });

  it("still spells both forms in the message it is drawn from", () => {
    const heading = messages.familyProduct.creationsHeading;
    expect(heading).toContain(`one {${HEADING_ONE}}`);
    expect(heading).toContain(`other {${HEADING_MANY}}`);
  });
});

describe("a URL that may become an href", () => {
  it("links an https value, in a new tab, with the opener severed", () => {
    const { getByRole } = renderCard([
      { title: "The castle gate", url: "https://example.com/castle" },
    ]);
    const link = getByRole("link", { name: linkName("The castle gate") });
    expect(link.getAttribute("href")).toBe("https://example.com/castle");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("links a plain http value too", () => {
    const { getByRole } = renderCard([
      { title: "The old wiki page", url: "http://example.com/wiki" },
    ]);
    expect(
      getByRole("link", { name: linkName("The old wiki page") }).getAttribute(
        "href",
      ),
    ).toBe("http://example.com/wiki");
  });

  it("keeps the entry in the list when it links", () => {
    const { getByRole } = renderCard([
      { title: "One", url: "https://example.com/one" },
      { title: "Two", url: "https://example.com/two" },
    ]);
    expect(getByRole("list").querySelectorAll("li")).toHaveLength(2);
  });
});

describe("a URL that may not", () => {
  /**
   * Every one of these renders the title and no anchor. The first two are the
   * dangerous pair — a scheme that executes and a scheme that carries its own
   * document — and the rest are the ordinary ways a staff-typed field is simply
   * not a URL.
   */
  const REFUSED: readonly { case: string; url: string }[] = [
    { case: "a javascript: payload", url: "javascript:alert(document.cookie)" },
    { case: "a data: document", url: "data:text/html,<script>alert(1)</script>" },
    { case: "whitespace only", url: "   " },
    { case: "a bare domain with no scheme", url: "example.com/castle" },
    { case: "an empty string", url: "" },
    { case: "a sentence a gedu typed instead", url: "shared world: /warp aino" },
  ];

  for (const refused of REFUSED) {
    it(`renders ${refused.case} as its title, with no anchor`, () => {
      const { queryByRole, queryByText } = renderCard([
        { title: "Clock tower", url: refused.url },
      ]);
      // The label survives — which is why the title is a required field.
      expect(queryByText("Clock tower")).not.toBeNull();
      // No anchor of any kind: an `<a>` with a blank href is not inert, it
      // resolves to the page the reader is already on.
      expect(queryByRole("link")).toBeNull();
      expect(queryByText(NEW_TAB)).toBeNull();
    });
  }

  it("never emits an anchor element even without an accessible name", () => {
    const { container } = renderCard([
      { title: "Clock tower", url: "javascript:alert(1)" },
    ]);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("degrades one entry without touching the linked one beside it", () => {
    const { getByRole, queryByText } = renderCard([
      { title: "The castle world", url: "https://example.com/castle" },
      { title: "Clock tower", url: "shared world: /warp aino" },
    ]);
    expect(
      getByRole("link", { name: linkName("The castle world") }),
    ).not.toBeNull();
    expect(queryByText("Clock tower")).not.toBeNull();
    expect(getByRole("list").querySelectorAll("a")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  On the page                                                               */
/* -------------------------------------------------------------------------- */

/** Monday 16 March 2026 — an in-person club, so no Join and no room to open. */
const NOW = new Date("2026-03-17T09:00:00.000Z");

/** A real generated UUID: the id seeds the masthead's identicon. */
const AINO = { id: "a085e922-7f74-4f6f-b614-71369cb05e6e", firstName: "Aino" };

const CREATIONS: readonly FamilyCreation[] = [
  { title: "The castle world", url: "https://example.com/castle" },
];

function renderPage(
  audience: FamilyProductPageAudience,
  creations: readonly FamilyCreation[],
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <FamilyProductPageBody
            audience={audience}
            productName="Minecraft Builders Club"
            schedule={{
              product_type: "consumer_club",
              timezone: "Europe/Helsinki",
              start_date: "2026-01-05",
              end_date: null,
              schedule_slots: [
                { weekday: 0, start_time: "17:00", duration_minutes: 90 },
              ],
            }}
            isRemote={false}
            participant={AINO}
            groupName="Builders A"
            gedus={[]}
            groupPublicNote={null}
            creations={creations}
            site={null}
            voiceHref="/voice/group/builders-a"
            entries={[]}
            sourceTimeZone="Europe/Helsinki"
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

describe("on the family product page", () => {
  const AUDIENCES: readonly FamilyProductPageAudience[] = [
    "customer",
    "self",
    "gamer",
  ];

  for (const audience of AUDIENCES) {
    it(`shows the card, in the same words, to the ${audience} audience`, () => {
      // The gamer revisiting their own work is a design goal, not a leftover:
      // one card, one heading, no copy keyed to who is reading.
      const { getByRole, queryByText } = renderPage(audience, CREATIONS);
      expect(queryByText(HEADING_ONE)).not.toBeNull();
      expect(
        getByRole("link", { name: linkName("The castle world") }),
      ).not.toBeNull();
    });

    it(`holds no space for it on a ${audience} page with none`, () => {
      const { queryByText } = renderPage(audience, []);
      expect(queryByText(HEADING_ONE)).toBeNull();
      expect(queryByText(HEADING_MANY)).toBeNull();
    });
  }

  it("sits between the standing context and the term's history", () => {
    const { container } = renderPage("customer", CREATIONS);
    const text = container.textContent;
    // Above the feed, because below it the card is behind a history nobody
    // scrolls to the end of. The order is load-bearing, so it is asserted.
    expect(text.indexOf(HEADING_ONE)).toBeGreaterThan(-1);
    expect(text.indexOf(HEADING_ONE)).toBeLessThan(
      text.indexOf(messages.familyProduct.feedHeading),
    );
  });
});
