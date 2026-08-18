import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MinecraftPasswordResetCard } from "@/components/tools/minecraft-password-reset-card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("adminTools"),
    description: "Platform operations tools",
  };
}

/**
 * Admin tools — the platform-operations jobs that belong to no one product.
 *
 * One card today: the Minecraft Education password reset, the same component
 * the gedu dashboard's Tools section renders. Admins reach it here because
 * they have a sidebar to reach it from; a gedu has one on their dashboard
 * because they do not.
 *
 * The container is `max-w-3xl` rather than the full width an admin surface may
 * use: this page is a form over a textarea and a list of one-line results, and
 * a line of text stretched across a 16:10 monitor is harder to read, not
 * easier. Width is there to be used by content that has width — tables,
 * columns, a reference rail — and a second column here would be an empty one.
 */
export default function AdminToolsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <MinecraftPasswordResetCard />
    </div>
  );
}
