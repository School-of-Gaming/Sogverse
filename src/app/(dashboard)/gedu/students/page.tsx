import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Students",
  description: "View and manage your students",
};

export default function GeduStudentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Students</h1>
        <p className="text-muted-foreground">
          View and manage your students
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No Students Yet</h3>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Students will appear here when they enroll in your courses.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
