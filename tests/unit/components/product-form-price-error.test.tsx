import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * **The price-floor refusal as the admin actually reads it.**
 *
 * `validate()` is pure and locale-free, so the currency's minimum charge leaves
 * it as raw *cents* — 50 — and the form is the only place that turns it into
 * money. The message it lands in says "must be at least {minimum}", which makes
 * the failure mode silent and expensive: an unformatted value renders "must be
 * at least 50", a sentence that reads perfectly and is wrong by a factor of a
 * hundred. The build-level tests pin the cents; only a render can pin the euros,
 * which is why this one goes through the whole form shell rather than calling
 * the transform.
 *
 * **On jsdom and native validation:** the price input carries `required` and a
 * `min`, so a real browser would refuse this submit before the handler ever ran.
 * jsdom implements the constraint-validation *API* (`checkValidity`) but not
 * interactive validation — it performs no form submission of its own, and a
 * `submit` event dispatched at the element is delivered to the handler
 * unconditionally. That is what lets a form test reach past the browser's own
 * refusal, and it is the same route the register-form tests take.
 *
 * Translations echo their key plus the interpolation values they were handed,
 * so nothing here depends on wording in `messages/` — only on which value the
 * form hands the message.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useLocale: () => "en",
  useFormatter: () => ({ number: (value: number) => String(value) }),
}));

vi.mock("@/services/products", () => ({
  useConsentDocuments: () => ({ data: [] }),
}));

// Both browse the database for rows this test has no opinion about; the ProseMirror
// editor additionally arrives through a dynamic import that would resolve after the
// assertion. Neither takes part in the price rule.
vi.mock("@/components/admin/products/location-picker", () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}));
vi.mock("@/components/admin/products/long-description-editor", () => ({
  LongDescriptionEditor: () => <div data-testid="long-description" />,
}));

import { NowProvider } from "@/providers";
import { ProductFormShell } from "@/components/admin/products/product-form";
import {
  initialState,
  type FormState,
} from "@/components/admin/products/product-form-state";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import { formatCurrencyFromCents } from "@/lib/utils";
import { CURRENCY_CONFIG } from "@/lib/constants";

const CONFIG = PRODUCT_TYPE_CONFIG.consumer_club;

/** A paid consumer club that clears every rule ahead of the price. */
function paidClubState(month: string): FormState {
  const s = initialState(CONFIG, "en");
  s.translations = {
    en: {
      name: "Test Club",
      shortDescription: "A great club",
      longDescription: "",
    },
  };
  s.activeLocale = "en";
  s.topic = "minecraft_java";
  s.spokenLanguageCode = "en";
  s.isRemote = true;
  s.locationId = null;
  s.startMode = "date";
  s.startDate = "2026-09-01";
  s.scheduleSlots = [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }];
  s.paidMode = "paid";
  s.prices = { eur: { session: "", month } };
  s.uncapped = false;
  s.seatCount = "10";
  return s;
}

function renderForm(month: string) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  // The picture card holds an upload mutation, so the form needs a query
  // client the way the app gives it one. It issues no read — a drop is what
  // sends anything anywhere — so an empty client is the whole requirement.
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      {/* The When and Registration sections read the shared clock to label the
          timezone picker's offsets. A fixed instant keeps the render
          deterministic; nothing here asserts on a label. */}
      <NowProvider initialNow={new Date("2026-09-01T12:00:00Z")}>
        <ProductFormShell
          productType="consumer_club"
          initialFormState={paidClubState(month)}
          isEdit={false}
          submitLabel="Save"
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      </NowProvider>
    </QueryClientProvider>,
  );
  const form = view.container.querySelector("form");
  if (!form) throw new Error("no form");
  return { ...view, form, onSubmit };
}

/** The floor, as money, in the locale this form is being read in. */
const MINIMUM = formatCurrencyFromCents(
  CURRENCY_CONFIG.eur.minimumChargeCents,
  "eur",
  "en",
);

describe("the product form's price-floor error", () => {
  it("names the minimum as money, not as cents", () => {
    const { form, container, onSubmit } = renderForm("0.30");

    fireEvent.submit(form);

    // €0.50 — the number a family would recognise on a card statement. The raw
    // machine value is the whole hazard: "minimum=50" is a sentence an admin
    // would believe.
    expect(MINIMUM).toBe("€0.50");
    expect(container.textContent).toContain(`minimum=${MINIMUM}`);
    expect(container.textContent).not.toContain("minimum=50");
    // The refusal is the form's, so nothing was handed to the wrapper to save.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("lets a price at the floor through to the wrapper", () => {
    // The counterpart: the same render path with a legal price submits, which
    // is what shows the assertion above is about the amount rather than about
    // the form refusing everything.
    const { form, onSubmit } = renderForm("0.50");

    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
