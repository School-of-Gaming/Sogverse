import { AdminGroupDetailsPage } from "@/components/admin/products/group-details/admin-group-details-page";

export default async function AdminConsumerClubGroupDetailsPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id, groupId } = await params;
  return (
    <AdminGroupDetailsPage
      productType="consumer_club"
      productId={id}
      groupId={groupId}
    />
  );
}
