import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";
import {
  GUIDE_MCP_UPLOAD_MAX_BYTES,
  GUIDE_UPLOAD_MAX_BYTES,
} from "@/services/guides/guides.contracts";
import {
  guideContentDisposition,
  guideFileName,
  guideFileRefusal,
  storeGuideFile,
  type StoreGuideFileArgs,
} from "@/services/guides/guides.server";

/**
 * The guide store: what it refuses before anything is stored, the fresh path
 * every upload gets, which writer it calls on which client, and the objects it
 * deletes — the one it replaced, or its own when the database refuses the
 * write. Both clients are real ones over fake transports, so what is asserted
 * is the requests they sent.
 */

const GUIDE = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

/** Whether a path is `<guide>/<locale>/<random uuid>.pdf`. */
function isFreshPath(path: string, guide: string, locale: string): boolean {
  const parts = path.split("/");
  return parts.length === 3 && parts[0] === guide && parts[1] === locale && OBJECT_NAME.test(parts[2]);
}

const pdf = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  return bytes;
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** One client's transport: what it was asked, and what the database answers an RPC. */
function transport() {
  const calls: Call[] = [];
  let rpcAnswer: Response = postgrestJson(null);
  let uploadAnswer: Response = postgrestJson({ Key: "guides/x", Id: "x" });
  const fetchMock: FetchMock = vi.fn<typeof fetch>();
  fetchMock.mockImplementation(async (input, init) => {
    const url = requestedUrl(input);
    const method = init?.method ?? "GET";
    const raw = init?.body;
    const body = typeof raw === "string" ? JSON.parse(raw) : raw;
    calls.push({ method, path: decodeURIComponent(url.pathname), body });
    if (url.pathname.startsWith("/rest/v1/rpc/")) return rpcAnswer.clone();
    if (method === "DELETE") return postgrestJson([]);
    return uploadAnswer.clone();
  });
  return {
    client: createFetchStubbedClient(fetchMock),
    calls,
    answerRpc: (response: Response) => {
      rpcAnswer = response;
    },
    answerUpload: (response: Response) => {
      uploadAnswer = response;
    },
  };
}

let db: ReturnType<typeof transport>;
let admin: ReturnType<typeof transport>;

beforeEach(() => {
  db = transport();
  admin = transport();
});

function store(overrides: Partial<StoreGuideFileArgs> = {}) {
  return storeGuideFile({
    db: db.client,
    admin: admin.client,
    bytes: pdf(),
    fileName: "guide.pdf",
    target: { kind: "existing", guideId: GUIDE },
    locale: "en",
    maxBytes: GUIDE_UPLOAD_MAX_BYTES,
    ...overrides,
  });
}

const uploads = () => admin.calls.filter((call) => call.method === "POST");
const deletes = () => admin.calls.filter((call) => call.method === "DELETE");
const uploadedPath = () => uploads()[0].path.replace("/storage/v1/object/guides/", "");

describe("guideFileRefusal", () => {
  it("refuses an empty file, one over the cap and one that is not a PDF", () => {
    expect(guideFileRefusal(new Uint8Array(0), 100)?.code).toBe("empty");
    expect(guideFileRefusal(pdf(101), 100)?.code).toBe("too_large");
    expect(guideFileRefusal(new TextEncoder().encode("<html>"), 100)?.code).toBe("not_pdf");
    expect(guideFileRefusal(new TextEncoder().encode("%PD"), 100)?.code).toBe("not_pdf");
    expect(guideFileRefusal(pdf(100), 100)).toBeNull();
  });

  it("names the remedy when a file is too large", () => {
    const refusal = guideFileRefusal(pdf(GUIDE_MCP_UPLOAD_MAX_BYTES + 1), GUIDE_MCP_UPLOAD_MAX_BYTES);
    expect(refusal?.error).toContain("Compress file");
    expect(refusal?.error).toContain("Reduce file size");
    expect(guideFileRefusal(pdf(GUIDE_UPLOAD_MAX_BYTES + 1), GUIDE_UPLOAD_MAX_BYTES)?.error).toContain(
      "must be 4 MB or smaller; this one is 4 MB",
    );
  });
});

describe("guideFileName", () => {
  it("keeps the last segment, trimmed and capped, else a plain name", () => {
    expect(guideFileName(" C:\\Users\\me\\Parents guide.pdf ")).toBe("Parents guide.pdf");
    expect(guideFileName("a/b/opas.pdf")).toBe("opas.pdf");
    expect(guideFileName("   ")).toBe("guide.pdf");
    expect(guideFileName(`${"x".repeat(300)}.pdf`)).toHaveLength(255);
  });
});

