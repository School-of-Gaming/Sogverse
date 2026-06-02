import { type ReactNode } from "react";

/**
 * Terminal/info state shared across the PIN screens — the unlock gate's
 * "check your email", and reset's success / invalid-link states. Same floating,
 * card-less, centered column as the pad screens (PinEntry / PinSet) so every
 * PIN surface looks identical: an icon, a title + description, and one action.
 */
export function PinNotice({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      {icon}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
