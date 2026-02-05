import type { Metadata } from "next";
import { BookOpen, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Courses",
  description: "Manage your courses and learning content",
};

export default function GeduCoursesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Courses</h1>
          <p className="text-muted-foreground">
            Manage your courses and learning content
          </p>
        </div>
        <Button disabled>
          <Plus className="mr-2 h-4 w-4" />
          Create Course
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No Courses Yet</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Course creation is coming soon. You&apos;ll be able to create and manage
            educational gaming content.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
