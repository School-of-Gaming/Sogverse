import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { SUPPORT_EMAIL } from "@/lib/constants";

// The login page's dev-only quick sign-in carries the rich seed's addresses and
// password, and it is gated on build-time constants so that a production build
// folds the gate to false and drops the whole panel. This reads the build this
// suite serves and holds that to be true: nothing a browser is sent, and none of
// the server's emitted code, names the seed accounts or the panel's label.
//
// The needles are the seed addresses no real page uses, plus the panel label.
// The parent seed address is not one of them: the Lynx API docs page shows that
// same address as a sample, so it is legitimately in the build.
//
// Server source maps are skipped. They carry every source file's original text
// verbatim, dead branches included, and are never served, so a hit in one says
// nothing about what runs.
const NEEDLES = ["admin@example.com", "gedu@example.com", "Dev sign-in"];

const BUILD_DIR = join(process.cwd(), ".next");

function filesUnder(dir: string, skip: (name: string) => boolean): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- walks the fixed build directories below, no external input
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !skip(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

// Walked when a test runs rather than when the file loads, so a run filtered to
// the other smoke specs never reads the build, and each file's text is dropped
// once it has been checked.
function scannedFiles(): string[] {
  return [
    ...filesUnder(join(BUILD_DIR, "static"), () => false),
    ...filesUnder(join(BUILD_DIR, "server"), (name) => name.endsWith(".map")),
  ];
}

function read(path: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file the walk above found inside the build directory, no external input
  return readFileSync(path, "utf8");
}

test.describe("Dev sign-in in the production build", () => {
  // The positive control: the scan reads real bundled output and would see an
  // address literal if one were there. The support address is one the login
  // page itself renders, so it ships to the browser and is in the server output.
  test("the scan sees what the build contains", () => {
    const files = scannedFiles();
    const foundUnder = (tree: string) =>
      files.some(
        (path) =>
          path.startsWith(join(BUILD_DIR, tree)) && read(path).includes(SUPPORT_EMAIL),
      );

    expect(foundUnder("static")).toBe(true);
    expect(foundUnder("server")).toBe(true);
  });

  test("names none of the seed accounts", () => {
    const hits = scannedFiles().flatMap((path) => {
      const text = read(path);
      return NEEDLES.filter((needle) => text.includes(needle)).map(
        (needle) => `${needle} in ${path}`,
      );
    });

    expect(hits).toEqual([]);
  });
});
