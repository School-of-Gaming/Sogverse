// Re-export Supabase utilities
// Note: Import the specific module you need based on your context:
// - client.ts for Client Components (browser)
// - server.ts for Server Components and Route Handlers
// - admin.ts for server-only operations that bypass RLS

export { createClient as createBrowserClient, getClient } from "./client";
export {
  createClient as createServerClient,
  getSession,
  getUser,
  getUserWithProfile,
} from "./server";
export { createAdminClient } from "./admin";
