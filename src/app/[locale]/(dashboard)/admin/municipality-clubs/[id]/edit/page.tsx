import { EditProductPage } from "@/components/admin/products/edit-product-page";

export default async function EditMunicipalityClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <EditProductPage productType="municipality_club" productId={id} />
  );
}
