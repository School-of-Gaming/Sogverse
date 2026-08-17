import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { z } from "zod";
import messages from "@/../messages/en.json";
import { SEARCH_DEBOUNCE_MS } from "@/hooks/use-debounced-value";
import {
  buildMunicipalityEntries,
  type MunicipalityEntry,
} from "@/lib/schools/municipalities";
import type {
  locationSearchHit,
  locationSearchResult,
} from "@/services/locations/locations.contracts";
import { SchoolsBrowse } from "@/components/public/schools/schools-browse";

/**
 * `/schools` searches with **two arms in union**, and this file is about the
 * seam between them.
 *
 * The local arm narrows the club-bearing municipalities the server shipped and
 * renders on the keystroke. The fallback arm asks the database's own search
 * index, a debounce behind, and appends whatever the local arm did not already
 * show. The union is what makes a clubless municipality findable when its whole
 * name sits inside a club-bearing one's — Lahti inside Vesilahti is the shape,
 * and 32 such pairs exist in the real Finnish data — which the
 * fire-only-when-local-comes-up-empty cascade this replaced could never do.
 *
 * Five things are easy to get subtly wrong and are pinned deliberately: the
 * dedupe key (what the local arm *rendered*, never the club-bearing id set),
 * the empty state waiting for a fallback that is genuinely coming and for no
 * longer than that, the appended block surviving a related keystroke instead of
 * blinking out while the next request flies, that same block going at once when
 * the query is rewritten into something it cannot answer, and a failed fallback
 * degrading to the ordinary empty state rather than to an error.
 *
 * The search hook is mocked rather than the network: everything asserted here
 * is this component's own arbitration between the two arms.
 */

type SearchHit = z.infer<typeof locationSearchHit>;
type SearchAnswer = z.infer<typeof locationSearchResult>;

type Answer = "pending" | "failed" | SearchAnswer;

/** What the mocked hook answers with when no per-needle answer is registered. */
let fallback: Answer = "pending";

/**
 * Per-needle answers, for the cases about one needle's block standing in for
 * another's. Registered rather than computed, so a given needle answers with
 * the *same object* every render — which is what the real hook does, and what
 * the component's "has this response been replaced?" bookkeeping reads.
 */
const answers = new Map<string, Answer>();

/** Every call the component made, so the needle and the scoping are assertable. */
const calls: { needle: string; options: Record<string, unknown> }[] = [];

/**
 * Stands in for `useLocationSearch`. Declared (not assigned) so the hoisted
 * `vi.mock` factory below can close over it, and deliberately faithful about
 * the disabled case: below the route's minimum needle length the real hook
 * never runs and never leaves React Query's "pending" status.
 */
function mockSearch(needle: string, options: Record<string, unknown>) {
  calls.push({ needle, options });
  if (needle.length < 2) return { data: undefined, isPending: true };
  const reply = answers.get(needle) ?? fallback;
  if (reply === "pending") return { data: undefined, isPending: true };
  if (reply === "failed") return { data: undefined, isPending: false };
  return { data: reply, isPending: false };
}

// Only the hook is replaced — the module's constants stay real, so nothing
// here can drift from the route's own minimum needle length.
vi.mock("@/services/locations", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useLocationSearch: mockSearch,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function region(id: string, name: string) {
  return { id, name, name_i18n: null, type: "region" as const };
}

function hit(
  id: string,
  name: string,
  parent: ReturnType<typeof region>,
  nameI18n: Record<string, string> | null = null,
): SearchHit {
  return {
    id,
    name,
    name_i18n: nameI18n,
    type: "municipality",
    parent_id: parent.id,
    country_code: "FI",
    external_code: null,
    ancestors: [parent],
  };
}

function answer(...hits: SearchHit[]): SearchAnswer {
  return { total: hits.length, results: hits };
}

const PIRKANMAA = region("pirkanmaa", "Pirkanmaa");
const UUSIMAA = region("uusimaa", "Uusimaa");
const PAIJAT_HAME = region("paijat-hame", "Päijät-Häme");
const POHJOIS_KARJALA = region("pohjois-karjala", "Pohjois-Karjala");

/**
 * The club-bearing set the server ships. Vesilahti is the whole point of it:
 * "lahti" is an infix of its name, so the local arm answers that query and a
 * cascade guarding the fallback on zero local hits would never fire.
 */
const ENTRIES: MunicipalityEntry[] = buildMunicipalityEntries(
  [
    {
      id: "vesilahti",
      name: "Vesilahti",
      name_i18n: null,
      ancestors: [PIRKANMAA],
    },
    {
      id: "helsinki",
      name: "Helsinki",
      name_i18n: { sv: "Helsingfors" },
      ancestors: [UUSIMAA],
    },
  ],
  "en",
);

const LAHTI = hit("lahti", "Lahti", PAIJAT_HAME);
const KONTIOLAHTI = hit("kontiolahti", "Kontiolahti", POHJOIS_KARJALA);
const VESILAHTI_HIT = hit("vesilahti", "Vesilahti", PIRKANMAA);
/** The postal arm's case: a club-bearing row no local slug match can reach. */
const HELSINKI_HIT = hit("helsinki", "Helsinki", UUSIMAA, {
  sv: "Helsingfors",
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function browse() {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <SchoolsBrowse entries={ENTRIES} />
    </NextIntlClientProvider>
  );
}

function type(value: string) {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value } });
}

