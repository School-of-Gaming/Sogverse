import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("lynxApi"),
    robots: { index: false, follow: false },
  };
}

/** An inline machine value: a field name, an enum value, a literal. */
function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-lifted px-1.5 py-0.5 font-mono text-[0.9em]">
      {children}
    </code>
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
      <pre className="p-4 font-mono text-sm leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

/**
 * One row of a parameter or field table, ready to render: a literal name, a
 * literal type, and the one translated cell.
 *
 * `type` and `description` are both optional because the proposal leaves some
 * rows without one — a paging row has no single type, and a record's
 * `created_at`/`updated_at` need no gloss. An absent cell is left empty rather
 * than filled with invented copy.
 */
type Row = {
  name: string;
  type?: string;
  description?: React.ReactNode;
};

/** Column headers are furniture — the one place the house style keeps caps. */
const HEAD_CELL =
  "py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const BODY_CELL = "py-2.5 pr-4 align-top";

/**
 * Tables are the widest thing on the page, so each one carries its own
 * horizontal scroll: the document body never scrolls sideways on a phone.
 */
function RowTable({
  rows,
  nameHeading,
  typeHeading,
  descriptionHeading,
}: {
  rows: Row[];
  nameHeading: string;
  typeHeading: string;
  descriptionHeading: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={`${HEAD_CELL} w-[15rem]`}>
              {nameHeading}
            </th>
            <th scope="col" className={`${HEAD_CELL} w-[12rem]`}>
              {typeHeading}
            </th>
            <th scope="col" className={HEAD_CELL}>
              {descriptionHeading}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-b border-border last:border-0">
              <td className={BODY_CELL}>
                <Code>{row.name}</Code>
              </td>
              <td className={`${BODY_CELL} text-xs text-muted-foreground`}>
                {row.type ? <span className="font-mono">{row.type}</span> : null}
              </td>
              <td className={`${BODY_CELL} text-muted-foreground`}>
                {row.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-semibold">{children}</h2>;
}

/** A heading a reader scans for structure rather than reads as prose. */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="mt-16 scroll-mt-[calc(var(--header-height)+1rem)] first:mt-0"
    >
      {children}
    </section>
  );
}

/**
 * A resource: its method and path, what it is, how it is filtered, one example
 * record and the fields that record carries.
 *
 * Every resource is drawn by this one component so the reading order is the
 * same in all seven — an engineer who has read one knows where to look in the
 * next.
 */
function Resource({
  id,
  path,
  title,
  intro,
  params,
  example,
  exampleTitle,
  fields,
  note,
  labels,
}: {
  id: string;
  path: string;
  title: string;
  intro: React.ReactNode;
  params: Row[];
  example: string;
  exampleTitle: string;
  fields: Row[];
  note?: React.ReactNode;
  labels: {
    queryParameters: string;
    fields: string;
    columnName: string;
    columnType: string;
    columnDescription: string;
  };
}) {
  return (
    <Section id={id}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="font-mono">GET</Badge>
        <h2 className="break-all font-mono text-xl font-semibold">{path}</h2>
      </div>
      <p className="mt-2 text-muted-foreground">{title}</p>
      <p className="mt-4 max-w-3xl text-muted-foreground">{intro}</p>

      <SubHeading>{labels.queryParameters}</SubHeading>
      <div className="mt-2">
        <RowTable
          rows={params}
          nameHeading={labels.columnName}
          typeHeading={labels.columnType}
          descriptionHeading={labels.columnDescription}
        />
      </div>

      <div className="mt-8">
        <CodeBlock title={exampleTitle}>{example}</CodeBlock>
      </div>

      <SubHeading>{labels.fields}</SubHeading>
      <div className="mt-2">
        <RowTable
          rows={fields}
          nameHeading={labels.columnName}
          typeHeading={labels.columnType}
          descriptionHeading={labels.columnDescription}
        />
      </div>

      {note && (
        <p className="mt-6 max-w-3xl text-sm text-muted-foreground">{note}</p>
      )}
    </Section>
  );
}

/**
 * The machine-readable half of the reference, declared as data rather than as
 * JSX: a parameter's or a field's name and type are protocol literals, and the
 * only translated thing about a row is the sentence describing it, named here
 * by its message key under `docs.lynxApi`. Keeping it out of the markup is also
 * what keeps a page of literal field names honest under the no-literal-string
 * rule — nothing here is copy, so nothing here should look like copy.
 *
 * `as const` is load-bearing: it keeps every `key` a literal type, so the
 * compiler checks each one against the catalog at the point it is rendered.
 */
