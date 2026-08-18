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
 * **The copy is a prop, not a lookup.** Certification gates more than one thing
 * — creating a voice room, resetting Minecraft Education passwords — and a
 * shared notice that carried the voice wording under a Tools heading would be
 * telling the reader about the wrong feature. So the shell is shared and each
 * section names its own strings.
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
 * The Tools section's notice. Sits in this module rather than under
 * `components/tools/` because it is a fact about the *gedu* — an account
 * awaiting approval — and not about the tool it stands in for.
 */
export function UncertifiedToolsNotice() {
  const t = useTranslations("tools.uncertified");
  return <UncertifiedNotice title={t("title")} body={t("body")} />;
}
