'use client';

import { useEffect, useState } from 'react';
import StaffNav from '@/app/components/StaffNav';

const STATUS_LABELS = {
  draft: 'Awaiting client',
  sent: 'Awaiting signature',
  completed: 'Signed',
};
const STATUS_COLORS = {
  draft: '#8a6d00',
  sent: '#1a5fb4',
  completed: '#2B3227',
};

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
      <main style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Agreements</h1>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
          Every agreement sent, from client intake through to a signed document.
        </p>

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#b00020' }}>{error}</p>}
        {!loading && !error && agreements.length === 0 && (
          <p style={{ color: '#999' }}>No agreements yet.</p>
        )}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '8px 4px' }}>Location</th>
              <th style={{ padding: '8px 4px' }}>Client</th>
              <th style={{ padding: '8px 4px' }}>Document</th>
              <th style={{ padding: '8px 4px' }}>Status</th>
              <th style={{ padding: '8px 4px' }}>Uploaded docs</th>
              <th style={{ padding: '8px 4px' }}>Signed PDF</th>
            </tr>
          </thead>
          <tbody>
            {agreements.map((a) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px 4px' }}>{a.locationCode}</td>
                <td style={{ padding: '8px 4px' }}>
                  {a.clientCompanyName || '—'}
                  {a.clientEmail && <div style={{ color: '#999', fontSize: 12 }}>{a.clientEmail}</div>}
                </td>
                <td style={{ padding: '8px 4px' }}>{a.docLabel}</td>
                <td style={{ padding: '8px 4px' }}>
                  <span style={{ color: STATUS_COLORS[a.status] || '#666', fontWeight: 600 }}>
                    {STATUS_LABELS[a.status] || a.status}
                  </span>
                </td>
                <td style={{ padding: '8px 4px' }}>
                  {a.uploads && a.uploads.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {a.uploads.map((u, i) => (
                        <li key={i}>
                          {u.downloadUrl ? (
                            <a href={u.downloadUrl} target="_blank" rel="noopener noreferrer">
                              {u.filename}
                            </a>
                          ) : (
                            u.filename
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    '—'
                  )}
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
