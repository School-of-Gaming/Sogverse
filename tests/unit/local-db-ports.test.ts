import net from "node:net";

import { describe, expect, it } from "vitest";

import {
  bindableBlocks,
  canBind,
  PORT_BLOCK_SIZE,
  PORT_BLOCKS,
  parseClaimedBlocks,
} from "../../scripts/lib/local-db-ports.mjs";

describe("bindableBlocks", () => {
  it("keeps the blocks whose every port binds, in order, all below both OSes' ephemeral ranges", async () => {
    const refused = new Set([20000, 20199, 23950]);
    const blocks = await bindableBlocks(new Set(), async (port: number) => !refused.has(port));
    expect(blocks).toEqual(PORT_BLOCKS.filter((base) => ![20000, 20100, 23900].includes(base)));
    // Linux's ephemeral range starts at 32768, Windows' dynamic range at 49152.
    expect(PORT_BLOCKS.at(-1)! + PORT_BLOCK_SIZE - 1).toBeLessThan(32768);
  });

  it("never probes a claimed block, and leaves it out", async () => {
    const probed = new Set<number>();
    const blocks = await bindableBlocks(new Set([20100, 21000]), async (port: number) => {
      probed.add(port);
      return true;
    });
    expect(blocks).toEqual(PORT_BLOCKS.filter((base) => base !== 20100 && base !== 21000));
    const inClaimed = (port: number) => (port >= 20100 && port < 20200) || (port >= 21000 && port < 21100);
    expect([...probed].filter(inClaimed)).toEqual([]);
  });
});

describe("parseClaimedBlocks", () => {
  it("reads the sentinel's comma-separated blocks and drops anything that is not one", () => {
    expect(parseClaimedBlocks("20000,,21300,x")).toEqual(new Set([20000, 21300]));
    expect(parseClaimedBlocks("")).toEqual(new Set());
    expect(parseClaimedBlocks(undefined)).toEqual(new Set());
  });
});

describe("canBind", () => {
  it("says no for a port something is listening on, and yes once it is let go", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen({ port: 0, host: "127.0.0.1" }, resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("expected a TCP address");
    const { port } = address;

    expect(await canBind(port)).toBe(false);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await canBind(port)).toBe(true);
  });
});
