import { ProductDetailsPage } from "@/components/admin/products/product-details-page";

export default async function AdminMunicipalityClubDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProductDetailsPage productType="municipality_club" productId={id} />
  );
}
