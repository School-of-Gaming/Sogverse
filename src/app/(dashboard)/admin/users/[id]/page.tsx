"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { ArrowLeft, Coins, AlertTriangle, Users } from "lucide-react";
import { NavChevron } from "@/components/ui/nav-chevron";
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
import { GeduCoverageEditor } from "@/components/gedu/gedu-coverage-editor";
import { ROLE_BADGE_STYLES, ROLE_LABEL_KEYS } from "@/lib/constants";
import { formatCurrencyFromCents, formatDate } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import { useTokenRates } from "@/providers/token-rate-provider";

export default function AdminUserDetailPage() {
  const t = useTranslations('admin.users');
  const c = useTranslations('common');
  const params = useParams();
  const userId = params.id as string;
  const { currency } = useCurrency();
  const locale = useLocale();
  const { baseRates } = useTokenRates();

  const { data: profile, isLoading: profileLoading } = useProfile(userId);
  const { data: balance } = useTokenBalance(userId, profile?.role === "customer");
  const { data: transactions } = useTokenTransactions(userId);
  const adjustMutation = useAdjustTokens();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isCustomer = profile?.role === "customer";
  const isGamer = profile?.role === "gamer";
  const isGedu = profile?.role === "gedu";
  const { data: linkedGamers } = useLinkedGamers(isCustomer ? userId : "");
  const { data: linkedParents } = useLinkedParents(isGamer ? userId : "");
  const parsedAmount = parseInt(amount, 10);
  const isValidAmount = !isNaN(parsedAmount) && parsedAmount !== 0;
  const baseRate = baseRates[currency];
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
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={ROUTES.admin.users} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {t('backToUsers')}
        </Link>
        <p className="text-muted-foreground">{t('userNotFound')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={ROUTES.admin.users} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {t('backToUsers')}
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
              <Badge className={ROLE_BADGE_STYLES[profile.role]}>
                {c(ROLE_LABEL_KEYS[profile.role])}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {t('joined')} {profile.created_at ? formatDate(profile.created_at, locale) : t('unknown')}
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
              {isCustomer ? t('linkedGamers') : t('linkedParents')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isCustomer && linkedGamers && linkedGamers.length > 0 && (
              <div className="space-y-2">
                {linkedGamers.map((gamer) => (
                  <Link
                    key={gamer.id}
                    href={ROUTES.admin.user(gamer.id)}
                    className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <Identicon id={gamer.id} size={32} />
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {gamer.display_name || gamer.username || t('unnamedGamer')}
                        </p>
                        <p className="text-xs text-muted-foreground ">
                          {gamer.username}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGE_STYLES.gamer}>
                        {c("roleGamer")}
                      </Badge>
                      <NavChevron size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {isCustomer && (!linkedGamers || linkedGamers.length === 0) && (
              <p className="text-sm text-muted-foreground">{t('noConnectedGamers')}</p>
            )}
            {isGamer && linkedParents && linkedParents.length > 0 && (
              <div className="space-y-2">
                {linkedParents.map((parent) => (
                  <Link
                    key={parent.id}
                    href={ROUTES.admin.user(parent.id)}
                    className="group flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <Identicon id={parent.id} size={32} />
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {parent.display_name || parent.username || t('unnamedUser')}
                        </p>
                        <p className="text-xs text-muted-foreground ">
                          {parent.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={ROLE_BADGE_STYLES.customer}>
                        {c("roleParent")}
                      </Badge>
                      <NavChevron size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gedu coverage areas — substitute matching */}
      {isGedu && <GeduCoverageEditor geduId={userId} />}

      {/* Token Management (customers only) */}
      {isCustomer && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                {t('tokenBalance')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">{balance ?? 0}</span>
                <span className="text-muted-foreground">{c('sorgs')}</span>
              </div>

              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                <div className="flex items-center gap-2 text-sm text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  {t('tokenMonetaryWarning', { rate: formatCurrencyFromCents(baseRate, currency, locale) })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">{t('amountLabel')}</Label>
                  <Input
                    id="amount"
                    type="number"
                    placeholder={t('amountPlaceholder')}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason">{t('reasonLabel')}</Label>
                  <Input
                    id="reason"
                    placeholder={t('reasonPlaceholder')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>

              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!isValidAmount || !reason.trim()}
              >
                {t('adjustBalance')}
              </Button>

              {adjustMutation.isError && (
                <p className="text-sm text-destructive">
                  {adjustMutation.error.message || t('failedToAdjust')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle>{t('transactionHistory')}</CardTitle>
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
              {t('adjustDialogTitle', { action: parsedAmount > 0 ? t('add') : t('remove'), count: Math.abs(parsedAmount || 0) })}
            </DialogTitle>
            <DialogDescription>
              {t('adjustDialogDescription', {
                action: parsedAmount > 0 ? t('add') : t('remove'),
                count: Math.abs(parsedAmount || 0),
                direction: parsedAmount > 0 ? t('to') : t('from'),
                user: profile.display_name || profile.username || t('thisUser'),
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t('monetaryValue')}:</span>{" "}
              <span className="font-medium">{monetaryValue}</span>
            </p>
            <p>
              <span className="text-muted-foreground">{t('reasonLabel')}:</span>{" "}
              <span className="font-medium">{reason}</span>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {c('cancel')}
            </Button>
            <Button
              onClick={handleConfirmAdjust}
              disabled={adjustMutation.isPending}
            >
              {adjustMutation.isPending ? t('adjusting') : c('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
