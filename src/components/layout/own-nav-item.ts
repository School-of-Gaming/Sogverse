import { ROUTES } from "@/lib/constants";

/**
 * The gedu pages that carry **their own item in the chrome**, rather than being
 * reached from the dashboard they sit under.
 *
 * Substitutions is role-gated by living under the gedu dashboard's path, which
 * is what makes it look like a page *of* that dashboard to any prefix test —
 * and it is not one: it has a nav item of its own, and the chrome must name the
 * reader's position once.
 */
const PAGES_WITH_THEIR_OWN_NAV_ITEM = [ROUTES.gedu.substitutions];

/**
 * Whether this path is a gedu page with its own nav item.
 *
 * **Two consumers, one answer.** The header's logo and the account menu's
 * "My SOG" row both light on "the dashboard and the pages beneath it", and both
 * have to carve out the same set — written twice, the strip lit two places at
 * once the first time a second such page arrived. A page joins the list above
 * in the same change that gives it its nav item.
 *
 * The pathname is the locale-stripped internal one the wrapped `usePathname`
 * returns, which is what the route constants are spelled in.
 */
export function hasOwnNavItem(pathname: string): boolean {
  return PAGES_WITH_THEIR_OWN_NAV_ITEM.some(
    (page) => pathname === page || pathname.startsWith(page + "/"),
  );
}
