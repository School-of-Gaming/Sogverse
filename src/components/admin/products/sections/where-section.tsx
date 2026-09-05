"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Field } from "@/components/ui/field";
import { FormSection, InfoCallout } from "../form-primitives";
import { ChosenSitePanel, LocationPicker } from "../location-picker";
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
        <div className="inline-flex rounded-md border border-border p-1">
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
          <>
            <Field
              label={
                state.isRemote ? t("labels.municipality") : t("labels.site")
              }
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
                countryCode={config.countryBound ?? undefined}
              />
            </Field>

            {/* The building itself, editable here rather than only on its own
                page: an admin who has just named one has everything they know
                about it in front of them, and every field in the panel belongs
                to the *site* — shared by every product running there — so it
                saves on its own routes the moment its Save is pressed and never
                joins this form's submit. It is a sibling of the field above and
                not a child of it, so the field's hint stays against the control
                it describes. */}
            {pickerMode === "site" && (
              <ChosenSitePanel
                value={state.locationId}
                countryCode={config.countryBound ?? undefined}
              />
            )}
          </>
        ) : (
          <InfoCallout text={t("hints.onlineNoLocation")} />
        )}

        {state.isRemote && <InfoCallout text={t("hints.voiceRoomAuto")} />}
      </div>
    </FormSection>
  );
}
