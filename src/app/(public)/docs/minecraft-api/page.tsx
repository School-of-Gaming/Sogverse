import type { Metadata } from "next";
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

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight">
        Minecraft Server API
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Use this endpoint to check whether a connecting player is allowed to join
        the Minecraft world. The server sends the player&apos;s Minecraft UUID
        and receives an allow/deny decision with session timing.
      </p>

      {/* Authentication */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Authentication</h2>
        <p className="mt-3 text-muted-foreground">
          All requests require a static API key passed as a Bearer token in the{" "}
          <Code>Authorization</Code> header.
        </p>
        <CodeBlock>{`Authorization: Bearer <MINECRAFT_SERVER_API_KEY>`}</CodeBlock>
        <p className="mt-3 text-sm text-muted-foreground">
          Contact the Sogverse team if you need a key or need it rotated.
        </p>
      </section>

      {/* Endpoint */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Endpoint</h2>
        <div className="mt-4">
          <CodeBlock>{`GET ${baseUrl}/api/minecraft/join-check?uuid=<minecraft-uuid>`}</CodeBlock>
        </div>

        <h3 className="mt-6 text-lg font-medium">Query Parameters</h3>
        <div className="mt-2">
          <Field name="uuid" type="string (required)">
            The player&apos;s Minecraft UUID. Both dashed
            (<Code>069a79f4-44e9-4726-a5be-fca90e38aaf5</Code>) and undashed
            (<Code>069a79f444e94726a5befca90e38aaf5</Code>) formats are accepted.
          </Field>
        </div>
      </section>

      {/* Responses */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Responses</h2>

        <div className="mt-6 space-y-6">
          {/* 200 Allowed */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <span className="rounded bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                  200
                </span>
                Player Allowed
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
                  Player has an active session right now.
                </Field>
                <Field name="role" type={`"gamer" | "gedu"`}>
                  The player&apos;s role in Sogverse.
                </Field>
                <Field name="displayName" type="string">
                  The player&apos;s display name.
                </Field>
                <Field name="endTime" type="ISO 8601 string">
                  When the session window closes (includes a 5-minute buffer
                  after the scheduled end). Use this to schedule a kick or
                  re-check.
                </Field>
                <Field name="reason" type="string">
                  Human-readable description: the product name and educator
                  name.
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
                Player Denied
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
                The player exists in Sogverse but has no active session right
                now. No <Code>endTime</Code> is included.
              </p>
            </CardContent>
          </Card>

          {/* Error responses */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Error Responses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  401
                </span>
                <p className="text-sm text-muted-foreground">
                  Missing, malformed, or invalid API key.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  400
                </span>
                <p className="text-sm text-muted-foreground">
                  Missing or invalid <Code>uuid</Code> query parameter.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  404
                </span>
                <p className="text-sm text-muted-foreground">
                  No Sogverse account linked to this Minecraft UUID.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                  500
                </span>
                <p className="text-sm text-muted-foreground">
                  Server error. Retry with backoff.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Example */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Example</h2>
        <div className="mt-4">
          <CodeBlock title="curl">{`curl -H "Authorization: Bearer <key>" \\
  "${baseUrl}/api/minecraft/join-check?uuid=069a79f4-44e9-4726-a5be-fca90e38aaf5"`}</CodeBlock>
        </div>
      </section>

      {/* Integration Notes */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold">Integration Notes</h2>
        <ul className="mt-4 list-inside list-disc space-y-3 text-muted-foreground">
          <li>
            Call this endpoint on every player join. Both gedus and gamers are
            session-gated &mdash; they can only join during their scheduled
            session window.
          </li>
          <li>
            The session window opens 5 minutes before the scheduled start and
            closes 5 minutes after the scheduled end.
          </li>
          <li>
            When <Code>allowed: true</Code>, use <Code>endTime</Code> to
            schedule a re-check or kick. If back-to-back sessions exist (e.g.
            one ends 14:00, next starts 14:05), the player gets kicked at the
            first session&apos;s end and rejoins for the next.
          </li>
          <li>
            A <Code>404</Code> means the player hasn&apos;t linked their
            Minecraft account in Sogverse yet. You can show them a message to
            link their account in their profile settings.
          </li>
          <li>
            All error responses follow the shape{" "}
            <Code>{`{ "error": "message" }`}</Code>.
          </li>
        </ul>
      </section>
    </div>
  );
}
