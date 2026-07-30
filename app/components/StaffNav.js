'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function StaffNav() {
  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <nav
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '16px 20px 0',
        display: 'flex',
        gap: 16,
        fontSize: 14,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <a href="/agreements/new">New Agreement</a>
      <a href="/agreements/list">Signed Agreements</a>
      <button
        onClick={handleSignOut}
        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 14 }}
      >
        Sign out
      </button>
    </nav>
  );
}