const PAGING_ROWS = [
  { name: "updated_since, limit, cursor", key: "common.seeConventions" },
] as const;

const PRODUCTS_PARAMS = [
  {
    name: "status",
    type: "pending | running | completed | cancelled",
    key: "resources.products.params.status",
  },
  {
    name: "updated_since",
    type: "ISO 8601",
    key: "common.seeConventions",
  },
  { name: "limit, cursor", key: "common.seeConventions" },
] as const;

const PRODUCTS_FIELDS = [
  { name: "id", type: "uuid", key: "resources.products.fields.id" },
  { name: "name", type: "object", key: "resources.products.fields.name" },
  {
    name: "type",
    type: "consumer_club | municipality_club | camp | event",
    key: "resources.products.fields.type",
  },
  {
    name: "delivery",
    type: "online | in_person",
    key: "resources.products.fields.delivery",
  },
  {
    name: "location",
    type: "object | null",
    key: "resources.products.fields.location",
  },
  { name: "status", type: "enum", key: "resources.products.fields.status" },
  {
    name: "start_date, end_date",
    type: "date | null",
    key: "resources.products.fields.dates",
  },
  {
    name: "timezone",
    type: "string",
    key: "resources.products.fields.timezone",
  },
  {
    name: "age_range",
    type: "object",
    key: "resources.products.fields.ageRange",
  },
  { name: "seats", type: "object", key: "resources.products.fields.seats" },
  {
    name: "registration_opens_at",
    type: "timestamp",
    key: "resources.products.fields.registrationOpensAt",
  },
  {
    name: "requires_creations",
    type: "boolean",
    key: "resources.products.fields.requiresCreations",
  },
  { name: "groups", type: "array", key: "resources.products.fields.groups" },
  { name: "created_at, updated_at", type: "timestamp" },
] as const;

const PARENTS_PARAMS = [
  {
    name: "marketing_consent",
    type: "granted",
    key: "resources.parents.params.marketingConsent",
  },
  {
    name: "utm_campaign",
    type: "string",
    key: "resources.parents.params.utmCampaign",
  },
  ...PAGING_ROWS,
] as const;

const PARENTS_FIELDS = [
  { name: "id", type: "uuid", key: "resources.parents.fields.id" },
  {
    name: "email",
    type: "string | null",
    key: "resources.parents.fields.email",
  },
  {
    name: "created_at",
    type: "timestamp",
    key: "resources.parents.fields.createdAt",
  },
  { name: "locale", type: "string", key: "resources.parents.fields.locale" },
  {
    name: "location",
    type: "object | null",
    key: "resources.parents.fields.location",
  },
  { name: "utm", type: "object", key: "resources.parents.fields.utm" },
  {
    name: "marketing_consent",
    type: "object | null",
    key: "resources.parents.fields.marketingConsent",
  },
  {
    name: "gamer_ids",
    type: "array",
    key: "resources.parents.fields.gamerIds",
  },
  {
    name: "updated_at",
    type: "timestamp",
    key: "resources.parents.fields.updatedAt",
  },
] as const;

const GAMERS_PARAMS = [
  { name: "parent_id", type: "uuid", key: "resources.gamers.params.parentId" },
  {
    name: "photo_consent",
    type: "granted",
    key: "resources.gamers.params.photoConsent",
  },
  {
    name: "roblox",
    type: "verified",
    key: "resources.gamers.params.roblox",
  },
  ...PAGING_ROWS,
] as const;

const GAMERS_FIELDS = [
  { name: "id", type: "uuid", key: "resources.gamers.fields.id" },
  {
    name: "parent_id",
    type: "uuid",
    key: "resources.gamers.fields.parentId",
  },
  {
    name: "created_at",
    type: "timestamp",
    key: "resources.gamers.fields.createdAt",
  },
  { name: "age", type: "integer", key: "resources.gamers.fields.age" },
  {
    name: "location",
    type: "object | null",
    key: "resources.gamers.fields.location",
  },
  {
    name: "roblox",
    type: "object | null",
    key: "resources.gamers.fields.roblox",
  },
  {
    name: "photo_consent",
    type: "object | null",
    key: "resources.gamers.fields.photoConsent",
  },
  { name: "updated_at", type: "timestamp" },
] as const;

