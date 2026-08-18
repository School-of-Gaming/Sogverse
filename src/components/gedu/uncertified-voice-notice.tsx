import { useTranslations } from "next-intl";
import { UncertifiedNotice } from "./uncertified-notice";

/**
 * Shown in place of the instant-room create card while a gedu is awaiting admin
 * certification. The real boundary is server-side (the create route 403s); this
 * just explains why the button isn't here, so an uncertified gedu isn't left
 * clicking a button that fails.
 *
 * It sits in its own module so the dashboard's draft body can render it without
 * importing the live body — which would pull the live body's query-bound
 * sections along with it. The card itself is the shared awaiting-certification
 * shell beside it; only the two strings are voice's own.
 */
export function UncertifiedVoiceNotice() {
  const t = useTranslations("voice.instant.createPage");
  return (
    <UncertifiedNotice title={t("uncertifiedTitle")} body={t("uncertifiedBody")} />
  );
}
