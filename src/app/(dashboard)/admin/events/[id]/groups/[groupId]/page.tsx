import { AdminGroupDetailsPage } from "@/components/admin/products/group-details/admin-group-details-page";

export default async function AdminEventGroupDetailsPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  return (
    <AdminGroupDetailsPage
      productType="event"
      productId={id}
      groupId={groupId}
    />
  );
}
