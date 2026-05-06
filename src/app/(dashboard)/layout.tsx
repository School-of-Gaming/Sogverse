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

  return (
    <>
      <Header />
      <DashboardLayout>{children}</DashboardLayout>
    </>
  );
}
