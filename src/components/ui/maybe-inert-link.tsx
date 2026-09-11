import type { AnchorHTMLAttributes } from "react";

import { Link } from "@/i18n/navigation";
import { INERT_HREF, type MaybeInertHref } from "@/lib/constants/routes";

/**
 * A link whose destination may be the inert `#` — a card whose product has no
 * page behind it yet, a Join for an in-person session with no room to join.
 *
 * The two halves are different elements on purpose. A real destination is a
 * route, so it goes through the wrapped `Link` and comes out localized; `#` is
 * not a route at all, so it is a plain anchor that cancels its own click. The
 * alternative — handing the fragment to a route-typed `Link` — is a value the
 * type system cannot check and the router has no business seeing.
 */
export function MaybeInertLink({
  href,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: MaybeInertHref;
}) {
  if (href === INERT_HREF) {
    return (
      <a
        {...props}
        href={INERT_HREF}
        onClick={(event) => {
          event.preventDefault();
          props.onClick?.(event);
        }}
      />
    );
  }
  return <Link href={href} {...props} />;
}
