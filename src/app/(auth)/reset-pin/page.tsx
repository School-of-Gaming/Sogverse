import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPinForm } from "@/components/pin";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("resetPin"), description: "Set a new parent PIN for your Sogverse account" };
}

/**
 * The reset link carries the signed token as a `?token=` query param (built in
 * /api/auth/pin/forgot). Read it server-side and pass it down so the form
 * renders its final state on the first frame — no client loading flash, mirror
 * of how the unlock page seeds `pin_is_set`.
 */
export default async function ResetPinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ResetPinForm token={typeof token === "string" ? token : null} />;
}
