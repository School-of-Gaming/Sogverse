import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new password for your Sogverse account",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
