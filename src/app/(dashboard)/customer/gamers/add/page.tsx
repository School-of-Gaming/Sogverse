"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Gamepad2, Eye, EyeOff, Check } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/providers";
import { useCreateGamer } from "@/services/gamers";

const createGamerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores"
    ),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  displayName: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function AddGamerPage() {
  const { user } = useAuth();
  const createGamer = useCreateGamer();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const validatedData = createGamerSchema.parse({
        username,
        password,
        confirmPassword,
        displayName: displayName || undefined,
      });

      if (!user) {
        setError("You must be logged in to create a gamer account");
        return;
      }

      await createGamer.mutateAsync({
        parentId: user.id,
        input: {
          username: validatedData.username,
          password: validatedData.password,
          displayName: validatedData.displayName,
        },
      });

      setSuccess(true);
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred");
      }
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <Check className="h-8 w-8 text-success" />
            </div>
            <h3 className="mt-4 text-lg font-medium">Gamer Account Created!</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              <strong>{displayName || username}</strong> can now log in using their
              username and password at the Gamer Login page.
            </p>
            <div className="mt-6 flex gap-4">
              <Link href="/customer/gamers">
                <Button variant="outline">View All Gamers</Button>
              </Link>
              <Button onClick={() => {
                setSuccess(false);
                setUsername("");
                setPassword("");
                setConfirmPassword("");
                setDisplayName("");
              }}>
                Add Another Gamer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customer/gamers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add a Gamer</h1>
          <p className="text-muted-foreground">
            Create a new gamer account for your child
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Gamepad2 className="h-6 w-6 text-secondary-foreground" />
            </div>
            <div>
              <CardTitle>New Gamer Account</CardTitle>
              <CardDescription>
                Your child will use these credentials to log in
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name (Optional)</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="How their name appears in-game"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={createGamer.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Choose a unique username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={createGamer.isPending}
                required
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Letters, numbers, and underscores only
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={createGamer.isPending}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                At least 6 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Confirm the password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={createGamer.isPending}
                required
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={createGamer.isPending}
            >
              {createGamer.isPending ? "Creating..." : "Create Gamer Account"}
            </Button>
          </CardContent>
        </form>
      </Card>

      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Your child will use their username (not an email)
            to log in at the special Gamer Login page. Make sure they remember their
            password, or you can reset it from your dashboard.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
