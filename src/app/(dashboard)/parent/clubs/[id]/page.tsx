import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FamilyProductWorkspace } from "@/components/family/product-page/FamilyProductWorkspace";

// Six URL prefixes, one page — a family's view of one enrollment. The dashboard
// card builds the right link per product_type via ROUTES.customer.enrollment /
// ROUTES.gamer.enrollment; this file and its five siblings are thin route
// shells that hand the participation id and the audience to the shared
// workspace, which server-prefetches the page's reads and hydrates them into
// the client shell.
//
// The `[id]` is a PARTICIPATION id, not a product id: the page is gamer-scoped,
// so two siblings in one club have two pages and only the participation row
// names either of them.
//
// The proxy needs nothing for these — it gates by role-prefix scan, so
// everything under `/parent/**` is already behind the customer's session and
// PIN gate.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("familyProduct"),
    description: t("familyProductDescription"),
  };
}

export default async function CustomerClubPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FamilyProductWorkspace participationId={id} audience="customer" />;
}
