import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { AudienceSection } from "@/components/admin/products/sections/audience-section";
import {
  initialState,
  type FormState,
} from "@/components/admin/products/product-form-state";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import type { SpokenLanguage } from "@/types";

/**
 * **The Audience section's two one-of-many controls, as a reader of the form
 * meets them.**
 *
 * Region lock and spoken language are a deliberately mismatched pair — cards
 * against pills, a 28px flag against an 18px chip — and both are native radio
 * groups rather than a styled toggle, so the thing worth pinning is what the
 * native semantics actually say: which radio comes up `checked` for a given
 * form state, what the writer is handed when one is picked, and whether the
 * browser will refuse a submit with none picked.
 *
 * Those are the three claims a visual review cannot make. A card can look
 * selected because its border is tinted while its radio is unchecked, and an
 * unanswered required field is invisible until the moment somebody tries to
 * save.
 *
 * Rendered through the real `AudienceSection`, not the two radio components on
 * their own: the section is what decides a lock is `optional` and what threads
 * `regionLockCountry` / `spokenLanguageCode` out of one `FormState` and back
 * into it, and a test of the leaves would have missed a section that wired them
 * to the wrong field.
 *
 * Translations echo their keys, so nothing here depends on English wording —
 * but the country names do not: they come from `Intl` through the same
 * display-name helper the shop uses, which is why the cards are found by their
 * resolved names.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

/**
 * The reference set the pill row renders from, injected rather than fetched.
 *
 * A shape-accurate slice of `spoken_languages`: the `name` column is the
 * table's single English label, which the display-name hook uses only as a
 * fallback, so these are the rows a real read would hand back.
 */
const LANGUAGES: SpokenLanguage[] = [
  { code: "fi", name: "Finnish" },
  { code: "sv", name: "Swedish" },
  { code: "en", name: "English" },
];

vi.mock("@/services/users", () => ({
  useSpokenLanguages: () => ({ data: LANGUAGES }),
}));

/** A consumer club: the section's fullest form — `regionLockable` is true. */
const CONFIG = PRODUCT_TYPE_CONFIG.consumer_club;

function renderSection(overrides: Partial<FormState> = {}) {
  const setState = vi.fn();
  const state: FormState = { ...initialState(CONFIG, "en"), ...overrides };
  const { container } = render(
    <AudienceSection state={state} setState={setState} config={CONFIG} />,
  );
  return { container, setState, state };
}

/** The radios of one group, in document order. */
const radios = (container: HTMLElement, name: string) => [
  ...container.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${name}"]`,
  ),
];

/** The card/pill a radio sits inside — the thing an admin actually clicks. */
const cardOf = (radio: HTMLInputElement) => radio.closest("label")!;

/** The one radio of a group that is checked, or `undefined` when none is. */
const checkedIn = (container: HTMLElement, name: string) =>
  radios(container, name).find((r) => r.checked);

