/**
 * Downloading and caching the GeoNames dumps, and reading text out of them.
 *
 * GeoNames publishes one zip per country under `/export/dump/<CC>.zip`, one zip
 * of alternate names per country under `/export/dump/alternatenames/<CC>.zip`,
 * and a plain `/export/dump/countryInfo.txt` — the three this module reads.
 * (Postal codes live under `/export/zip/<CC>.zip` and are a separate ingestion
 * with its own table; a reader for them belongs with that generator, not here,
 * until one exists.) Everything is CC BY 4.0 and republished daily.
 *
 * ## The cache is working data, not repo content
 *
 * Dumps are tens of megabytes and are re-downloaded by every generator run that
 * touches the same country, so they land under
 * `node_modules/.cache/geonames/` — already gitignored (the whole of
 * `/node_modules` is), already understood as disposable, and blown away by a
 * clean install like any other build cache. `GEONAMES_CACHE_DIR` overrides the
 * location for anyone who wants the files somewhere they can poke at them.
 *
 * **Downloading is idempotent**: a cached file is reused as-is, so a rerun of a
 * generator reads exactly the bytes the previous run read. That is the whole
 * determinism story for a system whose upstream has no archive — see the
 * generator header. `GEONAMES_REFRESH=1` forces a re-download when you
 * deliberately want today's dump.
 *
 * ## The zip reader
 *
 * Node ships `zlib` but no archive reader, and the alternative was a
 * dependency for one archive format read three times. The reader below handles
 * exactly what GeoNames ships — stored or deflated entries, no encryption, no
 * zip64 — and refuses anything else rather than guessing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const BASE = "https://download.geonames.org/export";

/** Where the downloaded dumps live. See the header for why here. */
export function cacheDir() {
  const override = process.env.GEONAMES_CACHE_DIR;
  if (override) return override;
  return join(import.meta.dirname, "..", "..", "..", "node_modules", ".cache", "geonames");
}

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/**
 * A downloaded file plus the upstream `Last-Modified` that came with it. The
 * date is the dump's own publication date and is what the emitted migration
 * stamps in its header, so it is cached beside the bytes rather than re-fetched
 * — a cached run must report the date of the bytes it actually read.
 */
async function download(path) {
  const dir = cacheDir();
  mkdirSync(dir, { recursive: true });

  const name = path.replace(/[/]/g, "_");
  const file = join(dir, name);
  const metaFile = `${file}.meta.json`;

  if (!process.env.GEONAMES_REFRESH && existsSync(file) && existsSync(metaFile)) {
    const meta = JSON.parse(readFileSync(metaFile, "utf8"));
    return { bytes: readFileSync(file), lastModified: meta.lastModified, cached: true };
  }

  const url = `${BASE}/${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    fail(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());

  // The header is an HTTP-date; keep the date part only. It is stamped into a
  // migration header, so a time of day and a timezone abbreviation would be
  // noise a reviewer has to read past.
  const raw = response.headers.get("last-modified");
  const lastModified = raw ? new Date(raw).toISOString().slice(0, 10) : "unknown";

  writeFileSync(file, bytes);
  writeFileSync(metaFile, `${JSON.stringify({ url, lastModified }, null, 2)}\n`, "utf8");
  return { bytes, lastModified, cached: false };
}

/* --------------------------------------------------------------- zip reader */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Extract one named entry from a zip archive held in memory. */
function unzipEntry(bytes, entryName, describedAs) {
  // The end-of-central-directory record is last, after a comment of unknown
  // length, so it is found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) fail(`${describedAs}: not a zip archive (no end-of-central-directory record)`);

  const entryCount = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (bytes.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      fail(`${describedAs}: corrupt central directory at entry ${i}`);
    }
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      if (bytes.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
        fail(`${describedAs}: corrupt local header for ${entryName}`);
      }
      const localNameLength = bytes.readUInt16LE(localOffset + 26);
      const localExtraLength = bytes.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      fail(`${describedAs}: ${entryName} uses unsupported compression method ${method}`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  fail(`${describedAs}: no entry named ${entryName}`);
}

/* ------------------------------------------------------------------- reads */

/** `<CC>.txt` out of `/export/dump/<CC>.zip` — the country's places. */
export async function readCountryDump(iso) {
  const { bytes, lastModified, cached } = await download(`dump/${iso}.zip`);
  const text = unzipEntry(bytes, `${iso}.txt`, `dump/${iso}.zip`).toString("utf8");
  return { text, lastModified, cached };
}

/** `<CC>.txt` out of `/export/dump/alternatenames/<CC>.zip`. */
export async function readAlternateNames(iso) {
  const { bytes, lastModified, cached } = await download(`dump/alternatenames/${iso}.zip`);
  const text = unzipEntry(bytes, `${iso}.txt`, `alternatenames/${iso}.zip`).toString("utf8");
  return { text, lastModified, cached };
}

/** The country reference table — geonameid per country/territory, and more. */
export async function readCountryInfo() {
  const { bytes, lastModified, cached } = await download("dump/countryInfo.txt");
  return { text: bytes.toString("utf8"), lastModified, cached };
}
