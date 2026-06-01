import { EditProductPage } from "@/components/admin/products/edit-product-page";

export default async function EditConsumerClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditProductPage productType="consumer_club" productId={id} />;
}