const ENROLMENTS_PARAMS = [
  {
    name: "product_id",
    type: "uuid",
    key: "resources.enrolments.params.productId",
  },
  {
    name: "gamer_id",
    type: "uuid",
    key: "resources.enrolments.params.gamerId",
  },
  {
    name: "status",
    type: "active | waitlisted | completed",
    key: "resources.enrolments.params.status",
  },
  ...PAGING_ROWS,
] as const;

const ENROLMENTS_FIELDS = [
  { name: "id", type: "uuid", key: "resources.enrolments.fields.id" },
  {
    name: "product_id, group_id",
    type: "uuid",
    key: "resources.enrolments.fields.productGroupId",
  },
  {
    name: "gamer_id, parent_id",
    type: "uuid",
    key: "resources.enrolments.fields.gamerParentId",
  },
  {
    name: "status",
    type: "enum",
    key: "resources.enrolments.fields.status",
  },
  {
    name: "signed_up_at",
    type: "timestamp",
    key: "resources.enrolments.fields.signedUpAt",
  },
  {
    name: "group_joined_at",
    type: "timestamp | null",
    key: "resources.enrolments.fields.groupJoinedAt",
  },
  {
    name: "age_at_start",
    type: "integer | null",
    key: "resources.enrolments.fields.ageAtStart",
  },
  {
    name: "attendance",
    type: "object",
    key: "resources.enrolments.fields.attendance",
  },
  {
    name: "creations",
    type: "array",
    key: "resources.enrolments.fields.creations",
  },
  {
    name: "creations_updated_at",
    type: "timestamp | null",
    key: "resources.enrolments.fields.creationsUpdatedAt",
  },
  { name: "updated_at", type: "timestamp" },
] as const;

const SESSIONS_PARAMS = [
  {
    name: "product_id",
    type: "uuid",
    key: "resources.sessions.params.productId",
  },
  {
    name: "group_id",
    type: "uuid",
    key: "resources.sessions.params.groupId",
  },
  { name: "from, to", type: "date", key: "resources.sessions.params.fromTo" },
  ...PAGING_ROWS,
] as const;

const SESSIONS_FIELDS = [
  { name: "id", type: "uuid", key: "resources.sessions.fields.id" },
  {
    name: "product_id, group_id",
    type: "uuid",
    key: "resources.sessions.fields.productGroupId",
  },
  {
    name: "starts_at, ends_at",
    type: "timestamp",
    key: "resources.sessions.fields.times",
  },
  {
    name: "attendance",
    type: "array",
    key: "resources.sessions.fields.attendance",
  },
  {
    name: "photo_count",
    type: "integer",
    key: "resources.sessions.fields.photoCount",
  },
  { name: "updated_at", type: "timestamp" },
] as const;

const RESEARCH_PARAMS = [
  {
    name: "product_id",
    type: "uuid",
    key: "resources.robloxResearch.params.productId",
  },
  {
    name: "from, to",
    type: "date",
    key: "resources.robloxResearch.params.fromTo",
  },
  { name: "limit, cursor", key: "common.seeConventions" },
] as const;

const RESEARCH_FIELDS = [
  {
    name: "roblox_username, roblox_user_id",
    type: "string, integer | null",
    key: "resources.robloxResearch.fields.roblox",
  },
  {
    name: "country_code, city",
    type: "string",
    key: "resources.robloxResearch.fields.location",
  },
  {
    name: "age",
    type: "integer | null",
    key: "resources.robloxResearch.fields.age",
  },
  {
    name: "intervention_date",
    type: "date",
    key: "resources.robloxResearch.fields.interventionDate",
  },
  {
    name: "activity",
    type: "object",
    key: "resources.robloxResearch.fields.activity",
  },
  {
    name: "published_game_url",
    type: "string | null",
    key: "resources.robloxResearch.fields.publishedGameUrl",
  },
] as const;

const STATS_PARAMS = [
  { name: "from, to", type: "date", key: "resources.stats.params.fromTo" },
] as const;

