import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { ResetPinForm } from "@/components/pin";
import { resolvePinResetToken } from "@/lib/pin-session-server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata("/reset-pin", await getLocale())),
    title: t("pages.resetPin"),
    description: t("descriptions.resetPin"),
  };
}

/**
 * The reset link carries the signed token as a `?token=` query param (built in
 * /api/auth/pin/forgot). Read AND validate it server-side, then pass both down
 * so the form renders its final state on the first frame — no client loading
 * flash, mirror of how the unlock page seeds `pin_is_set`.
 *
 * Validating here is what makes a dead link (expired, or already used — the
 * token is single-use) show the "link expired" notice immediately instead of
 * prompting for a PIN and then misreporting the server's rejection as a
 * mismatch. The same check guards the write in /api/auth/pin/reset, so this is
 * purely the UI gate and can't be trusted on its own.
 */
export default async function ResetPinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const tokenStr = typeof token === "string" ? token : null;
  const tokenValid = (await resolvePinResetToken(tokenStr)) !== null;
  return <ResetPinForm token={tokenStr} tokenValid={tokenValid} />;
}
