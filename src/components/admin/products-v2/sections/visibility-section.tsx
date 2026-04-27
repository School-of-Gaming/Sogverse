"use client";

import { useTranslations } from "next-intl";
import { FormSection } from "../form-primitives";
import type { FormState } from "../product-v2-form-state";

interface VisibilitySectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}

export function VisibilitySection({
  state,
  setState,
}: VisibilitySectionProps) {
  const t = useTranslations("admin.productsV2");

  return (
    <FormSection
      title={t("sections.visibility")}
      description={t("sections.visibilityDescription")}
    >
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input p-3">
        <input
          type="checkbox"
          checked={state.isVisible}
          onChange={(e) =>
            setState({ ...state, isVisible: e.target.checked })
          }
          className="mt-0.5 h-4 w-4"
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
