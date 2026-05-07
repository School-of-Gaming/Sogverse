import { EditProductV2Page } from "@/components/admin/products-v2/edit-product-v2-page";

export default async function EditCampPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditProductV2Page productType="camp" productId={id} />;
}
