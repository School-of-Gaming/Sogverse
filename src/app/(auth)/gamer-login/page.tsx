import type { Metadata } from "next";
import { GamerLoginForm } from "@/components/auth";

export const metadata: Metadata = {
  title: "Gamer Login",
  description: "Sign in to your gamer account",
};

export default function GamerLoginPage() {
  return <GamerLoginForm />;
}
