"use client";

import { useState } from "react";
import { ClipboardList, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useMyEnrollments } from "@/services/enrollments";
import { EnrollmentCard } from "@/components/enrollment/enrollment-card";
import { ROUTES } from "@/lib/constants";

export default function CustomerEnrollmentsPage() {
  const { data: enrollments, isLoading } = useMyEnrollments();
  const [showInactive, setShowInactive] = useState(false);

  const active = enrollments?.filter((e) => e.status === "active") ?? [];
  const inactive = enrollments?.filter((e) => e.status !== "active") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Enrollments</h1>
        <p className="text-muted-foreground">
          Manage your gamers&apos; enrollments and upcoming sessions
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      ) : active.length === 0 && inactive.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ClipboardList className="h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No Enrollments Yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Browse products and enroll your gamers to get started.
            </p>
            <Link href={ROUTES.products} className="mt-4">
              <Button>Browse Products</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active enrollments */}
          {active.length > 0 ? (
            <div className="space-y-4">
              {active.map((enrollment) => (
                <EnrollmentCard
                  key={enrollment.enrollmentId}
                  enrollment={enrollment}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No active enrollments.{" "}
                  <Link
                    href={ROUTES.products}
                    className="font-medium text-primary hover:underline"
                  >
                    Browse products
                  </Link>{" "}
                  to enroll your gamers.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Inactive enrollments (collapsed) */}
          {inactive.length > 0 && (
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
                Past Enrollments ({inactive.length})
              </button>

              {showInactive && (
                <div className="mt-4 space-y-4">
                  {inactive.map((enrollment) => (
                    <EnrollmentCard
                      key={enrollment.enrollmentId}
                      enrollment={enrollment}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
