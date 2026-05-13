import { User } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Avatar shown when the viewer is signed out (or, faded, while auth is still
 * resolving). Designed to share the exact same layout slot as the signed-in
 * Identicon so the navbar doesn't reflow when auth state changes.
 *
 * Decorative: the surrounding interactive element (a Link to /login or to the
 * dashboard) carries the accessible name.
 */
export function UnknownAvatar({
  faded = false,
  className,
}: {
  faded?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute inset-0 flex items-center justify-center bg-primary",
        faded && "opacity-40",
        className,
      )}
    >
      <User
        className="h-[62%] w-[62%] text-primary-foreground"
        strokeWidth={2}
      />
    </div>
  );
}
