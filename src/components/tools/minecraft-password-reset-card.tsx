"use client";

import { useTranslations } from "next-intl";
import { useResetMinecraftPasswords } from "@/services/minecraft-education";
import { MinecraftPasswordResetCardView } from "./minecraft-password-reset-card-view";

/**
 * Data half of the Minecraft Education password-reset tool: one mutation, and
 * nothing else. The markup lives in the view beside it, which takes the whole
 * panel state as props.
 *
 * **`isPending` is enough here, and the committing-boolean pattern is not
 * wanted.** That pattern exists for actions whose success path navigates or
 * swaps the panel out, where React Query flips `isPending` false a beat before
 * the page goes away and the button re-enables in the gap. Nothing navigates
 * here: the results land in the card the button sits in, and re-running the
 * same batch is a legitimate thing to want — a password that scrolled out of a
 * chat is reset again rather than recovered — so the button coming back is the
 * correct end state, not a race.
 */
export function MinecraftPasswordResetCard() {
  const t = useTranslations("tools.minecraftPasswordReset");
  const mutation = useResetMinecraftPasswords();

  return (
    <MinecraftPasswordResetCardView
      results={mutation.data ?? null}
      submitting={mutation.isPending}
      // The message off the wire is a server-side sentence in English (the role
      // gate's 403 text), so it is not shown; the reader gets the translated
      // "something went wrong" and the real one stays in the console.
      error={mutation.isError ? t("requestFailed") : null}
      onSubmit={(usernames) => mutation.mutate(usernames)}
    />
  );
}
