'use client';

import { useState, use as usePromise } from 'react';

export default function PublicHouseRulesStartPage({ params }) {
  const { location } = usePromise(params);

  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/${location}/house_rules/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, contactName, email }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Something went wrong');
      window.location.href = data.signingUrl;
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const labelStyle = { fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 };
  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };

  return (
    <main style={{ maxWidth: 480, margin: '60px auto', padding: '0 20px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>House Rules</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Enter your details below. You&apos;ll then be taken straight to DocuSign to review and sign.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label>
          <span style={labelStyle}>Company Name *</span>
          <input style={inputStyle} required value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>Contact Name</span>
          <input style={inputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </label>
        <label>
          <span style={labelStyle}>Email *</span>
          <input type="email" style={inputStyle} required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {error && <p style={{ color: '#b00020', fontSize: 13 }}>{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          style={{
            background: '#2B3227',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '14px 20px',
            fontSize: 15,
            cursor: submitting ? 'not-allowed' : 'pointer',
            marginTop: 8,
          }}
        >
          {submitting ? 'Submitting…' : 'Continue to sign'}
        </button>
      </form>
    </main>
  );
}
