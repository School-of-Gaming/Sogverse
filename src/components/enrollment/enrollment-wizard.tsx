"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Gamepad2, Plus, Users, ArrowLeft, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useAuth } from "@/providers";
import { useMyGamers } from "@/services/gamers";
import {
  useEnrollmentGroups,
  useEnrollGamer,
  type EnrollmentGroup,
} from "@/services/enrollments";
import { useTokenBalance } from "@/services/tokens";
import type { ProductWithGame } from "@/services/products/products.service";
import { ROUTES } from "@/lib/constants";
import { InlineGamerForm } from "./inline-gamer-form";

type Step = "select-gamer" | "create-gamer" | "select-group" | "confirm" | "success";

// Ordered steps for the progress indicator (create-gamer is treated as part of select-gamer)
const PROGRESS_STEPS = ["select-gamer", "select-group", "confirm"] as const;

interface EnrollmentWizardProps {
  product: ProductWithGame;
}

export function EnrollmentWizard({ product }: EnrollmentWizardProps) {
  const { user } = useAuth();
  const { data: gamers, isLoading: gamersLoading } = useMyGamers();
  const { data: groups, isLoading: groupsLoading } = useEnrollmentGroups(
    product.id,
  );
  const { data: balance } = useTokenBalance(user?.id ?? "");
  const enrollGamer = useEnrollGamer();

  const [step, setStep] = useState<Step>("select-gamer");
  const [selectedGamerId, setSelectedGamerId] = useState<string | null>(null);
  const [selectedGamerName, setSelectedGamerName] = useState<string | null>(
    null,
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [enrollResult, setEnrollResult] = useState<{
    enrollmentId: string;
    newBalance: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If customer has no gamers and we're on the select step, show creation instead
  const hasNoGamers = !gamersLoading && gamers && gamers.length === 0;
  const effectiveStep =
    step === "select-gamer" && hasNoGamers ? "create-gamer" : step;

  const selectedGroup = groups?.find((g) => g.groupId === selectedGroupId);
  const currentBalance = balance ?? 0;
  const hasEnoughTokens = currentBalance >= product.token_cost;

  const advanceAfterGamerSelect = (gamerId: string, gamerName: string) => {
    setSelectedGamerId(gamerId);
    setSelectedGamerName(gamerName);
    setError(null);
    if (groups && groups.length === 1) {
      setSelectedGroupId(groups[0].groupId);
      setStep("confirm");
    } else {
      setStep("select-group");
    }
  };

  const handleSelectGamer = (gamerId: string, displayName: string) => {
    advanceAfterGamerSelect(gamerId, displayName);
  };

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
    setError(null);
    setStep("confirm");
  };

  const handleGamerCreated = (gamerId: string, displayName: string) => {
    advanceAfterGamerSelect(gamerId, displayName);
  };

  const handleEnroll = async () => {
    if (!selectedGamerId || !selectedGroupId) return;
    setError(null);
    try {
      const result = await enrollGamer.mutateAsync({
        gamerId: selectedGamerId,
        groupId: selectedGroupId,
      });
      setEnrollResult(result);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll");
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === "create-gamer") {
      if (gamers && gamers.length > 0) {
        setStep("select-gamer");
      }
    } else if (step === "select-group") {
      setStep("select-gamer");
      setSelectedGamerId(null);
      setSelectedGamerName(null);
    } else if (step === "confirm") {
      if (groups && groups.length === 1) {
        setStep("select-gamer");
        setSelectedGamerId(null);
        setSelectedGamerName(null);
        setSelectedGroupId(null);
      } else {
        setStep("select-group");
        setSelectedGroupId(null);
      }
    }
  };

  // Which progress step is active (for indicator)
  const currentProgressIndex =
    effectiveStep === "create-gamer"
      ? 0
      : PROGRESS_STEPS.indexOf(effectiveStep as (typeof PROGRESS_STEPS)[number]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enroll Your Gamer</CardTitle>
        <CardDescription>
          {product.token_cost} Sorgs will be deducted for the upcoming session
        </CardDescription>

        {/* Progress indicator */}
        {effectiveStep !== "success" && (
          <div className="flex items-center gap-2 pt-2">
            {PROGRESS_STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    i <= currentProgressIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < currentProgressIndex ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </div>
                {i < PROGRESS_STEPS.length - 1 && (
                  <div
                    className={`h-0.5 w-8 ${
                      i < currentProgressIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Step: Select Gamer */}
        {effectiveStep === "select-gamer" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose which gamer to enroll:
            </p>

            {gamersLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded-md bg-muted"
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {gamers?.map((gamer) => (
                    <button
                      key={gamer.id}
                      onClick={() =>
                        handleSelectGamer(
                          gamer.id,
                          gamer.display_name ?? gamer.username ?? "Gamer",
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:border-primary hover:bg-accent"
                    >
                      <Avatar className="h-10 w-10">
                        <Identicon id={gamer.id} size={40} />
                      </Avatar>
                      <div>
                        <p className="font-medium">{gamer.display_name}</p>
                        <p className="text-sm text-muted-foreground">
                          @{gamer.username}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStep("create-gamer")}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Gamer
                </Button>
              </>
            )}
          </div>
        )}

        {/* Step: Create Gamer */}
        {effectiveStep === "create-gamer" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Create a new gamer account for your child
              </p>
            </div>
            <InlineGamerForm
              onSuccess={handleGamerCreated}
              onCancel={() => {
                if (gamers && gamers.length > 0) {
                  setStep("select-gamer");
                }
              }}
            />
          </div>
        )}

        {/* Step: Select Group */}
        {effectiveStep === "select-group" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Choose a group for{" "}
                <span className="font-medium text-foreground">
                  {selectedGamerName}
                </span>
                :
              </p>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="mr-1 h-3 w-3" />
                Back
              </Button>
            </div>

            {groupsLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-md bg-muted"
                  />
                ))}
              </div>
            ) : groups && groups.length > 0 ? (
              <div className="space-y-2">
                {groups.map((group) => (
                  <GroupCard
                    key={group.groupId}
                    group={group}
                    onSelect={() => handleSelectGroup(group.groupId)}
                  />
                ))}
              </div>
            ) : (
              <Alert>
                <AlertDescription>
                  No groups available for this product yet. Please try again
                  later.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Step: Confirm */}
        {effectiveStep === "confirm" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Enrollment Summary</p>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="mr-1 h-3 w-3" />
                Back
              </Button>
            </div>

            <div className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Gamer</span>
                <span className="font-medium">{selectedGamerName}</span>
              </div>
              {selectedGroup && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Gedu</span>
                  <span className="font-medium">
                    {selectedGroup.geduDisplayName}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Cost</span>
                <span className="font-bold text-primary">
                  {product.token_cost} Sorgs
                </span>
              </div>
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Balance</span>
                  <span>{currentBalance} Sorgs</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">After Enrollment</span>
                  <span
                    className={
                      hasEnoughTokens
                        ? "font-medium text-success"
                        : "font-medium text-destructive"
                    }
                  >
                    {currentBalance - product.token_cost} Sorgs
                  </span>
                </div>
              </div>
            </div>

            {!hasEnoughTokens && (
              <Alert variant="warning">
                <Coins className="h-4 w-4" />
                <AlertDescription>
                  You need {product.token_cost - currentBalance} more Sorg
                  {product.token_cost - currentBalance !== 1 ? "s" : ""} to
                  enroll.{" "}
                  <Link
                    href={ROUTES.customer.sorg}
                    className="font-medium underline"
                  >
                    Get more Sorgs
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              disabled={!hasEnoughTokens || enrollGamer.isPending}
              onClick={handleEnroll}
            >
              {enrollGamer.isPending ? "Enrolling..." : "Confirm Enrollment"}
            </Button>
          </div>
        )}

        {/* Step: Success */}
        {effectiveStep === "success" && (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-4 text-lg font-medium">Enrolled!</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong>{selectedGamerName}</strong> is now enrolled in{" "}
              <strong>{product.name}</strong>.
            </p>
            {enrollResult && (
              <p className="mt-1 text-sm text-muted-foreground">
                New balance: {enrollResult.newBalance} Sorgs
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <Link href={ROUTES.customer.enrollments}>
                <Button variant="outline">View My Enrollments</Button>
              </Link>
              <Link href={ROUTES.products}>
                <Button>Browse Products</Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GroupCard({
  group,
  onSelect,
}: {
  group: EnrollmentGroup;
  onSelect: () => void;
}) {
  const ageRange =
    group.minGamerAge != null && group.maxGamerAge != null
      ? group.minGamerAge === group.maxGamerAge
        ? `${group.minGamerAge}y`
        : `${group.minGamerAge}–${group.maxGamerAge}y`
      : null;

  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center justify-between rounded-md border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent"
    >
      <div>
        <p className="font-medium">{group.geduDisplayName}</p>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {group.gamerCount} gamer{group.gamerCount !== 1 ? "s" : ""}
          </span>
          {ageRange && <span>Ages {ageRange}</span>}
        </div>
      </div>
    </button>
  );
}
