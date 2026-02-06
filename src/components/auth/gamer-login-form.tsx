"use client";

import { useState } from "react";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { getClient } from "@/lib/supabase/client";
import { generateGamerEmail } from "@/lib/utils";

const gamerLoginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function GamerLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = getClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const validatedData = gamerLoginSchema.parse({ username, password });

      // Convert username to synthetic email
      const syntheticEmail = generateGamerEmail(validatedData.username);

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: validatedData.password,
      });

      if (signInError) {
        // Provide user-friendly error message
        if (signInError.message.includes("Invalid login credentials")) {
          setError("Incorrect username or password. Please try again.");
        } else {
          setError(signInError.message);
        }
        return;
      }

      if (data.user) {
        // Full page navigation so the root layout re-runs server-side
        // and hydrates AuthProvider with the correct initialProfile.
        window.location.href = "/gamer";
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError("An unexpected error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <div className="rounded-full bg-primary/10 p-3">
            <Gamepad2 className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl">Gamer Login</CardTitle>
        <CardDescription>
          Enter your username and password to start playing!
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Your secret password"
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
            {isLoading ? "Loading..." : "Start Playing!"}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            Need help? Ask your parent or guardian.
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                Not a gamer?
              </span>
            </div>
          </div>
          <Link href="/login" className="w-full">
            <Button variant="outline" type="button" className="w-full">
              Parent/Adult Login
            </Button>
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
