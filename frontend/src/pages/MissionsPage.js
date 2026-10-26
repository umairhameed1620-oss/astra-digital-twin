import React, { useState, useEffect } from 'react';
import { missions as mApi, spacecraft as scApi } from '../utils/api';

// Accepts any API response shape and returns an array
const toList = (res) => {
  const body = res && res.data !== undefined ? res.data : res;
  const candidates = [
    body,
    body?.data,
    body?.missions,
    body?.spacecraft,
    body?.data?.missions,
    body?.data?.spacecraft,
    body?.items,
    body?.results,
  ];
  return candidates.find(Array.isArray) || [];
};

// Accepts any API response shape and returns the created object
const toObj = (res) => {
  const body = res && res.data !== undefined ? res.data : res;
  if (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) return body.data;
  if (body?.mission && typeof body.mission === 'object') return body.mission;
  return body;
};

// Objectives may arrive as an array, a JSON string, or newline text
const toObjectives = (o) => {
  if (Array.isArray(o)) return o.filter(Boolean);
  if (typeof o === 'string' && o.trim()) {
    try {
      const parsed = JSON.parse(o);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (e) { /* not JSON */ }
    return o.split('\n').map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const emptyForm = { name: '', spacecraftId: '', description: '', objectives: '' };

const MissionsPage = () => {
  const [missions, setMissions] = useState([]);
  const [spacecraft, setSpacecraft] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    Promise.all([mApi.getAll(), scApi.getAll()])
      .then(([ms, sc]) => {
        setMissions(toList(ms));
        setSpacecraft(toList(sc));
      })
      .catch(err => {
        console.error(err);
        setError('Could not load missions. Check that the backend is running.');
      })
      .finally(() => setLoading(false));
  }, []);

  // Resolve a spacecraft name from whatever field the backend returns
  const scName = (m) => {
    if (m.spacecraft_name) return m.spacecraft_name;
    if (m.spacecraftName) return m.spacecraftName;
    if (m.spacecraft && typeof m.spacecraft === 'object' && m.spacecraft.name) return m.spacecraft.name;
    const id = m.spacecraft_id ?? m.spacecraftId ?? (typeof m.spacecraft !== 'object' ? m.spacecraft : undefined);
    if (id === undefined || id === null || id === '') return null;
    const sc = spacecraft.find(s => String(s.id) === String(id));
    return sc ? sc.name : null;
  };

  const openForm = () => {
    setError('');
    setForm({ ...emptyForm, spacecraftId: spacecraft.length === 1 ? String(spacecraft[0].id) : '' });
    setShowForm(s => !s);
  };

  const create = async () => {
    setError('');
    if (!form.name.trim()) { setError('Mission name is required.'); return; }
    if (!form.spacecraftId) { setError('Please select a spacecraft for this mission.'); return; }
    setSaving(true);
    try {
      const objectives = form.objectives.split('\n').map(s => s.trim()).filter(Boolean);
      // Send the spacecraft under both naming styles so the backend picks it up either way
      const payload = {
        name: form.name.trim(),
        description: form.description,
        objectives,
        spacecraftId: form.spacecraftId,
        spacecraft_id: form.spacecraftId,
      };
      const res = await mApi.create(payload);
      const created = toObj(res) || {};
      const sc = spacecraft.find(s => String(s.id) === String(form.spacecraftId));
      setMissions([
        {
          ...payload,
          status: 'planning',
          created_at: new Date().toISOString(),
          ...created,
          spacecraft_name: created.spacecraft_name || (sc ? sc.name : undefined),
        },
        ...missions,
      ]);
      setShowForm(false);
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Could not create mission.');
    } finally {
      setSaving(false);
    }
  };

  const statusColor = { planning: 'warning', active: 'nominal', completed: 'satellite', aborted: 'critical' };

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>MISSION CONTROL</div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Mission Registry</h1>
        </div>
        <button onClick={openForm} className="btn btn-primary">+ Plan Mission</button>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div className="card animate-in" style={{ marginBottom: 24 }}>
          <div className="section-title">New Mission</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Mission Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="ARTEMIS-3, STARLINK-G6..." />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Spacecraft</label>
              <select value={form.spacecraftId} onChange={e => setForm({ ...form, spacecraftId: e.target.value })}>
                <option value="">— Select Twin —</option>
                {spacecraft.map(sc => <option key={sc.id} value={String(sc.id)}>{sc.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Mission Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <div className="form-group">
            <label>Objectives (one per line)</label>
            <textarea value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })} placeholder="Deploy to target orbit&#10;Activate payload&#10;Begin science operations" rows={3} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Mission'}</button>
            <button onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {missions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
              <div style={{ color: 'var(--text-secondary)' }}>No missions planned yet</div>
            </div>
          ) : missions.map((m, i) => {
            const key = m.id ?? `tmp-${i}`;
            const status = m.status || 'planning';
            const objectives = toObjectives(m.objectives);
            const name = scName(m);
            const isOpen = expanded === key;
            return (
              <div
                key={key}
                className="card"
                onClick={() => setExpanded(isOpen ? null : key)}
                style={{ display: 'flex', gap: 20, alignItems: 'flex-start', cursor: objectives.length ? 'pointer' : 'default' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600 }}>{m.name}</h3>
                    <span className={`badge badge-${statusColor[status] || 'warning'}`}>{status}</span>
                    {objectives.length > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                        {objectives.length} objective{objectives.length > 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                  {m.description && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>{m.description}</p>}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Spacecraft: <span style={{ color: name ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>{name || 'None assigned'}</span>
                    {' · '}Created: <span style={{ color: 'var(--text-secondary)' }}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</span>
                  </div>
                  {isOpen && objectives.length > 0 && (
                    <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1 }}>OBJECTIVES</div>
                      <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        {objectives.map((o, idx) => <li key={idx}>{o}</li>)}
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MissionsPage;
