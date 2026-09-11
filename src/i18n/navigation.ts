import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * The app's navigation APIs — locale-aware wrappers around `next/link` and
 * `next/navigation`, typed against the routing config's pathnames map.
 *
 * **Use these, not `next/link` / `next/navigation`, wherever a route is named.**
 * The wrapped `Link` takes an internal pathname (`/shop/[id]`) plus its params
 * and emits the external, locale-prefixed href (`/fi/kauppa/<id>`); the typed
 * `href` is what turns a missed call site into a compile error.
 *
 * **`usePathname` here returns the *internal* pathname with no locale prefix**
 * — `/fi/kauppa/<id>` comes back as `/shop/[id]`. That is exactly right for
 * *comparing* a pathname (active-state logic, dashboard-prefix detection) and
 * exactly wrong for *embedding one in a URL*: a `?redirect=/shop/[id]` passes
 * every allowlist and then navigates to a literal `[id]`. The split rule:
 * comparing → wrapped; embedding in a URL → raw `next/navigation`, with a
 * comment saying why.
 *
 * Full-page navigations (`window.location.href`) and server 303s stay on bare
 * paths deliberately — they cost one proxy hop and land in the reader's stored
 * locale, which is the designed behaviour for a flow re-entering the app.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
