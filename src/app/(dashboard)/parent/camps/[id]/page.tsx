import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FamilyProductWorkspace } from "@/components/family/product-page/FamilyProductWorkspace";

// One of six thin route shells over the shared family product workspace. See
// `parent/clubs/[id]/page.tsx` for the full note on why there are six of them,
// why the `[id]` is a participation id, and why the proxy needs no change.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("familyProduct"),
    description: t("familyProductDescription"),
  };
}

export default async function CustomerCampPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FamilyProductWorkspace participationId={id} audience="customer" />;
}
