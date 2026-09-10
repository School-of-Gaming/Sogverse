"use client";

import { Globe, MapPin } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LanguageFlag } from "@/components/ui/language-flag";
import { PRODUCT_AGE_BANDS } from "@/lib/constants/gamer-age";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";
import { useLanguageNames } from "@/hooks/use-language-names";
import { formatWeekday } from "@/lib/products/format-product-schedule";
import { TOPIC_FILTER_CHIPS } from "@/lib/products/topics";
import { useTopicLabel } from "@/lib/products/use-topic-label";
import { TagGlyph } from "./product-chips";
import { PRODUCT_TAG_VALUES, productTagLabelKey } from "./product-tag";
import { useBrowseFilters } from "./use-browse-filters";
import { useShopCategories } from "./use-shop-categories";

// What the browse filters *are*, as data: nine rows of chips, each chip
// knowing its own word, whether it is lit, and how to toggle itself.
//
// It is a module of its own because two surfaces read the same list and must
// never disagree about it. The filter card renders every row; the trigger bar
// below `lg` renders only the lit chips, as a summary of what is narrowing the
// grid. Had the summary enumerated the vocabularies a second time it would
// have been nine label lookups free to drift from the nine above them — a chip
// that says one word in the sheet and another in the summary is the same
// control described twice.
//
// Nothing here is presentational beyond a chip's own glyph and the widths a
// row asks for: where the rows sit, and how they are drawn, belongs to
// whatever renders them.

export interface BrowseFilterChip {
  /** Unique within its row. */
  key: string;
  /** The chip's word as plain text — what assistive tech is given, and what a
   *  chip with no richer rendering shows. */
  text: string;
  /** A richer rendering of the same word, where a row has one: the weekday
   *  chips change form with the viewport, which no string can express. */
  label?: React.ReactNode;
  /** The glyph a chip's own vocabulary carries. Rows whose words stand alone
   *  have none, and inventing one for them is how a glyph stops meaning
   *  anything. */
  icon?: React.ReactNode;
  /** Sizing this chip asks for inside a row — a fixed column, centred digits.
   *  Never colour or state: those belong to whatever draws the chip. */
  className?: string;
  active: boolean;
  toggle: () => void;
}

export interface BrowseFilterRow {
  id: string;
  label: string;
  chips: BrowseFilterChip[];
}

