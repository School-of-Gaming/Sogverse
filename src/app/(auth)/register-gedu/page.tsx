import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RegisterGeduForm } from "@/components/auth";
import { prefetchSpokenLanguages } from "@/services/users/users.prefetch";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("registerGedu"),
    description: "Create your Sogverse game educator account",
  };
}

/** `?redirect=` is read server-side — see the note on the register page. */
export default async function RegisterGeduPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[] }>;
}) {
  // Prefetch the spoken languages server-side so the checkboxes paint complete
  // on the first frame (layout-shift rule); the table is anon-readable, so this
  // works without a session. Coverage needs no prefetch: the field renders a
  // fixed-height, initially-empty chip box, and opening its dialog reads one
  // indexed level of the tree — nothing worth moving to the server.
  const [spokenLanguages, { redirect }] = await Promise.all([
    prefetchSpokenLanguages(),
    searchParams,
  ]);

  return (
    <RegisterGeduForm
      initialSpokenLanguages={spokenLanguages}
      redirect={typeof redirect === "string" ? redirect : null}
    />
  );
}
