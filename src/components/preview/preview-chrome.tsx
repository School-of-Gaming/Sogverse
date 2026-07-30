import { DashboardLayout, Footer, Header } from "@/components/layout";
import type { PreviewChromeKind } from "./scenes";

/**
 * The real app chrome a preview scene sits inside.
 *
 * The preview route lives in its own route group with a pass-through layout, so
 * nothing is inherited by accident: each scene declares the chrome it wants and
 * gets the same components the corresponding route group composes. `"public"`
 * mirrors the `(public)` layout (header, flexible main, footer); `"dashboard"`
 * mirrors the `(dashboard)` layout as every non-admin role sees it — header
 * plus the dashboard layout with no sidebar.
 */
export function PreviewChrome({
  chrome,
  children,
}: {
  chrome: PreviewChromeKind;
  children: React.ReactNode;
}) {
  if (chrome === "dashboard") {
    return (
      <>
        <Header />
        <DashboardLayout showSidebar={false}>{children}</DashboardLayout>
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
