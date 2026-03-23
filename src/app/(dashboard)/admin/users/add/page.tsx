"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Check } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCreateGedu } from "@/services/users";

const createGeduSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export default function AddUserPage() {
  const createGedu = useCreateGedu();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setWarning(null);

    try {
      const validatedData = createGeduSchema.parse({ email });

      const result = await createGedu.mutateAsync({
        email: validatedData.email,
      });

      if (result.warning) {
        setWarning(result.warning);
      }

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
            <h3 className="mt-4 text-lg font-medium">Invite Sent!</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              An invitation email has been sent to <strong>{email}</strong>.
            </p>
            {warning && (
              <p className="mt-2 text-center text-sm text-warning">
                {warning}
              </p>
            )}
            <div className="mt-6 flex gap-4">
              <Link href={ROUTES.admin.users}>
                <Button variant="outline">View All Users</Button>
              </Link>
              <Button onClick={() => {
                setSuccess(false);
                setEmail("");
                setWarning(null);
              }}>
                Invite Another
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
        <Link href={ROUTES.admin.users}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Invite a new Gedu</h1>
          <p className="text-muted-foreground">
            Send an invitation to a new Gedu
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
              <CardTitle>New Gedu Invitation</CardTitle>
              <CardDescription>
                The Gedu will receive an email to set up their account
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

            <Button
              type="submit"
              className="w-full"
              disabled={createGedu.isPending}
            >
              {createGedu.isPending ? "Sending Invite..." : "Send Invite"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
