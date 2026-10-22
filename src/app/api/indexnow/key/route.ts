import { indexNowKey } from "@/lib/indexnow/indexnow";

/**
 * GET /api/indexnow/key — the IndexNow key file, served at the site root as
 * `/indexnow-key.txt` by a rewrite in `next.config.ts`; the root is what lets
 * it vouch for every URL on the host. A search engine fetches it to check
 * that a submission naming this key came from us.
 *
 * The key is public by design — the protocol publishes it on the site it
 * vouches for — so the file has no gate. With no usable key configured
 * (`INDEXNOW_KEY`) there is no file, and the answer is a 404.
 */
export function GET() {
  const key = indexNowKey();
  if (key === null) return new Response("Not found", { status: 404 });
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
