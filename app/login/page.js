'use client';

import { useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (signInError) throw signInError;
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: '80px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Flowork Staff Login</h1>
      <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>
        Enter your @flowork.me email to get a sign-in link.
      </p>

      {sent ? (
        <p style={{ fontSize: 14 }}>
          Check <strong>{email}</strong> for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            required
            placeholder="you@flowork.me"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '10px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
          />
          {error && <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            style={{
              background: '#2B3227',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '12px 18px',
              fontSize: 15,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      )}
    </main>
  );
}
