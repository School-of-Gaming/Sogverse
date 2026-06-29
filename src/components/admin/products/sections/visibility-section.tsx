"use client";

import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSection } from "../form-primitives";
import type { FormState } from "../product-form-state";

interface VisibilitySectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}

export function VisibilitySection({
  state,
  setState,
}: VisibilitySectionProps) {
  const t = useTranslations("admin.products");

  return (
    <FormSection
      title={t("sections.visibility")}
      description={t("sections.visibilityDescription")}
    >
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input p-3">
        <Checkbox
          className="mt-0.5"
          checked={state.isVisible}
          onChange={(e) =>
            setState({ ...state, isVisible: e.target.checked })
          }
        />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">{t("labels.makeVisible")}</div>
          <div className="text-xs text-muted-foreground">
            {t("hints.visibleHint")}
          </div>
        </div>
      </label>
    </FormSection>
  );
}
