"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveLocale } from "@/lib/constants/locales";
import { useCreateProductV2 } from "@/services/products-v2";
import { AudienceSection } from "./sections/audience-section";
import { BillingSection } from "./sections/billing-section";
import { GroupsSection } from "./sections/groups-section";
import { IdentitySection } from "./sections/identity-section";
import { RegistrationSection } from "./sections/registration-section";
import { VisibilitySection } from "./sections/visibility-section";
import { WhenSection } from "./sections/when-section";
import { WhereSection } from "./sections/where-section";
import { buildCreateInput, validate } from "./product-v2-build";
import { initialState, type FormState } from "./product-v2-form-state";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { ProductTypeV2 } from "@/types";

interface ProductV2FormProps {
  productType: ProductTypeV2;
}

export function ProductV2Form({ productType }: ProductV2FormProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const router = useRouter();
  const t = useTranslations("admin.productsV2");
  const c = useTranslations("common");
  const rawLocale = useLocale();
  const uiLocale = resolveLocale(rawLocale);
  const label = t(`types.${config.i18nKey}.label`);

  const [state, setState] = useState<FormState>(() =>
    initialState(config, uiLocale),
  );
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);

  const createProduct = useCreateProductV2();

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

    const input = buildCreateInput(state, productType, config);
    setCommitting(true);

    try {
      await createProduct.mutateAsync(input);
      router.push(`/admin/${config.routeSlug}`);
    } catch (err) {
      setCommitting(false);
      setError(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  }

  // ===== Render =====

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <IdentitySection
        state={state}
        setState={setState}
        config={config}
        uiLocale={uiLocale}
        setError={setError}
      />
      <AudienceSection state={state} setState={setState} />
      <WhereSection state={state} setState={setState} config={config} />
      <WhenSection state={state} setState={setState} config={config} />
      <GroupsSection state={state} setState={setState} />
      <BillingSection state={state} setState={setState} config={config} />
      <RegistrationSection state={state} setState={setState} />
      <VisibilitySection state={state} setState={setState} />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/admin/${config.routeSlug}`)}
        >
          {c("cancel")}
        </Button>
        <Button type="submit" size="lg" disabled={committing}>
          {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {t("actions.createLabel", { label: label.toLowerCase() })}
        </Button>
      </div>
    </form>
  );
}
