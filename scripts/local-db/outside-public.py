#!/usr/bin/env python3
"""Write the part of the schema that lives outside `public` as readable SQL.

Usage:
    outside-public.py <db-container> <out-dir>

`supabase/schema/` is a raw pg_dump of the `public` schema, so everything a
migration created anywhere else is missing from it: the extensions, the trigger
on `auth.users`, the RLS policies on `storage.objects`, the rows that define
storage buckets and cron jobs, and the membership of the `supabase_realtime`
publication. This script queries the catalog for exactly those classes and
renders each as the statements that would recreate it, one file per class:

    extensions.sql                CREATE EXTENSION
    auth-users-triggers.sql       CREATE TRIGGER, from pg_get_triggerdef
    storage-objects-policies.sql  CREATE POLICY, rebuilt from pg_policies
    storage-buckets.sql           INSERT ... ON CONFLICT DO NOTHING (rows)
    cron-jobs.sql                 SELECT cron.schedule(...) (rows)
    realtime-publication.sql      ALTER PUBLICATION ... ADD TABLE

Buckets and cron jobs are rows rather than DDL, which is why no dump of any
schema carries them; they are rendered as the statements that would put the
rows back.

WHAT IS LISTED IS EVERYTHING, not "ours". The catalog cannot say which extension
a migration installed and which the image was born with, and the attempt to
guess is what kept this content in migration history in the first place. So the
platform's own extensions and policies are listed alongside ours, and a CLI
version bump that changes them changes these files — which is exactly when they
should change, and CI's comparison is what says so.

Every query runs through `docker exec <container> psql` and returns a single
JSON document, so an expression holding newlines or quotes crosses the boundary
untouched; all rendering happens here, in one place, for both callers (the local
`generate` command and CI's schema-generation step).

Output is byte-deterministic: every listing is ordered in SQL, and files are
written with LF endings.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys

# Identifiers that have to be quoted to survive a round trip. The regex covers
# the shape rule; the list covers the words that look legal but are reserved.
# Both are deliberately conservative — quoting one identifier too many is
# harmless, and the alternative is carrying Postgres's whole keyword table.
SAFE_IDENT = re.compile(r"^[a-z_][a-z0-9_$]*$")
RESERVED = frozenset(
    """all analyse analyze and any array as asc asymmetric authorization binary both
    case cast check collate collation column concurrently constraint create cross
    current_catalog current_date current_role current_schema current_time
    current_timestamp current_user default deferrable desc distinct do else end except
    false fetch for foreign freeze from full grant group having ilike in initially
    inner intersect into is isnull join lateral leading left like limit localtime
    localtimestamp natural not notnull null offset on only or order outer overlaps
    placing primary references returning right select session_user similar some
    symmetric table tablesample then to trailing true union unique user using variadic
    verbose when where window with""".split()
)


class Failed(Exception):
    pass


def ident(name: str) -> str:
    if SAFE_IDENT.match(name) and name not in RESERVED:
        return name
    return '"%s"' % name.replace('"', '""')


def literal(text: str) -> str:
    # standard_conforming_strings is on, so a backslash is an ordinary
    # character and doubling the quote is the whole of the escaping.
    return "'%s'" % text.replace("'", "''")


def value(val: object) -> str:
    """One SQL literal for a JSON scalar or array out of the catalog."""
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "true" if val else "false"
    if isinstance(val, int):
        return str(val)
    if isinstance(val, float):
        return repr(val)
    if isinstance(val, list):
        if not val:
            return "'{}'::text[]"
        return "ARRAY[%s]" % ", ".join(literal(str(item)) for item in val)
    return literal(str(val))


def dollar_quote(body: str) -> str:
    """Dollar-quote a body whatever it holds, so nothing needs escaping."""
    tag = ""
    while ("$%s$" % tag) in body:
        tag += "q"
    return "$%s$%s$%s$" % (tag, body, tag)


def psql(container: str, sql: str) -> str:
    """Run one statement and hand back its single unaligned field."""
    proc = subprocess.run(
        [
            "docker",
            "exec",
            # An empty search_path, set at connection time, is what makes the
            # rendered SQL copy-able. Postgres deparses an expression against
            # the path in force, so with `public` on it a policy body comes back
            # naming `chat_messages` and `get_user_role()` bare — statements
            # that mean whatever the path means wherever they are replayed. With
            # nothing on the path every name is written out in full. pg_dump
            # sets it the same way and for the same reason; it is set through
            # the environment rather than a leading -c so that nothing but the
            # query itself ever reaches stdout.
            "-e",
            "PGOPTIONS=-c search_path=",
            container,
            "psql",
            "-X",
            "-q",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-c",
            sql,
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise Failed(
            "psql exited %d for a catalog query:\n%s"
            % (proc.returncode, proc.stderr.strip())
        )
    return proc.stdout


def rows(container: str, inner_sql: str) -> list:
    """Every row of a catalog query, as JSON, ordered by the query itself."""
    return json.loads(psql(container, inner_sql).strip() or "[]")


# --- the catalog queries -----------------------------------------------------
#
# Each returns ONE json array, so a policy expression spanning lines or holding
# quotes reaches Python as a string rather than as something the caller has to
# re-split. The ORDER BY lives inside json_agg: an aggregate's input order is
# only defined when it is stated there.

Q_EXTENSIONS = """
SELECT coalesce(json_agg(json_build_object(
         'name', extname,
         'schema', extnamespace::regnamespace::text,
         'version', extversion
       ) ORDER BY extname), '[]')::text
  FROM pg_extension
