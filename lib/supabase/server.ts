import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * Supabase client bound to the current request's cookies — use in server
 * components, route handlers, and server actions. Honors RLS for the
 * signed-in user.
 */
type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export function createSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — setAll is a no-op there, which is fine
            // as long as middleware refreshes the session.
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS. Use ONLY in trusted server code
 * (route handlers, server actions). NEVER expose to the client.
 *
 * Used by the public /api/invite/[token] routes since the friend isn't
 * authenticated.
 */
export function createSupabaseService() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
