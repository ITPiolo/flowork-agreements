'use client';

import { useEffect, useState } from 'react';
import StaffNav from '@/app/components/StaffNav';

const STATUS_META = {
  draft: { label: 'Awaiting client', color: '#8a6d00', bg: '#fdf6e3' },
  sent: { label: 'Awaiting signature', color: '#1a5fb4', bg: '#eaf2fb' },
  completed: { label: 'Signed', color: '#1e5c34', bg: '#eaf6ee' },
};
const DOC_LABELS = { house_rules: 'House Rules', kyc: 'KYC Form' };

function fmt(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function AgreementsListPage() {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/agreements/completed')
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error);
        setAgreements(data.agreements);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <StaffNav />
      <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px 60px', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Agreements</h1>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
          Every agreement sent, from client intake through to a signed document.
        </p>

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        {!loading && !error && agreements.length === 0 && (
          <p style={{ color: '#999' }}>No agreements yet.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {agreements.map((a) => (
            <AgreementCard key={a.id} agreement={a} />
          ))}
        </div>
      </main>
    </>
  );
}

function AgreementCard({ agreement: a }) {
  const meta = STATUS_META[a.status] || { label: a.status, color: '#666', bg: '#f4f4f4' };

  return (
    <div style={{ border: '1px solid #e3e3e3', borderRadius: 10, padding: 18, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {a.clientCompanyName || 'Unnamed client'}
            <span style={{ fontWeight: 400, color: '#999', marginLeft: 8, fontSize: 13 }}>{a.clientEmail}</span>
          </div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
            {a.locationCode} · {DOC_LABELS[a.docType] ?? a.docType}
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: meta.color,
            background: meta.bg,
            padding: '4px 10px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          {meta.label}
        </span>
      </div>

      <Timeline agreement={a} />

      {a.uploads && a.uploads.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 6 }}>
            Client-uploaded documents
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {a.uploads.map((u, i) => (
              <li key={i} style={{ marginBottom: 2 }}>
                {u.downloadUrl ? (
                  <a href={u.downloadUrl} target="_blank" rel="noopener noreferrer">
                    {u.filename}
                  </a>
                ) : (
                  u.filename
                )}
                {u.uploadedAt && <span style={{ color: '#999' }}> — uploaded {fmt(u.uploadedAt)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {a.downloadUrl && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <a
            href={a.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              fontSize: 13,
              fontWeight: 600,
              color: '#2B3227',
              border: '1px solid #2B3227',
              borderRadius: 6,
              padding: '6px 12px',
              textDecoration: 'none',
            }}
          >
            View / Download signed PDF
          </a>
        </div>
      )}
    </div>
  );
}

function Timeline({ agreement: a }) {
  const steps = [
    { label: 'Requested', at: a.createdAt, done: true },
    { label: 'Submitted / Sent', at: a.sentAt, done: !!a.sentAt },
    { label: 'Signed', at: a.completedAt, done: !!a.completedAt },
  ];

  return (
    <div style={{ display: 'flex', gap: 0, marginTop: 14 }}>
      {steps.map((step, i) => (
        <div key={step.label} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: step.done ? '#2B3227' : '#ddd',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: step.done ? '#2B3227' : '#aaa' }}>
                {step.label}
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#999', marginLeft: 14 }}>
              {step.at ? fmt(step.at) : '—'}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: steps[i + 1].done ? '#2B3227' : '#e3e3e3', margin: '0 8px' }} />
          )}
        </div>
      ))}
    </div>
  );
}
