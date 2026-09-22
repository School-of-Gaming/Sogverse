#!/usr/bin/env python3
"""Split a raw pg_dump of the public schema into one file per object.

Usage:
    split-schema.py <out-dir> [dump-file]      # dump-file defaults to stdin ("-")

The dump is the output of

    pg_dump -U postgres -d postgres --schema=public --schema-only --no-owner

with the \\restrict / \\unrestrict lines already filtered out. pg_dump writes
every object as an archive entry introduced by a three-line header

    --
    -- Name: <name>; Type: <TYPE>; Schema: <schema>; Owner: <owner>
    --

and this script cuts on exactly those headers, copying each entry's bytes
verbatim into the file of the object it belongs to. Nothing is rewritten, so a
CHECK constraint holding a literal carriage return survives untouched (which is
why supabase/schema/** is -text in .gitattributes).

Layout produced:

    tables/<table>.sql        table + its indexes, constraints, triggers,
                              policies, row security, grants, comments,
                              owned sequences and column defaults
    views/<view>.sql          view + its grants and comments
    functions/<function>.sql  function + its grants and comment
    types/enums-and-types.sql every TYPE entry with its comments
    misc/schema.sql           the schema's own block, DEFAULT ACLs and
                              anything that could not be attributed

Entries keep dump order inside every file. The dump is alphabetical within an
object class, so adding an unrelated object moves no other file's bytes.

The dump's own preamble (the "Dumped from/by ... version" lines and the SET /
set_config restore settings) and its trailing "dump complete" banner are
dropped: they are restore-session boilerplate that no reader of a generated
snapshot needs, and they are the one part of the dump that changes when the
Postgres or CLI patch version moves.

Exit status is non-zero on any structural anomaly: a preamble that is not
boilerplate, an entry count that does not survive the split, a byte-level
reconstruction mismatch, two objects whose file names collide, or a dump that
lost an entire object class.
"""

from __future__ import annotations

import hashlib
import os
import re
import shutil
import sys

# --- header parsing ---------------------------------------------------------

# The name is matched greedily so the LAST "; Type: " wins: a policy or
# constraint name may legitimately contain a semicolon.
HEADER_RE = re.compile(
    rb"^-- Name: (?P<name>.*); Type: (?P<type>[A-Z][A-Z ]*);"
    rb" Schema: (?P<schema>[^;]*); Owner: (?P<owner>.*)$"
)

DASHES = b"--"
FOOTER = b"--\n-- PostgreSQL database dump complete\n--\n"

# Every non-blank preamble line must look like one of these, or the dump is not
# the shape we think it is.
PREAMBLE_OK_RE = re.compile(rb"^(--.*|SET .*|SELECT pg_catalog\.set_config\(.*)$")

# Object classes that must appear at least once, or the dump silently lost one.
# Mirrors the CREATE TABLE / CREATE POLICY / CREATE TRIGGER / GRANT check that
# guarded the single-file dump.
REQUIRED_TYPES = ("TABLE", "POLICY", "TRIGGER", "ACL")

CLASS_DIRS = ("tables", "views", "functions", "types", "misc")

# Lead words of the multi-word built-in type names. Used to tell a parameter
# name from the first word of a type when normalising a function signature.
MULTIWORD_TYPE_LEADS = frozenset(
    ("double", "character", "bit", "time", "timestamp", "national", "interval")
)

ARG_MODES = frozenset(("in", "out", "inout", "variadic"))

SAFE_NAME_RE = re.compile(r"[A-Za-z0-9_.\-]")

MISC = os.path.join("misc", "schema")
TYPES = os.path.join("types", "enums-and-types")


class Anomaly(Exception):
    """A structural problem that must fail the run."""


class Entry:
    __slots__ = ("index", "name", "type", "schema", "start", "end", "data")

    def __init__(self, index, name, type_, schema, start):
        self.index = index
        self.name = name
        self.type = type_
        self.schema = schema
        self.start = start
        self.end = -1
        self.data = b""

    @property
    def header(self):
        return "-- Name: %s; Type: %s; Schema: %s" % (self.name, self.type, self.schema)

    @property
    def body(self):
        """The entry's statements, decoded leniently, for regex inspection."""
        return self.data.decode("utf-8", "replace")


