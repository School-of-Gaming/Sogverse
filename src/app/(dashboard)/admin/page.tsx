import type { Metadata } from "next";
import Link from "next/link";
import { Users, Package, TrendingUp, DollarSign } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Manage users, products, and system settings",
};

const stats = [
  {
    title: "Total Users",
    value: "0",
    description: "Active accounts",
    icon: Users,
    href: ROUTES.admin.users,
  },
  {
    title: "Products",
    value: "0",
    description: "Active products",
    icon: Package,
    href: ROUTES.admin.products,
  },
  {
    title: "Revenue",
    value: "$0",
    description: "This month",
    icon: DollarSign,
    href: "#",
  },
  {
    title: "Growth",
    value: "0%",
    description: "From last month",
    icon: TrendingUp,
    href: "#",
  },
];

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to the Sogverse admin panel. Manage users, products, and system settings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="group transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground group-hover:text-foreground/70">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest system events</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No recent activity to display.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
