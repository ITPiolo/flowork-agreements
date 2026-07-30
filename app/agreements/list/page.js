'use client';

import { useEffect, useState } from 'react';
import StaffNav from '@/app/components/StaffNav';

export default function CompletedAgreementsPage() {
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
      <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Signed Agreements</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Completed, signed documents ready to view or download.
      </p>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: '#b00020' }}>{error}</p>}
      {!loading && !error && agreements.length === 0 && (
        <p style={{ color: '#999' }}>No completed agreements yet.</p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: '8px 4px' }}>Location</th>
            <th style={{ padding: '8px 4px' }}>Client</th>
            <th style={{ padding: '8px 4px' }}>Document</th>
            <th style={{ padding: '8px 4px' }}>Signed</th>
            <th style={{ padding: '8px 4px' }}></th>
          </tr>
        </thead>
        <tbody>
          {agreements.map((a) => (
            <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '8px 4px' }}>{a.locationCode}</td>
              <td style={{ padding: '8px 4px' }}>
                {a.clientCompanyName}
                <div style={{ color: '#999', fontSize: 12 }}>{a.clientEmail}</div>
              </td>
              <td style={{ padding: '8px 4px' }}>{a.docLabel}</td>
              <td style={{ padding: '8px 4px' }}>
                {a.completedAt ? new Date(a.completedAt).toLocaleDateString() : '—'}
              </td>
              <td style={{ padding: '8px 4px' }}>
                {a.downloadUrl ? (
                  <a href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
                    View / Download
                  </a>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </main>
    </>
  );
}
