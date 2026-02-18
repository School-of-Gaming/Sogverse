import { cn } from "@/lib/utils";
import type { TokenTransaction } from "@/types";

interface TransactionHistoryTableProps {
  transactions: TokenTransaction[] | undefined;
}

export function TransactionHistoryTable({ transactions }: TransactionHistoryTableProps) {
  if (!transactions || transactions.length === 0) {
    return <p className="text-sm text-muted-foreground">No transactions yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">Date</th>
            <th className="pb-2 pr-4">Amount</th>
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">Description</th>
            <th className="pb-2">Balance After</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b border-border/50">
              <td className="py-2 pr-4 whitespace-nowrap">
                {new Date(tx.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </td>
              <td className={cn("py-2 pr-4 font-medium", tx.amount > 0 ? "text-green-400" : "text-red-400")}>
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
