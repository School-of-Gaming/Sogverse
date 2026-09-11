"use client";

import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * **What a child is told about photographs of them — a statement, never a
 * control.**
 *
 * The answer belongs to their parent: `set_gamer_photo_consent` is guard-first
 * on `assert_role('customer')` and refuses anyone else, so a checkbox here could
 * only ever be a box that fails on click. The card therefore renders no control
 * at all rather than a disabled one — a greyed tick invites a child to work out
 * how to un-grey it, while a sentence saying who decides is an answer they can
 * act on by asking their parent.
 *
 * **Both sentences state mechanisms.** Either way the child learns what actually
 * happens: that a Gedu asks them before taking a photo even when their parent
 * has said yes, or that a Gedu keeps them out of session photos and that only
 * their parent can change it. Neither says anything about how seriously we take
 * anything.
 *
 * **`granted` arrives as a prop, resolved by the route before the first byte.**
 * The two sentences are different lengths and wrap to different heights, so a
 * value that landed after paint would grow this card and push the security card
 * below it down. See the route for why that read is blocking rather than
 * reserved-for.
 */
export function GamerPhotoConsentNotice({ granted }: { granted: boolean }) {
  const t = useTranslations("settings.photoConsent");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {granted ? t("granted") : t("notGranted")}
        </p>
      </CardContent>
    </Card>
  );
}
