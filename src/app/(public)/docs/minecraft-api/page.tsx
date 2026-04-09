import type { Metadata } from "next";
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Minecraft Server API",
  description: "API documentation for the Sogverse Minecraft server join-check endpoint.",
  robots: { index: false, follow: false },
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{children}</code>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-muted/50">
      {title && (
        <div className="border-b px-4 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <pre className="p-4 text-sm leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Field({
  name,
  type,
  children,
}: {
  name: string;
  type: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-0">
      <div className="flex items-baseline gap-2">
        <Code>{name}</Code>
        <span className="text-xs text-muted-foreground">{type}</span>
      </div>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

export default function MinecraftApiDocsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const t = useTranslations('docs.minecraftApi');

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        {t('title')}
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {t('description')}
      </p>

      {/* Authentication */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('authentication.heading')}</h2>
        <p className="mt-3 text-muted-foreground">
          {t.rich('authentication.description', {
            code: (chunks) => <Code>{chunks}</Code>,
          })}
        </p>
        <CodeBlock>{`Authorization: Bearer <MINECRAFT_SERVER_API_KEY>`}</CodeBlock>
        <p className="mt-3 text-sm text-muted-foreground">
          {t('authentication.contactNote')}
        </p>
      </section>

      {/* Endpoint */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('endpoint.heading')}</h2>
        <div className="mt-4">
          <CodeBlock>{`GET ${baseUrl}/api/minecraft/join-check?uuid=<minecraft-uuid>`}</CodeBlock>
        </div>

        <h3 className="mt-6 text-lg font-medium">{t('endpoint.queryParams')}</h3>
        <div className="mt-2">
          <Field name="uuid" type={t('endpoint.uuidType')}>
            {t.rich('endpoint.uuidDescription', {
              code1: (chunks) => <Code>{chunks}</Code>,
              code2: (chunks) => <Code>{chunks}</Code>,
            })}
          </Field>
        </div>
      </section>

      {/* Responses */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('responses.heading')}</h2>

        <div className="mt-6 space-y-6">
          {/* 200 Allowed */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  200
                </span>
                {t('responses.playerAllowed')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock>{`{
  "allowed": true,
  "role": "gamer",
  "displayName": "CoolKid",
  "endTime": "2026-03-19T15:05:00.000Z",
  "reason": "Intro to Redstone with GeduSteve"
}`}</CodeBlock>
              <div className="mt-4">
                <Field name="allowed" type="true">
                  {t('responses.fields.allowedTrue')}
                </Field>
                <Field name="role" type={`"gamer" | "gedu"`}>
                  {t('responses.fields.role')}
                </Field>
                <Field name="displayName" type="string">
                  {t('responses.fields.displayName')}
                </Field>
                <Field name="endTime" type="ISO 8601 string">
                  {t('responses.fields.endTime')}
                </Field>
                <Field name="reason" type="string">
                  {t('responses.fields.reason')}
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* 200 Denied */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <span className="rounded bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                  200
                </span>
                {t('responses.playerDenied')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock>{`{
  "allowed": false,
  "role": "gamer",
  "displayName": "CoolKid",
  "reason": "No active session"
}`}</CodeBlock>
              <p className="mt-4 text-sm text-muted-foreground">
                {t.rich('responses.deniedDescription', {
                  code: (chunks) => <Code>{chunks}</Code>,
                })}
              </p>
            </CardContent>
          </Card>

          {/* Error responses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('responses.errorResponses')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  401
                </span>
                <p className="text-sm text-muted-foreground">
                  {t('responses.error401')}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  400
                </span>
                <p className="text-sm text-muted-foreground">
                  {t.rich('responses.error400', {
                    code: (chunks) => <Code>{chunks}</Code>,
                  })}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  404
                </span>
                <p className="text-sm text-muted-foreground">
                  {t('responses.error404')}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  500
                </span>
                <p className="text-sm text-muted-foreground">
                  {t('responses.error500')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Example */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('example.heading')}</h2>
        <div className="mt-4">
          <CodeBlock title="curl">{`curl -H "Authorization: Bearer <key>" \\
  "${baseUrl}/api/minecraft/join-check?uuid=069a79f4-44e9-4726-a5be-fca90e38aaf5"`}</CodeBlock>
        </div>
      </section>

      {/* Integration Notes */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('integrationNotes.heading')}</h2>
        <ul className="mt-4 list-inside list-disc space-y-3 text-muted-foreground">
          <li>{t('integrationNotes.note1')}</li>
          <li>{t('integrationNotes.note2')}</li>
          <li>
            {t.rich('integrationNotes.note3', {
              code1: (chunks) => <Code>{chunks}</Code>,
              code2: (chunks) => <Code>{chunks}</Code>,
            })}
          </li>
          <li>
            {t.rich('integrationNotes.note4', {
              code: (chunks) => <Code>{chunks}</Code>,
            })}
          </li>
          <li>
            {t.rich('integrationNotes.note5', {
              code: (chunks) => <Code>{chunks}</Code>,
            })}
          </li>
        </ul>
      </section>
    </div>
  );
}
