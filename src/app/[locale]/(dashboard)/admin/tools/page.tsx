import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MinecraftPasswordResetCard } from "@/components/tools/minecraft-password-reset-card";
import { CreateInstantRoomCard } from "@/components/voice/instant/CreateInstantRoomCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("adminTools"),
    description: "Minecraft Education password resets and instant voice rooms",
  };
}

/**
 * Admin tools — the platform-operations jobs that belong to no one product.
 *
 * Two cards, the same two the gedu dashboard's Tools section renders and in the
 * same order: the Minecraft Education password reset, then the instant voice
 * room. The voice card had a sidebar entry and a page of its own until the
 * second tool arrived; keeping them apart would have meant a sidebar that grows
 * an entry per button, so they share one. Admins reach these from the sidebar; a
 * gedu gets them on their dashboard because they have no sidebar to reach them
 * with.
 *
 * The container is `max-w-3xl` rather than the full width an admin surface may
 * use: both cards are a control over a stack of one-line results, and a line of
 * text stretched across a 16:10 monitor is harder to read, not easier. Width is
 * there to be used by content that has width — tables, columns, a reference
 * rail — and a second column here would be an empty one. One cap for both, so
 * the two cards' edges line up rather than stepping in and out down the page.
 */
export default function AdminToolsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <MinecraftPasswordResetCard />
      <CreateInstantRoomCard />
    </div>
  );
}