def parse_entries(data):
    """Cut the dump into archive entries, preserving every byte of each."""
    lines = data.split(b"\n")
    starts = []
    off = 0
    for line in lines:
        starts.append(off)
        off += len(line) + 1

    entries = []
    for i in range(len(lines) - 2):
        # A header is three lines: "--", "-- Name: ...", "--". Requiring all
        # three keeps a "-- Name:"-looking line inside a function body from
        # being mistaken for an object header.
        if lines[i] != DASHES or lines[i + 2] != DASHES:
            continue
        m = HEADER_RE.match(lines[i + 1])
        if m is None:
            continue
        entries.append(
            Entry(
                len(entries),
                m.group("name").decode("utf-8", "surrogateescape"),
                m.group("type").decode("ascii"),
                m.group("schema").decode("utf-8", "surrogateescape"),
                starts[i],
            )
        )

    if not entries:
        raise Anomaly("no pg_dump object headers found in the input")

    footer_at = data.rfind(FOOTER)
    region_end = footer_at if footer_at > entries[-1].start else len(data)

    for n, entry in enumerate(entries):
        entry.end = entries[n + 1].start if n + 1 < len(entries) else region_end
        entry.data = data[entry.start : entry.end]

    return entries


def check_preamble(data, first_start):
    for raw in data[:first_start].split(b"\n"):
        line = raw.strip()
        if not line:
            continue
        if not PREAMBLE_OK_RE.match(line):
            raise Anomaly(
                "the dump preamble holds something that is not restore "
                "boilerplate, so dropping it would lose it: %r"
                % line.decode("utf-8", "replace")
            )


# --- function signature normalisation ---------------------------------------


def split_top_level(text, sep=","):
    parts, depth, cur = [], 0, []
    for ch in text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == sep and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return parts


def parse_signature(sig):
    """Split "name(arg, arg)" into its name and its raw argument strings."""
    open_at = sig.find("(")
    if open_at < 0 or not sig.rstrip().endswith(")"):
        return sig.strip(), []
    name = sig[:open_at].strip()
    inner = sig[open_at + 1 : sig.rstrip().rfind(")")].strip()
    if not inner:
        return name, []
    return name, [a.strip() for a in split_top_level(inner)]


def strip_default(arg):
    depth = 0
    lowered = arg.lower()
    for i, ch in enumerate(arg):
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        elif depth == 0 and ch == "=":
            return arg[:i]
        elif depth == 0 and lowered.startswith(" default ", i):
            return arg[:i]
    return arg


def arg_variants(arg):
    """Return (the argument as written, the argument with a leading parameter
    name removed). The two coincide when there is nothing to remove."""
    cleaned = " ".join(strip_default(arg).split())
    tokens = cleaned.split(" ")
    if tokens and tokens[0].lower() in ARG_MODES and len(tokens) > 1:
        tokens = tokens[1:]
    kept = " ".join(tokens).lower()
    if len(tokens) > 1:
        return kept, " ".join(tokens[1:]).lower()
    return kept, kept


def signature_keys(sig):
    """Return (function name, best-guess key, per-argument variant pairs).

    The key is the argument TYPE list: parameter names, argument modes,
    defaults, case and spacing are all normalised away, so a function header
    ("f(uuid, text)") and a grant header ("FUNCTION f(p_id uuid, p_note text)")
    reduce to the same string. The best guess drops a leading token whenever it
    cannot be the first word of a multi-word built-in type.
    """
    name, args = parse_signature(sig)
    variants = [arg_variants(a) for a in args]
    guess = []
    for as_written, without_name in variants:
        first = as_written.split(" ")[0] if as_written else ""
        if as_written != without_name and first not in MULTIWORD_TYPE_LEADS:
            guess.append(without_name)
        else:
            guess.append(as_written)
    return name, "%s(%s)" % (name, ",".join(guess)), variants


def candidate_keys(name, variants, cap=12):
    """Every way of reading each argument as "type" or as "name type"."""
    if len(variants) > cap:
        return
    combos = [[]]
    for as_written, without_name in variants:
        options = (
            [as_written] if as_written == without_name else [as_written, without_name]
        )
        combos = [c + [o] for c in combos for o in options]
    for combo in combos:
        yield "%s(%s)" % (name, ",".join(combo))