/** Let the debounce fire, which is what puts a needle in front of the hook. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10);
  });
}

/**
 * A search row as one comparable value: its whole text (name, region sub-line
 * and status pill, which is every claim the row makes) plus whether it is a
 * link, since that is the difference between a municipality a parent can open
 * and one we run nothing in.
 */
function rows(): { text: string; link: boolean }[] {
  return screen.queryAllByRole("listitem").map((li) => ({
    text: li.textContent,
    link: li.querySelector("a") !== null,
  }));
}

function row(name: string, regionName: string, hasClubs: boolean) {
  const status = hasClubs
    ? messages.schools.status.available
    : messages.schools.status.noClubs;
  return { text: `${name}${regionName}${status}`, link: hasClubs };
}

function noMatchesCard(): HTMLElement | null {
  return screen.queryByText(/No municipality matches/);
}

function lastCall() {
  return calls[calls.length - 1];
}

beforeEach(() => {
  vi.useFakeTimers();
  calls.length = 0;
  answers.clear();
  fallback = "pending";
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("SchoolsBrowse — the two search arms in union", () => {
  it("renders the local hits on the keystroke, without waiting for the index", () => {
    renderBrowse();
    type("vesi");

    // No timers advanced: the index has not even been asked yet.
    expect(rows()).toEqual([row("Vesilahti", "Pirkanmaa", true)]);
    expect(noMatchesCard()).toBeNull();
  });

  it("appends the index's hits below the local ones, in rank order, clubless", () => {
    fallback = answer(LAHTI, KONTIOLAHTI);
    renderBrowse();
    type("lahti");
    settle();

    // Rank order is kept within the appended block: Kontiolahti sorts before
    // Lahti alphabetically and must not be reordered on the way in.
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
      row("Kontiolahti", "Pohjois-Karjala", false),
    ]);
  });

  it("dedupes against what the local arm rendered", () => {
    fallback = answer(VESILAHTI_HIT, LAHTI);
    renderBrowse();
    type("vesilahti");
    settle();

    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
    ]);
  });

  it("renders a club-bearing hit the local arm missed as a working link", () => {
    // A postcode: nothing the local slug fold can match, and the index answers
    // with a municipality the page already holds an entry for.
    fallback = answer(HELSINKI_HIT);
    renderBrowse();
    type("00100");
    settle();

    expect(rows()).toEqual([row("Helsinki", "Uusimaa", true)]);
    expect(
      screen.getByRole("link", { name: /Helsinki/ }).getAttribute("href"),
    ).toBe("/schools/helsinki");
  });

  it("scopes the index query to Finnish municipalities, placeholder off, one retry", () => {
    fallback = answer(LAHTI);
    renderBrowse();
    type("lahti");
    settle();

    expect(lastCall()).toEqual({
      needle: "lahti",
      options: {
        types: ["municipality"],
        country: "FI",
        keepPreviousResults: false,
        // Not React Query's default of three: this results area renders
        // nothing while a fallback is unresolved, so the retry budget is how
        // long a failing request keeps the page blank.
        retry: 1,
      },
    });
  });

  it("caps the search box at the length the route will accept", () => {
    renderBrowse();

    // A longer needle comes back 400, which would leave the results area blank
    // rather than showing the ordinary empty state.
    expect(screen.getByRole("searchbox").getAttribute("maxLength")).toBe("120");
  });

  it("asks the index nothing for input that folds away, and shows the default view", () => {
    renderBrowse();
    type("lahti");
    settle();
    type("--");
    settle();

    expect(lastCall().needle).toBe("");
    expect(noMatchesCard()).toBeNull();
    // The regions, collapsed, are the default view.
    expect(screen.getByRole("button", { name: /Pirkanmaa/ })).toBeTruthy();
  });
});

/**
 * The two arms answer at different speeds, so every keystroke leaves a window
 * where the local half has moved on and the index half has not. What fills that
 * window is the previous response, and these cases are the whole of the rule:
 * it is kept while the two needles contain one another, replaced when the fresh
 * one lands, and dropped the moment it could be mistaken for an answer.
 */
