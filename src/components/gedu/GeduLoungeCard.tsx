"use client";

import Link from "next/link";
import { Mic, PhoneCall } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AvailableVoiceRoomWithWindow } from "@/services/voice";

interface GeduLoungeCardProps {
  room: AvailableVoiceRoomWithWindow;
}

export function GeduLoungeCard({ room }: GeduLoungeCardProps) {
  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mic className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium">{room.name}</p>
            <Badge variant="outline" className="text-xs">Always Open</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Connect with other educators anytime
          </p>
        </div>
        <Link
          href={ROUTES.gedu.voice(room.id)}
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5 shrink-0")}
        >
          <PhoneCall className="h-4 w-4" />
          Join
        </Link>
      </CardContent>
    </Card>
  );
}
