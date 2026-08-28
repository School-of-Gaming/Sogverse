"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSupportedCurrency } from "@/lib/constants";
import {
  isSupportedLocale,
  LOCALE_CONFIG,
  resolveLocale,
} from "@/lib/constants/locales";
import { formatCurrencyFromCents } from "@/lib/utils";
import { useLocale } from "next-intl";
import { useLanguageNames } from "@/hooks/use-language-names";
import { AudienceSection } from "./sections/audience-section";
import { BillingSection } from "./sections/billing-section";
import {
  ConsentsSection,
  MarketingConsentsSection,
} from "./sections/consents-section";
import { FeesSection } from "./sections/fees-section";
import { IdentitySection } from "./sections/identity-section";
import { RegistrationSection } from "./sections/registration-section";
import { VisibilitySection } from "./sections/visibility-section";
import { WhenSection } from "./sections/when-section";
import { WhereSection } from "./sections/where-section";
import { validate, type ValidationFailure } from "./product-build";
import { type ProductImageSelection } from "./product-image-selection";
import { type FormState } from "./product-form-state";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";
import type { ProductType } from "@/types";

interface ProductFormShellProps {
  productType: ProductType;
  /** Pre-populated state. Create wrapper passes `initialState(...)`,
   *  edit wrapper passes `existingFormState(product, ...)`. */
  initialFormState: FormState;
  /** The catalogue entry `initialFormState.imageId` points at, from the
   *  product read's `product_images` embed. `null` for a product with no
   *  picture, and on the empty create form. Derived data, so it is a prop
   *  rather than form state — see `ImagePicker`. */
  initialImage?: ProductImageSelection | null;
  /** Submit-button label, e.g. "Create club" or "Save changes". */
  submitLabel: string;
  /** Called when the admin clicks Cancel. Wrapper navigates from here. */
  onCancel: () => void;
  /** Called after `validate()` passes. Wrapper builds the payload, fires
   *  the mutation, and navigates on success. Throws on error so the shell
   *  can render the message. The shell deliberately does NOT clear the
   *  committing flag on success — the wrapper's nav unmounts the page,
   *  closing the click→action gap (see CLAUDE.md "Loading & Disabled State").
   *
   *  It may instead resolve with a **soft warning**: the product was saved and
   *  something beside it was not. The wrapper does not navigate in that case —
   *  it hands the warning back and the shell shows it (see below). */
  onSubmit: (state: FormState) => Promise<ProductSaveWarning | void>;
}

/**
 * A save that succeeded with something to say.
 *
 * The one case today is the picture: the product was written and the statement
 * linking its catalogue entry was not, because another admin retired that entry
 * between this form loading and this save. The product is fine, so this is not
 * an error — but it must not be swallowed either, and there is no toast
 * anywhere in this app to put it in. So the wrapper withholds the navigation
 * and the shell shows the message where the admin is already looking, with the
 * navigation as a button they press when they have read it.
 *
 * `message` is the route's own admin-facing English, shown verbatim: it names
 * the cause, and an admin is the reader it was written for.
 */
export interface ProductSaveWarning {
  message: string;
  /** Go where the wrapper would have gone. Labelled by the shell. */
  onContinue: () => void;
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
  initialImage = null,
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
  const [warning, setWarning] = useState<ProductSaveWarning | null>(null);
  const [committing, setCommitting] = useState(false);
  const languageName = useLanguageNames();

  /**
   * The picture beside `state.imageId`. Derived data, so it lives outside form
   * state — but it does have to be *state*, because the catalogue dialog can
   * change it (a pick, a rename, a replace) and the card has to follow without
   * anyone re-reading the product. Seeded from the read the form was seeded
   * from, so the card paints on the first frame.
   */
  const [currentImage, setCurrentImage] =
    useState<ProductImageSelection | null>(initialImage);

  /**
   * Turn a validation failure's interpolation values into the ones the message
   * actually renders. `validate()` is pure and locale-free, so anything that
   * needs the viewer's locale travels as a raw machine value and is resolved
   * here — two cases, and they are the same shape:
   *
   *   - a locale *code*, swapped for the language name in the viewer's language
   *     (the i18n language-name rule).
   *   - a `minimum` in *cents*, formatted into the viewer's money string. The
   *     currency to format it in round-trips through the `currency` value the
   *     validator sends alongside (its uppercase label, which lowercases back to
   *     the code exactly).
   *
   * Both branches key on the **data** rather than on a list of message keys:
   * whichever failure carries a numeric `minimum` gets it formatted, so a key
   * added later cannot render raw cents ("must be at least 50" — a plausible
   * sentence that is off by a factor of a hundred) by forgetting to join a
   * hand-maintained list. A value the pair cannot be made sense of — a
   * non-numeric minimum, an unsupported currency — falls through untouched.
   */
  function displayValues(failure: ValidationFailure) {
    const values = failure.values;
    if (!values) return undefined;

    if (failure.messageKey === "translationIncomplete") {
      const code = values.locale;
      if (!isSupportedLocale(code)) return values;
      return {
        ...values,
        locale: languageName(code, LOCALE_CONFIG[code].label),
      };
    }

    const minimum = values.minimum;
    if (typeof minimum === "number") {
      const currency = String(values.currency).toLowerCase();
      if (!isSupportedCurrency(currency)) return values;
      return {
        ...values,
        minimum: formatCurrencyFromCents(minimum, currency, uiLocale),
      };
    }

    return values;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const failure = validate(state, config);
    if (failure) {
      setError(t(`errors.${failure.messageKey}`, displayValues(failure)));
      return;
    }

    setCommitting(true);
    try {
      const result = await onSubmit(state);
      // A warning means the save landed but the wrapper did not navigate, so
      // this page stays up. `committing` deliberately stays set: the product
      // exists now, and a second submit would either create a duplicate or
      // re-save a form the admin has not touched since being told something
      // went sideways. The way on is the warning's own button.
      if (result) setWarning(result);
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
        currentImage={currentImage}
        onImageChange={(imageId, image) => {
          setState((s) => ({ ...s, imageId }));
          setCurrentImage(image);
        }}
      />
      <AudienceSection state={state} setState={setState} config={config} />
      <WhereSection state={state} setState={setState} config={config} />
      <WhenSection state={state} setState={setState} config={config} />
      <BillingSection state={state} setState={setState} config={config} />
      <FeesSection state={state} setState={setState} config={config} />
      <RegistrationSection state={state} setState={setState} config={config} />
      {/* After the registration timing and before the listing toggle: the two
          signup-act questions sit together, in the order a parent meets them —
          when the door opens, then what they agree to on the way through. Takes
          no `config`, because the enrolment conditions are a generic mechanism
          with no per-type rule behind them. */}
      <ConsentsSection state={state} setState={setState} />
      {/* Directly beneath, in the order the panel puts them in front of a
          parent: the conditions first, then the question they may decline.
          Separate sections rather than one, because a condition and a question
          are what an admin most needs to be unable to confuse. */}
      <MarketingConsentsSection state={state} setState={setState} />
      <VisibilitySection state={state} setState={setState} />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {warning && (
        <div className="rounded-md bg-warning/10 p-3 text-sm text-warning">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{warning.message}</span>
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={warning.onContinue}
          >
            {c("continue")}
          </Button>
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
