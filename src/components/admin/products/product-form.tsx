"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveLocale } from "@/lib/constants/locales";
import { useLocale } from "next-intl";
import { AudienceSection } from "./sections/audience-section";
import { BillingSection } from "./sections/billing-section";
import { IdentitySection } from "./sections/identity-section";
import { RegistrationSection } from "./sections/registration-section";
import { VisibilitySection } from "./sections/visibility-section";
import { WhenSection } from "./sections/when-section";
import { WhereSection } from "./sections/where-section";
import { validate } from "./product-build";
import { type FormState } from "./product-form-state";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductFormShellProps {
  productType: ProductType;
  /** Pre-populated state. Create wrapper passes `initialState(...)`,
   *  edit wrapper passes `existingFormState(product, ...)`. */
  initialFormState: FormState;
  /** Submit-button label, e.g. "Create club" or "Save changes". */
  submitLabel: string;
  /** Called when the admin clicks Cancel. Wrapper navigates from here. */
  onCancel: () => void;
  /** Called after `validate()` passes. Wrapper builds the payload, fires
   *  the mutation, and navigates on success. Throws on error so the shell
   *  can render the message. The shell deliberately does NOT clear the
   *  committing flag on success — the wrapper's nav unmounts the page,
   *  closing the click→action gap (see CLAUDE.md "Loading & Disabled State"). */
  onSubmit: (state: FormState) => Promise<void>;
}

/**
 * Shared form shell for both create and edit. Owns local form state,
 * validation, error display, and the committing flag. The wrappers
 * (`ProductFormCreate`, `ProductFormEdit`) supply the initial state,
 * the submit pipeline (build + mutate + navigate), and the button label.
 */
export function ProductFormShell({
  productType,
  initialFormState,
  submitLabel,
  onCancel,
  onSubmit,
}: ProductFormShellProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const t = useTranslations("admin.products");
  const c = useTranslations("common");
  const rawLocale = useLocale();
  const uiLocale = resolveLocale(rawLocale);

  const [state, setState] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const failure = validate(state, config);
    if (failure) {
      setError(t(`errors.${failure.messageKey}`, failure.values));
      // Switch the pricing block to the failing currency tab so the admin
      // sees an empty/invalid field where the message says it is.
      if (failure.focusCurrency) {
        setState((prev) => ({
          ...prev,
          activeCurrency: failure.focusCurrency!,
        }));
      }
      return;
    }

    setCommitting(true);
    try {
      await onSubmit(state);
    } catch (err) {
      setCommitting(false);
      setError(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <IdentitySection
        state={state}
        setState={setState}
        config={config}
        uiLocale={uiLocale}
      />
      <AudienceSection state={state} setState={setState} />
      <WhereSection state={state} setState={setState} config={config} />
      <WhenSection state={state} setState={setState} config={config} />
      <BillingSection state={state} setState={setState} config={config} />
      <RegistrationSection state={state} setState={setState} />
      <VisibilitySection state={state} setState={setState} />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t pt-6">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {c("cancel")}
        </Button>
        <Button type="submit" size="lg" disabled={committing}>
          {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