"""

Q_AUTH_USER_TRIGGERS = """
SELECT coalesce(json_agg(json_build_object(
         'name', tgname,
         'definition', pg_get_triggerdef(oid)
       ) ORDER BY tgname), '[]')::text
  FROM pg_trigger
 WHERE tgrelid = 'auth.users'::regclass
   AND NOT tgisinternal
"""

Q_STORAGE_POLICIES = """
SELECT coalesce(json_agg(json_build_object(
         'name', policyname,
         'permissive', permissive,
         'roles', roles,
         'cmd', cmd,
         'qual', qual,
         'with_check', with_check
       ) ORDER BY policyname), '[]')::text
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
"""

Q_BUCKETS = """
SELECT coalesce(json_agg(json_build_object(
         'id', id,
         'name', name,
         'public', public,
         'file_size_limit', file_size_limit,
         'allowed_mime_types', allowed_mime_types
       ) ORDER BY id), '[]')::text
  FROM storage.buckets
"""

# `cron.job` is only there when pg_cron is installed, and a missing relation is
# a parse error rather than an empty result — so the table's existence is asked
# first, as its own query.
Q_CRON_INSTALLED = "SELECT to_regclass('cron.job') IS NOT NULL"

Q_CRON_JOBS = """
SELECT coalesce(json_agg(json_build_object(
         'jobname', jobname,
         'schedule', schedule,
         'command', command
       ) ORDER BY jobname), '[]')::text
  FROM cron.job
"""

Q_PUBLICATION = """
SELECT coalesce(json_agg(json_build_object(
         'schema', schemaname,
         'table', tablename
       ) ORDER BY schemaname, tablename), '[]')::text
  FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime'
