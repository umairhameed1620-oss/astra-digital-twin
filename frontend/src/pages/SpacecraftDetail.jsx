import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';

const TYPE_ICONS = { satellite: '🛰️', rocket: '🚀', space_station: '🏗️', rover: '🤖' };

export default function SpacecraftDetail() {
  const { id } = useParams();
  const { token, apiUrl } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/spacecraft/${id}`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${apiUrl}/budget/${id}`, { headers: authHeaders }).then(r => r.json()),
    ]).then(([scData, budgetData]) => {
      setData(scData);
      setBudget(budgetData);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}><Navbar /><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)', color: 'var(--text-muted)' }}>Loading...</div></div>;

  const sc = data?.spacecraft;
  const components = data?.components || [];
  const events = data?.recentEvents || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Fleet</Link>
          <span>/</span>
          <span style={{ color: 'var(--accent-blue-light)' }}>{sc?.name}</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ fontSize: 48 }}>{TYPE_ICONS[sc?.type] || '🛸'}</div>
            <div>
              <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{sc?.name}</h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textTransform: 'capitalize' }}>{sc?.type?.replace('_', ' ')} · {sc?.status}</p>
              {sc?.description && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 6, maxWidth: 500 }}>{sc?.description}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={() => navigate(`/spacecraft/${id}/builder`)}>🔧 Open Builder</button>
            <button className="btn-primary" onClick={() => navigate(`/spacecraft/${id}/simulation`)}>⚙️ Run Simulation</button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid-4" style={{ marginBottom: 24 }}>
          {[
            { label: 'Components', value: components.length, unit: '', color: 'var(--accent-blue)', icon: '🔩' },
            { label: 'Total Mass', value: parseFloat(budget?.massBudget?.totalMassKg || 0).toFixed(1), unit: 'kg', color: 'var(--accent-cyan)', icon: '⚖️' },
            { label: 'Power Gen', value: parseFloat(budget?.powerBudget?.totalGenerationW || 0).toFixed(0), unit: 'W', color: 'var(--accent-green)', icon: '⚡' },
            { label: 'Power Margin', value: parseFloat(budget?.powerBudget?.marginPct || 0).toFixed(1), unit: '%', color: budget?.powerBudget?.status === 'healthy' ? 'var(--accent-green)' : 'var(--accent-yellow)', icon: '📊' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{s.icon}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</span>
              </div>
              <p style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 700, color: s.color }}>
                {s.value}<span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 4 }}>{s.unit}</span>
              </p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          {/* Components list */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Installed Subsystems</h3>
            {components.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <p>No components yet. <Link to={`/spacecraft/${id}/builder`} style={{ color: 'var(--accent-blue-light)' }}>Open Builder →</Link></p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {components.map(comp => (
                  <div key={comp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                    <span className={`status-dot ${comp.status || 'nominal'}`} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{comp.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{comp.category?.replace('_', ' ')}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-yellow)' }}>{parseFloat(comp.mass_kg).toFixed(2)} kg</p>
                      {parseFloat(comp.power_consumption_w) > 0 && <p style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--accent-red)' }}>-{parseFloat(comp.power_consumption_w).toFixed(0)}W</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Events log */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Mission Log</h3>
            {events.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No events logged yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {events.map(ev => (
                  <div key={ev.id} style={{ paddingLeft: 12, borderLeft: `2px solid ${ev.severity === 'critical' ? 'var(--accent-red)' : ev.severity === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-blue)'}` }}>
                    <p style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>{ev.description}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{new Date(ev.timestamp).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
