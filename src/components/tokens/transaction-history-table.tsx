import { useTranslations } from "next-intl";
import { cn, formatDate } from "@/lib/utils";
import type { TokenTransaction } from "@/types";

interface TransactionHistoryTableProps {
  transactions: TokenTransaction[] | undefined;
  locale: string;
}

export function TransactionHistoryTable({ transactions, locale }: TransactionHistoryTableProps) {
  const t = useTranslations('tokens');

  if (!transactions || transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('transactions.empty')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">{t('transactions.date')}</th>
            <th className="pb-2 pr-4">{t('transactions.amount')}</th>
            <th className="pb-2 pr-4">{t('transactions.type')}</th>
            <th className="pb-2 pr-4">{t('transactions.description')}</th>
            <th className="pb-2">{t('transactions.balanceAfter')}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-border/50">
              <td className="py-2 pr-4 whitespace-nowrap">
                {formatDate(tx.created_at, locale, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td className={cn("py-2 pr-4 font-medium", tx.amount > 0 ? "text-success" : "text-destructive")}>
                {tx.amount > 0 ? "+" : ""}{tx.amount}
              </td>
              <td className="py-2 pr-4 capitalize">
                {tx.type.replaceAll("_", " ")}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">
                {tx.description}
              </td>
              <td className="py-2">{tx.balance_after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
