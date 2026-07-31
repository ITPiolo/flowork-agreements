'use client';

import { useEffect, useState } from 'react';
import StaffNav from '@/app/components/StaffNav';

export default function AdminStaffPage() {
  const [staff, setStaff] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [entityId, setEntityId] = useState(''); // '' = all entities
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  function loadStaff() {
    setLoading(true);
    fetch('/api/admin/staff')
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error);
        setStaff(data.staff);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadStaff();
    fetch('/api/entities')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setEntities(data.entities);
      });
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setAddError('');
    setAdding(true);
    try {
      const res = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, entityId: entityId || null }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setEmail('');
      setEntityId('');
      loadStaff();
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id) {
    if (!confirm('Remove this person\'s access?')) return;
    const res = await fetch(`/api/admin/staff/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error);
      return;
    }
    loadStaff();
  }

  return (
    <>
      <StaffNav />
      <main style={{ maxWidth: 700, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Staff Access</h1>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
          Add or remove who can sign in to Flowork Agreements, and which location(s) they can work with.
        </p>

        <form
          onSubmit={handleAdd}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 24, border: '1px solid #ddd', borderRadius: 8, padding: 16 }}
        >
          <label style={{ flex: 1, fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Email</span>
            <input
              type="email"
              required
              placeholder="name@flowork.me"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
            />
          </label>
          <label style={{ fontSize: 13 }}>
            <span style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Access</span>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 }}
            >
              <option value="">All locations (admin)</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.location_code} only
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={adding}
            style={{ background: '#2B3227', color: 'white', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 14, cursor: adding ? 'not-allowed' : 'pointer' }}
          >
            {adding ? 'Adding…' : 'Add'}
          </button>
        </form>
        {addError && <p style={{ color: '#b00020', marginTop: -16, marginBottom: 16 }}>{addError}</p>}

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#b00020' }}>{error}</p>}

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '8px 4px' }}>Email</th>
              <th style={{ padding: '8px 4px' }}>Access</th>
              <th style={{ padding: '8px 4px' }}>Added</th>
              <th style={{ padding: '8px 4px' }}></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '8px 4px' }}>{s.email}</td>
                <td style={{ padding: '8px 4px' }}>
                  {s.entityId === null ? (
                    <span style={{ fontWeight: 600 }}>All locations</span>
                  ) : (
                    s.locationCode
                  )}
                </td>
                <td style={{ padding: '8px 4px', color: '#999' }}>{new Date(s.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '8px 4px' }}>
                  <button
                    onClick={() => handleRemove(s.id)}
                    style={{ background: 'none', border: 'none', color: '#b00020', cursor: 'pointer', fontSize: 13 }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}