const STATS_FIELDS = [
  {
    name: "totals.parents_created",
    type: "integer",
    key: "resources.stats.fields.parentsCreated",
  },
  {
    name: "totals.gamers_created",
    type: "integer",
    key: "resources.stats.fields.gamersCreated",
  },
  {
    name: "totals.enrolments",
    type: "integer",
    key: "resources.stats.fields.enrolments",
  },
  {
    name: "totals.attended",
    type: "integer",
    key: "resources.stats.fields.attended",
  },
  {
    name: "totals.games_published",
    type: "integer",
    key: "resources.stats.fields.gamesPublished",
  },
  {
    name: "by_product",
    type: "array",
    key: "resources.stats.fields.byProduct",
  },
  {
    name: "by_campaign",
    type: "array",
    key: "resources.stats.fields.byCampaign",
  },
] as const;

const ERROR_ROWS = [
  { code: "400", key: "errors.e400" },
  { code: "401", key: "errors.e401" },
  { code: "404", key: "errors.e404" },
  { code: "429", key: "errors.e429" },
  { code: "500", key: "errors.e500" },
] as const;

/** The resource paths, in the order the page and its contents rail read them. */
const RESOURCE_PATHS = {
  products: "/products",
  parents: "/parents",
  gamers: "/gamers",
  enrolments: "/enrolments",
  sessions: "/sessions",
  "roblox-research": "/roblox-research",
  stats: "/stats",
} as const;

const PRODUCTS_EXAMPLE = `{
  "id": "5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11",
  "name": { "en": "Roblox Creator Camp — Paris", "fr": "Camp Créateur Roblox — Paris" },
  "type": "camp",
  "delivery": "in_person",
  "location": { "city": "Paris", "country_code": "FR" },
  "status": "running",
  "start_date": "2026-10-19",
  "end_date": "2026-10-23",
  "timezone": "Europe/Paris",
  "age_range": { "min": 13, "max": 17 },
  "seats": { "capacity": 24, "active": 21, "waitlisted": 3 },
  "registration_opens_at": "2026-09-01T08:00:00Z",
  "requires_creations": true,
  "groups": [
    { "id": "0e2b6a7e-6d2a-4f6c-b3a1-3f1f9c8e5a21", "name": "Group A" }
  ],
  "created_at": "2026-08-20T09:12:44Z",
  "updated_at": "2026-09-14T16:03:10Z"
}`;

const PARENTS_EXAMPLE = `{
  "id": "9c3e2b4a-7f11-4d0e-8b6a-1a2b3c4d5e6f",
  "email": "parent@example.com",
  "created_at": "2026-09-02T18:41:07Z",
  "locale": "fr",
  "location": { "city": "Lyon", "country_code": "FR" },
  "utm": { "source": "lynx", "medium": "email", "campaign": "lynx-autumn-a" },
  "marketing_consent": { "granted": true, "updated_at": "2026-09-02T18:43:12Z" },
  "gamer_ids": ["b7d1c0e2-3a4f-4b5c-9d6e-7f8a9b0c1d2e"],
  "updated_at": "2026-09-02T18:43:12Z"
}`;

const GAMERS_EXAMPLE = `{
  "id": "b7d1c0e2-3a4f-4b5c-9d6e-7f8a9b0c1d2e",
  "parent_id": "9c3e2b4a-7f11-4d0e-8b6a-1a2b3c4d5e6f",
  "created_at": "2026-09-02T18:45:30Z",
  "age": 14,
  "location": { "city": "Lyon", "country_code": "FR" },
  "roblox": { "username": "builder_leo", "user_id": 1234567890, "verified": true },
  "photo_consent": { "granted": true, "updated_at": "2026-09-02T18:46:01Z" },
  "updated_at": "2026-09-10T12:00:00Z"
}`;

const ENROLMENTS_EXAMPLE = `{
  "id": "e4f5a6b7-c8d9-4e0f-a1b2-c3d4e5f6a7b8",
  "product_id": "5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11",
  "group_id": "0e2b6a7e-6d2a-4f6c-b3a1-3f1f9c8e5a21",
  "gamer_id": "b7d1c0e2-3a4f-4b5c-9d6e-7f8a9b0c1d2e",
  "parent_id": "9c3e2b4a-7f11-4d0e-8b6a-1a2b3c4d5e6f",
  "status": "active",
  "signed_up_at": "2026-09-02T18:47:15Z",
  "group_joined_at": "2026-09-05T09:30:00Z",
  "age_at_start": 14,
  "attendance": {
    "sessions_held": 5,
    "sessions_present": 4,
    "first_present_at": "2026-10-19T09:00:00Z",
    "last_present_at": "2026-10-23T09:00:00Z"
  },
  "creations": [
    { "title": "Obby Escape", "url": "https://www.roblox.com/games/123456789/Obby-Escape", "is_roblox_url": true }
  ],
  "creations_updated_at": "2026-10-23T12:10:00Z",
  "updated_at": "2026-10-23T12:10:00Z"
}`;

