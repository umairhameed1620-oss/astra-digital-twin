import React, { useState, useEffect } from 'react';
import OrbitalVisualiser from '../components/visualiser/OrbitalVisualiser';
import { spacecraft as scApi } from '../utils/api';

const LIFECYCLE = [
  { key: 'designed', label: 'Designed', color: 'var(--text-muted)' },
  { key: 'launched', label: 'Launched', color: 'var(--accent-amber)' },
  { key: 'operational', label: 'Operational', color: 'var(--accent-green)' },
  { key: 'decommissioned', label: 'Decommissioned', color: 'var(--accent-red)' },
];

const statusInfo = (status) =>
  LIFECYCLE.find(s => s.key === status) ||
  { key: status, label: status === 'simulating' ? 'Simulating' : (status || 'Unknown'), color: 'var(--accent-primary)' };

// Same RAAN the 3D visualiser uses, so the numbers match the globe
const hash = (s) => {
  let x = 0;
  for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(x);
};

const VisualisePage = () => {
  const [spacecraft, setSpacecraft] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState('');

  useEffect(() => {
    scApi.getAll().then(res => {
      const scArr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setSpacecraft(scArr);
      if (scArr.length) setSelectedId(scArr[0].id);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const selected = spacecraft.find(s => String(s.id) === String(selectedId));

  const changeStatus = async (status) => {
    if (!selected || saving) return;
    if (status === 'decommissioned' &&
        !window.confirm(`Decommission ${selected.name}? This marks the end of its mission.`)) return;
    setSaving(true);
    setStatusError('');
    try {
      const res = await scApi.setStatus(selected.id, status);
      const updated = res.data || {};
      setSpacecraft(list => list.map(s => (String(s.id) === String(selected.id) ? { ...s, ...updated, status } : s)));
    } catch (err) {
      console.error(err);
      setStatusError(err?.response?.data?.error || 'Could not update status.');
    } finally {
      setSaving(false);
    }
  };

  const cfg = selected?.config || {};
  const altitude = Number(cfg.altitude) || null;
  const inclination = cfg.inclination != null ? Number(cfg.inclination) : null;
  const deltaV = cfg.deltaV ?? cfg.deltaVBudget ?? cfg.dv;
  const raan = selected ? (cfg.raan != null ? Number(cfg.raan) : hash(selected.id) % 360) : 0;
  const period = altitude ? Math.round(2 * Math.PI * Math.sqrt(Math.pow((6371 + altitude) * 1000, 3) / 3.986004418e14) / 60) : null;
  const velocity = altitude ? Math.sqrt(398600.4418 / (6371 + altitude)).toFixed(3) : null;

  const lifeIdx = selected ? LIFECYCLE.findIndex(s => s.key === selected.status) : -1;
  const next = lifeIdx >= 0 && lifeIdx < LIFECYCLE.length - 1 ? LIFECYCLE[lifeIdx + 1] : null;
  const prev = lifeIdx > 0 ? LIFECYCLE[lifeIdx - 1] : null;

  return (
    <div className="animate-in" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 6 }}>3D MISSION VISUALISER</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Orbital Operations Centre</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {spacecraft.map(sc => (
              <button key={sc.id} onClick={() => setSelectedId(sc.id)} className="btn" style={{
                padding: '6px 14px', fontSize: 12,
                background: String(selectedId) === String(sc.id) ? 'var(--accent-glow)' : 'transparent',
                color: String(selectedId) === String(sc.id) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                border: `1px solid ${String(selectedId) === String(sc.id) ? 'var(--accent-primary)' : 'var(--border)'}`,
              }}>{sc.name}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, minHeight: 0 }}>
        {/* 3D Canvas */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              Initialising 3D engine...
            </div>
          ) : spacecraft.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛸</div>
              <div style={{ color: 'var(--text-secondary)' }}>No spacecraft to visualise</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>Create spacecraft twins first</div>
            </div>
          ) : (
            <OrbitalVisualiser spacecraft={spacecraft} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>

        {/* Side panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
          {selected ? (
            <>
              {/* Selected object */}
              <div className="card">
                <div className="section-title">Selected Object</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>{{ satellite: '🛰️', rocket: '🚀', station: '🔭', rover: '🤖' }[selected.type]}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{selected.name}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <span className={`badge badge-${selected.type}`}>{selected.type}</span>
                      <span className="badge" style={{ color: statusInfo(selected.status).color, border: `1px solid ${statusInfo(selected.status).color}` }}>
                        {statusInfo(selected.status).label}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Altitude', altitude ? `${altitude} km` : null],
                    ['Inclination', inclination != null ? `${inclination}°` : null],
                    ['ΔV Budget', deltaV != null ? `${deltaV} m/s` : null],
                    ['Orbital Period', period ? `${period} min` : null],
                    ['Velocity', velocity ? `${velocity} km/s` : null],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mission lifecycle */}
              <div className="card">
                <div className="section-title">Mission Lifecycle</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 14 }}>
                  {LIFECYCLE.map((step, i) => {
                    const done = lifeIdx >= 0 && i < lifeIdx;
                    const current = i === lifeIdx;
                    return (
                      <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                        <div style={{
                          width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                          background: current ? step.color : done ? 'var(--accent-primary)' : 'transparent',
                          border: `2px solid ${current ? step.color : done ? 'var(--accent-primary)' : 'var(--border)'}`,
                          boxShadow: current ? `0 0 8px ${step.color}` : 'none',
                        }} />
                        <span style={{
                          fontSize: 12,
                          color: current ? step.color : done ? 'var(--text-secondary)' : 'var(--text-muted)',
                          fontWeight: current ? 600 : 400,
                        }}>{step.label}</span>
                        {current && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>CURRENT</span>}
                      </div>
                    );
                  })}
                </div>

                {lifeIdx === -1 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Status is <strong>{statusInfo(selected.status).label}</strong>. Reset to start the lifecycle.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  {lifeIdx === -1 ? (
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 12 }} disabled={saving} onClick={() => changeStatus('designed')}>
                      Reset to Designed
                    </button>
                  ) : (
                    <>
                      {prev && (
                        <button className="btn btn-secondary" style={{ fontSize: 12 }} disabled={saving} onClick={() => changeStatus(prev.key)}>
                          ← Back
                        </button>
                      )}
                      {next && (
                        <button className="btn btn-primary" style={{ flex: 1, fontSize: 12 }} disabled={saving} onClick={() => changeStatus(next.key)}>
                          {saving ? 'Updating…' : `${next.key === 'decommissioned' ? 'Decommission' : `Mark ${next.label}`} →`}
                        </button>
                      )}
                    </>
                  )}
                </div>

                {statusError && (
                  <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-red)' }}>{statusError}</div>
                )}
              </div>

              {/* Orbital elements */}
              <div className="card">
                <div className="section-title">Orbital Elements</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Semi-major axis', altitude ? `${(6371 + altitude).toFixed(0)} km` : 'N/A'],
                    ['Eccentricity', '0.0000 (circular)'],
                    ['Inclination', inclination != null ? `${inclination.toFixed(2)}°` : 'N/A'],
                    ['RAAN', `${raan.toFixed(1)}°`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: 30 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Select a spacecraft</div>
            </div>
          )}

          {/* Fleet summary */}
          <div className="card">
            <div className="section-title">Fleet ({spacecraft.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {spacecraft.map(sc => {
                const info = statusInfo(sc.status);
                const isSel = String(selectedId) === String(sc.id);
                return (
                  <div key={sc.id} onClick={() => setSelectedId(sc.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    borderRadius: 6, cursor: 'pointer',
                    background: isSel ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                    border: `1px solid ${isSel ? 'var(--accent-primary)' : 'var(--border)'}`,
                    transition: 'all 0.2s'
                  }}>
                    <span style={{ fontSize: 14 }}>{{ satellite: '🛰️', rocket: '🚀', station: '🔭', rover: '🤖' }[sc.type]}</span>
                    <span style={{ fontSize: 12, flex: 1, color: 'var(--text-primary)' }}>{sc.name}</span>
                    <span style={{ fontSize: 10, color: info.color, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: info.color, display: 'inline-block' }} />
                      {info.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualisePage;
