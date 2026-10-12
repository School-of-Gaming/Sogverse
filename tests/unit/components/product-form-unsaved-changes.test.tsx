import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";

/**
 * **The product form asks before it is left with unsaved changes — and only
 * then.** Whatever is changed anywhere on the form counts, a price as much as a
 * name; an untouched form, a blank language tab and a change put back do not.
 *
 * The real rich editor is kept, because the case worth pinning is the one a
 * textarea stand-in cannot show: the editor writes an opened product's long
 * description back in its own dialect on its first transaction, and that must
 * not read as a change.
 *
 * Whether the guard is up is read off the page's `beforeunload` answer — the
 * one way out only the browser's own prompt can stop.
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

// Browses the database for rows this test has no opinion about.
vi.mock("@/components/admin/products/location-picker", () => ({
  LocationPicker: () => <div data-testid="location-picker" />,
}));

import { NowProvider } from "@/providers";
import { ProductFormShell } from "@/components/admin/products/product-form";
import {
  cloneFormState,
  existingFormState,
} from "@/components/admin/products/product-build";
import {
  initialState,
  type FormState,
} from "@/components/admin/products/product-form-state";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import { syntheticConsumerProduct } from "../../mocks/product-admin-detail-row";

const CONFIG = PRODUCT_TYPE_CONFIG.consumer_club;

/** Markdown the editor would write differently, ending in a list. */
const FOREIGN_DIALECT = "Some __strong__ words.\n\n\n* one\n* two";

/**
 * The rich editor is loaded on demand; loaded once here, its import resolves
 * from the module cache, so no case depends on how long the first load took.
 */
beforeAll(async () => {
  await import("@/components/ui/rich-text-editor");
});

function openedProduct(): FormState {
  const product = syntheticConsumerProduct();
  product.product_translations = product.product_translations.map((row) => ({
    ...row,
    long_description: FOREIGN_DIALECT,
  }));
  return existingFormState(product, CONFIG, "en");
}

function renderForm(
  initialFormState: FormState,
  onSubmit: () => Promise<void> = async () => {},
) {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <NowProvider initialNow={new Date("2026-09-01T12:00:00Z")}>
        <ProductFormShell
          productType="consumer_club"
          initialFormState={initialFormState}
          isEdit
          submitLabel="Save"
          onCancel={vi.fn()}
          onSubmit={onSubmit}
        />
      </NowProvider>
    </QueryClientProvider>,
  );
  const form = view.container.querySelector("form");
  const price = view.container.querySelector<HTMLInputElement>("#price-eur");
  if (!form || !price) throw new Error("no form");
  return { form, price };
}

/** Wait for the real rich editor, and place a caret as a click would. */
async function touchLongDescription() {
  const surface = await screen.findByRole("textbox", {
    name: "labels.longDescription",
  });
  const editor = (surface as HTMLElement & { editor?: Editor }).editor;
  if (!editor) throw new Error("no editor on the writing surface");
  await waitFor(() => expect(editor.isInitialized).toBe(true));
  act(() => {
    // No scroll: jsdom has no layout to measure, and the scroll runs a frame
    // later, after a case may already have unmounted.
    editor.commands.focus("end", { scrollIntoView: false });
  });
  return editor;
}

/** Whether leaving now would be asked about. */
function guarded(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const nameBox = () => screen.getByLabelText<HTMLInputElement>("labels.name");

describe("the product form's unsaved-changes guard", () => {
  it("stays down on an opened product whose long description the editor respells", async () => {
    renderForm(openedProduct());
    const editor = await touchLongDescription();
    expect(guarded()).toBe(false);

    act(() => {
      editor.commands.insertContent("x");
    });
    expect(guarded()).toBe(true);
    act(() => {
      editor.commands.undo();
    });
    expect(guarded()).toBe(false);
  });

  it("goes up for a price change and down again when it is put back", async () => {
    const { price } = renderForm(openedProduct());
    await touchLongDescription();
    const stored = price.value;

    fireEvent.change(price, { target: { value: "50.00" } });
    expect(guarded()).toBe(true);
    fireEvent.change(price, { target: { value: stored } });
    expect(guarded()).toBe(false);
  });

  it("goes up for a name change and down again when it is put back", async () => {
    renderForm(openedProduct());
    await touchLongDescription();
    const stored = nameBox().value;

    fireEvent.change(nameBox(), { target: { value: "Renamed" } });
    expect(guarded()).toBe(true);
    fireEvent.change(nameBox(), { target: { value: stored } });
    expect(guarded()).toBe(false);
  });

  it("stays down on an opened clone", async () => {
    renderForm(cloneFormState(syntheticConsumerProduct(), CONFIG, "en", " (Copy)"));
    await touchLongDescription();
    expect(guarded()).toBe(false);
  });

  it("stays down on a new product, and for a language tab added and left blank", async () => {
    renderForm(initialState(CONFIG, "en"));
    await touchLongDescription();
    expect(guarded()).toBe(false);

    fireEvent.change(screen.getByLabelText("addLanguage"), {
      target: { value: "fi" },
    });
    expect(guarded()).toBe(false);

    fireEvent.change(nameBox(), { target: { value: "Kerho" } });
    expect(guarded()).toBe(true);
  });

  it("stands down once a save is pressed", async () => {
    // A save that never settles: the page is on its way out.
    const { form, price } = renderForm(openedProduct(), () => new Promise(() => {}));
    await touchLongDescription();
    fireEvent.change(price, { target: { value: "50.00" } });
    expect(guarded()).toBe(true);

    fireEvent.submit(form);
    await waitFor(() => expect(guarded()).toBe(false));
  });
});
