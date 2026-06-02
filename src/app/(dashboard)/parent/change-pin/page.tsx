import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChangePinFlow } from "@/components/pin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("changePin") };
}

export default function ChangePinPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <ChangePinFlow />
    </div>
  );
}