const SESSIONS_EXAMPLE = `{
  "id": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
  "product_id": "5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11",
  "group_id": "0e2b6a7e-6d2a-4f6c-b3a1-3f1f9c8e5a21",
  "starts_at": "2026-10-19T09:00:00Z",
  "ends_at": "2026-10-19T12:00:00Z",
  "attendance": [
    { "gamer_id": "b7d1c0e2-3a4f-4b5c-9d6e-7f8a9b0c1d2e", "status": "present" },
    { "gamer_id": "6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7a8b9c0", "status": "absent" }
  ],
  "photo_count": 3,
  "updated_at": "2026-10-19T12:30:00Z"
}`;

const RESEARCH_EXAMPLE = `{
  "roblox_username": "builder_leo",
  "roblox_user_id": 1234567890,
  "country_code": "FR",
  "city": "Lyon",
  "age": 14,
  "intervention_date": "2026-10-19",
  "activity": {
    "product_id": "5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11",
    "name": "Roblox Creator Camp — Paris",
    "type": "camp",
    "delivery": "in_person"
  },
  "published_game_url": "https://www.roblox.com/games/123456789/Obby-Escape"
}`;

const STATS_EXAMPLE = `{
  "range": { "from": null, "to": null },
  "totals": {
    "parents_created": 412,
    "gamers_created": 468,
    "enrolments": 503,
    "attended": 377,
    "games_published": 214
  },
  "by_product": [
    {
      "product_id": "5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11",
      "enrolments": 24,
      "attended": 21,
      "games_published": 17
    }
  ],
  "by_campaign": [
    { "utm_campaign": "lynx-autumn-a", "parents_created": 88, "gamers_created": 97, "enrolments": 101 },
    { "utm_campaign": null, "parents_created": 260, "gamers_created": 301, "enrolments": 322 }
  ]
}`;

const LIST_ENVELOPE = `{
  "data": [ … ],
  "next_cursor": "eyJ1cGRhdGVkX2F0IjoiMjAyNi0wOS0xNVQxMDowMDowMFoifQ"
}`;

const AUTH_HEADER = `Authorization: Bearer <LYNX_API_KEY>`;

const ERROR_SHAPE = `{ "error": { "code": "…", "message": "…" } }`;

