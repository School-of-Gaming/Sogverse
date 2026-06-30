import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isPreviewScenario } from "@/components/public/products/mock-detail-fixtures";
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

  // Any valid scenario renders here. A parent only ever *navigates* to the
  // open/countdown states (their card carries a "View" CTA — see
  // scenarioHasDetailPage, which still gates the card link). The closed states
  // (ended / running late / fully booked) have no card link, but they're
  // reachable in real life via a stale link or bookmark, so the UI Components
  // page links here directly to preview that ClosedPanel full-page.
  if (!isPreviewScenario(scenario)) {
    notFound();
  }

  return <ProductDetailPreviewClient scenario={scenario} />;
}
