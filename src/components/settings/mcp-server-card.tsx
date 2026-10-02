"use client";

import { Check, Copy, Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

/**
 * The URL field's id. A named constant rather than a literal in the markup
 * because the literal-string lint reads JSX attributes and cannot tell a DOM id
 * apart from copy.
 */
const MCP_URL_FIELD_ID = "settings-mcp-server-url";

/**
 * **Where an admin finds the address to connect an AI app to, and nothing
 * more.** The URL is the whole of what any client needs: it registers itself,
 * sends the admin through sign-in and the consent page, and is done. So the card
 * gives the address and three generic steps, and deliberately no per-client
 * walkthrough — every AI app words its settings differently and changes them
 * often, and the app itself can explain its own screens better than a
 * paragraph here could, which is what the last step says.
 *
 * **`url` arrives whole from the route**, built there on the request's trusted
 * origin, so each environment shows its own endpoint and nothing here reads
 * `window.location`.
 */
export function McpServerCard({ url }: { url: string }) {
  const t = useTranslations("settings.mcp");
  const { copied, copy } = useCopyToClipboard();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          <CardTitle>{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label={t("urlLabel")} htmlFor={MCP_URL_FIELD_ID}>
          {/* `readOnly`, not `disabled`: the address is there to be selected
              and copied by hand too, and a disabled input is skipped by the
              keyboard and cannot be selected. */}
          <div className="flex gap-2">
            <Input
              id={MCP_URL_FIELD_ID}
              value={url}
              readOnly
              className="bg-lifted font-mono"
            />
            {/* Both labels share one grid cell and the inactive one is hidden,
                so the button keeps the wider label's width and the field beside
                it does not move when it confirms. The icons are the same size. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => void copy(url)}
              className={cn("shrink-0", copied && "text-success")}
            >
              {copied ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              <span className="grid">
                <span
                  aria-hidden={copied}
                  className={cn("col-start-1 row-start-1", copied && "invisible")}
                >
                  {t("copy")}
                </span>
                <span
                  aria-hidden={!copied}
                  className={cn("col-start-1 row-start-1", !copied && "invisible")}
                >
                  {t("copied")}
                </span>
              </span>
            </Button>
          </div>
        </Field>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("steps.add")}</li>
          <li>{t("steps.signIn")}</li>
          <li>{t("steps.unsure")}</li>
        </ol>
      </CardContent>
    </Card>
  );
}
