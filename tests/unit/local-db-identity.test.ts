import { describe, expect, it } from "vitest";

import { stackIdentity } from "../../scripts/lib/local-db-identity.mjs";

const identityOf = (name: string) =>
  stackIdentity(`C:\\Users\\Kyle\\work\\Sogverse\\.claude\\worktrees\\${name}`, `/mnt/c/Users/Kyle/work/Sogverse/.claude/worktrees/${name}`);

describe("stackIdentity", () => {
  it("gives a checkout three distinct ids that share its stack's", () => {
    const { projectId, generateId, testId } = identityOf("local-db-ports");
    expect(new Set([projectId, generateId, testId]).size).toBe(3);
    expect(generateId.startsWith(`${projectId}-`)).toBe(true);
    expect(testId.startsWith(`${projectId}-`)).toBe(true);
  });

  it("keeps every id within the CLI's 40 characters however long the worktree's name", () => {
    const ids = identityOf("a-worktree-name-far-longer-than-any-project-id-could-hold");
    for (const id of Object.values(ids)) expect(id.length).toBeLessThanOrEqual(40);
  });

  it("holds no underscore, which the shell side's exact-suffix container match relies on", () => {
    for (const id of Object.values(identityOf("some_name_with_underscores"))) expect(id).not.toContain("_");
  });
});
