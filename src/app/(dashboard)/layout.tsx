import { redirect } from "next/navigation";
import { DashboardLayout, Header } from "@/components/layout";
import { getUserWithProfile } from "@/lib/supabase/server";

export default async function DashboardRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userWithProfile = await getUserWithProfile();

  if (!userWithProfile?.user) {
    redirect("/login");
  }

  // Parent and gamer dashboards have moved to a single-page scroll UX with
  // an in-page section pill (see /parent and /gamer pages); the sidebar is
  // suppressed for those roles across every (dashboard) route.
  const role = userWithProfile.profile?.role;
  const showSidebar = role === "admin" || role === "gedu";

  return (
    <>
      <Header />
      <DashboardLayout showSidebar={showSidebar}>{children}</DashboardLayout>
    </>
  );
}
