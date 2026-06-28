import React, { useState, useEffect } from 'react';
import OrbitalVisualiser from '../components/visualiser/OrbitalVisualiser';
import { spacecraft as scApi } from '../utils/api';

const VisualisePage = () => {
  const [spacecraft, setSpacecraft] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scApi.getAll().then(res => {
      setSpacecraft(res.data?.data || []);
      if (res.data?.data?.length) setSelectedId(res.data.data[0].id);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const selected = spacecraft.find(s => s.id === selectedId);

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
                background: selectedId === sc.id ? 'var(--accent-glow)' : 'transparent',
                color: selectedId === sc.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                border: `1px solid ${selectedId === sc.id ? 'var(--accent-primary)' : 'var(--border)'}`,
              }}>{sc.name}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, minHeight: 0 }}>
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
              <div className="card">
                <div className="section-title">Selected Object</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 28 }}>{{ satellite: '🛰️', rocket: '🚀', station: '🔭', rover: '🤖' }[selected.type]}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{selected.name}</div>
                    <span className={`badge badge-${selected.type}`}>{selected.type}</span>
                  </div>
                </div>
                {selected.config && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selected.config.altitude && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Altitude</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>{selected.config.altitude} km</span>
                      </div>
                    )}
                    {selected.config.inclination && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Inclination</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>{selected.config.inclination}°</span>
                      </div>
                    )}
                    {selected.config.deltaV && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ΔV Budget</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>{selected.config.deltaV} m/s</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Orbital Period</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>
                        {selected.config.altitude ? Math.round(2 * Math.PI * Math.sqrt(Math.pow((6371 + selected.config.altitude) * 1000, 3) / (3.986e14)) / 60) : 'N/A'} min
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="section-title">Orbital Elements</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    ['Semi-major axis', selected.config?.altitude ? `${(6371 + selected.config.altitude).toFixed(0)} km` : 'N/A'],
                    ['Eccentricity', '0.0001'],
                    ['RAAN', `${Math.floor(Math.random() * 360)}°`],
                    ['Arg. of Perigee', `${Math.floor(Math.random() * 360)}°`],
                  ].map(([label, value]) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-title">Ground Track</div>
                <div style={{
                  width: '100%', height: 120, background: 'var(--bg-secondary)',
                  borderRadius: 6, position: 'relative', overflow: 'hidden'
                }}>
                  {/* Simple SVG world map outline */}
                  <svg viewBox="0 0 360 180" style={{ width: '100%', height: '100%', opacity: 0.3 }}>
                    <rect width="360" height="180" fill="none" />
                    {Array.from({ length: 7 }, (_, i) => (
                      <line key={`h${i}`} x1="0" y1={i * 30} x2="360" y2={i * 30} stroke="#1a3a5c" strokeWidth="0.5" />
                    ))}
                    {Array.from({ length: 13 }, (_, i) => (
                      <line key={`v${i}`} x1={i * 30} y1="0" x2={i * 30} y2="180" stroke="#1a3a5c" strokeWidth="0.5" />
                    ))}
                  </svg>
                  {/* Simulated ground track */}
                  <svg viewBox="0 0 360 180" style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
                    <path d={`M 0,90 Q 90,${90 - (selected.config?.inclination || 53) * 0.8} 180,90 Q 270,${90 + (selected.config?.inclination || 53) * 0.8} 360,90`}
                      stroke="#00d4ff" strokeWidth="1.5" fill="none" opacity="0.7" />
                    <circle cx="180" cy="90" r="4" fill="#00d4ff" />
                  </svg>
                  <div style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 10, color: 'var(--text-muted)' }}>Live Track</div>
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
              {spacecraft.map(sc => (
                <div key={sc.id} onClick={() => setSelectedId(sc.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 6, cursor: 'pointer',
                  background: selectedId === sc.id ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                  border: `1px solid ${selectedId === sc.id ? 'var(--accent-primary)' : 'var(--border)'}`,
                  transition: 'all 0.2s'
                }}>
                  <span style={{ fontSize: 14 }}>{{ satellite: '🛰️', rocket: '🚀', station: '🔭', rover: '🤖' }[sc.type]}</span>
                  <span style={{ fontSize: 12, flex: 1, color: 'var(--text-primary)' }}>{sc.name}</span>
                  <span className={`badge badge-${sc.status === 'simulating' ? 'nominal' : 'warning'}`} style={{ fontSize: 9 }}>
                    {sc.status === 'simulating' ? '●' : '○'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualisePage;