describe("guideContentDisposition", () => {
  it("names a plain file the same in both forms", () => {
    expect(guideContentDisposition("attachment", "guide-fi.pdf")).toBe(
      `attachment; filename="guide-fi.pdf"; filename*=UTF-8''guide-fi.pdf`,
    );
  });

  it("keeps a name that would break the header out of its plain filename", () => {
    expect(guideContentDisposition("attachment", 'Vanhempien "opas"; 2026.pdf')).toBe(
      `attachment; filename="Vanhempien _opas__ 2026.pdf"; filename*=UTF-8''Vanhempien%20%22opas%22%3B%202026.pdf`,
    );
  });

  it("encodes every character RFC 5987 reserves, an apostrophe included, for an inline file", () => {
    expect(guideContentDisposition("inline", "Föräldrarnas guide (Kyle's)!*.pdf")).toBe(
      `inline; filename="F_r_ldrarnas guide _Kyle_s___.pdf"; ` +
        `filename*=UTF-8''F%C3%B6r%C3%A4ldrarnas%20guide%20%28Kyle%27s%29%21%2A.pdf`,
    );
  });

  it("ends both forms in .pdf whatever the stored name", () => {
    expect(guideContentDisposition("inline", "opas")).toBe(
      `inline; filename="opas.pdf"; filename*=UTF-8''opas.pdf`,
    );
    expect(guideContentDisposition("attachment", "OPAS.PDF")).toBe(
      `attachment; filename="OPAS.PDF"; filename*=UTF-8''OPAS.PDF`,
    );
  });
});

describe("storeGuideFile", () => {
  it("refuses before storing anything", async () => {
    for (const bytes of [new Uint8Array(0), pdf(11), new TextEncoder().encode("nope")]) {
      expect((await store({ bytes, maxBytes: 10 })).status).toBe("refused");
    }
    expect(await store({ target: { kind: "new", label: "  " } })).toEqual({
      status: "refused",
      refusal: { code: "label", error: "A guide needs a label" },
    });
    expect(admin.calls).toEqual([]);
    expect(db.calls).toEqual([]);
  });

  it("creates a new guide with its first file, the bytes on the service client and the rows on the caller's", async () => {
    db.answerRpc(postgrestJson(GUIDE));
    const result = await store({
      fileName: "parents.pdf",
      target: { kind: "new", label: " Parents' guide " },
      locale: "fi",
    });

    expect(result.status).toBe("stored");
    if (result.status !== "stored") return;
    expect(uploads()).toHaveLength(1);
    expect(isFreshPath(uploadedPath(), result.guideId, "fi")).toBe(true);
    expect(admin.calls.some((call) => call.path.startsWith("/rest/"))).toBe(false);
    expect(db.calls).toEqual([
      {
        method: "POST",
        path: "/rest/v1/rpc/create_guide",
        body: {
          p_id: result.guideId,
          p_label: "Parents' guide",
          p_locale: "fi",
          p_storage_path: uploadedPath(),
          p_file_name: "parents.pdf",
          p_byte_size: 64,
        },
      },
    ]);
    expect(result).toMatchObject({ created: true, replaced: false, locale: "fi", byteSize: 64 });
    expect(deletes()).toEqual([]);
  });

  it("replaces a language's file at a fresh path and deletes the object it replaced", async () => {
    const old = `${GUIDE}/en/00000000-0000-4000-8000-000000000001.pdf`;
    db.answerRpc(postgrestJson(old));
    const result = await store({
      fileName: "parents-v2.pdf",
      target: { kind: "existing", guideId: GUIDE.toUpperCase() },
    });

    expect(isFreshPath(uploadedPath(), GUIDE, "en")).toBe(true);
    expect(db.calls[0]).toEqual({
      method: "POST",
      path: "/rest/v1/rpc/save_guide_file",
      body: {
        p_id: GUIDE,
        p_locale: "en",
        p_storage_path: uploadedPath(),
        p_file_name: "parents-v2.pdf",
        p_byte_size: 64,
      },
    });
    expect(deletes().map((call) => call.body)).toEqual([{ prefixes: [old] }]);
    expect(result).toMatchObject({ status: "stored", guideId: GUIDE, created: false, replaced: true });
  });

  it("gives every upload its own path", async () => {
    await store();
    await store();
    const [first, second] = uploads().map((call) => call.path);
    expect(first).not.toBe(second);
  });

  it("deletes nothing when the language had no file", async () => {
    db.answerRpc(postgrestJson(null));
    expect(await store({ locale: "fi" })).toMatchObject({ status: "stored", replaced: false });
    expect(deletes()).toEqual([]);
  });

  it("deletes its own object and throws the database's refusal when the write is refused", async () => {
    db.answerRpc(postgrestJson({ code: "P0002", message: "Guide not found", details: null, hint: null }, 400));
    await expect(store()).rejects.toMatchObject({ code: "P0002", message: "Guide not found" });
    expect(deletes().map((call) => call.body)).toEqual([{ prefixes: [uploadedPath()] }]);
  });

  it("throws without writing when the bucket refuses the bytes", async () => {
    admin.answerUpload(
      postgrestJson({ statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" }, 413),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(store()).rejects.toMatchObject({ status: 500 });
    expect(db.calls).toEqual([]);
  });
});
