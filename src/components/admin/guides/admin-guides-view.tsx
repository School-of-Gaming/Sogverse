"use client";

import { useAdminGuides } from "@/services/guides/guides.queries";
import { AdminGuidesPage } from "./admin-guides-page";

/** The live data shell for `/admin/guides`: one read, into the body beside it. */
export function AdminGuidesView() {
  const { data, status } = useAdminGuides();

  return <AdminGuidesPage guides={data ?? []} status={status} />;
}