"""


# --- rendering ---------------------------------------------------------------

GENERATED = (
    "-- Generated from the database by `npm run db -- generate`; never hand-edited."
)


def render_extensions(items: list) -> list:
    lines = []
    for ext in items:
        lines.append(
            "CREATE EXTENSION IF NOT EXISTS %s WITH SCHEMA %s;  -- %s"
            % (ident(ext["name"]), ident(ext["schema"]), ext["version"])
        )
    return lines or ["-- No extension is installed."]


def render_triggers(items: list) -> list:
    return [item["definition"] + ";" for item in items] or [
        "-- No trigger is attached to auth.users."
    ]


def render_policies(items: list) -> list:
    blocks = []
    for pol in items:
        block = [
            "CREATE POLICY %s ON storage.objects" % ident(pol["name"]),
            "  AS %s"
            % ("PERMISSIVE" if pol["permissive"] == "PERMISSIVE" else "RESTRICTIVE"),
            "  FOR %s" % pol["cmd"],
            "  TO %s" % ", ".join(ident(role) for role in pol["roles"]),
        ]
        if pol["qual"] is not None:
            block.append("  USING (%s)" % pol["qual"])
        if pol["with_check"] is not None:
            block.append("  WITH CHECK (%s)" % pol["with_check"])
        blocks.append("\n".join(block) + ";")
    return blocks or ["-- No policy is defined on storage.objects."]


BUCKET_COLUMNS = ("id", "name", "public", "file_size_limit", "allowed_mime_types")


def render_buckets(items: list) -> list:
    blocks = []
    for bucket in items:
        blocks.append(
            "INSERT INTO storage.buckets (%s)\nVALUES (%s)\nON CONFLICT (id) DO NOTHING;"
            % (
                ", ".join(BUCKET_COLUMNS),
                ", ".join(value(bucket[column]) for column in BUCKET_COLUMNS),
            )
        )
    return blocks or ["-- No storage bucket is defined."]


def render_cron(items: list) -> list:
    if items is None:
        return ["-- pg_cron is not installed, so no job can be scheduled."]
    return [
        "SELECT cron.schedule(%s, %s, %s);"
        % (
            literal(job["jobname"]),
            literal(job["schedule"]),
            dollar_quote(job["command"]),
        )
        for job in items
    ] or ["-- No cron job is scheduled."]


def render_publication(items: list) -> list:
    return [
        "ALTER PUBLICATION supabase_realtime ADD TABLE %s.%s;"
        % (ident(item["schema"]), ident(item["table"]))
        for item in items
    ] or ["-- The supabase_realtime publication carries no table."]


def write(out_dir: str, name: str, headline: str, blocks: list) -> None:
    # newline="\n" rather than the platform default: these files are compared
    # byte for byte against a second generator's output.
    # A file of one-line statements reads as a list and is separated by single
    # newlines; one holding a statement that wraps needs a blank line between
    # entries to show where each begins. The choice follows from the content, so
    # it stays deterministic.
    separator = "\n\n" if any("\n" in block for block in blocks) else "\n"
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("-- %s\n%s\n\n" % (headline, GENERATED))
        handle.write(separator.join(blocks))
        handle.write("\n")


def main(argv: list) -> int:
    if len(argv) != 3:
        sys.stderr.write("usage: outside-public.py <db-container> <out-dir>\n")
        return 2
    container, out_dir = argv[1], argv[2]
    os.makedirs(out_dir, exist_ok=True)

    cron_installed = psql(container, Q_CRON_INSTALLED).strip() == "t"

    write(
        out_dir,
        "extensions.sql",
        "Every extension installed in this database — ours and the image's — in the "
        "schema it was installed into, with its version as a trailing comment.",
        render_extensions(rows(container, Q_EXTENSIONS)),
    )
    write(
        out_dir,
        "auth-users-triggers.sql",
        "Triggers on auth.users. The auth schema belongs to the platform, so no dump "
        "of public carries them.",
        render_triggers(rows(container, Q_AUTH_USER_TRIGGERS)),
    )
    write(
        out_dir,
        "storage-objects-policies.sql",
        "RLS policies on storage.objects — the whole of our storage authorization, "
        "since the image enables row security on that table.",
        render_policies(rows(container, Q_STORAGE_POLICIES)),
    )
    write(
        out_dir,
        "storage-buckets.sql",
        "Storage buckets. Rows in storage.buckets rather than DDL, rendered as the "
        "statements that put them back.",
        render_buckets(rows(container, Q_BUCKETS)),
    )
    write(
        out_dir,
        "cron-jobs.sql",
        "Scheduled pg_cron jobs. Rows in cron.job rather than DDL, rendered as the "
        "calls that schedule them.",
        render_cron(rows(container, Q_CRON_JOBS) if cron_installed else None),
    )
    write(
        out_dir,
        "realtime-publication.sql",
        "Tables in the supabase_realtime publication. The publication itself is "
        "pre-created empty, so membership is all there is to restore.",
        render_publication(rows(container, Q_PUBLICATION)),
    )

    sys.stderr.write("outside-public: wrote 6 files to %s\n" % out_dir)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Failed as exc:
        sys.stderr.write("outside-public: error: %s\n" % exc)
        sys.exit(1)
