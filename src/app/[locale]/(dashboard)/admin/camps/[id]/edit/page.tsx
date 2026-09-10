import { EditProductPage } from "@/components/admin/products/edit-product-page";

export default async function EditCampPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditProductPage productType="camp" productId={id} />;
}
