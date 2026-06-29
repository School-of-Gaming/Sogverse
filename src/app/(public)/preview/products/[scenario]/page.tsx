import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  isPreviewScenario,
  scenarioHasDetailPage,
} from "@/components/public/products/mock-detail-fixtures";
import { ProductDetailPreviewClient } from "./preview-client";

// Sandbox route used by /admin/ui-components to preview the detail page
// in the same chrome a parent would see (header + footer + the public
// layout shell — no admin sidebar). Surfaced only via the UI Components
// page's "View full page →" link, never indexed. Fully fixture-driven;
// no DB calls. The fixture / countdown logic is a client concern, so the
// route delegates to a client child (`ProductDetailPreviewClient`).

interface PageProps {
  params: Promise<{ scenario: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProductDetailPreviewPage({ params }: PageProps) {
  const { scenario } = await params;

  // Only scenarios whose card has a working "View" CTA have a detail page worth
  // previewing — a parent can't navigate to a full/closed or ended product's
  // page, so we don't mock one.
  if (!isPreviewScenario(scenario) || !scenarioHasDetailPage(scenario)) {
    notFound();
  }

  return <ProductDetailPreviewClient scenario={scenario} />;
}
