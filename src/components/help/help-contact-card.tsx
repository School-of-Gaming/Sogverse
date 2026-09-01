import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { SUPPORT_EMAIL } from "@/lib/constants";

/**
 * The support-email card, rendered identically in the parent and gedu Help &
 * feedback sections.
 *
 * **No variant prop, and the gamer section is why.** A child has no mailbox of
 * their own and the message form below already routes a reply to their parent,
 * so the honest answer for that surface is not a card in a different shape — it
 * is no card at all, and the gamer's section simply does not render this one. A
 * `showEmail={false}` prop would have put that decision inside a component that
 * cannot see who is reading.
 *
 * It exists at all because dashboards render no footer: on every public page
 * the support address is already in the footer, which is exactly why `/about`
 * carries no card like this one.
 */
export function HelpContactCard() {
  const t = useTranslations("helpSection.contact");

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start sm:gap-4">
        <Mail className="h-6 w-6 shrink-0 text-primary" aria-hidden />
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{t("heading")}</h3>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
          <p className="text-sm">
            {t("emailLabel")}{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-primary hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
