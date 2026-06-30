import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isPreviewScenario } from "@/components/public/products/mock-detail-fixtures";
import { ConfirmationPreviewClient } from "./preview-client";

// Sandbox route used by the detail preview's CTA: the post-signup summary
// rendered in the same public chrome a parent sees. Reached from
// /preview/products/[scenario] → click the CTA → here. Fully fixture-driven, no
// DB calls, never indexed. The fixture build is a client concern (it can resolve
// live countdown timestamps), so the route delegates to a client child.
interface PageProps {
  params: Promise<{ scenario: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ConfirmationPreviewPage({ params }: PageProps) {
  const { scenario } = await params;

  if (!isPreviewScenario(scenario)) {
    notFound();
  }

  return <ConfirmationPreviewClient scenario={scenario} />;
}
