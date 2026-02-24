"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Coins, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
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
import { useTokenBalance, useTokenTransactions, useAdjustTokens } from "@/services/tokens";
import { TransactionHistoryTable } from "@/components/tokens";
import { ROLE_BADGES, TOKEN_BASE_RATE } from "@/lib/constants";
import { formatCurrencyFromCents } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.id as string;
  const { currency } = useCurrency();

  const { data: profile, isLoading: profileLoading } = useProfile(userId);
  const { data: balance } = useTokenBalance(userId, profile?.role === "customer");
  const { data: transactions } = useTokenTransactions(userId);
  const adjustMutation = useAdjustTokens();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isCustomer = profile?.role === "customer";
  const parsedAmount = parseInt(amount, 10);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount !== 0;
  const baseRate = TOKEN_BASE_RATE[currency];
  const monetaryValue = isValidAmount
    ? formatCurrencyFromCents(Math.abs(parsedAmount) * baseRate, currency)
    : formatCurrencyFromCents(0, currency);

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
            <AvatarImage src={profile.avatar_url || undefined} />
            <Identicon id={profile.id} size={64} />
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">
              {profile.display_name || profile.username || "Unnamed User"}
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
                Joined {profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "Unknown"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

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
                  Tokens have monetary value ({formatCurrencyFromCents(baseRate, currency)}/token). All changes are logged.
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
                  {adjustMutation.error?.message || "Failed to adjust balance"}
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
              <TransactionHistoryTable transactions={transactions} />
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
