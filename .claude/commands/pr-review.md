---
name: pr-review
description: PR review focusing on architecture, code quaility, testing, and security.
---

I want you to perform a thorough Pull Request review of the current feature branch against the 'dev' branch.

1.  **Analysis**:
    * **Diff**: Check the diff between the current branch and the dev branch.
    * **File Review**: For each file in the diff, read the full file (not just the diff hunks) using the Read tool. This is critical for understanding context around changes — how the changed code fits into the larger file

2.  **Architecture & Design**: 
    * **Code Duplication & DRY**: Does this PR introduce logic, types, or UI patterns that already exist elsewhere? Can we abstract this into a shared utility, hook, or component?
    * **Alignment**: Does this align with the existing architectural patterns?
    * **Abstractions**: Are implementation details exposed inappropriately (leaky abstractions)?
    * **Responsibility**: Do new modules follow the Single Responsibility Principle?
    * **Tech Debt**: Are adding new tech debt to the project?

3.  **Code Quality**: 
    * Look for logic errors, code smells, and potential bugs.
    * Identify redundant code or "copy-paste" patterns that increase the maintenance burden.
    * Check if there any unnecessarily large files or functions that could benefit from being broken up.
    * Verify that essential or complex logic has unit tests and integration tests where appropriate.
    * For critical database logic (monetary transactions, SECURITY DEFINER RPCs, RLS policies protecting sensitive data), verify there are DB tests in `tests/db/`.
    * Verify that critical pages and UI components and have e2e tests.

4.  **Security & Performance**: 
    * Identify security holes (especially Supabase RLS and monetary payments).
    * Look for performance regressions (like unnecessary client-side rendering or "waterfall" fetches).

Please provide the review in a structured format:
- **Architectural & Design Feedback**: High-level design and reusability thoughts.
- **Critical**: Must-fix bugs, security issues, or major duplication.
- **Suggested**: Improvements for readability/maintainability.
- **Nitpick**: Minor style points.