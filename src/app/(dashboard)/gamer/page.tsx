import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { ROUTES } from "@/lib/constants";
import { YTY_ELEMENTS } from "@/lib/constants/yty";

export const metadata: Metadata = {
  title: "Gamer Home",
  description: "Your gamer dashboard in the Sogverse",
};

export default function GamerDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-primary">
          Welcome, Gamer!
        </h1>
        <p className="text-muted-foreground">
          Ready to play and learn?
        </p>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {YTY_ELEMENTS.map((el) => (
          <Card key={el.id} className={`bg-gradient-to-br ${el.color.bgGradient}`}>
            <CardHeader className="text-center pb-2">
              <el.icon className={`mx-auto h-8 w-8 ${el.color.accent}`} />
              <CardTitle className="text-base">{el.name}</CardTitle>
            </CardHeader>
            <CardContent className="text-center pt-0">
              <p className="text-3xl font-bold">0</p>
              <p className="text-xs text-muted-foreground">{el.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Link href={ROUTES.gamer.groups} className="block">
        <Card className="group cursor-pointer transition-colors hover:bg-muted/50">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">My Groups</p>
              <p className="text-sm text-muted-foreground">
                View your groups and upcoming voice sessions
              </p>
            </div>
            <NavChevron />
          </CardContent>
        </Card>
      </Link>

      <Card className="border-secondary/50 bg-secondary/5">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="text-4xl">🎮</div>
          <div>
            <h3 className="font-medium">Tip of the Day</h3>
            <p className="text-sm text-muted-foreground">
              By doing good things — learning new skills, making friends, and joining
              in — you earn Yty for yourself and for the Sogverse!
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
