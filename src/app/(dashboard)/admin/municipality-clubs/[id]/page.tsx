import { ProductV2DetailsPage } from "@/components/admin/products-v2/product-v2-details-page";

export default async function AdminMunicipalityClubDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ProductV2DetailsPage productType="municipality_club" productId={id} />
  );
}