# --- attribution -------------------------------------------------------------


def unquote(ident):
    ident = ident.strip()
    if len(ident) >= 2 and ident[0] == '"' and ident[-1] == '"':
        return ident[1:-1].replace('""', '"')
    return ident


def strip_schema(ident):
    ident = unquote(ident.strip())
    if ident.startswith("public."):
        return unquote(ident[len("public.") :])
    return ident


INDEX_ON_RE = re.compile(
    r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+\S+\s+ON\s+(?:ONLY\s+)?public\.(\"[^\"]+\"|[^\s(]+)",
    re.IGNORECASE,
)
SEQ_OWNED_RE = re.compile(r"OWNED\s+BY\s+public\.(\"[^\"]+\"|[^\s.]+)\.", re.IGNORECASE)


class Splitter:
    def __init__(self, entries):
        self.entries = entries
        self.warnings = []
        self.relations = set()
        self.views = set()
        self.index_owner = {}
        self.sequence_owner = {}
        self.function_keys = {}
        self.known_keys = set()

    # -- pass 1: registries ---------------------------------------------------

    def scan(self):
        for e in self.entries:
            if e.type == "TABLE":
                self.relations.add(e.name)
            elif e.type in ("VIEW", "MATERIALIZED VIEW"):
                self.relations.add(e.name)
                self.views.add(e.name)
            elif e.type == "INDEX":
                m = INDEX_ON_RE.search(e.body)
                if m:
                    self.index_owner[e.name] = strip_schema(m.group(1))
            elif e.type in ("SEQUENCE OWNED BY", "SEQUENCE SET"):
                m = SEQ_OWNED_RE.search(e.body)
                if m:
                    self.sequence_owner[e.name] = strip_schema(m.group(1))
            elif e.type == "FUNCTION":
                name, key, _ = signature_keys(e.name)
                self.function_keys.setdefault(name, [])
                if key not in self.function_keys[name]:
                    self.function_keys[name].append(key)
                self.known_keys.add(key)

    # -- function lookup ------------------------------------------------------

    def resolve_function(self, sig, header):
        name, guess, variants = signature_keys(sig)
        if guess in self.known_keys:
            return guess
        for key in candidate_keys(name, variants):
            if key in self.known_keys:
                return key
        keys = self.function_keys.get(name)
        if keys and len(keys) == 1:
            # No overloads: the name alone identifies the function, so no
            # spelling of its signature can make this ambiguous.
            return keys[0]
        self.warn(
            "could not match a function signature to any CREATE FUNCTION: %s" % header
        )
        return None

    def function_path(self, key):
        name = key[: key.index("(")]
        keys = self.function_keys.get(name, [key])
        if len(keys) == 1:
            return os.path.join("functions", safe_file(name))
        # Overloads are disambiguated by a hash of the normalised argument type
        # list, not by an ordinal: a new overload then never renames an existing
        # one's file.
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:8]
        return os.path.join("functions", safe_file("%s__%s" % (name, digest)))

    # -- relation lookup ------------------------------------------------------

    def relation_path(self, rel, header):
        rel = strip_schema(rel)
        if rel in self.views:
            return os.path.join("views", safe_file(rel))
        if rel in self.relations:
            return os.path.join("tables", safe_file(rel))
        self.warn("names a relation the dump never defines (%s): %s" % (rel, header))
        return None

    def warn(self, message):
        self.warnings.append(message)
        sys.stderr.write("split-schema: warning: %s\n" % message)

    # -- pass 2: attribution --------------------------------------------------

    def attribute(self, e):
        """Return the output path, without its extension, for one entry."""
        t = e.type

        if t in ("SCHEMA", "DEFAULT ACL", "EXTENSION"):
            return MISC
        if t in ("TYPE", "SHELL TYPE", "DOMAIN"):
            return TYPES
        if t == "TABLE":
            return os.path.join("tables", safe_file(e.name))
        if t in ("VIEW", "MATERIALIZED VIEW"):
            return os.path.join("views", safe_file(e.name))
        if t == "FUNCTION":
            _name, key, _variants = signature_keys(e.name)
            return self.function_path(key)
        if t == "INDEX":
            # The index header carries only the index name; the owning table
            # comes from the ON clause of the CREATE INDEX statement.
            owner = self.index_owner.get(e.name)
            if owner is None:
                self.warn("index with no readable ON clause: %s" % e.header)
                return MISC
            return self.relation_path(owner, e.header) or MISC
        if t in (
            "CONSTRAINT",
            "FK CONSTRAINT",
            "CHECK CONSTRAINT",
            "TRIGGER",
            "POLICY",
            "DEFAULT",
        ):
            # Header name is "<relation> <object name>", and an unqualified
            # relation name holds no whitespace, so the first token is it.
            return self.relation_path(e.name.split(" ", 1)[0], e.header) or MISC
        if t == "ROW SECURITY":
            return self.relation_path(e.name, e.header) or MISC
        if t in ("SEQUENCE", "SEQUENCE OWNED BY", "SEQUENCE SET"):
            owner = self.sequence_owner.get(e.name)
            if owner is None:
                self.warn("sequence that is owned by no column: %s" % e.header)
                return MISC
            return self.relation_path(owner, e.header) or MISC
        if t in ("ACL", "COMMENT"):
            return self.attribute_subject(e) or MISC

        self.warn("unknown object class %r: %s" % (t, e.header))
        return MISC

    def attribute_subject(self, e):
        """ACL and COMMENT headers name their subject: "TABLE profiles",
        "COLUMN profiles.phone", "FUNCTION f(p_id uuid)", "CONSTRAINT c ON t",
        "TRIGGER g ON t", "INDEX i", "TYPE x", "SCHEMA public"."""
        kind, _, rest = e.name.partition(" ")
        kind = kind.upper()
        rest = rest.strip()

        if kind == "SCHEMA":
            return MISC
        if kind in ("TYPE", "DOMAIN"):
            return TYPES
        if kind in ("FUNCTION", "PROCEDURE", "AGGREGATE"):
            key = self.resolve_function(rest, e.header)
            return self.function_path(key) if key else None
        if kind in ("TABLE", "VIEW", "MATERIALIZED", "SEQUENCE"):
            if kind == "MATERIALIZED":
                rest = rest.split(" ", 1)[1] if " " in rest else rest
            if kind == "SEQUENCE":
                owner = self.sequence_owner.get(strip_schema(rest))
                if owner is None:
                    self.warn("grant or comment on an unowned sequence: %s" % e.header)
                    return None
                rest = owner
            return self.relation_path(rest, e.header)
        if kind == "COLUMN":
            return self.relation_path(strip_schema(rest).rsplit(".", 1)[0], e.header)
        if kind in ("CONSTRAINT", "TRIGGER", "POLICY", "RULE"):
            parts = re.split(r"\s+ON\s+", rest, maxsplit=1)
            if len(parts) != 2:
                self.warn("subject with no ON clause: %s" % e.header)
                return None
            return self.relation_path(parts[1], e.header)
        if kind == "INDEX":
            owner = self.index_owner.get(strip_schema(rest))
            if owner is None:
                self.warn("comment on an index the dump never creates: %s" % e.header)
                return None
            return self.relation_path(owner, e.header)

        self.warn("unrecognised %s subject: %s" % (e.type, e.header))
        return None


