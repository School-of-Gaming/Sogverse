"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { parseChatBody } from "./chat-body";
import type { ChatAccount } from "./types";

/**
 * A message body, with its mentions drawn as chips.
 *
 * **A chip renders from the token's id, not its text.** The stored token
 * carries a name so the sentence still reads wherever the body travels, but
 * whoever is on screen is looked up by id — so a person who changes their name
 * is named correctly in every message that ever mentioned them, and a token
 * naming somebody the reader's account list has never heard of still renders
 * as the words it carries rather than as nothing.
 *
 * **Emphasis is the whole of what a mention does to the reader.** No sound, no
 * badge, no out-of-room notification: the person named sees the message stand
 * out, and everybody else sees a chip. The standing-out is the bubble's job, a
 * level up — this component only draws the chip.
 */
export function ChatBodyText({
  body,
  accounts,
  className,
}: {
  body: string;
  /** Everyone the surface knows about, keyed by id. */
  accounts: ReadonlyMap<string, ChatAccount>;
  className?: string;
}) {
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parseChatBody(body).map((segment, index) =>
        segment.kind === "text" ? (
          <Fragment key={index}>{segment.text}</Fragment>
        ) : (
          <span
            key={index}
            // **Info, not primary** *(owner ruling)*. A mention is one concept
            // and wears one colour wherever it shows: the chip here and the
            // ring on a row that names the reader are the same token, so
            // learning it once is enough. Primary is the surface's own
            // emphasis — the sender's name, the jump flash — and a mention
            // borrowing it made "about you" and "this is ours" the same
            // colour.
            // The chip's ground is neutral and the colour is all in the ink:
            // a brand hue darkened into a ground is no longer that hue.
            className="rounded bg-muted px-1 font-medium text-info"
          >
            {`@${accounts.get(segment.id)?.name ?? segment.name}`}
          </span>
        ),
      )}
    </span>
  );
}
