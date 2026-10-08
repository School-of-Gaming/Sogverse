import type { Metadata } from "next";
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("minecraftApi"),
    robots: { index: false, follow: false },
  };
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-lifted px-1.5 py-0.5 text-sm">{children}</code>
  );
}

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-lifted">
      {title && (
        <div className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
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
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Code>{name}</Code>
        <span className="text-xs text-muted-foreground">{type}</span>
      </div>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

const ALLOWED_EXAMPLE = `{
  "allowed": true,
  "reason": "paid_enrollment",
  "message": "Allowed: Aino has a paid seat on Minecraft Java Club.",
  "gamers": [
    {
      "firstName": "Aino",
      "minecraftUsername": "AinoMC",
      "enrollments": [
        {
          "product": "Minecraft Java Club",
          "productType": "consumer_club",
          "billingMode": "paid",
          "startDate": "2026-09-01",
          "endDate": null,
          "qualifies": true
        }
      ]
    }
  ]
}`;

const DENIED_EXAMPLE = `{
  "allowed": false,
  "reason": "no_paid_enrollment",
  "message": "Denied: Eero has no current paid seat.",
  "gamers": [
    {
      "firstName": "Eero",
      "minecraftUsername": "EeroBuilds",
      "enrollments": [
        {
          "product": "Minecraft Club Espoo",
          "productType": "municipality_club",
          "billingMode": "external_contract",
          "startDate": "2026-08-17",
          "endDate": "2026-12-11",
          "qualifies": false
        }
      ]
    }
  ]
}`;

export default function MinecraftApiDocsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const t = useTranslations('docs.minecraftApi');
  const code = (chunks: React.ReactNode) => <Code>{chunks}</Code>;
  const codes = { code, code1: code, code2: code, code3: code };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        {t('title')}
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {t('description')}
      </p>

      {/* Who is let in */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('eligibility.heading')}</h2>
        <p className="mt-3 text-muted-foreground">{t('eligibility.intro')}</p>
        <ul className="mt-4 list-inside list-disc space-y-3 text-muted-foreground">
          <li>{t('eligibility.paidProducts')}</li>
          <li>{t('eligibility.notCounted')}</li>
          <li>{t('eligibility.current')}</li>
          <li>{t('eligibility.sharedAccounts')}</li>
          <li>{t('eligibility.gedus')}</li>
        </ul>
      </section>

      {/* Authentication */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('authentication.heading')}</h2>
        <p className="mt-3 text-muted-foreground">
          {t.rich('authentication.description', codes)}
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
            {t.rich('endpoint.uuidDescription', codes)}
          </Field>
        </div>
      </section>

      {/* Responses */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('responses.heading')}</h2>
        <p className="mt-3 text-muted-foreground">
          {t.rich('responses.intro', codes)}
        </p>

        <div className="mt-6 space-y-6">
          {/* 200 Allowed */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <span className="rounded border border-border px-2 py-0.5 text-xs font-semibold text-success">
                  200
                </span>
                {t('responses.playerAllowed')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock>{ALLOWED_EXAMPLE}</CodeBlock>
            </CardContent>
          </Card>

          {/* 200 Denied */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <span className="rounded border border-border px-2 py-0.5 text-xs font-semibold text-warning">
                  200
                </span>
                {t('responses.playerDenied')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CodeBlock>{DENIED_EXAMPLE}</CodeBlock>
              <p className="mt-4 text-sm text-muted-foreground">
                {t.rich('responses.deniedDescription', codes)}
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
                <span className="mt-0.5 shrink-0 rounded border border-border px-2 py-0.5 text-xs font-semibold text-destructive">
                  401
                </span>
                <p className="text-sm text-muted-foreground">
                  {t.rich('responses.error401', codes)}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded border border-border px-2 py-0.5 text-xs font-semibold text-destructive">
                  400
                </span>
                <p className="text-sm text-muted-foreground">
                  {t.rich('responses.error400', codes)}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded border border-border px-2 py-0.5 text-xs font-semibold text-destructive">
                  500
                </span>
                <p className="text-sm text-muted-foreground">
                  {t('responses.error500')}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {t.rich('responses.errorShape', codes)}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Field reference */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('fields.heading')}</h2>
        <div className="mt-2">
          <Field name="allowed" type="boolean">
            {t.rich('fields.allowed', codes)}
          </Field>
          <Field name="reason" type="string">
            {t('fields.reason')}
          </Field>
          <Field name="message" type="string">
            {t('fields.message')}
          </Field>
          <Field name="gamers" type="array">
            {t.rich('fields.gamers', codes)}
          </Field>
        </div>

        <h3 className="mt-6 text-lg font-medium">{t('fields.reasonsHeading')}</h3>
        <div className="mt-2">
          <Field name="paid_enrollment" type="allowed: true">
            {t('fields.reasons.paidEnrollment')}
          </Field>
          <Field name="no_linked_account" type="allowed: false">
            {t('fields.reasons.noLinkedAccount')}
          </Field>
          <Field name="no_linked_gamer" type="allowed: false">
            {t('fields.reasons.noLinkedGamer')}
          </Field>
          <Field name="no_paid_enrollment" type="allowed: false">
            {t('fields.reasons.noPaidEnrollment')}
          </Field>
        </div>

        <h3 className="mt-6 text-lg font-medium">{t('fields.gamerHeading')}</h3>
        <div className="mt-2">
          <Field name="firstName" type="string">
            {t('fields.gamer.firstName')}
          </Field>
          <Field name="minecraftUsername" type="string">
            {t('fields.gamer.minecraftUsername')}
          </Field>
          <Field name="enrollments" type="array">
            {t('fields.gamer.enrollments')}
          </Field>
        </div>

        <h3 className="mt-6 text-lg font-medium">{t('fields.enrollmentHeading')}</h3>
        <div className="mt-2">
          <Field name="product" type="string">
            {t('fields.enrollment.product')}
          </Field>
          <Field name="productType" type={`"consumer_club" | "municipality_club" | "camp" | "event"`}>
            {t('fields.enrollment.productType')}
          </Field>
          <Field name="billingMode" type={`"paid" | "free" | "external_contract"`}>
            {t('fields.enrollment.billingMode')}
          </Field>
          <Field name="startDate" type="YYYY-MM-DD">
            {t('fields.enrollment.startDate')}
          </Field>
          <Field name="endDate" type="YYYY-MM-DD | null">
            {t.rich('fields.enrollment.endDate', codes)}
          </Field>
          <Field name="qualifies" type="boolean">
            {t('fields.enrollment.qualifies')}
          </Field>
        </div>
      </section>

      {/* Example */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('example.heading')}</h2>
        <div className="mt-4">
          {/* eslint-disable-next-line i18next/no-literal-string -- curl code sample; code is never translated */}
          <CodeBlock title="curl">{`curl -H "Authorization: Bearer <key>" \\
  "${baseUrl}/api/minecraft/join-check?uuid=069a79f4-44e9-4726-a5be-fca90e38aaf5"`}</CodeBlock>
        </div>
      </section>

      {/* Integration notes */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">{t('integrationNotes.heading')}</h2>
        <ul className="mt-4 list-inside list-disc space-y-3 text-muted-foreground">
          <li>{t.rich('integrationNotes.branchOnAllowed', codes)}</li>
          <li>{t('integrationNotes.failClosed')}</li>
          <li>{t('integrationNotes.noLongCache')}</li>
          <li>{t.rich('integrationNotes.notLinked', codes)}</li>
          <li>{t('integrationNotes.keyServerSide')}</li>
        </ul>
      </section>
    </div>
  );
}