def safe_file(name):
    """A file name that survives every filesystem, reversibly."""
    out = []
    for ch in name:
        if SAFE_NAME_RE.match(ch):
            out.append(ch)
        elif ord(ch) < 256:
            out.append("%%%02X" % ord(ch))
        else:
            out.append("%%u%04X" % ord(ch))
    return "".join(out) or "_"


# --- output ------------------------------------------------------------------


def replace_output_dir(out_dir):
    if os.path.exists(out_dir):
        if not os.path.isdir(out_dir):
            raise Anomaly("%s exists and is not a directory" % out_dir)
        stray = [n for n in os.listdir(out_dir) if n not in CLASS_DIRS]
        if stray:
            raise Anomaly(
                "%s holds things this script did not write (%s); refusing to "
                "replace it" % (out_dir, ", ".join(sorted(stray)[:5]))
            )
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)


def write_files(out_dir, buckets):
    # A case-insensitive filesystem would silently merge two objects whose
    # names differ only in case.
    by_lower = {}
    for path in buckets:
        clash = by_lower.setdefault(path.lower(), path)
        if clash != path:
            raise Anomaly(
                "two objects would share a file on a case-insensitive "
                "filesystem: %s and %s" % (clash, path)
            )

    written = {}
    for path, entries in buckets.items():
        blob = b"".join(e.data for e in entries)
        full = os.path.join(out_dir, path + ".sql")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        # Binary mode: no newline translation and no encoding pass, so the
        # bytes land exactly as pg_dump wrote them.
        with open(full, "wb") as fh:
            fh.write(blob)
        written[path.replace(os.sep, "/") + ".sql"] = blob
    return written


