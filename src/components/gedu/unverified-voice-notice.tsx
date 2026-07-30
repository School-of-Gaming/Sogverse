import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shown in place of the instant-room create card while a gedu is awaiting admin
 * verification. The real boundary is server-side (the create route 403s); this
 * just explains why the button isn't here, so an unverified gedu isn't left
 * clicking a button that fails.
 *
 * It sits in its own module so the dashboard's draft body can render it without
 * importing the live body — which would pull the live body's query-bound
 * sections along with it.
 */
export function UnverifiedVoiceNotice() {
  const t = useTranslations("voice.instant.createPage");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          {t("unverifiedTitle")}
        </CardTitle>
        <CardDescription>{t("unverifiedBody")}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
