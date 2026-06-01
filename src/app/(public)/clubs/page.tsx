import { ProductBrowsePage } from "@/components/public/products/product-browse-page";

// Browse: consumer clubs only (per redesign §7.3).
// Purchased: consumer + municipality clubs — a muni club registered via
// /registration shows up here so the parent has a single place to manage
// every club their kid is in.
export default function ClubsPage() {
  return (
    <ProductBrowsePage
      browseType="consumer_club"
      purchasedTypes={["consumer_club", "municipality_club"]}
    />
  );
}
