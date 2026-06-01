import { NewProductPage } from "@/components/admin/products/new-product-page";

export default async function NewConsumerClubPage({
  searchParams,
}: {
  searchParams: Promise<{ cloneFrom?: string | string[] }>;
}) {
  const { cloneFrom } = await searchParams;
  return (
    <NewProductPage
      productType="consumer_club"
      cloneFrom={Array.isArray(cloneFrom) ? cloneFrom[0] : cloneFrom}
    />
  );
}
