"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { TagGlyph } from "@/components/public/products/product-chips";
import {
  PRODUCT_TAG_VALUES,
  productTagLabelKey,
} from "@/components/public/products/product-tag";
import type { ProductTag } from "@/types";
import { FormSection } from "../form-primitives";
import type { FormState } from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";
import { RegionLockRadios } from "./region-lock-radios";
import { SpokenLanguageRadios } from "./spoken-language-radios";

// The design-tag choices, in the order the admin reads them: "no tag" first
// because it is the default and by far the commonest answer, then the tag
// values.
//
// The values come from the tag module's ordered list — the same list the shop's
// filter chips enumerate — so the admin sets a tag from the vocabulary a parent
// filters by, in that order. That list is itself derived from codegen, so a
// fourth tag added by migration appears in both places the moment types are
// regenerated, and its missing label key fails the build in the tag module.
const TAG_OPTIONS: readonly (ProductTag | null)[] = [
  null,
  ...PRODUCT_TAG_VALUES,
];

interface AudienceSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
}

export function AudienceSection({
  state,
  setState,
  config,
}: AudienceSectionProps) {
  const t = useTranslations("admin.products");
  // The family-facing tag words, so the admin picks from the same vocabulary the
  // parent will read on the card. Resolved through the tag module's key map, not
  // by spelling the message key from the enum value.
  const tTag = useTranslations("productTag");

  // The two audience flags as one list, so the pair renders from a single card
  // body and the "at least one" rule is counted once instead of mirrored per
  // box. Each entry carries its own writer rather than a computed state key,
  // which keeps the update typed against FormState with no cast.
  const audienceFlags = [
    {
      flag: "forGamers" as const,
      checked: state.forGamers,
      apply: (checked: boolean) => setState({ ...state, forGamers: checked }),
    },
    {
      flag: "forParents" as const,
      checked: state.forParents,
      apply: (checked: boolean) => setState({ ...state, forParents: checked }),
    },
  ];
  // A product with no audience is refused by a CHECK on `products`, so rather
  // than let the admin build a form the save would reject, the last remaining
  // tick simply cannot be released: the box goes disabled, and the rule doing it
  // ("pick at least one") is the field's own hint, sitting right under the pair.
  // A disabled control whose reason is written beside it beats a click that
  // silently does nothing, and beats an error that only turns up at submit.
  // validate() states the rule too, as the backstop for state assembled any
  // other way.
  const checkedCount = audienceFlags.filter((a) => a.checked).length;

  return (
    <FormSection
      title={t("sections.audience")}
      description={t("sections.audienceDescription")}
    >
      <Field label={t("labels.seatAudience")} hint={t("hints.seatAudienceHint")}>
        {/* Function children so the pair is a real group to assistive tech:
            the label names it and the hint (which carries the "pick at least
            one" rule) describes it — loose text under a pair of checkboxes is
            announced by nothing. The locked box stays aria-disabled rather
            than disabled so it keeps its place in the tab order and announces
            its state; a disabled input would vanish from keyboard traversal
            and take the pair down to one stop. */}
        {({ hintId, labelId }) => (
          <div
            role="group"
            aria-labelledby={labelId}
            aria-describedby={hintId}
            className="grid gap-3 sm:grid-cols-2"
          >
            {audienceFlags.map(({ flag, checked, apply }) => {
              const locked = checked && checkedCount === 1;
              return (
                <label
                  key={flag}
                  className={cn(
                    "flex items-start gap-3 rounded-md border border-border p-3 transition-colors",
                    checked && "bg-primary/5",
                    locked ? "cursor-default" : "cursor-pointer"
                  )}
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    aria-disabled={locked}
                    onChange={(e) => {
                      if (!locked) apply(e.target.checked);
                    }}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium">{t(`labels.${flag}`)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(`hints.${flag}Hint`)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </Field>

      {/* Ages describe the children a product serves, so they are collected
          only while it serves any. Unticking For gamers takes the fields away
          without emptying them — the payload builder derives null from the flag
          — so re-ticking within the same session hands back what was typed.
          Nothing above these fields moves when they appear or disappear, and
          the change is the direct result of the click that caused it. */}
      {state.forGamers && (
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("labels.minAge")} htmlFor="p-min-age">
            <Input
              id="p-min-age"
              type="number"
              min={0}
              value={state.minAge}
              onChange={(e) => setState({ ...state, minAge: e.target.value })}
              required
            />
          </Field>
          <Field label={t("labels.maxAge")} htmlFor="p-max-age">
            <Input
              id="p-max-age"
              type="number"
              min={0}
              value={state.maxAge}
              onChange={(e) => setState({ ...state, maxAge: e.target.value })}
              required
            />
          </Field>
        </div>
      )}

      {/* Region lock — the geographic half of "who may hold a seat", so it sits
          with the audience pair rather than in "Where": that section says where
          the product RUNS, and a fully remote club is as lockable as an
          in-person one. Rendered only for types whose config allows it, which
          excludes municipality clubs — their country is already settled by the
          separate `countryBound` mechanism, and offering both would be two
          controls for one fact. The flag is fixed for the whole life of a form,
          so nothing appears or disappears under the admin's cursor.

          It takes no part in the form locks: a lock is editable on a running
          product, because it gates future enrolments and is never re-run
          against a seat somebody already holds. And it is enforced by the shop
          UI alone — a family's location is self-attested — which the hint says
          out loud, because an admin who thinks this is a hard gate would be
          wrong about the one thing that matters. */}
      {config.regionLockable && (
        <Field
          label={t("labels.regionLock")}
          optional
          hint={t("hints.regionLockHint")}
        >
          {/* `optional` because it genuinely is — NULL is the default and by
              far the commonest state. The form's convention marks the
              exceptions rather than the norm, so the marker belongs on the
              label and the hint no longer opens by saying "Optional.": the
              hint's job is the self-attested/soft-block caveat, which is the
              one thing an admin must not miss here.

              Function children so the card grid is a real group: the label
              names it and the hint describes it. Neither is announced as loose
              text beside a bare grid. */}
          {({ hintId, labelId }) => (
            <RegionLockRadios
              value={state.regionLockCountry}
              onChange={(code) =>
                setState({ ...state, regionLockCountry: code })
              }
              labelId={labelId}
              hintId={hintId}
            />
          )}
        </Field>
      )}

      {/* Sits with the audience pair because it answers the neighbouring half of
          the same question — the flags above say who may hold a seat, this says
          who the sessions were built for — and above the spoken language, which
          is a property of how the product runs rather than of who it is for.
          It takes
          no part in the form locks: a tag is freely editable for the product's
          whole life, on a running club as much as a pending one. */}
      <Field label={t("labels.tag")} hint={t("hints.tagHint")}>
        {/* Function children for the same reason the pair above uses them: a
            radio group needs the label to name it and the hint to describe it,
            and neither is announced as loose text. The options are a wrapping
            row of intrinsic-width chips — a near neighbour of the language
            pills below — rather than a column grid sized to today's count: the
            enum
            is expected to grow, and a wrap adds rows where fixed columns would
            squeeze. Each tag option wears the glyph from the shared chip
            vocabulary, so the admin picks from the same icon-and-word pairing
            the parent will meet on the card; "no tag" alone has no glyph,
            because it is the absence being chosen. */}
        {({ hintId, labelId }) => (
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            aria-describedby={hintId}
            className="flex flex-wrap gap-2"
          >
            {TAG_OPTIONS.map((option) => {
              const selected = state.tag === option;
              return (
                <label
                  key={option ?? "none"}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors",
                    selected && "bg-primary/5"
                  )}
                >
                  <input
                    type="radio"
                    name="productTag"
                    className="h-4 w-4"
                    checked={selected}
                    onChange={() => setState({ ...state, tag: option })}
                  />
                  {option !== null && (
                    <TagGlyph
                      tag={option}
                      className={cn(
                        "h-4 w-4 shrink-0",
                        selected ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                  )}
                  <span className="font-medium">
                    {option === null
                      ? t("tagOptions.none")
                      : tTag(productTagLabelKey(option))}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </Field>

      {/* The reference set is a bounded, near-instant read (category 2 of the
          loading rules), so the field renders at once with its final chrome —
          label, hint, and a pill row holding its one-row height — instead of
          the whole Field popping in on the query's schedule and shoving the
          sections below it down.

          The label is "Spoken language" rather than "Delivered in": the field
          is the `spoken_language_code` column, and the house split between
          *locale* and *spoken language* is what the label should say out loud.
          The hint names neither a product type nor an audience — this section
          renders for clubs, camps and events alike, and for parent-only
          products, which have no gamers to speak anything. It says "main"
          because the column is one code while a session may mix languages. */}
      <Field
        label={t("labels.spokenLanguage")}
        hint={t("hints.spokenLanguageHint")}
      >
        {({ hintId, labelId }) => (
          <SpokenLanguageRadios
            value={state.spokenLanguageCode}
            onChange={(code) =>
              setState({ ...state, spokenLanguageCode: code })
            }
            labelId={labelId}
            hintId={hintId}
          />
        )}
      </Field>
    </FormSection>
  );
}
