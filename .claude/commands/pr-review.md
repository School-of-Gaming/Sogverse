---
name: pr-review
description: Thorough PR review focusing on architecture, code duplication, and design integrity.
---

I want you to perform a thorough Pull Request review of the current feature branch against the 'dev' branch.

1.  **Diff Analysis**: Check the diff between the current branch and the dev branch.

2.  **Architecture & Design**: 
    * **Code Duplication & DRY**: Does this PR introduce logic, types, or UI patterns that already exist elsewhere? Can we abstract this into a shared utility, hook, or component?
    * **Alignment**: Does this align with the existing architectural patterns?
    * **Abstractions**: Are implementation details exposed inappropriately (leaky abstractions)?
    * **Responsibility**: Do new modules follow the Single Responsibility Principle?

3.  **Code Quality**: 
    * Look for logic errors, code smells, and potential bugs.
    * Identify redundant code or "copy-paste" patterns that increase the maintenance burden.
    * Verify that core business logic and critical UI components have corresponding tests.

4.  **Security & Performance**: 
    * Identify security holes (especially Supabase RLS).
    * Look for performance regressions (like unnecessary client-side rendering or "waterfall" fetches).

Please provide the review in a structured format:
- **Architectural & DRY Feedback**: High-level design and reusability thoughts.
- **Critical**: Must-fix bugs, security issues, or major duplication.
- **Suggested**: Improvements for readability/maintainability.
- **Nitpick**: Minor style points.