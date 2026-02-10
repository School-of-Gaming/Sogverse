import type { Metadata } from "next";
import { ShoppingBag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Orders",
  description: "View your purchase history",
};

export default function CustomerOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-muted-foreground">
          View your purchase history and manage subscriptions
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ShoppingBag className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No Orders Yet</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            When you purchase products, they will appear here.
          </p>
          <Link href="/products" className="mt-4">
            <Button>Browse Products</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
