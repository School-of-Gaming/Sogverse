"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSpokenLanguages } from "@/services/users";
import { Field, FormSection } from "../form-primitives";
import type { FormState } from "../product-v2-form-state";

interface AudienceSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}

export function AudienceSection({ state, setState }: AudienceSectionProps) {
  const t = useTranslations("admin.productsV2");
  const { data: spokenLanguages } = useSpokenLanguages();

  return (
    <FormSection
      title={t("sections.audience")}
      description={t("sections.audienceDescription")}
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label={t("labels.minAge")} htmlFor="p-min-age" required>
          <Input
            id="p-min-age"
            type="number"
            min={0}
            value={state.minAge}
            onChange={(e) => setState({ ...state, minAge: e.target.value })}
            required
          />
        </Field>
        <Field label={t("labels.maxAge")} htmlFor="p-max-age" required>
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

      {spokenLanguages && (
        <Field
          label={t("labels.deliveredIn")}
          hint={t("hints.deliveredInHint")}
        >
          <div className="flex flex-wrap gap-2">
            {spokenLanguages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() =>
                  setState({ ...state, spokenLanguageCode: lang.code })
                }
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  state.spokenLanguageCode === lang.code
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground hover:border-foreground hover:text-foreground"
                )}
              >
                {lang.name}
              </button>
            ))}
          </div>
        </Field>
      )}
    </FormSection>
  );
}
