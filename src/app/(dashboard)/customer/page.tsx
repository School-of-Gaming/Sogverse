import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2, ShoppingBag, UserPlus, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Parent Dashboard",
  description: "Manage your gamers and view your orders",
};

const quickActions = [
  {
    title: "My Gamers",
    description: "View and manage your linked gamer accounts",
    icon: Gamepad2,
    href: "/customer/gamers",
    variant: "default" as const,
  },
  {
    title: "Add Gamer",
    description: "Create a new gamer account for your child",
    icon: UserPlus,
    href: "/customer/gamers/add",
    variant: "outline" as const,
  },
  {
    title: "Orders",
    description: "View your purchase history",
    icon: ShoppingBag,
    href: "/customer/orders",
    variant: "outline" as const,
  },
  {
    title: "Settings",
    description: "Update your account settings",
    icon: Settings,
    href: "/settings",
    variant: "outline" as const,
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
              <h3 className="font-medium">Create Gamer Accounts</h3>
              <p className="text-sm text-muted-foreground">
                Set up accounts for your children with their own usernames and passwords.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              2
            </div>
            <div>
              <h3 className="font-medium">Explore Products</h3>
              <p className="text-sm text-muted-foreground">
                Browse our catalog of educational games and learning packs.
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
                Your gamers can log in with their username and start learning through play.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
