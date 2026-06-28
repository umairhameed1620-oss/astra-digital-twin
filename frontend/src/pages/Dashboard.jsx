import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';

const SPACECRAFT_TYPES = [
  { value: 'satellite', label: '🛰️ Satellite', desc: 'LEO/MEO/GEO orbit' },
  { value: 'rocket', label: '🚀 Launch Vehicle', desc: 'Multi-stage rocket' },
  { value: 'space_station', label: '🏗️ Space Station', desc: 'Modular station' },
  { value: 'rover', label: '🤖 Rover', desc: 'Surface explorer' },
];

const TYPE_ICONS = { satellite: '🛰️', rocket: '🚀', space_station: '🏗️', rover: '🤖' };
const STATUS_COLORS = { design: 'blue', simulation: 'purple', active: 'green', decommissioned: 'red' };

export default function Dashboard() {
  const { user, token, logout, apiUrl } = useAuth();
  const navigate = useNavigate();
  const [spacecraft, setSpacecraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'satellite', description: '' });
  const [error, setError] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetchSpacecraft();
  }, []);

  const fetchSpacecraft = async () => {
    try {
      const res = await fetch(`${apiUrl}/spacecraft`, { headers: authHeaders });
      const data = await res.json();
      setSpacecraft(data.spacecraft || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const createSpacecraft = async (e) => {
    e.preventDefault();
    setCreating(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/spacecraft`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSpacecraft(prev => [data.spacecraft, ...prev]);
      setShowCreate(false);
      setForm({ name: '', type: 'satellite', description: '' });
      navigate(`/spacecraft/${data.spacecraft.id}/builder`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const totalMission = spacecraft.filter(s => s.status === 'active').length;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
              Mission Fleet
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Welcome back, {user?.fullName?.split(' ')[0]}. {spacecraft.length} spacecraft in registry.
            </p>
          </div>
          <button className="btn-primary" onClick={() => setShowCreate(true)} style={{ flexShrink: 0 }}>
            + New Spacecraft Twin
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid-4" style={{ marginBottom: 32 }}>
          {[
            { label: 'Total Twins', value: spacecraft.length, icon: '🛸', color: 'var(--accent-blue)' },
            { label: 'Active Missions', value: spacecraft.filter(s=>s.status==='active').length, icon: '✅', color: 'var(--accent-green)' },
            { label: 'In Simulation', value: spacecraft.filter(s=>s.status==='simulation').length, icon: '⚙️', color: 'var(--accent-purple)' },
            { label: 'In Design', value: spacecraft.filter(s=>s.status==='design').length, icon: '✏️', color: 'var(--accent-cyan)' },
          ].map((stat, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>{stat.icon}</span>
                <span style={{ fontSize: 28, fontWeight: 700, fontFamily: 'Orbitron, sans-serif', color: stat.color }}>{stat.value}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Spacecraft Grid */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔄</div>
            <p>Loading spacecraft registry...</p>
          </div>
        ) : spacecraft.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <div style={{ fontSize: 60, marginBottom: 20 }}>🛸</div>
            <h3 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No spacecraft twins yet</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>Create your first digital twin to begin simulation</p>
            <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Create First Twin</button>
          </div>
        ) : (
          <div className="grid-3">
            {spacecraft.map((sc, i) => (
              <div key={sc.id} className="card" style={{ cursor: 'pointer', animation: `fadeIn 0.4s ease-out ${i * 0.08}s both` }}
                onClick={() => navigate(`/spacecraft/${sc.id}`)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: 36 }}>{TYPE_ICONS[sc.type] || '🛸'}</div>
                  <span className={`badge badge-${STATUS_COLORS[sc.status] || 'blue'}`}>{sc.status}</span>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: 'var(--text-primary)' }}>{sc.name}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize', marginBottom: 12 }}>
                  {sc.type.replace('_', ' ')}
                </p>
                {sc.description && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {sc.description}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 16, paddingTop: 12, borderTop: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Components</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-blue-light)', fontFamily: 'monospace' }}>
                      {sc.component_count || 0}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Mass</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>
                      {parseFloat(sc.total_mass_kg || 0).toFixed(1)} kg
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Power</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent-green)', fontFamily: 'monospace' }}>
                      {parseFloat(sc.total_power_generation_w || 0).toFixed(0)} W
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: '7px 12px', justifyContent: 'center' }}
                    onClick={e => { e.stopPropagation(); navigate(`/spacecraft/${sc.id}/builder`); }}>
                    🔧 Builder
                  </button>
                  <button className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: '7px 12px', justifyContent: 'center' }}
                    onClick={e => { e.stopPropagation(); navigate(`/spacecraft/${sc.id}/simulation`); }}>
                    ⚙️ Simulate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="card" style={{ width: '100%', maxWidth: 520, padding: 32, animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Create Spacecraft Twin</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>

            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--accent-red)', fontSize: 13 }}>{error}</div>}

            <form onSubmit={createSpacecraft} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label>Spacecraft Name</label>
                <input placeholder="e.g. Sentinel-1A, Falcon Heavy Demo" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>

              <div>
                <label>Spacecraft Type</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  {SPACECRAFT_TYPES.map(t => (
                    <div key={t.value} onClick={() => setForm(f => ({ ...f, type: t.value }))}
                      style={{ padding: '12px 14px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${form.type === t.value ? 'var(--accent-blue)' : 'var(--border)'}`,
                        background: form.type === t.value ? 'rgba(59,130,246,0.1)' : 'var(--bg-secondary)', transition: 'all 0.15s' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{t.label.split(' ')[0]}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: form.type === t.value ? 'var(--accent-blue-light)' : 'var(--text-primary)' }}>{t.label.split(' ').slice(1).join(' ')}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label>Mission Description <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                <textarea placeholder="Brief mission overview..." value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)} style={{ flex: 1, justifyContent: 'center' }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={creating} style={{ flex: 2, justifyContent: 'center', padding: '12px' }}>
                  {creating ? 'Creating...' : '🚀 Create & Open Builder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
