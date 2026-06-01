import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  PREVIEW_STATES,
  PREVIEW_TYPES,
  type PreviewStateKind,
} from "@/components/public/products/mock-detail-fixtures";
import type { ProductType } from "@/types";
import { ProductDetailPreviewClient } from "./preview-client";

// Sandbox route used by /admin/ui-components to preview the detail page
// in the same chrome a parent would see (header + footer + the public
// layout shell — no admin sidebar). Surfaced only via the UI Components
// page's "Preview full page →" link, never indexed. Fully fixture-driven;
// no DB calls. The fixture / countdown logic is a client concern, so the
// route delegates to a client child (`ProductDetailPreviewClient`).

interface PageProps {
  params: Promise<{ type: string; state: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProductDetailPreviewPage({ params }: PageProps) {
  const { type, state } = await params;

  if (!isProductType(type) || !isPreviewState(state)) {
    notFound();
  }

  return <ProductDetailPreviewClient productType={type} stateKind={state} />;
}

function isProductType(s: string): s is ProductType {
  return (PREVIEW_TYPES as readonly string[]).includes(s);
}

function isPreviewState(s: string): s is PreviewStateKind {
  return (PREVIEW_STATES as readonly string[]).includes(s);
}
