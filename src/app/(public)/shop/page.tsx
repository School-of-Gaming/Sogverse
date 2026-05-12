import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("shop") };
}

export default function ShopPage() {
  const t = useTranslations("shop");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("intro")}</p>
      </div>
    </div>
  );
}
