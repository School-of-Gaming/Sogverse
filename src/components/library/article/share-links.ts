/**
 * **The share targets for one article**, as plain addresses.
 *
 * Each is the platform's own documented share URL, so sharing costs no
 * third-party script and no change to the CSP: the page renders ordinary
 * links, and nothing of the platform's runs here until a reader follows one.
 *
 * Every value is encoded with `encodeURIComponent`, never `URLSearchParams`:
 * the latter writes a space as `+`, which a `mailto:` does not decode (RFC
 * 6068), so an email subject would arrive full of plus signs.
 */
export interface ShareLinks {
  whatsapp: string;
  email: string;
  linkedin: string;
  x: string;
  reddit: string;
}

export function buildShareLinks({
  url,
  title,
}: {
  /** The article's absolute, canonical address. */
  url: string;
  title: string;
}): ShareLinks {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return {
    // WhatsApp takes one text field, so the title and the link travel in it
    // together; the app turns the link into its preview.
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    email: `mailto:?subject=${t}&body=${u}`,
    // LinkedIn reads the title and picture from the page itself.
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    x: `https://x.com/intent/post?text=${t}&url=${u}`,
    reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
  };
}
