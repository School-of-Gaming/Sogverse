import type { Metadata } from "next";
import Link from "next/link";
import { Users, GraduationCap, BookOpen, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Educator Dashboard",
  description: "Manage your students and courses",
};

const stats = [
  {
    title: "Students",
    value: "0",
    description: "Active students",
    icon: Users,
    href: "/gedu/students",
  },
  {
    title: "Courses",
    value: "0",
    description: "Active courses",
    icon: BookOpen,
    href: "/gedu/courses",
  },
  {
    title: "Completion Rate",
    value: "0%",
    description: "Average completion",
    icon: TrendingUp,
    href: "#",
  },
  {
    title: "Certifications",
    value: "0",
    description: "Issued this month",
    icon: GraduationCap,
    href: "#",
  },
];

export default function GeduDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Educator Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your game educator portal. Manage students, courses, and track progress.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.href}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common educator tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/gedu/students"
              className="block rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <h3 className="font-medium">View Students</h3>
              <p className="text-sm text-muted-foreground">
                Monitor student progress and achievements
              </p>
            </Link>
            <Link
              href="/gedu/courses"
              className="block rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <h3 className="font-medium">Manage Courses</h3>
              <p className="text-sm text-muted-foreground">
                Create and manage learning content
              </p>
            </Link>
          </CardContent>
        </Card>

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

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4">
          <p className="text-sm">
            <strong>Note:</strong> The educator features are currently in development.
            More functionality will be added soon, including course creation, student
            management, and progress tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
