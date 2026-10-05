"use client";

import { useAdminLandingPages } from "@/services/landing-pages";
import { AdminLandingPagesPage } from "./admin-landing-pages-page";

/** The live data shell for `/admin/landing-pages`: one read, into the body beside it. */
export function AdminLandingPagesView() {
  const { data, isPending } = useAdminLandingPages();

  return <AdminLandingPagesPage pages={data ?? []} settled={!isPending} />;
}
