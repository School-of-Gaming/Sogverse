"use client";

import { Sidebar } from "./sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  showSidebar: boolean;
}

export function DashboardLayout({ children, showSidebar }: DashboardLayoutProps) {
  return (
    <div className="flex">
      {showSidebar && <Sidebar />}
      {/* min-w-0 lets the flex item shrink to its assigned width instead of
          growing to fit its widest unbreakable child. Without it, a long
          Finnish/Swedish word (e.g. "turvallisuusasetuksiasi") on the
          settings page would push <main> past the viewport, causing a small
          horizontal page scroll on narrow widths. The public layout uses
          flex-col so width is the cross-axis and this isn't an issue. */}
      <main className="min-w-0 flex-1 bg-background">
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
}