def verify_from_disk(out_dir, entries, written):
    """Re-read every written file, re-split it, and prove the split is a
    partition of the input: same entry count, same bytes, each exactly once."""
    want = {}
    for e in entries:
        want[e.data] = want.get(e.data, 0) + 1

    seen = {}
    total = 0
    for root, _dirs, files in os.walk(out_dir):
        for fname in files:
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, out_dir).replace(os.sep, "/")
            with open(full, "rb") as fh:
                blob = fh.read()
            if blob != written.get(rel):
                raise Anomaly("%s does not hold the bytes it was written with" % rel)
            for e in parse_entries(blob):
                seen[e.data] = seen.get(e.data, 0) + 1
                total += 1

    if total != len(entries):
        raise Anomaly(
            "split %d entries but %d came back off disk" % (len(entries), total)
        )
    if seen != want:
        differing = sum(1 for k, v in want.items() if seen.get(k, 0) != v)
        raise Anomaly(
            "the files on disk are not the dump's entries: %d entry bodies "
            "differ in count" % differing
        )
    return total


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = set(a for a in argv[1:] if a.startswith("--"))
    if flags - {"--verify", "--no-verify", "--quiet"} or not args or len(args) > 2:
        sys.stderr.write(
            "usage: split-schema.py [--no-verify] [--quiet] <out-dir> [dump-file]\n"
        )
        return 2

    out_dir = args[0]
    source = args[1] if len(args) > 1 else "-"
    if source == "-":
        data = sys.stdin.buffer.read()
    else:
        with open(source, "rb") as fh:
            data = fh.read()

    entries = parse_entries(data)
    check_preamble(data, entries[0].start)

    splitter = Splitter(entries)
    splitter.scan()

    buckets = {}
    counts = {}
    for e in entries:
        counts[e.type] = counts.get(e.type, 0) + 1
        buckets.setdefault(splitter.attribute(e), []).append(e)

    missing = [t for t in REQUIRED_TYPES if not counts.get(t)]
    if missing:
        raise Anomaly(
            "the dump lost an object class: it holds no %s entry. A dump "
            "missing a whole class is never a real schema change."
            % ", ".join(missing)
        )

    placed = sum(len(v) for v in buckets.values())
    if placed != len(entries):
        raise Anomaly("read %d entries but placed %d" % (len(entries), placed))

    # Byte-exact reconstruction: the entries, in dump order, ARE the dump
    # between its preamble and its closing banner.
    region = data[entries[0].start : entries[-1].end]
    if b"".join(e.data for e in entries) != region:
        raise Anomaly("the entries do not reconstruct the input byte for byte")

    replace_output_dir(out_dir)
    written = write_files(out_dir, buckets)

    verified = 0
    if "--no-verify" not in flags:
        verified = verify_from_disk(out_dir, entries, written)

    if "--quiet" not in flags:
        per_class = {}
        for path in written:
            head = path.split("/", 1)[0]
            per_class[head] = per_class.get(head, 0) + 1
        sys.stderr.write(
            "split-schema: %d entries -> %d files (%s)%s, %d warnings\n"
            % (
                len(entries),
                len(written),
                ", ".join("%s %d" % (k, per_class[k]) for k in sorted(per_class)),
                ", verified %d off disk" % verified if verified else "",
                len(splitter.warnings),
            )
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv))
    except Anomaly as exc:
        sys.stderr.write("split-schema: error: %s\n" % exc)
        sys.exit(1)