describe("the region-lock cards", () => {
  it("checks 'not region locked' when nothing is locked", () => {
    // NULL is the default and by far the commonest state, so the absence has to
    // be a *chosen* option rather than the group simply having no answer — an
    // unchecked group would make the ordinary case look unanswered.
    const { container } = renderSection({ regionLockCountry: null });
    const cards = radios(container, "regionLock");
    // Every seeded country, plus the "no lock" card leading the grid.
    expect(cards).toHaveLength(5);
    expect(cards[0].checked).toBe(true);
    expect(cardOf(cards[0]).textContent).toContain("regionLock.none");
    expect(cards.filter((r) => r.checked)).toHaveLength(1);
  });

  it("checks the locked country's own card", () => {
    const { container } = renderSection({ regionLockCountry: "SE" });
    const checked = checkedIn(container, "regionLock");
    expect(cardOf(checked!).textContent).toContain("Sweden");
    // And the default card is no longer the answer.
    expect(radios(container, "regionLock")[0].checked).toBe(false);
  });

  it("hands the writer the country code when a country is picked", () => {
    const { container, setState } = renderSection({ regionLockCountry: null });
    const finland = radios(container, "regionLock").find((r) =>
      cardOf(r).textContent.includes("Finland"),
    );
    fireEvent.click(finland!);
    expect(setState).toHaveBeenCalledTimes(1);
    expect(setState.mock.calls[0][0]).toMatchObject({
      regionLockCountry: "FI",
    });
  });

  it("hands the writer null when the lock is cleared", () => {
    // The distinction the column depends on: clearing a lock is NULL, not the
    // empty string a text input would have produced.
    const { container, setState } = renderSection({ regionLockCountry: "FI" });
    fireEvent.click(radios(container, "regionLock")[0]);
    expect(setState).toHaveBeenCalledTimes(1);
    expect(setState.mock.calls[0][0]).toMatchObject({
      regionLockCountry: null,
    });
  });

  it("carries no `required`, because the field is genuinely optional", () => {
    // The counterpart of the language row below, and the reason the label wears
    // the form's "(optional)" marker: unlocked is a legal, ordinary answer, so
    // the browser must not refuse a save that leaves the default in place.
    const { container } = renderSection();
    for (const radio of radios(container, "regionLock")) {
      expect(radio.required).toBe(false);
    }
  });

  it("leaves the section's other fields alone when the lock changes", () => {
    // The section threads several fields out of one FormState; a writer that
    // reached for the wrong one would still light up the card it was told to.
    const { container, setState, state } = renderSection({
      regionLockCountry: null,
      spokenLanguageCode: "fi",
    });
    fireEvent.click(radios(container, "regionLock")[1]);
    expect(setState.mock.calls[0][0]).toMatchObject({
      spokenLanguageCode: "fi",
      forGamers: state.forGamers,
      tag: state.tag,
    });
  });
});

describe("the spoken-language pills", () => {
  it("checks the stored language's own pill", () => {
    const { container } = renderSection({ spokenLanguageCode: "fi" });
    const pills = radios(container, "spokenLanguage");
    expect(pills).toHaveLength(LANGUAGES.length);
    const checked = checkedIn(container, "spokenLanguage");
    expect(cardOf(checked!).textContent).toContain("Finnish");
    expect(pills.filter((r) => r.checked)).toHaveLength(1);
  });

  it("leaves a new product unanswered, and required", () => {
    // The form's convention is that fields are required by default and carry no
    // marker, so the obligation is stated by the native `required` alone. With
    // no pill checked and every radio required, the browser refuses the submit —
    // which is the entire mechanism, and it is invisible on screen.
    const { container } = renderSection({ spokenLanguageCode: "" });
    expect(checkedIn(container, "spokenLanguage")).toBeUndefined();
    for (const radio of radios(container, "spokenLanguage")) {
      expect(radio.required).toBe(true);
    }
  });

  it("hands the writer the language code when a pill is picked", () => {
    const { container, setState } = renderSection({ spokenLanguageCode: "" });
    const swedish = radios(container, "spokenLanguage").find((r) =>
      cardOf(r).textContent.includes("Swedish"),
    );
    fireEvent.click(swedish!);
    expect(setState).toHaveBeenCalledTimes(1);
    expect(setState.mock.calls[0][0]).toMatchObject({
      spokenLanguageCode: "sv",
    });
  });

  it("names each language once to a screen reader", () => {
    // The flag is decorative: its SVG <title> would otherwise announce the
    // language name a second time, immediately before the visible label saying
    // exactly the same thing.
    const { container } = renderSection({ spokenLanguageCode: "fi" });
    for (const radio of radios(container, "spokenLanguage")) {
      const card = cardOf(radio);
      expect(card.querySelectorAll("svg").length).toBeGreaterThan(0);
      for (const svg of card.querySelectorAll("svg")) {
        expect(svg.closest("[aria-hidden]")).not.toBeNull();
      }
    }
  });
});
