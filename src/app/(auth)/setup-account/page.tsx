import type { Metadata } from "next";
import { SetupAccountForm } from "@/components/auth";

export const metadata: Metadata = {
  title: "Set Up Your Account",
  description: "Set up your Sogverse game educator account",
};

export default function SetupAccountPage() {
  return <SetupAccountForm />;
}
