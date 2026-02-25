import type { Metadata } from "next";
import Link from "next/link";
import { Coins, Gamepad2, ClipboardList, ShoppingCart, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Parent Dashboard",
  description: "Manage your gamers and view your orders",
};

const quickActions = [
  {
    title: "My Gamers",
    description: "View and manage your linked gamer accounts",
    icon: Gamepad2,
    href: ROUTES.customer.gamers,
  },
  {
    title: "Sorg",
    description: "Balance, purchases, and transaction history",
    icon: Coins,
    href: ROUTES.customer.sorg,
  },
  {
    title: "Browse Products",
    description: "Explore products and enroll your gamers",
    icon: ShoppingCart,
    href: ROUTES.products,
  },
  {
    title: "My Enrollments",
    description: "View and manage your gamer enrollments",
    icon: ClipboardList,
    href: ROUTES.customer.enrollments,
  },
  {
    title: "Settings",
    description: "Update your account settings",
    icon: Settings,
    href: ROUTES.settings,
  },
];

export default function CustomerDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome to Sogverse!</h1>
        <p className="text-muted-foreground">
          Manage your gamer accounts and explore our educational gaming content.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href}>
            <Card className="group h-full transition-colors hover:bg-accent hover:text-accent-foreground">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <action.icon className="h-6 w-6 text-muted-foreground group-hover:text-accent-foreground/70" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{action.title}</CardTitle>
                    <CardDescription className="group-hover:text-accent-foreground/70">{action.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Here&apos;s how to get the most out of Sogverse
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              1
            </div>
            <div>
              <h3 className="font-medium">Get Sorgs</h3>
              <p className="text-sm text-muted-foreground">
                Purchase Sorg tokens to pay for your children&apos;s sessions.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              2
            </div>
            <div>
              <h3 className="font-medium">Browse &amp; Enroll</h3>
              <p className="text-sm text-muted-foreground">
                Find a product, create a gamer account, and enroll them in a group — all in one step.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              3
            </div>
            <div>
              <h3 className="font-medium">Let Them Play!</h3>
              <p className="text-sm text-muted-foreground">
                Your gamers log in with their username and join their sessions each week.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
