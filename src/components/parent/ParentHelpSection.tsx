"use client";

import { useTranslations } from "next-intl";
import { Mail, Pickaxe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORT_EMAIL } from "@/lib/constants";

const MINECRAFT_SERVERS = [
  { id: "fi", address: "fi.mc.sog.gg" },
  { id: "en", address: "en.mc.sog.gg" },
] as const;

const STEP_KEYS = ["install", "signIn", "addServer", "joinAtCampTime"] as const;

export function ParentHelpSection() {
  const t = useTranslations("parent.help");

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-start sm:gap-4">
          <Mail className="h-6 w-6 shrink-0 text-primary" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{t("contact.heading")}</h3>
            <p className="text-sm text-muted-foreground">{t("contact.body")}</p>
            <p className="text-sm">
              {t("contact.emailLabel")}{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-primary hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Pickaxe className="h-5 w-5 text-primary" />
            <CardTitle>{t("minecraft.heading")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("minecraft.intro")}</p>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {STEP_KEYS.map((key) => (
              <li key={key} className="space-y-1">
                <p className="font-medium">{t(`minecraft.steps.${key}.title`)}</p>
                {key === "addServer" ? (
                  <div className="space-y-2 text-muted-foreground">
                    <p>{t("minecraft.steps.addServer.body")}</p>
                    <ul className="space-y-1">
                      {MINECRAFT_SERVERS.map((server) => (
                        <li key={server.id} className="flex flex-wrap items-center gap-2">
                          <span>{t(`minecraft.servers.${server.id}`)}</span>
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                            {server.address}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    {t(`minecraft.steps.${key}.body`)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
