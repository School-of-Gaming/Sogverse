"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Field, FormSection, InfoCallout } from "../form-primitives";
import { LocationPicker } from "../location-picker";
import {
  locationPickerMode,
  type FormState,
} from "../product-form-state";
import type { ProductTypeConfig } from "../product-type-config";

interface WhereSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
}

export function WhereSection({ state, setState, config }: WhereSectionProps) {
  const t = useTranslations("admin.products");

  const pickerMode = locationPickerMode(config, state.isRemote);
  const showLocationPicker = pickerMode !== null;

  return (
    <FormSection
      title={t("sections.where")}
      description={t(`sections.whereDescription.${config.i18nKey}`)}
    >
      {config.allowsRemote && config.allowsInPerson ? (
        <div className="inline-flex rounded-md border border-input p-1">
          <button
            type="button"
            onClick={() => setState({ ...state, isRemote: true })}
            className={cn(
              "rounded px-4 py-1.5 text-sm transition-colors",
              state.isRemote
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("labels.online")}
          </button>
          <button
            type="button"
            onClick={() => setState({ ...state, isRemote: false })}
            className={cn(
              "rounded px-4 py-1.5 text-sm transition-colors",
              !state.isRemote
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("labels.inPerson")}
          </button>
        </div>
      ) : null}

      <div className="mt-3 space-y-4">
        {showLocationPicker ? (
          <Field
            label={
              state.isRemote ? t("labels.municipality") : t("labels.site")
            }
            required
            hint={
              state.isRemote
                ? t("hints.municipalityHint")
                : t("hints.siteHint")
            }
          >
            <LocationPicker
              value={state.locationId}
              onChange={(id) => setState({ ...state, locationId: id })}
              pickable={pickerMode}
            />
          </Field>
        ) : (
          <InfoCallout text={t("hints.onlineNoLocation")} />
        )}

        {state.isRemote && <InfoCallout text={t("hints.voiceRoomAuto")} />}
      </div>
    </FormSection>
  );
}
