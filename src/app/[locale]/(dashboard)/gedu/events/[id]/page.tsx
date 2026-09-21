import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduProductWorkspace } from "@/components/gedu/session-details/GeduProductWorkspace";

// Three URL prefixes, one page. See the clubs/[id] route for the design
// note — this file's only job is to hand the product id to the shared
// workspace component.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduSessionDetails") };
}

export default async function GeduEventDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ groupId?: string | string[] }>;
}) {
  const [{ id }, { groupId }] = await Promise.all([params, searchParams]);
  return <GeduProductWorkspace productId={id} groupIdParam={groupId} />;
}
