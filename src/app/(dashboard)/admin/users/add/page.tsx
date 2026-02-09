"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Check } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateGedu } from "@/services/users";

const createGeduSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters").optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default function AddUserPage() {
  const createGedu = useCreateGedu();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const validatedData = createGeduSchema.parse({ displayName, email, password });

      await createGedu.mutateAsync({
        email: validatedData.email,
        password: validatedData.password,
        displayName: validatedData.displayName || undefined,
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
            <h3 className="mt-4 text-lg font-medium">Account Created!</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              A gedu account has been created for <strong>{email}</strong>.
              They can sign in with the email and password you provided.
            </p>
            <div className="mt-6 flex gap-4">
              <Link href="/admin/users">
                <Button variant="outline">View All Users</Button>
              </Link>
              <Button onClick={() => {
                setSuccess(false);
                setDisplayName("");
                setEmail("");
                setPassword("");
              }}>
                Add Another
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
        <Link href="/admin/users">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Add Game Educator</h1>
          <p className="text-muted-foreground">
            Create an account for a new game educator
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <UserPlus className="h-6 w-6 text-secondary-foreground" />
            </div>
            <div>
              <CardTitle>New Gedu Account</CardTitle>
              <CardDescription>
                The educator can change their password and display name after signing in
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
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Jane Doe"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={createGedu.isPending}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="educator@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={createGedu.isPending}
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Temporary Password</Label>
              <Input
                id="password"
                type="text"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={createGedu.isPending}
                required
                autoComplete="off"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={createGedu.isPending}
            >
              {createGedu.isPending ? "Creating Account..." : "Create Account"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
