import React, { useState, useEffect } from 'react';
import { missions as mApi, spacecraft as scApi } from '../utils/api';

const MissionsPage = () => {
  const [missions, setMissions] = useState([]);
  const [spacecraft, setSpacecraft] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', spacecraftId: '', description: '', objectives: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([mApi.getAll(), scApi.getAll()]).then(([ms, sc]) => {
      setMissions(ms.data || []);
      setSpacecraft(sc.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const create = async () => {
    if (!form.name) return;
    try {
      const res = await mApi.create({ ...form, objectives: form.objectives.split('\n').filter(Boolean) });
      setMissions([res.data, ...missions]);
      setShowForm(false);
      setForm({ name: '', spacecraftId: '', description: '', objectives: '' });
    } catch (err) { console.error(err); }
  };

  const statusColor = { planning: 'warning', active: 'nominal', completed: 'satellite', aborted: 'critical' };

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>MISSION CONTROL</div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Mission Registry</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">+ Plan Mission</button>
      </div>

      {showForm && (
        <div className="card animate-in" style={{ marginBottom: 24 }}>
          <div className="section-title">New Mission</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Mission Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="ARTEMIS-3, STARLINK-G6..." />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Spacecraft</label>
              <select value={form.spacecraftId} onChange={e => setForm({...form, spacecraftId: e.target.value})}>
                <option value="">— Select Twin —</option>
                {spacecraft.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Mission Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} />
          </div>
          <div className="form-group">
            <label>Objectives (one per line)</label>
            <textarea value={form.objectives} onChange={e => setForm({...form, objectives: e.target.value})} placeholder="Deploy to target orbit&#10;Activate payload&#10;Begin science operations" rows={3} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={create} className="btn btn-primary">Create Mission</button>
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
          ) : missions.map(m => (
            <div key={m.id} className="card" style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600 }}>{m.name}</h3>
                  <span className={`badge badge-${statusColor[m.status]}`}>{m.status}</span>
                </div>
                {m.description && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>{m.description}</p>}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Spacecraft: <span style={{ color: 'var(--text-secondary)' }}>{m.spacecraft_name || 'None assigned'}</span>
                  {' · '}Created: <span style={{ color: 'var(--text-secondary)' }}>{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MissionsPage;
