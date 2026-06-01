import { NewProductV2Page } from "@/components/admin/products-v2/new-product-v2-page";

export default async function NewConsumerClubPage({
  searchParams,
}: {
  searchParams: Promise<{ cloneFrom?: string | string[] }>;
}) {
  const { cloneFrom } = await searchParams;
  return (
    <NewProductV2Page
      productType="consumer_club"
      cloneFrom={Array.isArray(cloneFrom) ? cloneFrom[0] : cloneFrom}
    />
  );
}