export default function LynxApiDocsPage() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const t = useTranslations("docs.lynxApi");

  /**
   * Every prose string on this page may carry `<code>` spans, so one helper
   * renders them all rather than each call site restating the tag map.
   */
  const rich = (key: Parameters<typeof t.rich>[0]) =>
    t.rich(key, { code: (chunks) => <Code>{chunks}</Code> });

  /** Turns a declared row into a rendered one, resolving its message key. */
  const rows = <
    S extends {
      name: string;
      type?: string;
      key?: Parameters<typeof t.rich>[0];
    },
  >(
    specs: readonly S[]
  ): Row[] =>
    specs.map((spec) => ({
      name: spec.name,
      type: spec.type,
      description: spec.key ? rich(spec.key) : undefined,
    }));

  const apiBase = `${baseUrl}/api/partner/v1`;

  const labels = {
    queryParameters: t("common.queryParameters"),
    fields: t("common.fields"),
    columnName: t("common.columnName"),
    columnType: t("common.columnType"),
    columnDescription: t("common.columnDescription"),
  };

  const exampleRecord = t("common.exampleRecord");

  const contents: { id: string; label: React.ReactNode }[] = [
    { id: "scope", label: t("scope.heading") },
    { id: "authentication", label: t("authentication.heading") },
    { id: "conventions", label: t("conventions.heading") },
    ...Object.entries(RESOURCE_PATHS).map(([id, path]) => ({
      id,
      label: <span className="font-mono">{path}</span>,
    })),
    { id: "errors", label: t("errors.heading") },
    { id: "example", label: t("example.heading") },
    { id: "integration-notes", label: t("integrationNotes.heading") },
    { id: "not-included", label: t("notIncluded.heading") },
    { id: "later", label: t("later.heading") },
  ];

  return (
    <div className="container mx-auto max-w-6xl px-4 py-12">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t("lead")}</p>
        <Alert variant="warning" className="mt-6">
          <div>
            <AlertTitle>{t("proposal.title")}</AlertTitle>
            <AlertDescription className="mt-1">
              {t("proposal.body")}
            </AlertDescription>
          </div>
        </Alert>
      </header>

      <div className="mt-12 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        {/* On a wide screen this is a sticky rail beside the reference; at
            phone width it is simply the list the page opens with. */}
        <nav
          aria-label={t("contents.heading")}
          className="lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:max-h-[calc(100vh-var(--header-height)-3rem)] lg:self-start lg:overflow-y-auto"
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("contents.heading")}
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {contents.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block text-muted-foreground transition-colors hover:text-foreground"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 min-w-0 lg:mt-0">
          {/* Scope */}
          <Section id="scope">
            <SectionHeading>{t("scope.heading")}</SectionHeading>
            <div className="mt-4 max-w-3xl space-y-4 text-muted-foreground">
              <p>{t("scope.p1")}</p>
              <p>{t("scope.p2")}</p>
              <p>{t("scope.p3")}</p>
            </div>
          </Section>

          {/* Authentication */}
          <Section id="authentication">
            <SectionHeading>{t("authentication.heading")}</SectionHeading>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              {rich("authentication.description")}
            </p>
            <div className="mt-4">
              <CodeBlock>{AUTH_HEADER}</CodeBlock>
            </div>
            <p className="mt-4 max-w-3xl text-sm text-muted-foreground">
              {t("authentication.keyNote")}
            </p>
          </Section>

          {/* Conventions */}
          <Section id="conventions">
            <SectionHeading>{t("conventions.heading")}</SectionHeading>
            <div className="mt-4">
              <CodeBlock title={t("conventions.baseUrlLabel")}>
                {apiBase}
              </CodeBlock>
            </div>
            <ul className="mt-6 max-w-3xl list-disc space-y-3 pl-5 text-muted-foreground">
              <li>{rich("conventions.items.formats")}</li>
              <li>{rich("conventions.items.pagination")}</li>
              <li>{rich("conventions.items.updatedSince")}</li>
              <li>{rich("conventions.items.erasure")}</li>
              <li>{rich("conventions.items.consent")}</li>
              <li>
                {t("conventions.items.errors")} <Code>{ERROR_SHAPE}</Code>
              </li>
            </ul>
            <div className="mt-6">
              <CodeBlock title={t("conventions.envelopeTitle")}>
                {LIST_ENVELOPE}
              </CodeBlock>
            </div>
          </Section>

          {/* Resources */}
          <Resource
            id="products"
            path={RESOURCE_PATHS.products}
            title={t("resources.products.title")}
            intro={rich("resources.products.intro")}
            labels={labels}
            exampleTitle={exampleRecord}
            example={PRODUCTS_EXAMPLE}
            params={rows(PRODUCTS_PARAMS)}
            fields={rows(PRODUCTS_FIELDS)}
          />

          <Resource
            id="parents"
            path={RESOURCE_PATHS.parents}
            title={t("resources.parents.title")}
            intro={rich("resources.parents.intro")}
            labels={labels}
            exampleTitle={exampleRecord}
            example={PARENTS_EXAMPLE}
            params={rows(PARENTS_PARAMS)}
            fields={rows(PARENTS_FIELDS)}
          />

          <Resource
            id="gamers"
            path={RESOURCE_PATHS.gamers}
            title={t("resources.gamers.title")}
            intro={rich("resources.gamers.intro")}
            labels={labels}
            exampleTitle={exampleRecord}
            example={GAMERS_EXAMPLE}
            params={rows(GAMERS_PARAMS)}
            fields={rows(GAMERS_FIELDS)}
            note={t("resources.gamers.note")}
          />

          <Resource
            id="enrolments"
            path={RESOURCE_PATHS.enrolments}
            title={t("resources.enrolments.title")}
            intro={rich("resources.enrolments.intro")}
            labels={labels}
            exampleTitle={exampleRecord}
            example={ENROLMENTS_EXAMPLE}
            params={rows(ENROLMENTS_PARAMS)}
            fields={rows(ENROLMENTS_FIELDS)}
          />

          <Resource
            id="sessions"
            path={RESOURCE_PATHS.sessions}
            title={t("resources.sessions.title")}
            intro={rich("resources.sessions.intro")}
            labels={labels}
            exampleTitle={exampleRecord}
            example={SESSIONS_EXAMPLE}
            params={rows(SESSIONS_PARAMS)}
            fields={rows(SESSIONS_FIELDS)}
          />

          <Resource
            id="roblox-research"
            path={RESOURCE_PATHS["roblox-research"]}
            title={t("resources.robloxResearch.title")}
            intro={rich("resources.robloxResearch.intro")}
            labels={labels}
            exampleTitle={exampleRecord}
            example={RESEARCH_EXAMPLE}
            params={rows(RESEARCH_PARAMS)}
            fields={rows(RESEARCH_FIELDS)}
            note={rich("resources.robloxResearch.note")}
          />

          <Resource
            id="stats"
            path={RESOURCE_PATHS.stats}
            title={t("resources.stats.title")}
            intro={rich("resources.stats.intro")}
            labels={labels}
            exampleTitle={t("common.exampleResponse")}
            example={STATS_EXAMPLE}
            params={rows(STATS_PARAMS)}
            fields={rows(STATS_FIELDS)}
          />

          {/* Errors */}
          <Section id="errors">
            <SectionHeading>{t("errors.heading")}</SectionHeading>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className={`${HEAD_CELL} w-24`}>
                      {t("common.columnStatus")}
                    </th>
                    <th scope="col" className={HEAD_CELL}>
                      {t("common.columnMeaning")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ERROR_ROWS.map(({ code, key }) => (
                    <tr
                      key={code}
                      className="border-b border-border last:border-0"
                    >
                      <td className={BODY_CELL}>
                        <Code>{code}</Code>
                      </td>
                      <td className={`${BODY_CELL} text-muted-foreground`}>
                        {rich(key)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Example */}
          <Section id="example">
            <SectionHeading>{t("example.heading")}</SectionHeading>
            <div className="mt-4">
              {/* eslint-disable-next-line i18next/no-literal-string -- curl code sample; code is never translated */}
              <CodeBlock title="curl">{`curl -H "Authorization: Bearer <key>" \\
  "${apiBase}/enrolments?product_id=5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11&limit=100"`}</CodeBlock>
            </div>
          </Section>

          {/* Integration notes */}
          <Section id="integration-notes">
            <SectionHeading>{t("integrationNotes.heading")}</SectionHeading>
            <ul className="mt-4 max-w-3xl list-disc space-y-3 pl-5 text-muted-foreground">
              <li>{rich("integrationNotes.items.sync")}</li>
              <li>{rich("integrationNotes.items.join")}</li>
              <li>{rich("integrationNotes.items.consent")}</li>
              <li>{rich("integrationNotes.items.erasure")}</li>
              <li>{rich("integrationNotes.items.derived")}</li>
              <li>{rich("integrationNotes.items.readOnly")}</li>
            </ul>
          </Section>

          {/* Not included */}
          <Section id="not-included">
            <SectionHeading>{t("notIncluded.heading")}</SectionHeading>
            <ul className="mt-4 max-w-3xl list-disc space-y-3 pl-5 text-muted-foreground">
              <li>{rich("notIncluded.items.childIdentity")}</li>
              <li>{rich("notIncluded.items.parentContact")}</li>
              <li>{rich("notIncluded.items.feedback")}</li>
              <li>{rich("notIncluded.items.releases")}</li>
              <li>{rich("notIncluded.items.deliveryModel")}</li>
              <li>{rich("notIncluded.items.analytics")}</li>
            </ul>
          </Section>

          {/* Later */}
          <Section id="later">
            <SectionHeading>{t("later.heading")}</SectionHeading>
            <ul className="mt-4 max-w-3xl list-disc space-y-3 pl-5 text-muted-foreground">
              <li>{rich("later.items.photos")}</li>
              <li>{rich("later.items.satisfaction")}</li>
              <li>{rich("later.items.webhook")}</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
