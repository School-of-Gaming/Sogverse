import { z } from "zod";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";

/**
 * What a sign-up set out to reach, read off the `?redirect=` the register page
 * was opened with and carried in the registration body.
 *
 * **The value is untrusted.** Our own forms carry it, so a client can send
 * anything. It is resolved through `resolveInternalPath()` and matched on its
 * locale-stripped, untranslated pathname (`/fi/kauppa/<id>` is `/shop/<id>`),
 * and an id must be a UUID before anything is read with it.
 *
 * Client-safe, because both sides of a registration read it: the routes, for
 * the intent they store and the product their lead names, and the forms, for
 * the product their own `sign_up` push names — the same product, decided by
 * the same shape.
 */

// Any absolute base splits a path from its query; the value has already been
// proved same-origin by the time it is parsed against this.
const SENTINEL = "https://internal.invalid";

const SHOP_PRODUCT_TEMPLATE = "/shop/[id]";
const SCHOOL_PRODUCT_TEMPLATE = "/schools/[municipalityName]/[id]";
const LANDING_PAGE_TEMPLATE = ROUTES.landingPage("").pathname;

const uuid = z.string().uuid();

/** The page a redirect names, by its shape alone — nothing has been read yet. */
export type SignUpTarget =
  /** A product page, from the shop or from a municipality's school listing. */
  | { kind: "product_page"; via: "shop" | "schools"; productId: string }
  /** A landing page, at its id or at the slug its version in `locale` stores. */
  | { kind: "landing_page"; locale: string; idOrSlug: string };

/** The page a redirect names, or `null` when it is none of the sign-up targets. */
export function signUpTargetFrom(redirect: string | undefined): SignUpTarget | null {
  const path = resolveInternalPath(redirect, "");
  if (!path) return null;

  const { locale, pathname, template } = normalizeExternalPath(
    new URL(path, SENTINEL).pathname,
  );
  const segments = pathname.split("/");

  if (template === SHOP_PRODUCT_TEMPLATE) {
    const id = segments[2];
    return uuid.safeParse(id).success ? { kind: "product_page", via: "shop", productId: id } : null;
  }
  if (template === SCHOOL_PRODUCT_TEMPLATE) {
    const id = segments[3];
    return uuid.safeParse(id).success
      ? { kind: "product_page", via: "schools", productId: id }
      : null;
  }
  if (template === LANDING_PAGE_TEMPLATE) {
    const idOrSlug = segments[2];
    return idOrSlug
      ? { kind: "landing_page", locale: locale ?? DEFAULT_LOCALE, idOrSlug }
      : null;
  }
  return null;
}

/**
 * The shop product a sign-up's redirect names — the one product a lead may
 * name, on either side of the wire — or `null`. A municipality's school
 * listing is not a shop page and names none.
 */
export function signUpShopProductId(redirect: string | undefined): string | null {
  const target = signUpTargetFrom(redirect);
  return target?.kind === "product_page" && target.via === "shop"
    ? target.productId
    : null;
}
