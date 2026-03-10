"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Gamepad2, Settings, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useMyGamers } from "@/services/gamers";
import { useMyEnrollments } from "@/services/enrollments";
import { EnrollmentCard } from "@/components/enrollment/enrollment-card";
import { formatRelativeTime } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { ROUTES } from "@/lib/constants";
import type { CustomerEnrollment } from "@/services/enrollments";

interface GamerEnrollments {
  active: CustomerEnrollment[];
  inactive: CustomerEnrollment[];
}

function GamerInactiveEnrollments({ enrollments }: { enrollments: CustomerEnrollment[] }) {
  const [showInactive, setShowInactive] = useState(false);

  if (enrollments.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setShowInactive(!showInactive)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {showInactive ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        Past Enrollments ({enrollments.length})
      </button>

      {showInactive && (
        <div className="mt-3 space-y-3">
          {enrollments.map((enrollment) => (
            <EnrollmentCard
              key={enrollment.enrollmentId}
              enrollment={enrollment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CustomerGamersPage() {
  const { data: gamers, isLoading: gamersLoading } = useMyGamers();
  const { data: enrollments, isLoading: enrollmentsLoading } = useMyEnrollments();
  const { locale } = useCurrency();

  const isLoading = gamersLoading || enrollmentsLoading;

  const enrollmentsByGamer = useMemo(() => {
    if (!enrollments) return new Map<string, GamerEnrollments>();

    const map = new Map<string, GamerEnrollments>();
    for (const enrollment of enrollments) {
      if (!map.has(enrollment.gamerId)) {
        map.set(enrollment.gamerId, { active: [], inactive: [] });
      }
      const group = map.get(enrollment.gamerId)!;
      if (enrollment.status === "active") {
        group.active.push(enrollment);
      } else {
        group.inactive.push(enrollment);
      }
    }
    return map;
  }, [enrollments]);

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

      {isLoading ? (
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
            const gamerEnrollments = enrollmentsByGamer.get(gamer.id);
            const activeEnrollments = gamerEnrollments?.active ?? [];
            const inactiveEnrollments = gamerEnrollments?.inactive ?? [];

            return (
              <section key={gamer.id} className="space-y-4">
                {/* Gamer header card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <Identicon id={gamer.id} size={48} />
                        </Avatar>
                        <div>
                          <CardTitle className="text-lg">
                            {gamer.display_name}
                          </CardTitle>
                          <CardDescription>@{gamer.username}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Joined {formatRelativeTime(gamer.created_at ?? new Date().toISOString(), locale)}
                        </span>
                        <Link href={`${ROUTES.customer.gamers}/${gamer.id}`}>
                          <Button variant="outline" size="sm">
                            <Settings className="mr-2 h-4 w-4" />
                            Manage
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Active enrollments */}
                {activeEnrollments.length > 0 ? (
                  <div className="space-y-3 pl-4">
                    {activeEnrollments.map((enrollment) => (
                      <EnrollmentCard
                        key={enrollment.enrollmentId}
                        enrollment={enrollment}
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

                {/* Inactive enrollments (collapsible) */}
                {inactiveEnrollments.length > 0 && (
                  <div className="pl-4">
                    <GamerInactiveEnrollments enrollments={inactiveEnrollments} />
                  </div>
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
    </div>
  );
}
