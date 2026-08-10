// Declares the module types for statically imported image files (`.svg`,
// `.png`, ...) so `import logo from "@/assets/…"` resolves to Next's
// `StaticImageData` instead of erroring as an untyped module.
//
// Next ships these declarations, but only via the generated `next-env.d.ts`,
// which is gitignored and written by `next dev` / `next build`. `npm run
// type-check` is a bare `tsc --noEmit`, so on a clean checkout — a fresh clone,
// a new git worktree, or CI where type-check runs before any build — that file
// does not exist yet and every static asset import fails to compile. Committing
// the reference here makes it order-independent; it is idempotent when
// `next-env.d.ts` is also present.
/// <reference types="next/image-types/global" />
