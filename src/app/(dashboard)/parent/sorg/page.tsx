import { getStripeProducts } from "@/lib/stripe/products";
import { CustomerSorgContent } from "./customer-sorg-content";

export default async function CustomerSorgPage() {
  const { oneTimePackages, subscriptionPackages } = await getStripeProducts();

  return (
    <CustomerSorgContent
      oneTimePackages={oneTimePackages}
      subscriptionPackages={subscriptionPackages}
    />
  );
}
