import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enAdmin from "@/../messages/en/admin.json";
import enCommon from "@/../messages/en/common.json";
import enProductTag from "@/../messages/en/productTag.json";
import enConsentDocuments from "@/../messages/en/consentDocuments.json";
import enProductDetail from "@/../messages/en/productDetail.json";
import enProductAudience from "@/../messages/en/productAudience.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { ProductDetailsPage } from "@/components/admin/products/product-details-page";
import type {
  ProductAdminDetailRow,
} from "@/services/products/products.service";
import { syntheticConsumerProduct } from "../../mocks/product-admin-detail-row";

const messages = {
  admin: enAdmin,
  common: enCommon,
  productTag: enProductTag,
  consentDocuments: enConsentDocuments,
  productDetail: enProductDetail,
  productAudience: enProductAudience,
};

/**
 * ============================================================================
 * The admin product page's details card, as an admin reads it.
 * ============================================================================
 *
 * The card is where an admin reads every stored property of a product, so the
 * edit form is never the read path. These tests hold the parts of it with a
 * rule behind them: the facts the shop states to families appear here too, in
 * the family's words; the public link sits in the header, not among the facts;
 * and the creator is named and linked, or unknown when the read could not
 * reach them.
 *
 * The reads are stubbed at their hooks and the groups panel at its component:
 * what is under test is the card, never how the panel draws.
 */

const reads = vi.hoisted(() => ({
  product: undefined as unknown,
}));

vi.mock("@/services/products/products.queries", () => ({
  useProductAdmin: () => ({ data: reads.product, isLoading: false }),
  usePlannedSessions: () => ({ data: [], isPending: false }),
}));

vi.mock("@/components/admin/products/groups/groups-panel", () => ({
  GroupsPanel: () => <div data-testid="groups-panel" />,
}));

const NOW = new Date("2026-03-16T12:00:00.000Z");

function renderPage(product: ProductAdminDetailRow) {
  // No picture: the header would otherwise build a storage URL from an env var
  // this suite has no reason to set.
  reads.product = {
    ...product,
    image_id: null,
    image_path: null,
    catalogue_images: null,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <ProductDetailsPage productType="consumer_club" productId={product.id} />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** The `<dd>` beside the `<dt>` carrying `label`. */
function valueOf(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "dt" });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`no value for ${label}`);
  return value;
}

/**
 * The creation date is rendered in the viewer's zone, and the
 * `TimezoneProvider` seed above only answers the first render: after mount the
 * provider overrides it with the runtime's own zone. So the runtime zone is
 * pinned to Helsinki for this file — Node resets its default zone when
 * `TZ` is stubbed — and restored afterwards.
 */
beforeAll(() => {
  vi.stubEnv("TZ", "Europe/Helsinki");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe("the admin product details card", () => {
  afterEach(() => {
    cleanup();
  });

  it("names the creator and links to their admin user page", () => {
    renderPage({
      ...syntheticConsumerProduct(),
      created_at: "2025-12-01T08:00:00.000Z",
    });

    const link = within(valueOf("Created by")).getByRole("link", {
      name: "Aino Admin",
    });
    expect(link.getAttribute("href")).toBe("/admin/users/admin-1");
    expect(valueOf("Created on").textContent).toBe("1 Dec 2025");
  });

  it("names every marketing ask the product carries, School of Gaming's own included", () => {
    renderPage({
      ...syntheticConsumerProduct(),
      product_marketing_consents: [
        { consent_type: "lynx_educate" },
        { consent_type: "school_of_gaming" },
      ],
    });

    const value = valueOf("Marketing asks").textContent;
    expect(value).toContain("School of Gaming");
    expect(value).toContain("Lynx Educate");
  });

  it("dates the creation in the viewer's zone, not UTC", () => {
    // 23:30 UTC on 1 December is already 2 December in Helsinki.
    renderPage({
      ...syntheticConsumerProduct(),
      created_at: "2025-12-01T23:30:00.000Z",
    });

    expect(valueOf("Created on").textContent).toBe("2 Dec 2025");
  });

  it("calls the creator unknown, with no link, when the read could not reach them", () => {
    renderPage({ ...syntheticConsumerProduct(), creator: null });

    const value = valueOf("Created by");
    expect(value.textContent).toBe("Unknown");
    expect(within(value).queryByRole("link")).toBeNull();
  });

  it("states the shop's four facts in the family's words", () => {
    renderPage(syntheticConsumerProduct());

    // An online product with no place behind it: the delivery row says so,
    // and there is no "Where" row to repeat it.
    expect(valueOf("Delivery").textContent).toBe("Online");
    expect(screen.queryByText("Where")).toBeNull();
    // A gamers-only product: the age range alone.
    expect(valueOf("Age range").textContent).toBe("Ages 7–12");
    expect(valueOf("Spoken language").textContent).toContain("EN");
    expect(valueOf("Schedule").textContent).not.toBe("");
  });

  it("names and links a municipality club's invoice customer from the product read itself", () => {
    const customerId = "8c2f4e1a-7b3d-4a9e-b5c6-0d1e2f3a4b5c";
    renderPage({
      ...syntheticConsumerProduct(),
      product_type: "municipality_club",
      invoice_customer_id: customerId,
      invoice_customer: {
        id: customerId,
        invoice_name: "Espoon kaupunki",
        fennoa_customer_no: "F0037",
      },
    });

    const link = within(valueOf("Invoiced to")).getByRole("link", {
      name: "Espoon kaupunki (F0037)",
    });
    expect(link.getAttribute("href")).toContain(customerId);
  });

  it("carries the public link in the record, not in the header", () => {
    renderPage(syntheticConsumerProduct());

    const details = screen.getByRole("region", { name: "Product details" });
    const record = within(details)
      .getByRole("heading", { name: "Record" })
      .closest("section");
    if (!record) throw new Error("The Record heading has no section");
    expect(
      within(record).getByRole("link", { name: /\/shop\// }),
    ).toBeTruthy();
    expect(valueOf("Public link").textContent).toMatch(/\/shop\//);

    const title = screen.getByRole("heading", { name: "Build Club", level: 1 });
    const header = title.closest("header");
    if (!(header instanceof HTMLElement)) throw new Error("no header");
    expect(within(header).queryByRole("link", { name: /\/shop\// })).toBeNull();
  });
});
