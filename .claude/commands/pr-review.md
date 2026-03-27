---
name: pr-review
description: PR review focusing on architecture, code quality, testing, and security.
---

I want you to perform a thorough Pull Request review of the current feature branch against the 'dev' branch.

**Important: This is a static code review only.** Do not run type-check, lint, or tests — CI already handles those. Focus on reading and reasoning about the code.

1.  **Analysis**:
    * **Diff**: Check the diff between the current branch and the dev branch.
    * **File Review**: For each file in the diff, read the full file (not just the diff hunks) using the Read tool. This is critical for understanding context around changes — how the changed code fits into the larger file

2.  **Architecture & Design**: 
    * **Code Duplication & DRY**: Does this PR introduce logic, types, or UI patterns that already exist elsewhere? Can we abstract this into a shared utility, hook, or component?
    * **Alignment**: Does this align with the existing architectural patterns?
    * **Abstractions**: Are implementation details exposed inappropriately (leaky abstractions)?
    * **Responsibility**: Do new modules follow the Single Responsibility Principle?
    * **Tech Debt**: Are we adding new tech debt to the project?

3.  **Code Quality**: 
    * Look for logic errors, code smells, style consistency, and potential bugs.
    * Identify redundant code or "copy-paste" patterns that increase the maintenance burden.
    * Check if there any unnecessarily large files or functions that could benefit from being broken up.
    * Check for code readability and maintainability.
    * For high-risk code (financial logic, auth, SECURITY DEFINER RPCs, RLS policies) or complex logic that would benefit from tests, verify there are corresponding tests. Do not flag missing tests for routine code.

4.  **Security & Performance**: 
    * Identify security holes (especially Supabase RLS and monetary payments).
    * Look for performance regressions (like unnecessary client-side rendering or "waterfall" fetches).

**Provide the review in this format:**
1. Overall summary and feedback
2. Sort and number the issues from most important to least important and place them into these categories. Every item must be actionable — do not include praise or observations that require no changes:
    * Critical
    * Major
    * Minor
    * Trivial / Nitpick
3. For each issue, rate it as either:
    * **straightforward** — safe to apply without further discussion
    * **needs discussion** — higher risk, multiple valid approaches, or behavioral changes worth talking through
4. Do not apply any fixes. Wait for the user to pick which issues to address. When the user selects a **needs discussion** issue, explain the trade-offs and align on an approach before making changes.