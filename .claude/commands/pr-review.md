---
name: pr-review
description: PR review focusing on architecture, code quality, testing, and security.
---

I want you to perform a thorough Pull Request review of the current feature branch against the 'dev' branch.

**Important: This is a static code review only.** Do not run type-check, lint, or tests — CI already handles those. Focus on reading and reasoning about the code.

## Step 1 — Gather the diff

Run `git diff dev...HEAD` to get the full diff. Identify every changed file.

## Step 2 — Launch 3 parallel review agents

Launch all three agents simultaneously using the Agent tool. Each agent receives the same diff and file list, but has a distinct review lens. Every agent must read the **full file** (not just diff hunks) for each changed file using the Read tool — context around the changes is critical.

**Agent 1 — Architecture & Design**
> Review the diff for architectural and design concerns only. For every changed file, read the full file for context. Check:
> - **Code Duplication & DRY**: Does this PR introduce logic, types, or UI patterns that already exist elsewhere? Search the codebase for similar patterns. Can we abstract into a shared utility, hook, or component?
> - **Alignment**: Does this align with the project's existing architectural patterns (service layer, query hooks, route groups, component organization)?
> - **Abstractions**: Are implementation details exposed inappropriately (leaky abstractions)?
> - **Responsibility**: Do new modules follow the Single Responsibility Principle?
> - **Tech Debt**: Are we adding new tech debt?
>
> Return a numbered list of findings. Each finding must be actionable and include the file path and line range. Do not include praise or observations that require no changes.

**Agent 2 — Correctness & Logic**
> Review the diff for correctness and logic issues only. For every changed file, read the full file for context. Check:
> - **Logic errors**: Off-by-one, wrong comparisons, inverted conditions, missing null/undefined checks.
> - **Edge cases**: What inputs or states could break this? Empty arrays, concurrent requests, missing data.
> - **Race conditions**: Async operations that assume ordering, missing locks on read-then-write patterns.
> - **State management**: Missing query invalidations after mutations, stale closures, incorrect dependency arrays.
> - **Error paths**: Are errors handled or silently swallowed? Could a thrown error crash a page?
> - **Test coverage**: For high-risk code (financial logic, auth, SECURITY DEFINER RPCs, RLS policies) or complex logic, verify there are corresponding tests. Do not flag missing tests for routine code.
>
> Return a numbered list of findings. Each finding must be actionable and include the file path and line range. Do not include praise or observations that require no changes.

**Agent 3 — Security & Performance**
> Review the diff for security and performance concerns only. For every changed file, read the full file for context. Adopt an adversarial mindset — think about how this code could be exploited or how it could degrade the user experience. Check:
> - **Security**: Supabase RLS gaps, missing auth checks, IDOR vulnerabilities, SQL injection, XSS, SECURITY DEFINER privilege escalation, payment/financial logic manipulation.
> - **Performance**: Unnecessary client-side rendering, waterfall fetches, N+1 queries, missing indexes implied by new query patterns, expensive operations in hot paths, bundle size impact.
> - **Data integrity**: Missing row locks on financial operations, missing idempotency checks, race-prone read-then-write patterns.
>
> Return a numbered list of findings. Each finding must be actionable and include the file path and line range. Do not include praise or observations that require no changes.

## Step 3 — Synthesize the review

Once all three agents complete, merge their findings into a single review:

1. **Deduplicate**: If two agents flagged the same issue from different angles, merge into one finding and note both perspectives.
2. **Categorize and rank** all findings from most to least important:
   - Critical
   - Major
   - Minor
   - Trivial / Nitpick
3. **Tag each finding** as either:
   - **straightforward** — safe to apply without further discussion
   - **needs discussion** — higher risk, multiple valid approaches, or behavioral changes worth talking through
4. **Write the final review** in this format:
   - Overall summary (2-3 sentences)
   - Numbered findings grouped by severity, each with file path, line range, and the straightforward/needs-discussion tag

Do not apply any fixes. Wait for the user to pick which issues to address. When the user selects a **needs discussion** issue, explain the trade-offs and align on an approach before making changes.
