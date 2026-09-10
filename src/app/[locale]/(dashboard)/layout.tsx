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

  // Only the admin dashboard uses the sidebar. Parents, gamers, and gedus
  // have single-page dashboards where the SOG logo in the header is the
  // route back to the dashboard.
  const role = userWithProfile.profile?.role;
  const showSidebar = role === "admin";

  return (
    <>
      <Header />
      <DashboardLayout showSidebar={showSidebar}>{children}</DashboardLayout>
    </>
  );
}
