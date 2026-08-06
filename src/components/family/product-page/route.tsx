import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { SessionAudience } from "@/types";
import { FamilyProductWorkspace } from "./FamilyProductWorkspace";

/**
 * What the six family product-page routes are made of.
 *
 * **Six URLs, one page.** `/parent/{clubs,camps,events}/[id]` and the gamer
 * triplet all render a family's view of one enrollment; the dashboard card
 * builds the right link per `product_type` via `ROUTES.customer.enrollment` /
 * `ROUTES.gamer.enrollment`. The type segment exists because "clubs" and
 * "camps" are how families talk about what they are in — it is vocabulary, not
 * a routing decision, and nothing downstream reads it. Everything that *does*
 * vary is the audience, which is fixed by the role root.
 *
 * So the shells are two exports each and hold nothing of their own. They used
 * to hold a copy of the metadata function and a copy of the component — six
 * byte-identical pairs, which is six places for a change to be applied five
 * times.
 *
 * **The `[id]` is a PARTICIPATION id, not a product id.** The page is
 * gamer-scoped: two siblings in one club get two pages, and the participation
 * row is the only thing that names either of them.
 *
 * **The proxy needs nothing for these.** It gates by role-prefix scan, so
 * `/parent/**` is already behind the customer's session *and* the parent-PIN
 * gate (which is deny-by-default with a short exempt list), and `/gamer/**`
 * behind the child's.
 */

/**
 * The route metadata, identical on all six.
 *
 * One title for every type and both roles, as the gedu workspace does for its
 * three: a tab title naming the surface is more use than one naming the
 * product's category, and the page's own masthead is where the type is
 * actually stated.
 */
export async function familyProductMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("familyProduct"),
    description: t("familyProductDescription"),
  };
}

/** Build the route component for one audience. */
function familyProductRoute(audience: SessionAudience) {
  return async function FamilyProductRoute({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id } = await params;
    return <FamilyProductWorkspace participationId={id} audience={audience} />;
  };
}

/** The parent's three routes. */
export const CustomerFamilyProductRoute = familyProductRoute("customer");

/** The child's three. */
export const GamerFamilyProductRoute = familyProductRoute("gamer");
