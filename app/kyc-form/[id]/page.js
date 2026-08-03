'use client';

import { useEffect, useState, use as usePromise } from 'react';
import { KYC_FORM_SECTIONS } from '@/lib/kycFormSchema';

export default function KycFormPage({ params }) {
  const { id } = usePromise(params);

  const [prefill, setPrefill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [values, setValues] = useState({});
  const [uploads, setUploads] = useState({}); // { [docId]: { status, filename, path, error } }
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

  async function uploadFile(docId, file) {
    setUploads((u) => ({ ...u, [docId]: { status: 'uploading', filename: file.name } }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('docId', docId);
      const res = await fetch(`/api/kyc-form/${id}/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Upload failed');
      setUploads((u) => ({ ...u, [docId]: { status: 'done', filename: data.filename, path: data.path, uploadedAt: data.uploadedAt } }));
    } catch (err) {
      setUploads((u) => ({ ...u, [docId]: { status: 'error', filename: file.name, error: err.message } }));
    }
  }

  const hasAtLeastOneUpload = Object.entries(uploads).some(([docId, u]) => docId !== 'company_stamp' && u.status === 'done');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    if (!hasAtLeastOneUpload) {
      setSubmitError('Please attach at least one document before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const uploadedDocuments = Object.entries(uploads)
        .filter(([docId, u]) => docId !== 'company_stamp' && u.status === 'done')
        .map(([docId, u]) => ({ docId, path: u.path, filename: u.filename, uploadedAt: u.uploadedAt }));

      const res = await fetch(`/api/kyc-form/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values, uploadedDocuments, stampDocumentPath: uploads.company_stamp?.path }),
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
                <FieldRow
                  key={field.id}
                  field={field}
                  values={values}
                  setValue={setValue}
                  uploads={uploads}
                  uploadFile={uploadFile}
                />
              ))}
            </div>
          </fieldset>
        ))}

        {submitError && <p style={{ color: '#b00020' }}>{submitError}</p>}

        <p style={{ fontSize: 13, color: '#666', background: '#f4f6f2', padding: 12, borderRadius: 6 }}>
          Once you click below, you&apos;ll be taken straight to DocuSign to review and sign the completed document
          &mdash; no separate email needed. DocuSign will ask you to attach your company stamp there before you can finish.
        </p>

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

function FieldRow({ field, values, setValue, uploads, uploadFile }) {
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

  if (field.type === 'stampUpload') {
    return (
      <label>
        <span style={labelStyle}>
          {field.label}
          {field.required && ' *'}
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(field.id, file);
          }}
          style={{ fontSize: 13 }}
        />
        <UploadStatus upload={uploads[field.id]} />
      </label>
    );
  }

  if (field.type === 'checkboxGroup') {
    return (
      <div>
        <span style={labelStyle}>{field.label}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {field.options.map((opt) => (
            <div key={opt.id}>
              <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!values[opt.id]}
                  onChange={(e) => setValue(opt.id, e.target.checked)}
                />
                {opt.label}
              </label>
              {field.allowUpload && values[opt.id] && (
                <div style={{ marginLeft: 24, marginTop: 4 }}>
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(opt.id, file);
                    }}
                    style={{ fontSize: 12 }}
                  />
                  <UploadStatus upload={uploads[opt.id]} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function UploadStatus({ upload }) {
  if (!upload) return null;
  if (upload.status === 'uploading') {
    return <span style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Uploading {upload.filename}…</span>;
  }
  if (upload.status === 'done') {
    return <span style={{ fontSize: 12, color: '#2B3227', marginLeft: 8 }}>✓ {upload.filename} attached</span>;
  }
  if (upload.status === 'error') {
    return <span style={{ fontSize: 12, color: '#b00020', marginLeft: 8 }}>Failed: {upload.error}</span>;
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
