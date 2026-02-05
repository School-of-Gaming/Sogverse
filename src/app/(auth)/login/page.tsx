import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/components/auth";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Sogverse account",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96 w-full max-w-md animate-pulse rounded-lg bg-card" />}>
      <LoginForm />
    </Suspense>
  );
}
