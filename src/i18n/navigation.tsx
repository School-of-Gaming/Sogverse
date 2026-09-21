import { createNavigation } from "next-intl/navigation";
import type { ComponentProps } from "react";

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
const {
  Link: LocalizedLink,
  redirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing);

export { redirect, usePathname, useRouter, getPathname };

/**
 * The wrapped `Link` — and the one place the app's `prefetch` default is set,
 * which here is `false`.
 *
 * A prefetch only earns its request if it can hand the click something to
 * render from, and on this app's shape it cannot. Every route renders
 * dynamically and there is no `loading.tsx` anywhere, so Next has nothing it
 * could send ahead: on exactly that shape it short-circuits the prefetch to a
 * router-state response carrying no segment data and no head. The framework
 * default therefore fires one request per link *visible on screen* — a footer
 * row that sits on every page, a grid of product cards — and buys nothing with
 * them, while the click that eventually comes fetches the static and dynamic
 * parts in a single stream regardless. Same navigation, same speed; the
 * requests were pure cost.
 *
 * A call site that knows better opts back in with `prefetch={true}` (or
 * `prefetch="auto"`), and that is worth doing exactly where the target can
 * deliver something ahead of the click.
 *
 * Expect the default to flip back for routes that gain a static shell — a
 * `loading.tsx` boundary, or PPR under `cacheComponents`. Once there is a
 * prerendered shell to send, a prefetch buys a paint.
 *
 * It is a plain forwarding component rather than a re-export, so the module
 * still works in both graphs: `redirect` and `getPathname` are read from
 * server components, and a `"use client"` here would break them.
 */
export function Link({
  prefetch = false,
  ...props
}: ComponentProps<typeof LocalizedLink>) {
  return <LocalizedLink prefetch={prefetch} {...props} />;
}
