import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * **The product form's language tabs, on the shared tab bar.** Adding a
 * language opens and shows its tab with an empty draft; typing writes into the
 * shown tab only; closing the shown tab moves to the first remaining one in the
 * site's locale order; and the last tab cannot be closed.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useLocale: () => "en",
}));
vi.mock("@/components/admin/products/image-picker", () => ({
  ImagePicker: () => <div data-testid="image-picker" />,
}));
vi.mock("@/components/admin/products/long-description-editor", () => ({
  LongDescriptionEditor: () => <div data-testid="long-description" />,
}));

import { IdentitySection } from "@/components/admin/products/sections/identity-section";
import {
  initialState,
  type FormState,
} from "@/components/admin/products/product-form-state";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";

const config = PRODUCT_TYPE_CONFIG.consumer_club;
let latest: FormState;

function Harness() {
  const [state, setState] = useState<FormState>(() => initialState(config, "en"));
  useEffect(() => {
    latest = state;
  }, [state]);
  return (
    <IdentitySection
      state={state}
      setState={setState}
      config={config}
      uiLocale="en"
      currentImage={null}
      onImageChange={() => {}}
    />
  );
}

const nameBox = () => screen.getByLabelText<HTMLInputElement>("labels.name");

describe("the product form's language tabs", () => {
  it("adds, writes into, switches and removes tabs as before", () => {
    render(<Harness />);
    // One tab, and it cannot be closed.
    expect(screen.queryByRole("button", { name: /translations.removeLocale/ })).toBeNull();

    fireEvent.change(nameBox(), { target: { value: "Club" } });

    fireEvent.change(screen.getByLabelText("translations.addLocale"), {
      target: { value: "fi" },
    });
    expect(latest.activeLocale).toBe("fi");
    expect(latest.translations.fi).toEqual({
      name: "",
      shortDescription: "",
      longDescription: "",
    });
    expect(nameBox().value).toBe("");

    fireEvent.change(nameBox(), { target: { value: "Kerho" } });
    expect(latest.translations.en?.name).toBe("Club");
    expect(latest.translations.fi?.name).toBe("Kerho");

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(nameBox().value).toBe("Club");

    // Closing the shown tab moves to the first remaining one.
    fireEvent.click(
      screen.getByRole("button", { name: "translations.removeLocale locale=English" }),
    );
    expect(latest.translations.en).toBeUndefined();
    expect(latest.activeLocale).toBe("fi");
    expect(nameBox().value).toBe("Kerho");
    expect(screen.queryByRole("button", { name: /translations.removeLocale/ })).toBeNull();
  });
});
