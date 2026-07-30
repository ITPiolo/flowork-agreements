import { createClient } from '@supabase/supabase-js';

// Server-only, bypasses RLS entirely. Only for backend-to-backend paths with no user session
// (the DocuSign webhook) — never import this into a route that should be entity-scoped to staff.
export function getSupabaseServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
