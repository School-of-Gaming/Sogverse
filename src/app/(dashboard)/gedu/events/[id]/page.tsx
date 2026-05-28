import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SessionDetailsPage } from "@/components/gedu/session-details/SessionDetailsPage";

// Three URL prefixes, one page. See the clubs/[id] route for the design
// note — this file's only job is to hand the product id to the shared
// client component.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduSessionDetails") };
}

export default async function GeduEventDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SessionDetailsPage productId={id} />;
}
