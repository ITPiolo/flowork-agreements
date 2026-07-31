'use client';

import { useEffect, useState } from 'react';
import StaffNav from '@/app/components/StaffNav';

const DOC_LABELS = { house_rules: 'House Rules', kyc: 'KYC Form' };

export default function NewAgreementPage() {
  const [entities, setEntities] = useState([]);
  const [entityId, setEntityId] = useState('');
  const [docTypes, setDocTypes] = useState([]);
  const [client, setClient] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    tradeLicenceNo: '',
    officeNo: '',
  });
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/entities')
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error);
        setEntities(data.entities);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingEntities(false));
  }, []);

  const selectedEntity = entities.find((e) => e.id === entityId);

  function toggleDocType(docType) {
    setDocTypes((prev) =>
      prev.includes(docType) ? prev.filter((d) => d !== docType) : [...prev, docType]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);

    if (!entityId || docTypes.length === 0 || !client.companyName || !client.email) {
      setError('Location, at least one document, company name, and email are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, docTypes, client }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error || 'Request failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <StaffNav />
      <main style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>New Client Agreement</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Select a location, pick the documents to send, and enter the client&apos;s details.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>Location</legend>
          {loadingEntities ? (
            <p>Loading locations…</p>
          ) : (
            <div style={{ display: 'flex', gap: 12 }}>
              {entities.map((entity) => (
                <label
                  key={entity.id}
                  style={{
                    border: entityId === entity.id ? '2px solid #2B3227' : '1px solid #ccc',
                    borderRadius: 6,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  <input
                    type="radio"
                    name="entity"
                    value={entity.id}
                    checked={entityId === entity.id}
                    onChange={() => {
                      setEntityId(entity.id);
                      setDocTypes([]);
                    }}
                    style={{ marginRight: 8 }}
                  />
                  {entity.location_code} — {entity.name}
                </label>
              ))}
            </div>
          )}
          {selectedEntity && (
            <p style={{ fontSize: 12, color: '#777', marginTop: 10 }}>
              {selectedEntity.address} · {selectedEntity.phone} · {selectedEntity.email}
            </p>
          )}
        </fieldset>

        <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }} disabled={!selectedEntity}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>Documents to send</legend>
          {selectedEntity ? (
            selectedEntity.templates.map((t) => (
              <label key={t.id} style={{ display: 'block', marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={docTypes.includes(t.doc_type)}
                  onChange={() => toggleDocType(t.doc_type)}
                  style={{ marginRight: 8 }}
                />
                {DOC_LABELS[t.doc_type] ?? t.name}
              </label>
            ))
          ) : (
            <p style={{ color: '#999', fontSize: 13 }}>Pick a location first.</p>
          )}
        </fieldset>

        <fieldset style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
          <legend style={{ fontWeight: 600, fontSize: 14 }}>Client details</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Company name *" value={client.companyName} onChange={(v) => setClient({ ...client, companyName: v })} />
            <Field label="Contact name" value={client.contactName} onChange={(v) => setClient({ ...client, contactName: v })} />
            <Field label="Email *" type="email" value={client.email} onChange={(v) => setClient({ ...client, email: v })} />
            <Field label="Phone" value={client.phone} onChange={(v) => setClient({ ...client, phone: v })} />
            <Field label="Trade licence no." value={client.tradeLicenceNo} onChange={(v) => setClient({ ...client, tradeLicenceNo: v })} />
            <Field label="Office no." value={client.officeNo} onChange={(v) => setClient({ ...client, officeNo: v })} />
          </div>
        </fieldset>

        {error && <p style={{ color: '#b00020' }}>{error}</p>}

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
          {submitting ? 'Sending…' : 'Send for signature'}
        </button>
      </form>

      {result && (
        <div style={{ marginTop: 24, padding: 16, background: '#f4f6f2', borderRadius: 8 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>{result.ok ? 'Sent successfully' : 'Completed with errors'}</p>
          <ul style={{ fontSize: 13, paddingLeft: 18 }}>
            {result.results.map((r) => (
              <li key={r.docType}>
                {DOC_LABELS[r.docType] ?? r.docType}:{' '}
                {r.error ? (
                  <span style={{ color: '#b00020' }}>{r.error}</span>
                ) : r.kycFormEmailed ? (
                  'KYC form emailed to client'
                ) : (
                  `envelope ${r.envelopeId}`
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      </main>
    </>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
      />
    </label>
  );
}
