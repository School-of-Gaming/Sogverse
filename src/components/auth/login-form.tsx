"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Users, Gamepad2, GraduationCap, ArrowLeft } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { generateGamerEmail, cn } from "@/lib/utils";
import { ROLE_DASHBOARD_PATHS, ROUTES, type UserRole } from "@/lib/constants";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";

type LoginRole = "customer" | "gamer" | "gedu";

const emailLoginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const gamerLoginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const ROLE_CONFIG: Record<LoginRole, {
  icon: typeof Users;
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  glow: string;
}> = {
  customer: {
    icon: Users,
    title: "Parent",
    subtitle: "Manage your gamers",
    description: "Sign in to manage purchases and gamer accounts",
    accent: "text-primary border-primary/30 bg-primary/5",
    glow: "hover:shadow-[0_0_20px_rgba(250,169,1,0.15)] hover:border-primary/60",
  },
  gedu: {
    icon: GraduationCap,
    title: "Gedu",
    subtitle: "Teach & inspire",
    description: "Sign in to access your teaching tools",
    accent: "text-primary border-primary/30 bg-gradient-to-r from-primary/5 to-secondary/5",
    glow: "hover:shadow-[0_0_20px_rgba(200,80,120,0.15)] hover:border-secondary/40",
  },
  gamer: {
    icon: Gamepad2,
    title: "Gamer",
    subtitle: "Start playing",
    description: "Sign in with your username to start playing",
    accent: "text-secondary border-secondary/30 bg-secondary/5",
    glow: "hover:shadow-[0_0_20px_rgba(143,0,226,0.15)] hover:border-secondary/60",
  },
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const { redirect, status, navigateAfterAuth } = useAuthRedirect();

  const initialRole = (() => {
    const param = searchParams.get("role");
    if (param && param in ROLE_CONFIG) return param as LoginRole;
    return null;
  })();

  const [selectedRole, setSelectedRole] = useState<LoginRole | null>(initialRole);
  // Tracks the last selected role so the form keeps showing it during the fade-out
  // instead of snapping to a fallback.
  const [displayRole, setDisplayRole] = useState<LoginRole>(initialRole ?? "customer");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = getClient();
  const isGamer = selectedRole === "gamer";

  const handleBack = () => {
    setSelectedRole(null);
    setEmail("");
    setUsername("");
    setPassword("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let loginEmail: string;

      if (isGamer) {
        const validated = gamerLoginSchema.parse({ username, password });
        loginEmail = generateGamerEmail(validated.username);
      } else {
        const validated = emailLoginSchema.parse({ email, password });
        loginEmail = validated.email;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (signInError) {
        if (isGamer && signInError.message.includes("Invalid login credentials")) {
          setError("Incorrect username or password. Please try again.");
        } else {
          setError(signInError.message);
        }
        setIsLoading(false);
        return;
      }

      if (data.user) {
        if (isGamer) {
          // Gamer always goes to gamer dashboard — no profile lookup needed
          window.location.href = ROUTES.gamer.dashboard;
          return;
        }

        // For other roles, fetch profile to determine dashboard
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.user.id)
          .single();

        const role = (profile as { role: UserRole } | null)?.role;
        const dashboardPath = role
          ? ROLE_DASHBOARD_PATHS[role]
          : ROUTES.customer.dashboard;

        // Full page navigation so the root layout re-runs server-side
        // and hydrates AuthProvider with the correct initialProfile.
        navigateAfterAuth(dashboardPath);
        return;
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("An unexpected error occurred");
      }
    }

    setIsLoading(false);
  };

  return (
    <div className="w-full max-w-lg">
      {/* Grid overlay: both views share the same cell so the container
           height is always the taller of the two — no layout shift. */}
      <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
        {/* View 1: Role Selection Grid */}
        <div
          className={cn(
            "transition-all duration-[2000ms]",
            selectedRole !== null
              ? "pointer-events-none scale-95 opacity-0"
              : "scale-100 opacity-100"
          )}
        >
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold">Welcome to Sogverse</h1>
              <p className="text-muted-foreground">Choose how you&apos;d like to sign in</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(Object.entries(ROLE_CONFIG) as [LoginRole, typeof ROLE_CONFIG[LoginRole]][]).map(
                ([role, config]) => {
                  const Icon = config.icon;
                  return (
                    <button
                      key={role}
                      onClick={() => { setSelectedRole(role); setDisplayRole(role); }}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-lg border p-5 text-center transition-all duration-200",
                        config.accent,
                        config.glow,
                      )}
                    >
                      <Icon className="h-8 w-8" />
                      <span className={cn(
                        "text-lg font-semibold",
                        role === "gamer" && "font-display"
                      )}>
                        {config.title}
                      </span>
                      <span className="text-xs text-muted-foreground">{config.subtitle}</span>
                    </button>
                  );
                }
              )}
            </div>

            <div className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href={redirect ? `${ROUTES.register}?redirect=${encodeURIComponent(redirect)}` : ROUTES.register}
                className="text-primary hover:underline"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>

        {/* View 2: Login Form */}
        <div
          className={cn(
            "transition-all duration-[2000ms]",
            selectedRole === null
              ? "pointer-events-none scale-95 opacity-0"
              : "scale-100 opacity-100"
          )}
        >
          {(() => {
            // Always render form content (using "customer" as default) so it
            // contributes height to the grid cell and prevents layout shift.
            const config = ROLE_CONFIG[displayRole];
            const Icon = config.icon;
            return (
              <Card className="w-full">
                <CardHeader className="space-y-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    className="w-fit -ml-2 mb-2 text-muted-foreground"
                    type="button"
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                  <div className="flex justify-center mb-2">
                    <div className={cn("rounded-full p-3", config.accent)}>
                      <Icon className="h-8 w-8" />
                    </div>
                  </div>
                  <CardTitle className={cn(
                    "text-2xl text-center",
                    isGamer && "font-display"
                  )}>
                    {config.title} Login
                  </CardTitle>
                  <CardDescription className="text-center">
                    {config.description}
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                  <CardContent className="space-y-4">
                    {error && (
                      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}
                    {isGamer ? (
                      <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          type="text"
                          placeholder="Your gaming username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          disabled={isLoading}
                          required
                          autoComplete="username"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={isLoading}
                          required
                          autoComplete="username"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        {!isGamer && (
                          <Link
                            href={ROUTES.forgotPassword}
                            className="text-sm text-primary hover:underline"
                          >
                            Forgot password?
                          </Link>
                        )}
                      </div>
                      <Input
                        id="password"
                        type="password"
                        placeholder={isGamer ? "Your secret password" : "Enter your password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        required
                        autoComplete="current-password"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col space-y-4">
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {status ?? (isLoading ? "Signing in..." : isGamer ? "Start Playing!" : "Sign In")}
                    </Button>
                    {isGamer ? (
                      <p className="text-center text-sm text-muted-foreground">
                        Need help? Ask your parent or guardian.
                      </p>
                    ) : (
                      <div className="text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{" "}
                        <Link
                          href={redirect ? `${ROUTES.register}?redirect=${encodeURIComponent(redirect)}` : ROUTES.register}
                          className="text-primary hover:underline"
                        >
                          Sign up
                        </Link>
                      </div>
                    )}
                  </CardFooter>
                </form>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
