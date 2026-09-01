import { DashboardLayout, Footer, Header } from "@/components/layout";
import type { PreviewChromeKind } from "./scenes";

/**
 * The real app chrome a preview scene sits inside.
 *
 * The preview route lives in its own route group with a pass-through layout, so
 * nothing is inherited by accident: each scene declares the chrome it wants and
 * gets the same components the corresponding route group composes. `"public"`
 * mirrors the `(public)` layout (header, flexible main, footer); `"auth"`
 * mirrors the `(auth)` layout, which is that same shape with its `<main>`
 * centring one narrow column; `"dashboard"` mirrors the `(dashboard)` layout as
 * every non-admin role sees it — header plus the dashboard layout with no
 * sidebar; `"admin"` is that same layout as the **admin** meets it, sidebar
 * included.
 *
 * Admin is its own kind rather than a flag on `"dashboard"` because the sidebar
 * is not a decoration on an admin page — it is a third of the horizontal room,
 * and a wide two-column dashboard judged without it would be judged at a width
 * that does not exist. The sidebar renders itself from the viewer's own profile,
 * and only `/preview/*`'s admin gate can get anybody here at all, so it is the
 * real component reading the real role rather than a mock of one.
 */
export function PreviewChrome({
  chrome,
  children,
}: {
  chrome: PreviewChromeKind;
  children: React.ReactNode;
}) {
  if (chrome === "dashboard" || chrome === "admin") {
    return (
      <>
        <Header />
        <DashboardLayout showSidebar={chrome === "admin"}>
          {children}
        </DashboardLayout>
      </>
    );
  }

  // One wrapper for both signed-out shells, because they *are* one shape: the
  // `(auth)` group is the `(public)` group with its main centring a single
  // column. Two branches would be two copies of the same three lines, drifting
  // apart the first time the site's outer frame changes.
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main
        className={
          chrome === "auth" ? "flex flex-1 items-center justify-center p-4" : "flex-1"
        }
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}
