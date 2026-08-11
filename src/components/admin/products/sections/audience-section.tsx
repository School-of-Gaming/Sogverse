"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LanguageFlag } from "@/components/ui/language-flag";
import { cn } from "@/lib/utils";
import { useSpokenLanguages } from "@/services/users";
import { useLanguageNames } from "@/hooks/use-language-names";
import { Field } from "@/components/ui/field";
import { FormSection } from "../form-primitives";
import type { FormState } from "../product-form-state";

interface AudienceSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}

export function AudienceSection({ state, setState }: AudienceSectionProps) {
  const t = useTranslations("admin.products");
  const { data: spokenLanguages } = useSpokenLanguages();
  const languageName = useLanguageNames();

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
                    "flex items-start gap-3 rounded-md border p-3 transition-colors",
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-foreground/30",
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

      {/* The reference set is a bounded, near-instant read (category 2 of the
          loading rules), so the field renders at once with its final chrome —
          label, hint, and a chip row holding its one-row height — instead of
          the whole Field popping in on the query's schedule and shoving the
          sections below it down. */}
      <Field label={t("labels.deliveredIn")} hint={t("hints.deliveredInHint")}>
        <div className="flex min-h-9 flex-wrap gap-2">
          {(spokenLanguages ?? []).map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() =>
                  setState({ ...state, spokenLanguageCode: lang.code })
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors",
                  state.spokenLanguageCode === lang.code
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
              >
                <LanguageFlag
                  code={lang.code}
                  showCode={false}
                  title={languageName(lang.code, lang.name)}
                />
                {languageName(lang.code, lang.name)}
              </button>
            ))}
        </div>
      </Field>
    </FormSection>
  );
}
