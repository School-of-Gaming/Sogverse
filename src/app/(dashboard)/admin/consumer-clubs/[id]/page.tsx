import { ProductDetailsPage } from "@/components/admin/products/product-details-page";

export default async function AdminConsumerClubDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetailsPage productType="consumer_club" productId={id} />;
}
