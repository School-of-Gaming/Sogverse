"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCHOOLS, getSchool } from "./_mock/data";

export default function RegistrationLandingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Enter the code your school sent you.");
      return;
    }
    if (!getSchool(normalized)) {
      setError(
        `We couldn't find a school with code "${normalized}". Double-check with your school.`,
      );
      return;
    }
    router.push(`/registration/${normalized}`);
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <MockupRibbon />

      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Register for your school&apos;s gaming club
        </h1>
        <p className="mt-4 text-muted-foreground sm:text-lg">
          Sogverse partners with schools across Finland to run after-school
          gaming clubs. Enter the code your school gave you to see the clubs
          available to your child.
        </p>
      </div>

      <Card className="mx-auto mt-10 max-w-md">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">School code</Label>
              <Input
                id="code"
                placeholder="e.g. TAPIOLA26"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError(null);
                }}
                autoFocus
                autoCapitalize="characters"
                className="text-lg uppercase tracking-wider"
              />
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your school code is in the letter or email from your school.
                </p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full">
              Find my school
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mx-auto mt-16 max-w-4xl">
        <h2 className="text-center text-xl font-semibold">How it works</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StepCard
            step="1"
            title="Find your school"
            body="Enter your school's code to see the clubs offered this term."
          />
          <StepCard
            step="2"
            title="Be ready when registration opens"
            body="Seats fill fast. Save your child ahead of time so you're ready the moment registration opens."
          />
          <StepCard
            step="3"
            title="Join the waitlist if full"
            body="We'll notify you by email or WhatsApp if a seat opens up."
          />
        </div>
      </div>

      <DevShortcut />
    </div>
  );
}

function StepCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {step}
        </div>
        <h3 className="mt-4 font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function MockupRibbon() {
  return (
    <div className="mx-auto mb-8 max-w-md rounded-md border border-dashed border-primary/50 bg-primary/10 px-4 py-2 text-center text-xs text-primary">
      Mockup · all data is fake · for product-team review
    </div>
  );
}

// Visible-only-in-mockup shortcut so the team can jump straight into a school
// without typing the code. Remove when we wire up the real flow.
function DevShortcut() {
  return (
    <div className="mx-auto mt-16 max-w-xl rounded-md border bg-muted/30 p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Demo shortcuts
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        (Product-team review only — will be removed before launch.)
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {SCHOOLS.map((s) => (
          <li key={s.code}>
            <a
              className="text-primary underline-offset-4 hover:underline"
              href={`/registration/${s.code}`}
            >
              {s.name} — {s.code}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
