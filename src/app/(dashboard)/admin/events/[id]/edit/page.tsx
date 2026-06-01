import { EditProductPage } from "@/components/admin/products/edit-product-page";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditProductPage productType="event" productId={id} />;
}
