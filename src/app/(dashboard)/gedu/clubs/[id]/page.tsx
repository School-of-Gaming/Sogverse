import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SessionDetailsPage } from "@/components/gedu/session-details/SessionDetailsPage";

// Three URL prefixes, one page. The dashboard card builds the right link
// per product_type via ROUTES.gedu.assignedProduct; this file (and its
// camp/event siblings) is just a thin route shell that hands the product
// id to the shared client component. Keeps gedu-friendly URLs without
// forking the rendering.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduSessionDetails") };
}

export default async function GeduClubDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionDetailsPage productId={id} />;
}
