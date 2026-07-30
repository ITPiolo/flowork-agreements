'use client';

import { createBrowserClient } from '@supabase/ssr';

// Client Components — used for the login page's magic-link request.
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
