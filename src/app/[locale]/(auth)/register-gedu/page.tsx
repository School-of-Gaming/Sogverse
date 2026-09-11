import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { RegisterGeduForm } from "@/components/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata("/register-gedu", await getLocale())),
    title: t("pages.registerGedu"),
    description: t("descriptions.registerGedu"),
  };
}

/** `?redirect=` is read server-side — see the note on the register page. */
export default async function RegisterGeduPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  // Nothing here is prefetched. The language checkboxes enumerate the
  // `spoken_language` enum, a compile-time constant, so they paint complete on
  // the first frame with no read behind them. Coverage needs no prefetch
  // either: the field renders a fixed-height, initially-empty chip box, and
  // opening its dialog reads one indexed level of the tree.
  const { redirect } = await searchParams;

  return (
    <RegisterGeduForm
      redirect={typeof redirect === "string" ? redirect : null}
    />
  );
}
