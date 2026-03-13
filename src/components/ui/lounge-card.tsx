"use client";

import { Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JoinButton } from "@/components/ui/join-button";

interface LoungeCardProps {
  name: string;
  description: string;
  /** When null/undefined the join button shows a loading spinner. */
  joinHref?: string | null;
}

/**
 * Banner card for always-open voice lounges (Gedu Lounge, Admin Lounge, etc.).
 * Role-agnostic — the caller provides the name, description, and join route.
 */
export function LoungeCard({ name, description, joinHref }: LoungeCardProps) {
  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Mic className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium">{name}</p>
            <Badge variant="outline" className="text-xs">Always Open</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        </div>
        <JoinButton href={joinHref ?? ""} loading={!joinHref} />
      </CardContent>
    </Card>
  );
}
