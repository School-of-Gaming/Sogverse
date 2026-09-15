import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduProductWorkspace } from "@/components/gedu/session-details/GeduProductWorkspace";

// Three URL prefixes, one page — the gedu's group workspace. The dashboard
// card builds the right link per product_type via ROUTES.gedu.assignedProduct;
// this file (and its camp/event siblings) is just a thin route shell that hands
// the product id to the shared workspace component, which server-prefetches the
// page's two reads and hydrates them into the client shell. Keeps gedu-friendly
// URLs without forking the rendering.
//
// `?groupId=` rides along unparsed: it names which group of the product to open
// — what a cover card's link carries — and the workspace component owns the one
// copy of the rule for reading it, so the three routes stay identical.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduSessionDetails") };
}

export default async function GeduClubDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ groupId?: string | string[] }>;
}) {
  const [{ id }, { groupId }] = await Promise.all([params, searchParams]);
  return <GeduProductWorkspace productId={id} groupIdParam={groupId} />;
}
