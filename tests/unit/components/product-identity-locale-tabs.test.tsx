import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * **The product form's language tabs, on the shared tab bar.** Adding a
 * language opens and shows its tab with an empty draft; typing writes into the
 * shown tab only; switching shows that tab's draft; closing the shown tab moves
 * to the first remaining one in the site's locale order; and the last tab
 * cannot be closed.
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
vi.mock("@/components/ui/rich-text-editor", () => import("../../mocks/rich-text-editor"));

import { useAuthoredBodies } from "@/components/ui/authored-body-editor";
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
  const bodies = useAuthoredBodies();
  useEffect(() => {
    latest = state;
  }, [state]);
  return (
    <IdentitySection
      state={state}
      setState={setState}
      config={config}
      uiLocale="en"
      bodies={bodies}
      currentImage={null}
      onImageChange={() => {}}
    />
  );
}

const nameBox = () => screen.getByLabelText<HTMLInputElement>("labels.name");
const removeButtons = () =>
  screen.queryAllByRole("button", { name: /^removeLanguage/ });

describe("the product form's language tabs", () => {
  it("adds, writes into, switches and removes tabs", () => {
    render(<Harness />);
    // One tab, and it cannot be closed.
    expect(removeButtons()).toHaveLength(0);

    fireEvent.change(nameBox(), { target: { value: "Club" } });

    fireEvent.change(screen.getByLabelText("addLanguage"), {
      target: { value: "fi" },
    });
    expect(latest.translations.active).toBe("fi");
    expect(latest.translations.drafts.fi).toEqual({
      name: "",
      shortDescription: "",
      longDescription: "",
    });
    expect(nameBox().value).toBe("");
    expect(
      screen.getByRole("button", { name: /^Suomi/, pressed: true }),
    ).toBeTruthy();

    fireEvent.change(nameBox(), { target: { value: "Kerho" } });
    expect(latest.translations.drafts.en?.name).toBe("Club");
    expect(latest.translations.drafts.fi?.name).toBe("Kerho");

    fireEvent.click(screen.getByRole("button", { name: /^English/ }));
    expect(latest.translations.active).toBe("en");
    expect(nameBox().value).toBe("Club");

    // Closing the shown tab moves to the first remaining one.
    fireEvent.click(
      screen.getByRole("button", { name: "removeLanguage language=English" }),
    );
    expect(latest.translations.drafts.en).toBeUndefined();
    expect(latest.translations.active).toBe("fi");
    expect(nameBox().value).toBe("Kerho");
    expect(removeButtons()).toHaveLength(0);
  });

  it("leaves the name and the short description to validate(), not the browser", () => {
    render(<Harness />);
    // A blank tab is dropped at save rather than refused, so the shown tab's
    // fields cannot be `required` — the browser would block the submit first.
    expect(nameBox().required).toBe(false);
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("labels.shortDescription")
        .required,
    ).toBe(false);
  });
});