describe("SchoolsBrowse — the appended block across keystrokes", () => {
  it("keeps the block while a longer query debounces, then narrows on resolve", () => {
    answers.set("lah", answer(LAHTI, KONTIOLAHTI));
    answers.set("lahti", answer(LAHTI));
    renderBrowse();

    type("lah");
    settle();
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
      row("Kontiolahti", "Pohjois-Karjala", false),
    ]);

    // Mid-debounce on the longer needle. The block stands exactly as it was —
    // Kontiolahti included, because nothing here re-matches held hits against
    // the newer text; only the index gets to narrow them.
    type("lahti");
    expect(lastCall().needle).toBe("");
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
      row("Kontiolahti", "Pohjois-Karjala", false),
    ]);

    settle();
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
    ]);
  });

  it("keeps the block while a backspaced query debounces, then widens on resolve", () => {
    answers.set("lahti", answer(LAHTI));
    answers.set("lah", answer(LAHTI, KONTIOLAHTI));
    renderBrowse();

    type("lahti");
    settle();
    type("lah");

    // Containment runs both ways: deleting a character is the same walk as
    // typing one, and the block a parent is reading must not blink out for it.
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
    ]);

    settle();
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
      row("Kontiolahti", "Pohjois-Karjala", false),
    ]);
  });

  it("keeps the block even when the local arm has emptied under it", () => {
    answers.set("lahti", answer(LAHTI));
    renderBrowse();

    type("lahti");
    settle();
    // "lahtis" matches no club-bearing slug, so the local arm goes to nothing
    // and the held block is the only thing in the results area. It is still the
    // right thing to show: a related answer is on its way to replace it.
    type("lahtis");

    expect(rows()).toEqual([row("Lahti", "Päijät-Häme", false)]);
    expect(noMatchesCard()).toBeNull();
  });

  it("drops the block at once when the query is rewritten into something unrelated", () => {
    answers.set("lahti", answer(LAHTI));
    renderBrowse();

    type("lahti");
    settle();
    expect(rows()).toHaveLength(2);

    // A paste, not a keystroke. Nothing on screen may claim to answer it, and
    // the empty state stays withheld because a real answer is still coming.
    type("turku");
    expect(rows()).toEqual([]);
    expect(noMatchesCard()).toBeNull();
  });

  it("drops the block when the fallback for the new query fails", () => {
    answers.set("lahti", answer(LAHTI));
    answers.set("lahtis", "failed");
    renderBrowse();

    type("lahti");
    settle();
    type("lahtis");
    settle();

    // Nothing is coming to replace it any more, so holding it would make a dead
    // arm look like a live one. The ordinary empty state takes over.
    expect(rows()).toEqual([]);
    expect(noMatchesCard()).toBeTruthy();
  });

  it("still dedupes a held block against the local arm as that arm changes", () => {
    answers.set("vesilahti", answer(VESILAHTI_HIT, LAHTI));
    renderBrowse();

    type("vesilahti");
    settle();
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
    ]);

    // Backspacing to "vesilahti" minus a letter keeps the local Vesilahti row,
    // so the held hit for it must still be suppressed rather than doubling.
    type("vesilaht");
    expect(rows()).toEqual([
      row("Vesilahti", "Pirkanmaa", true),
      row("Lahti", "Päijät-Häme", false),
    ]);
  });
});

describe("SchoolsBrowse — when the empty state may appear", () => {
  it("shows it immediately for a one-character query, which asks the index nothing", () => {
    renderBrowse();
    type("q");

    expect(noMatchesCard()).toBeTruthy();
    expect(lastCall().needle).toBe("");
  });

  it("withholds it while the fallback for the current input is still coming", () => {
    renderBrowse();
    type("xyzq");

    // Mid-debounce: nothing has been asked yet, and the card must not flash.
    expect(noMatchesCard()).toBeNull();
    expect(rows()).toEqual([]);
    expect(lastCall().needle).toBe("");

    settle();
    expect(lastCall().needle).toBe("xyzq");
    expect(noMatchesCard()).toBeNull();
  });

  it("shows it once the fallback resolves with nothing", () => {
    const view = renderBrowse();
    type("xyzq");
    settle();
    expect(noMatchesCard()).toBeNull();

    fallback = answer();
    view.rerender(browse());

    expect(noMatchesCard()).toBeTruthy();
  });

  it("shows it when the fallback fails — a failure is never an error state", () => {
    fallback = "failed";
    renderBrowse();
    type("xyzq");
    settle();

    expect(noMatchesCard()).toBeTruthy();
  });

  it("leaves the local results standing when the fallback fails", () => {
    fallback = "failed";
    renderBrowse();
    type("lahti");
    settle();

    expect(rows()).toEqual([row("Vesilahti", "Pirkanmaa", true)]);
    expect(noMatchesCard()).toBeNull();
  });
});

function renderBrowse() {
  return render(browse());
}
