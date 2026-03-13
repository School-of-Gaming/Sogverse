"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins, AlertTriangle, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useProfile } from "@/services/users";
import { useLinkedGamers, useLinkedParents } from "@/services/gamers";
import { useTokenBalance, useTokenTransactions, useAdjustTokens } from "@/services/tokens";
import { TransactionHistoryTable } from "@/components/tokens";
import { ROLE_BADGES, TOKEN_BASE_RATE } from "@/lib/constants";
import { formatCurrencyFromCents, formatDate } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const { currency, locale } = useCurrency();

  const { data: profile, isLoading: profileLoading } = useProfile(userId);
  const { data: balance } = useTokenBalance(userId, profile?.role === "customer");
  const { data: transactions } = useTokenTransactions(userId);
  const adjustMutation = useAdjustTokens();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isCustomer = profile?.role === "customer";
  const isGamer = profile?.role === "gamer";
  const { data: linkedGamers } = useLinkedGamers(isCustomer ? userId : "");
  const { data: linkedParents } = useLinkedParents(isGamer ? userId : "");
  const parsedAmount = parseInt(amount, 10);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount !== 0;
  const baseRate = TOKEN_BASE_RATE[currency];
  const monetaryValue = isValidAmount
    ? formatCurrencyFromCents(Math.abs(parsedAmount) * baseRate, currency, locale)
    : formatCurrencyFromCents(0, currency, locale);

  const handleConfirmAdjust = async () => {
    if (!isValidAmount || !reason.trim()) return;
    await adjustMutation.mutateAsync({
      userId,
      amount: parsedAmount,
      description: reason.trim(),
    });
    setAmount("");
    setReason("");
    setConfirmOpen(false);
  };

  if (profileLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <Link href="/admin/users" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </Link>

      {/* User Summary */}
      <Card>
        <CardContent className="flex items-center gap-6 pt-6">
          <Avatar className="h-16 w-16">
            <Identicon id={profile.id} size={64} />
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {profile.display_name}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground">
                {profile.email || profile.username}
              </p>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Badge className={ROLE_BADGES[profile.role].className}>
                {ROLE_BADGES[profile.role].label}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Joined {profile.created_at ? formatDate(profile.created_at, locale) : "Unknown"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Linked Accounts (customers → gamers, gamers → parents) */}
      {(isCustomer || isGamer) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {isCustomer ? "Linked Gamers" : "Linked Parents"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isCustomer && linkedGamers && linkedGamers.length > 0 && (
              <div className="space-y-2">
                {linkedGamers.map((gamer) => (
                  <Link
                    key={gamer.id}
                    href={`/admin/users/${gamer.id}`}
                    className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <Identicon id={gamer.id} size={32} />
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {gamer.display_name || gamer.username || "Unnamed Gamer"}
                        </p>
                        <p className="text-xs text-muted-foreground group-hover:text-accent-foreground/70">
                          {gamer.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGES.gamer.className}>
                        {ROLE_BADGES.gamer.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {isCustomer && (!linkedGamers || linkedGamers.length === 0) && (
              <p className="text-sm text-muted-foreground">No connected gamers</p>
            )}
            {isGamer && linkedParents && linkedParents.length > 0 && (
              <div className="space-y-2">
                {linkedParents.map((parent) => (
                  <Link
                    key={parent.id}
                    href={`/admin/users/${parent.id}`}
                    className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <Identicon id={parent.id} size={32} />
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {parent.display_name || parent.username || "Unnamed User"}
                        </p>
                        <p className="text-xs text-muted-foreground group-hover:text-accent-foreground/70">
                          {parent.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGES.customer.className}>
                        {ROLE_BADGES.customer.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-accent-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Token Management (customers only) */}
      {isCustomer && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                Token Balance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">{balance ?? 0}</span>
                <span className="text-muted-foreground">Sorgs</span>
              </div>

              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                <div className="flex items-center gap-2 text-sm text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  Tokens have monetary value ({formatCurrencyFromCents(baseRate, currency, locale)}/token). All changes are logged.
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (+ to add, - to remove)</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder="e.g. 10 or -5"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Input
                    id="reason"
                    placeholder="e.g. Refund for billing error"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!isValidAmount || !reason.trim()}
              >
                Adjust Balance
              </Button>

              {adjustMutation.isError && (
                <p className="text-sm text-destructive">
                  {adjustMutation.error.message || "Failed to adjust balance"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              <TransactionHistoryTable transactions={transactions} locale={locale} />
            </CardContent>
          </Card>
        </>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {parsedAmount > 0 ? "Add" : "Remove"} {Math.abs(parsedAmount || 0)} Sorgs
            </DialogTitle>
            <DialogDescription>
              {parsedAmount > 0 ? "Add" : "Remove"} {Math.abs(parsedAmount || 0)} Sorgs{" "}
              {parsedAmount > 0 ? "to" : "from"}{" "}
              {profile.display_name || profile.username || "this user"}&apos;s balance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Monetary value:</span>{" "}
              <span className="font-medium">{monetaryValue}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Reason:</span>{" "}
              <span className="font-medium">{reason}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAdjust}
              disabled={adjustMutation.isPending}
            >
              {adjustMutation.isPending ? "Adjusting..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
