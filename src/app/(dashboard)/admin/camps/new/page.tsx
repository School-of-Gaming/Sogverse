import { NewProductPage } from "@/components/admin/products/new-product-page";

export default async function NewCampPage({
  searchParams,
}: {
  searchParams: Promise<{ cloneFrom?: string | string[] }>;
}) {
  const { cloneFrom } = await searchParams;
  return (
    <NewProductPage
      productType="camp"
      cloneFrom={Array.isArray(cloneFrom) ? cloneFrom[0] : cloneFrom}
    />
  );
}
