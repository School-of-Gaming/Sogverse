import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth";

export const metadata: Metadata = {
  title: "Create Account",
  description: "Create your Sogverse parent account",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="h-96 w-full max-w-md animate-pulse rounded-lg bg-card" />}>
      <RegisterForm />
    </Suspense>
  );
}
