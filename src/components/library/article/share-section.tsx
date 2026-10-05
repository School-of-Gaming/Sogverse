"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Link as LinkIcon, Mail, Share2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildShareLinks } from "./share-links";
import { LinkedInMark, RedditMark, WhatsAppMark, XMark } from "./share-marks";

const SHARE_BUTTON = buttonVariants({ variant: "outline", size: "sm" });

/** How long "Link copied" stands before the button says "Copy link" again. */
const COPIED_MS = 2000;

/**
 * **Share this article** — one row of buttons at the article's end.
 *
 * The order runs from the most universal to the most particular: copying the
 * link works everywhere, WhatsApp is where a parent actually sends a link to
 * another parent, email is the one every reader has, and the three public
 * platforms follow. The device's own share sheet goes last, and that is
 * load-bearing: it exists only where the browser offers `navigator.share`, so
 * it is decided after mount, and a button that arrives late has to join the
 * end of the run where the row's slack is, never push the buttons already
 * painted along.
 *
 * Every platform is a plain link to its public share address, opening in a new
 * tab — no script of theirs runs here. Email is the exception to the new tab:
 * a `mailto:` hands off to the mail app, and a new tab for it is left behind
 * blank.
 */
export function ShareSection({ url, title }: { url: string; title: string }) {
  const t = useTranslations("library.article.share");
  const links = buildShareLinks({ url, title });
  const canShareNatively = useSyncExternalStore(
    subscribeToNothing,
    () => typeof navigator.share === "function",
    () => false,
  );

  const platforms = [
    { name: "WhatsApp", href: links.whatsapp, Mark: WhatsAppMark },
    { name: "LinkedIn", href: links.linkedin, Mark: LinkedInMark },
    { name: "X", href: links.x, Mark: XMark },
    { name: "Reddit", href: links.reddit, Mark: RedditMark },
  ] as const;
  const [whatsapp, ...publicPlatforms] = platforms;

  return (
    <section aria-labelledby="library-share-heading" className="mt-10">
      <h2 id="library-share-heading" className="text-lg font-semibold">
        {t("heading")}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        <li>
          <CopyLinkButton url={url} />
        </li>
        <li>
          <PlatformLink {...whatsapp} label={t("on", { platform: whatsapp.name })} />
        </li>
        <li>
          <a href={links.email} aria-label={t("byEmail")} className={SHARE_BUTTON}>
            <Mail aria-hidden />
            {t("email")}
          </a>
        </li>
        {publicPlatforms.map((platform) => (
          <li key={platform.name}>
            <PlatformLink
              {...platform}
              label={t("on", { platform: platform.name })}
            />
          </li>
        ))}
        {canShareNatively && (
          <li>
            <button
              type="button"
              className={SHARE_BUTTON}
              onClick={() => {
                // A reader closing the sheet rejects the promise; that is a
                // choice, not a failure, and there is nothing to report.
                navigator.share({ title, url }).catch(() => {});
              }}
            >
              <Share2 aria-hidden />
              {t("native")}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

function PlatformLink({
  name,
  href,
  Mark,
  label,
}: {
  name: string;
  href: string;
  Mark: typeof WhatsAppMark;
  /** "Share on WhatsApp (opens in a new tab)" — the visible name, and why. */
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={SHARE_BUTTON}
    >
      <Mark />
      {name}
    </a>
  );
}

/**
 * Copies the article's address and says so for a moment. Both labels sit in
 * the same grid cell with the idle one hidden, so the button is always as wide
 * as the longer of the two and nothing after it in the row moves when the
 * label changes. The confirmation is also spoken, through a status line a
 * screen reader announces.
 */
function CopyLinkButton({ url }: { url: string }) {
  const t = useTranslations("library.article.share");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard (an insecure origin, a denied permission): the label
      // simply never confirms, which is the truth.
      return;
    }
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return (
    <>
      <button type="button" className={SHARE_BUTTON} onClick={copy}>
        {copied ? <Check aria-hidden /> : <LinkIcon aria-hidden />}
        <span className="grid">
          <span
            className={cn("col-start-1 row-start-1", copied && "invisible")}
            aria-hidden={copied}
          >
            {t("copyLink")}
          </span>
          <span
            className={cn("col-start-1 row-start-1", !copied && "invisible")}
            aria-hidden={!copied}
          >
            {t("copied")}
          </span>
        </span>
      </button>
      {/* Outside the button, so its words are announced rather than folded
          into the button's own name. */}
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}

/** `navigator.share` never appears or vanishes during a page's life. */
function subscribeToNothing() {
  return () => {};
}
