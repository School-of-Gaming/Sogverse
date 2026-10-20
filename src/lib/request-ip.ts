/**
 * The address a request came from, or `undefined` when no proxy in front of
 * the app said.
 *
 * `x-forwarded-for` is a list appended to by each hop, so the first entry is the
 * client; `x-real-ip` is the single-value form some proxies send instead. On
 * Vercel the platform writes the header itself, overwriting whatever the client
 * sent, so the first entry is the platform's word rather than the caller's.
 * Absent on a request that has no proxy in front of it at all; a fabricated
 * address would be worse than none, so the caller decides what absence means.
 */
export function clientIpFrom(headers: Headers): string | undefined {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || undefined;
}

/**
 * An IPv6 address's eight groups, expanded and without leading zeros, or null
 * when the text is not one. A dotted IPv4 tail counts as the last two groups.
 */
function ipv6Groups(address: string): string[] | null {
  let text = address;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    if ([a, b, c, d].some((octet) => octet > 255)) return null;
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] === "" ? [] : halves[0].split(":");
  const tail = halves.length === 2 && halves[1] !== "" ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  // Without `::` all eight are written; with it, it stands for at least one.
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16).toString(16));
}

/**
 * The network a client address stands for when requests are counted per
 * client: an IPv4 address is itself, and an IPv6 address is its /64, written
 * `<four groups>::/64`. One IPv6 subscriber is handed a whole /64 and may draw
 * a fresh address from it at will, so counting the full address would give
 * them a fresh allowance each time. An IPv4 address carried in IPv6
 * (`::ffff:a.b.c.d`) is the IPv4 address. Anything that does not parse is
 * returned unchanged.
 */
export function clientNetwork(ip: string): string {
  if (!ip.includes(":")) return ip;
  const groups = ipv6Groups(ip.trim().toLowerCase().replace(/%.*$/, ""));
  if (groups === null) return ip;
  if (groups.slice(0, 5).every((group) => group === "0") && groups[5] === "ffff") {
    const [high, low] = [parseInt(groups[6], 16), parseInt(groups[7], 16)];
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return `${groups.slice(0, 4).join(":")}::/64`;
}
