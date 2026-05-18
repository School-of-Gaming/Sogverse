"use client";

import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinButton } from "@/components/ui/join-button";

interface LoungeCardProps {
  name: string;
  description: string;
}

/**
 * Banner card for always-open voice lounges (Gedu Lounge, Admin Lounge).
 *
 * The Join button is rendered disabled — lounges rode on the v1 voice
 * room system (`voice_rooms` rows with `room_type = 'admin_only'` /
 * `'gedu_only'`) which has been deleted, and there is no v2 equivalent.
 * The cards stay visible for now per the TODO.md cleanup item ("Tear out
 * the v1 groups UI now that its voice surface is a no-op"); once the
 * surrounding pages are removed this component can go too.
 */
export function LoungeCard({ name, description }: LoungeCardProps) {
  const t = useTranslations('groups');

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mic className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium">{name}</p>
            <Badge variant="outline" className="text-xs">{t('alwaysOpen')}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <JoinButton onClick={() => {}} disabled />
      </CardContent>
    </Card>
  );
}
