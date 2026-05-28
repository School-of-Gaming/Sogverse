import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";

// Temporary diagnostic route to detect trailing-whitespace damage in env vars
// after re-uploading several values to Vercel as "sensitive". Returns ONLY
// metadata about each env var (length, first/last few chars masked, anomaly
// flags) — never the actual value. Admin-only. Delete after the audit is
// done.

const VARS_TO_AUDIT = [
  // Supabase
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  // Daily.co
  "NEXT_PUBLIC_DAILY_DOMAIN",
  "DAILY_API_KEY",
  // Stripe
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRODUCTS_WEBHOOK_SECRET",
  // Brevo
  "BREVO_API_KEY",
  // Minecraft
  "MINECRAFT_SERVER_API_KEY",
  // Discord
  "DISCORD_BOT_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_APPLICATION_ID",
  // Gemini
  "GEMINI_API_KEY",
  // Azure
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  // WhatsApp
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  // Google Sheets
  "GOOGLE_SHEETS_SPREADSHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  // Site
  "NEXT_PUBLIC_SITE_URL",
] as const;

function inspect(value: string | undefined) {
  if (value === undefined) {
    return { present: false } as const;
  }
  const flags: string[] = [];
  if (/\n/.test(value)) flags.push("CONTAINS_NEWLINE");
  if (/\r/.test(value)) flags.push("CONTAINS_CR");
  if (/^\s/.test(value)) flags.push("LEADING_WHITESPACE");
  if (/\s$/.test(value)) flags.push("TRAILING_WHITESPACE");
  // Use codePointAt to make non-ASCII chars (if any) safely renderable
  const firstThree = value.slice(0, 3);
  const lastThree = value.slice(-3);
  return {
    present: true,
    length: value.length,
    firstThree,
    lastThree,
    lastCharCode: value.length > 0 ? value.charCodeAt(value.length - 1) : null,
    flags,
  } as const;
}

export async function GET() {
  const result = await requireRole("admin", {
    forbiddenMessage: "Admin only",
  });
  if (result instanceof NextResponse) return result;

  const report = VARS_TO_AUDIT.map((key) => ({
    key,
    ...inspect(process.env[key]),
  }));

  return NextResponse.json({
    environment: process.env.VERCEL_ENV ?? "local",
    vercelUrl: process.env.VERCEL_URL ?? null,
    timestamp: new Date().toISOString(),
    vars: report,
  });
}
