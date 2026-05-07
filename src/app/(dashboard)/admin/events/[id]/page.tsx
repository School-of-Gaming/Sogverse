import { ProductV2DetailsPage } from "@/components/admin/products-v2/product-v2-details-page";

export default async function AdminEventDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductV2DetailsPage productType="event" productId={id} />;
}
