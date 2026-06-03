import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ShopBrowse } from "@/components/public/products/shop-browse";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("shop") };
}

export default function ShopPage() {
  return <ShopBrowse />;
}
