"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GroupCard } from "@/components/ui/group-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GamerCard } from "@/components/customer/gamer-card";
import { useMyGamers } from "@/services/gamers";
import { useMyGroups } from "@/services/groups";
import { useGroupsWithVoice } from "@/hooks/use-groups-page";
import { formatRelativeTime, formatScheduleLocal } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { ROUTES } from "@/lib/constants";

export default function CustomerGamersPage() {
  const { data: gamers, isLoading: gamersLoading, error: gamersError } = useMyGamers();
  const { groups, isLoading: groupsLoading, error: groupsError } = useGroupsWithVoice(useMyGroups());
  const { locale } = useCurrency();
  const [showJoinAlert, setShowJoinAlert] = useState(false);

  const isLoading = gamersLoading || groupsLoading;

  // Build a map of gamerId → groups that gamer is enrolled in
  const groupsByGamer = useMemo(() => {
    const map = new Map<string, typeof groups>();
    if (!gamers) return map;

    for (const gamer of gamers) {
      const gamerGroups = groups.filter((g) =>
        g.gamers.some((gg) => gg.gamerId === gamer.id),
      );
      map.set(gamer.id, gamerGroups);
    }
    return map;
  }, [gamers, groups]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Gamers</h1>
          <p className="text-muted-foreground">
            View and manage your gamers and their enrollments
          </p>
        </div>
        <Link href={ROUTES.products}>
          <Button>
            Browse Products
          </Button>
        </Link>
      </div>

      {(gamersError || groupsError) ? (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {gamersError?.message || groupsError?.message || "Failed to load data"}
        </div>
      ) : isLoading ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-3">
              <Card className="animate-pulse">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-md bg-muted" />
                    <div className="space-y-2">
                      <div className="h-4 w-24 rounded bg-muted" />
                      <div className="h-3 w-16 rounded bg-muted" />
                    </div>
                  </div>
                </CardHeader>
              </Card>
              <div className="h-28 animate-pulse rounded-lg bg-muted" />
            </div>
          ))}
        </div>
      ) : gamers && gamers.length > 0 ? (
        <div className="space-y-8">
          {gamers.map((gamer) => {
            const gamerGroups = groupsByGamer.get(gamer.id) ?? [];

            return (
              <section key={gamer.id} className="space-y-4">
                {/* Gamer header card */}
                <Link href={`${ROUTES.customer.gamers}/${gamer.id}`} className="block">
                  <GamerCard
                    id={gamer.id}
                    displayName={gamer.display_name}
                    username={gamer.username}
                    subtitle={`Joined ${formatRelativeTime(gamer.created_at, locale)}`}
                  />
                </Link>

                {/* Group cards (sorted live-first by useGroupsWithVoice) */}
                {gamerGroups.length > 0 ? (
                  <div className="space-y-3 pl-4">
                    {gamerGroups.map((group) => (
                      <GroupCardForCustomer
                        key={group.groupId}
                        group={group}
                        gamerId={gamer.id}
                        locale={locale}
                        onJoinClick={() => setShowJoinAlert(true)}
                      />
                    ))}
                  </div>
                ) : (
                  <Card className="ml-4">
                    <CardContent className="py-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No active enrollments.{" "}
                        <Link
                          href={ROUTES.products}
                          className="font-medium text-primary hover:underline"
                        >
                          Browse products
                        </Link>{" "}
                        to enroll this gamer.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gamepad2 className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No Gamers Yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Enroll in a product to create your first gamer account.
            </p>
            <Link href={ROUTES.products} className="mt-4">
              <Button>
                Browse Products
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Dialog open={showJoinAlert} onOpenChange={setShowJoinAlert}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Voice Chat Coming Soon</DialogTitle>
            <DialogDescription>
              Parent voice chat access is not yet available. Your gamer can join
              the session from their own account.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowJoinAlert(false)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupCardForCustomer({
  group,
  gamerId,
  locale,
  onJoinClick,
}: {
  group: import("@/hooks/use-groups-page").GroupWithVoice;
  gamerId: string;
  locale: string;
  onJoinClick: () => void;
}) {
  const schedule = useMemo(
    () => formatScheduleLocal(group.dayOfWeek, group.startTime, group.timezone, locale),
    [group.dayOfWeek, group.startTime, group.timezone, locale],
  );

  return (
    <GroupCard
      productName={group.productName}
      productImageUrl={group.productImageUrl}
      geduName={group.geduName}
      gamerCount={group.gamers.length}
      schedule={schedule}
      voiceIsOpen={group.voiceIsOpen}
      voiceNextSessionStart={group.voiceNextSessionStart}
      locale={locale}
      onJoinClick={onJoinClick}
      detailHref={ROUTES.customer.group(group.groupId, gamerId)}
    />
  );
}
