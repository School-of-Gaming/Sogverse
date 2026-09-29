"use client";

import { Button } from "@/components/ui/button";

/**
 * One-click sign-in as the rich seed's three people, for `next dev` against a
 * local Supabase stack. Developer chrome, not product copy: the labels are
 * literal English and never reach `messages/`.
 *
 * **The gate reads only values fixed at build time**, so Next inlines both and a
 * production build folds it to `false`, leaving the panel, the addresses and the
 * password unreferenced and dropped from the output — the smoke suite asserts
 * they are absent. The Supabase URL has to be written out as the literal
 * `process.env.NEXT_PUBLIC_SUPABASE_URL` for Next to inline it. A dev server
 * pointed at a remote database renders nothing, since these accounts exist only
 * where the rich seed ran.
 *
 * The buttons hand the pair straight to the form's own sign-in and never fill
 * the password form, which keeps the browser's password manager and its leaked
 * password warning out of it.
 */

/** Local stacks run on whatever port their worktree was given, so only the host counts. */
function isLoopback(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]";
  } catch {
    return false;
  }
}

const ENABLED =
  process.env.NODE_ENV === "development" &&
  isLoopback(process.env.NEXT_PUBLIC_SUPABASE_URL);

// Full literal addresses rather than a template over the role, so the smoke
// suite's scan of the production build has a real string to look for.
const SEED_ACCOUNTS = [
  { label: "admin", email: "admin@example.com" },
  { label: "gedu", email: "gedu@example.com" },
  { label: "parent", email: "parent@example.com" },
] as const;

const SEED_PASSWORD = "password";

const PANEL_LABEL = "Dev sign-in";

type DevSignInProps = {
  onSignIn: (email: string, password: string) => void;
  disabled: boolean;
};

function DevSignInPanel({ onSignIn, disabled }: DevSignInProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{PANEL_LABEL}</span>
      {SEED_ACCOUNTS.map(({ label, email }) => (
        <Button
          key={email}
          type="button"
          variant="outline"
          size="sm"
          title={email}
          disabled={disabled}
          onClick={() => onSignIn(email, SEED_PASSWORD)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export const DevSignIn: (props: DevSignInProps) => React.ReactNode = ENABLED
  ? DevSignInPanel
  : () => null;
