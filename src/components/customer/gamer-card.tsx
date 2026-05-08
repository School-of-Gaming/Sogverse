import { NavChevron } from "@/components/ui/nav-chevron";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";

interface GamerCardProps {
  id: string;
  firstName: string;
  username: string;
  /** Pre-formatted "Joined X ago" text, or any trailing label */
  subtitle?: string;
}

export function GamerCard({ id, firstName, username, subtitle }: GamerCardProps) {
  return (
    <Card className="group transition-colors hover:bg-accent hover:text-accent-foreground">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              <Identicon id={id} size={48} />
            </Avatar>
            <div>
              <CardTitle className="text-lg">{firstName}</CardTitle>
              <CardDescription>@{username}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {subtitle && (
              <span className="text-sm text-muted-foreground">{subtitle}</span>
            )}
            <NavChevron />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
