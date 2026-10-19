/**
 * The port blocks a local stack can be given, and the Windows-side half of
 * choosing one.
 *
 * A stack takes a whole block of 100 ports when it is first started, and keeps
 * it for its life (scripts/local-db.mjs says why). The blocks are 20000-20099,
 * 20100-20199, … 23900-23999: below Windows' dynamic port range (49152-65535),
 * where Hyper-V reserves blocks of its choosing at every boot and a reserved
 * port cannot be bound by anything, and below Linux's ephemeral range
 * (32768-60999), where an outbound connection inside the distro could already
 * be holding one.
 *
 * Which block a stack gets is decided inside the distro, where the stacks'
 * records and the lock that serialises allocation live. What can only be asked
 * on Windows is whether a block's ports can be bound there right now — the
 * stack is reached from Windows through WSL's localhost forwarder, which
 * silently fails to publish a port Windows will not let it bind, leaving a
 * healthy stack unreachable. So this side answers that question for every
 * block and hands the distro the list.
 */
import net from 'node:net';

export const PORT_BLOCK_SIZE = 100;
const FIRST_BLOCK = 20000;
const BLOCK_COUNT = 40;

export const PORT_BLOCKS = Array.from({ length: BLOCK_COUNT }, (_, index) => FIRST_BLOCK + index * PORT_BLOCK_SIZE);

/**
 * Whether a port can be bound on Windows' loopback at this moment. Binding and
 * closing at once is the faithful test: it fails alike for a port Hyper-V has
 * reserved (EACCES) and one something else is listening on (EADDRINUSE).
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export const canBind = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => server.close(() => resolve(true)));
  });

/**
 * The blocks the distro's `claimed=` sentinel names (scripts/local-db/claimed.sh),
 * out of its comma-separated word. Anything that is not a block is dropped: a
 * record with no readable block names none.
 *
 * @param {string | undefined} word
 * @returns {Set<number>}
 */
export const parseClaimedBlocks = (word) =>
  new Set(
    (word ?? '')
      .split(',')
      .filter((part) => /^\d+$/.test(part))
      .map(Number),
  );

/**
 * The unclaimed blocks every one of whose ports can be bound, in order. Every
 * port of a block is probed, not only the ones config.toml shifts into it: all
 * forty blocks take about two seconds, and the shift arithmetic keeps its one
 * home in lib.sh.
 *
 * A claimed block is never probed. Its stack may be starting at this moment,
 * and a probe's bind landing on a port just as WSL's forwarder publishes it can
 * leave that stack unreachable from Windows. The claims are read before the
 * probe, so a block claimed after the read is still probed. That window is
 * real, not theoretical: the probe takes two to three seconds, and a run that
 * claims a block just after the read can have its first container published
 * within them. What keeps it rare is that a collision also needs one of the
 * probe's binds, each held for well under a millisecond, to land on the very
 * port being published at the instant it is — so it narrows the hazard to a
 * coincidence rather than closing it.
 *
 * @param {Set<number>} [claimed]
 * @param {(port: number) => Promise<boolean>} [probe]
 * @returns {Promise<number[]>}
 */
export async function bindableBlocks(claimed = new Set(), probe = canBind) {
  const results = await Promise.all(
    PORT_BLOCKS.filter((base) => !claimed.has(base)).map(async (base) => {
      const ports = Array.from({ length: PORT_BLOCK_SIZE }, (_, offset) => base + offset);
      const bindable = await Promise.all(ports.map((port) => probe(port)));
      return bindable.every(Boolean) ? base : null;
    }),
  );
  return results.filter((base) => base !== null);
}