// Weekdays for the "Days" row, in fixed Mon→Sun order (0=Mon..6=Sun, matching
// `schedule_slots.weekday`). Hardcoded Monday-first: this is a filter, not a
// calendar, so the locale's first-day-of-week convention doesn't matter here.
// The per-chip labels are still localised via `formatWeekday`.
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * The rows, in the order a reader meets them.
 *
 * @param showTypeFilter Lead with the Clubs|Camps|Events Type row — and, by
 * owner decision, with the Audience row that shares its guard. The shop shows
 * both; the per-municipality page hides them, because there both have one
 * answer (everything is that school's own gamers-only club) and a filter with
 * one answer controls nothing. The Designed-for row deliberately does NOT
 * share this guard — a tag is orthogonal to what makes those two vacuous, and
 * one school can offer a beginner club beside a neuroinclusive one.
 */
export function useBrowseFilterRows(showTypeFilter: boolean): BrowseFilterRow[] {
  const t = useTranslations("productBrowse.filters");
  // The audience chips share their labels with the card badge and the overview
  // card's audience row — one vocabulary for the whole concept.
  const tAudience = useTranslations("productAudience");
  // Likewise the design tags: the chips wear the same words the cards' own tag
  // chips do, resolved through the tag module's key map rather than spelled
  // from the enum value.
  const tTag = useTranslations("productTag");
  const locale = useLocale();
  const topicLabel = useTopicLabel();
  // The Language row's vocabulary is the `spoken_language` enum — a constant, so
  // the row is complete in the first frame with nothing to await. It used to be
  // a query, and the row was rendered only once that query had answered: a
  // failed prefetch hid it and a later refetch put it back, moving every row
  // below on data's own schedule.
  const languageName = useLanguageNames();
  // Product category (Clubs | Camps | Events) leads the filter card as the
  // "Type" row. Unlike the other filters it lives in its own URL param
  // (useShopCategories) and drives which sections render rather than which
  // cards survive a predicate — but it is still an ordinary filter to the
  // reader, so "Clear all" resets it too (the delete rides along inside
  // `clear`'s single write).
  const { categories, toggleCategory } = useShopCategories();
  const {
    topics: selectedTopics,
    format: selectedFormat,
    price: selectedPrice,
    languages: selectedLanguages,
    audiences: selectedAudiences,
    tags: selectedTags,
    age: selectedAge,
    days: selectedDays,
    toggleTopics,
    toggleFormat,
    togglePrice,
    toggleLanguage,
    toggleAudience,
    toggleTag,
    setAge,
    toggleDay,
  } = useBrowseFilters();

  const rows: BrowseFilterRow[] = [];

  if (showTypeFilter) {
    // Type is an inclusive filter, not a choice: selecting nothing shows every
    // category, selecting chips narrows to them, and toggling the last one off
    // returns to everything.
    rows.push({
      id: "type",
      label: t("type"),
      chips: [
        {
          key: "clubs",
          text: t("typeClubs"),
          active: categories.includes("clubs"),
          toggle: () => toggleCategory("clubs"),
        },
        {
          key: "camps",
          text: t("typeCamps"),
          active: categories.includes("camps"),
          toggle: () => toggleCategory("camps"),
        },
        {
          key: "events",
          text: t("typeEvents"),
          active: categories.includes("events"),
          toggle: () => toggleCategory("events"),
        },
      ],
    });

    // Audience sits directly under Type because it is the same coarse cut:
    // both answer "which shelf am I looking at" before anything about the
    // product itself — and it shares Type's guard by owner decision, for the
    // reason given on `showTypeFilter` above. Two chips, not three: a chip is
    // the badge its cards wear, so each one matches exactly the products
    // bearing that tag, and gamers-only — the assumed default, badged with
    // nothing — is what the row has no chip for. Multi-select with OR
    // semantics like Subject and Language, but lighting both is still narrower
    // than lighting none: it is every badged product, and the unbadged
    // majority answers only to an empty row. The labels are the card's own
    // audience words, reused rather than re-authored so a chip and the card it
    // surfaces say the same thing. The row ships before any for-parents
    // product exists; a chip with an empty result set for a few days is
    // accepted (see the plan).
    rows.push({
      id: "audience",
      label: t("audience"),
      chips: [
        {
          key: "parents",
          text: tAudience("parents"),
          active: selectedAudiences.includes("parents"),
          toggle: () => toggleAudience("parents"),
        },
        {
          key: "families",
          text: tAudience("families"),
          active: selectedAudiences.includes("families"),
          toggle: () => toggleAudience("families"),
        },
      ],
    });
  }

  // "Designed for" follows Audience because it is the other half of the same
  // question — the row above says who may hold a seat, this says who the
  // sessions were built for. Unlike Audience it renders on the municipality
  // pages too (owner decision, 2026-08-12): Type and Audience hide there
  // because everything on a school page is that school's own gamers-only club
  // and both rows would have one answer, but a tag is orthogonal to that
  // structure — one school can offer a beginner club beside a neuroinclusive
  // one, and "which of my school's clubs fits my child" is that page's whole
  // question. On the municipality pages this row therefore leads.
  //
  // A chip is the chip the card wears, so each matches exactly the products
  // carrying that tag: OR across the lit chips, and untagged products — the
  // ordinary state, wearing nothing — answer only an empty row. Lighting all
  // three is therefore narrower than lighting none, exactly as on the Audience
  // row above.
  //
  // The chips carry the glyphs, unlike Audience and like Format: the tag
  // vocabulary is icon-and-word everywhere it is met — on the card, on the
  // detail hero, in the admin picker that set it — so a parent who taps the
  // sprout here recognises the sprout on the cards it leaves standing. The
  // glyph comes from the shared chip module, so a chip cannot pair a tag with
  // the wrong icon.
  //
  // The values are enumerated from the tag module's ordered list, so the row
  // and the admin picker offer the same vocabulary in the same order and a tag
  // added by migration appears in both without an edit here.
  rows.push({
    id: "designedFor",
    label: t("designedFor"),
    chips: PRODUCT_TAG_VALUES.map((tag) => ({
      key: tag,
      text: tTag(productTagLabelKey(tag)),
      icon: <TagGlyph tag={tag} className="h-3 w-3" />,
      active: selectedTags.includes(tag),
      toggle: () => toggleTag(tag),
    })),
  });

  rows.push({
    id: "subject",
    label: t("subject"),
    chips: TOPIC_FILTER_CHIPS.map((chip) => ({
      key: chip.key,
      // A multi-topic group (Minecraft) carries a literal brand label; a
      // single-topic chip resolves its label from the topic.
      text: chip.label ?? topicLabel(chip.topics[0]),
      // `some`, not `every`: a URL carrying a lone edition (an old shared
      // link, or a hand-edited param) still filters the grid, and a chip that
      // stays dark while its filter is on is a control lying about the
      // results. Toggling a partially-selected group completes it; toggling a
      // full group clears it.
      active: chip.topics.some((tp) => selectedTopics.includes(tp)),
      toggle: () => toggleTopics(chip.topics),
    })),
  });

  rows.push({
    id: "format",
    label: t("format"),
    chips: [
      {
        key: "online",
        text: t("formatOnline"),
        icon: <Globe className="h-3 w-3" aria-hidden />,
        active: selectedFormat === "online",
        toggle: () => toggleFormat("online"),
      },
      {
        key: "in_person",
        text: t("formatInPerson"),
        icon: <MapPin className="h-3 w-3" aria-hidden />,
        active: selectedFormat === "in_person",
        toggle: () => toggleFormat("in_person"),
      },
    ],
  });

  // Price sits directly after Format because the two are read together: a
  // family narrowing to what they can reach is asking where a club is and what
  // it costs in the same breath, and both rows answer with one chip or none.
  // Single-valued like Format — tapping the lit chip clears the row back to
  // any price.
  //
  // **Neither chip means unpriced, not free.** Some products state no price at
  // all: a school's club, invoiced to the municipality, whose card shows how
  // full it is where every other card shows what it costs. Those answer
  // neither chip and are reachable only with the row cleared — the same shape
  // the Audience and Designed-for rows have, where the unbadged majority
  // belongs to no chip. Calling such a club free would be the worse lie: what
  // it costs a family is decided by their municipality, not by us.
  //
  // No glyph: a currency symbol would be the only one on this surface, and it
  // would have to pick a currency to be, which is a choice the chip is not
  // making. The two words carry themselves.
  rows.push({
    id: "price",
    label: t("price"),
    chips: [
      {
        key: "free",
        text: t("priceFree"),
        active: selectedPrice === "free",
        toggle: () => togglePrice("free"),
      },
      {
        key: "paid",
        text: t("pricePaid"),
        active: selectedPrice === "paid",
        toggle: () => togglePrice("paid"),
      },
    ],
  });

  rows.push({
    id: "language",
    label: t("language"),
    chips: SPOKEN_LANGUAGES.map((code) => {
      const name = languageName(code);
      return {
        key: code,
        // The name is what assistive tech and the summary announce; the chip
        // itself wears the code beside its flag, because a row of full
        // language names does not fit a rail.
        text: name,
        label: code.toUpperCase(),
        icon: <LanguageFlag code={code} showCode={false} title={name} />,
        active: selectedLanguages.includes(code),
        toggle: () => toggleLanguage(code),
      };
    }),
  });

  // Age is single-valued — like the Format row, tapping the active chip clears
  // it back to "any age". The chips are the coarse age bands from
  // @/lib/constants/gamer-age (PRODUCT_AGE_BANDS); a band matches any product
  // whose age range overlaps it.
  rows.push({
    id: "age",
    label: t("age"),
    chips: PRODUCT_AGE_BANDS.map((band) => {
      const active =
        selectedAge?.min === band.min && selectedAge.max === band.max;
      return {
        key: `${band.min}-${band.max}`,
        text: `${band.min}–${band.max}`,
        // Centered tabular digits so the band labels line up evenly.
        className: "justify-center tabular-nums",
        active,
        toggle: () => setAge(active ? null : band),
      };
    }),
  });

  // Days matches any product whose schedule touches a selected weekday — a
  // club's recurring slot, a camp's day, an event's date all carry one. Chip
  // labels are responsive: the short weekday where the row is narrow, the full
  // name once there is width for it, and the short form again inside the rail,
  // where a Finnish "keskiviikko" would blow the column open. Both come from
  // Intl via `formatWeekday`, and the full name is what a screen reader is
  // given either way.
  rows.push({
    id: "days",
    label: t("days"),
    chips: WEEKDAYS.map((w) => ({
      key: String(w),
      text: formatWeekday(w, locale, "long"),
      label: (
        <>
          <span className="sm:hidden lg:inline">
            {formatWeekday(w, locale, "short")}
          </span>
          <span className="hidden sm:inline lg:hidden">
            {formatWeekday(w, locale, "long")}
          </span>
        </>
      ),
      // Fixed, centered width so all seven chips line up like the Age row. One
      // width per label form: ~3-char short, or the full weekday name. 5.5rem
      // fits the en/sv full names; the longest fi name slightly exceeds it and
      // that one chip grows past the floor.
      className: "min-w-[2.75rem] justify-center sm:min-w-[5.5rem] lg:min-w-[2.75rem]",
      active: selectedDays.includes(w),
      toggle: () => toggleDay(w),
    })),
  });

  return rows;
}
