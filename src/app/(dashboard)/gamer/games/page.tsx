import type { Metadata } from "next";
import { Gamepad2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "My Games",
  description: "View your games and learning content",
};

export default function GamerGamesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Games</h1>
        <p className="text-muted-foreground">
          All your games and learning content in one place
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Gamepad2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-medium">No Games Available</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Ask your parent to get you some awesome games!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
