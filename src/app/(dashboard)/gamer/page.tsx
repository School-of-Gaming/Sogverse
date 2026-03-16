import type { Metadata } from "next";
import Link from "next/link";
import { Users, Trophy, Star, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavChevron } from "@/components/ui/nav-chevron";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Gamer Home",
  description: "Your gaming dashboard",
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

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader className="text-center">
            <Trophy className="mx-auto h-8 w-8 text-secondary" />
            <CardTitle className="text-lg">Achievements</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-3xl font-bold">0</p>
            <p className="text-sm text-muted-foreground">Trophies earned</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary/10 to-secondary/5">
          <CardHeader className="text-center">
            <Star className="mx-auto h-8 w-8 text-secondary" />
            <CardTitle className="text-lg">Level</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-3xl font-bold">1</p>
            <p className="text-sm text-muted-foreground">Keep playing to level up!</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5">
          <CardHeader className="text-center">
            <Zap className="mx-auto h-8 w-8 text-success" />
            <CardTitle className="text-lg">XP Points</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-3xl font-bold">0</p>
            <p className="text-sm text-muted-foreground">Experience points</p>
          </CardContent>
        </Card>
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
              Learning is more fun when you play games! Keep exploring and earning achievements.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
