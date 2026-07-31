'use client';

import { useEffect, useState, use as usePromise } from 'react';
import { KYC_FORM_SECTIONS } from '@/lib/kycFormSchema';

export default function KycFormPage({ params }) {
  const { id } = usePromise(params);

  const [prefill, setPrefill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetch(`/api/kyc-form/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error);
        setPrefill(data);
        setValues((v) => ({
          ...v,
          company_name: data.companyName || '',
          company_email: data.email || '',
        }));
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function setValue(fieldId, value) {
    setValues((v) => ({ ...v, [fieldId]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/kyc-form/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Submission failed');
      window.location.href = data.signingUrl;
    } catch (err) {
      setSubmitError(err.message);
      setSubmitting(false);
    }
  }

  if (loading) return <Centered>Loading…</Centered>;
  if (loadError) return <Centered>{loadError}</Centered>;

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{prefill.entityName} — KYC Form</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Please complete this form. Once submitted, you&apos;ll be taken directly to sign the document.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {KYC_FORM_SECTIONS.map((section) => (
          <fieldset key={section.title} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>{section.title}</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
              {section.fields.map((field) => (
                <FieldRow key={field.id} field={field} values={values} setValue={setValue} />
              ))}
            </div>
          </fieldset>
        ))}

        {submitError && <p style={{ color: '#b00020' }}>{submitError}</p>}

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
          }}
        >
          {submitting ? 'Submitting…' : 'Submit and continue to sign'}
        </button>
      </form>
    </main>
  );
}

function FieldRow({ field, values, setValue }) {
  const labelStyle = { fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 };
  const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };

  if (field.type === 'text') {
    return (
      <label>
        <span style={labelStyle}>
          {field.label}
          {field.required && ' *'}
        </span>
        <input
          type={field.inputType || 'text'}
          required={field.required}
          value={values[field.id] || ''}
          onChange={(e) => setValue(field.id, e.target.value)}
          style={inputStyle}
        />
      </label>
    );
  }

  if (field.type === 'radio') {
    return (
      <div>
        <span style={labelStyle}>{field.label}</span>
        <div style={{ display: 'flex', gap: 20 }}>
          {['yes', 'no'].map((opt) => (
            <label key={opt} style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="radio"
                name={field.id}
                checked={values[field.id] === opt}
                onChange={() => setValue(field.id, opt)}
              />
              {opt === 'yes' ? 'Yes' : 'No'}
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === 'checkboxGroup') {
    return (
      <div>
        <span style={labelStyle}>{field.label}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {field.options.map((opt) => (
            <label key={opt.id} style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!values[opt.id]}
                onChange={(e) => setValue(opt.id, e.target.checked)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function Centered({ children }) {
  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <p>{children}</p>
    </main>
  );
}
