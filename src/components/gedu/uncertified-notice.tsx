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
 * The card a gedu awaiting admin certification gets in place of a panel they
 * cannot use yet.
 *
 * The real boundary is server-side in every case (the route 403s); this only
 * explains why the affordance is not there, so an uncertified gedu is not left
 * clicking a button that fails.
 *
 * **The copy is a prop, not a lookup.** The shell knows what a
 * waiting-for-approval card looks like and nothing about what is behind it, so
 * whoever renders one names its strings. Today there is one caller and it
 * speaks for a whole section; the prop is what keeps a second one from having
 * to borrow the first one's sentence.
 */
export function UncertifiedNotice({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}

/**
 * The Tools section's notice — one for the section, not one per panel.
 *
 * Certification is a single fact about the account and it gates every tool in
 * the section at once, so the copy names what is waiting behind the heading
 * (a voice room, a password reset) in one sentence rather than repeating the
 * same explanation once per card.
 *
 * Sits in this module rather than under `components/tools/` because it is a
 * fact about the *gedu* — an account awaiting approval — and not about the
 * tools it stands in for.
 */
export function UncertifiedToolsNotice() {
  const t = useTranslations("tools.uncertified");
  return <UncertifiedNotice title={t("title")} body={t("body")} />;
}
