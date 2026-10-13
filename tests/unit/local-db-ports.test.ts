import net from "node:net";

import { describe, expect, it } from "vitest";

import {
  bindableBlocks,
  canBind,
  PORT_BLOCK_SIZE,
  PORT_BLOCKS,
} from "../../scripts/lib/local-db-ports.mjs";

describe("PORT_BLOCKS", () => {
  it("is forty blocks of 100 from 20000, all below both OSes' ephemeral ranges", () => {
    expect(PORT_BLOCKS).toHaveLength(40);
    expect(PORT_BLOCKS[0]).toBe(20000);
    PORT_BLOCKS.forEach((base, index) => expect(base).toBe(20000 + index * PORT_BLOCK_SIZE));
    // Linux's ephemeral range starts at 32768, Windows' dynamic range at 49152.
    expect(PORT_BLOCKS.at(-1)! + PORT_BLOCK_SIZE - 1).toBeLessThan(32768);
  });
});

describe("bindableBlocks", () => {
  it("keeps the blocks whose every port binds, in order", async () => {
    const refused = new Set([20000, 20199, 23950]);
    const blocks = await bindableBlocks(async (port: number) => !refused.has(port));
    expect(blocks).toEqual(PORT_BLOCKS.filter((base) => ![20000, 20100, 23900].includes(base)));
  });

  it("probes every port of every block", async () => {
    const probed = new Set<number>();
    await bindableBlocks(async (port: number) => {
      probed.add(port);
      return true;
    });
    expect(probed.size).toBe(PORT_BLOCKS.length * PORT_BLOCK_SIZE);
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
