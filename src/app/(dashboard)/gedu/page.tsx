import type { Metadata } from "next";
import Link from "next/link";
import { Users, Gamepad2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Educator Dashboard",
  description: "Manage your groups and students",
};

const stats = [
  {
    title: "Groups",
    value: "--",
    description: "Assigned groups",
    icon: Users,
    href: "/gedu/groups",
  },
  {
    title: "Gamers",
    value: "--",
    description: "Enrolled gamers",
    icon: Gamepad2,
    href: "#",
  },
];

export default function GeduDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Educator Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your game educator portal. View your groups, students, and voice sessions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
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
          <CardDescription>Latest student activities</CardDescription>
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
