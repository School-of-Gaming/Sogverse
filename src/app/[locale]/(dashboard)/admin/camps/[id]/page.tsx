import { ProductDetailsPage } from "@/components/admin/products/product-details-page";

export default async function AdminCampDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetailsPage productType="camp" productId={id} />;
}
