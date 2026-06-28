import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter } from 'recharts';

export default function Simulation() {
  const { id } = useParams();
  const { token, apiUrl } = useAuth();
  const navigate = useNavigate();

  const [spacecraft, setSpacecraft] = useState(null);
  const [simType, setSimType] = useState('orbital');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  // Orbital params
  const [orbParams, setOrbParams] = useState({ altitude_km: 500, inclination_deg: 51.6, duration_minutes: 180 });
  // Ascent params
  const [ascentParams, setAscentParams] = useState({
    payload_mass_kg: 1000,
    stages: [
      { thrust_n: 845000, isp_s: 282, propellant_mass_kg: 120000, dry_mass_kg: 8000 },
      { thrust_n: 95000, isp_s: 348, propellant_mass_kg: 25000, dry_mass_kg: 2000 }
    ]
  });

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch(`${apiUrl}/spacecraft/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setSpacecraft(d.spacecraft));
    fetch(`${apiUrl}/simulation/${id}/history`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setHistory(d.simulations || []));
  }, [id]);

  const runSimulation = async () => {
    setRunning(true); setError(''); setResults(null);
    try {
      const endpoint = simType === 'orbital' ? '/simulation/orbital' : '/simulation/ascent';
      const body = simType === 'orbital'
        ? { spacecraftId: id, ...orbParams }
        : { spacecraftId: id, ...ascentParams };

      const res = await fetch(`${apiUrl}${endpoint}`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResults(data.results);
      // Refresh history
      const hRes = await fetch(`${apiUrl}/simulation/${id}/history`, { headers: { Authorization: `Bearer ${token}` } });
      const hData = await hRes.json();
      setHistory(hData.simulations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Fleet</Link>
          <span>/</span>
          <Link to={`/spacecraft/${id}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{spacecraft?.name}</Link>
          <span>/</span>
          <span style={{ color: 'var(--accent-blue-light)' }}>Simulation</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 700 }}>⚙️ Physics Simulation Engine</h1>
          <button className="btn-secondary" onClick={() => navigate(`/spacecraft/${id}/builder`)}>🔧 Back to Builder</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
          {/* LEFT: Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Sim type selector */}
            <div className="card" style={{ padding: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Simulation Type</p>
              {[
                { value: 'orbital', label: '🛰️ Orbital Mechanics', desc: 'Ground track, eclipse, orbital elements' },
                { value: 'ascent', label: '🚀 Rocket Ascent', desc: 'Multi-stage trajectory simulation' },
              ].map(t => (
                <div key={t.value} onClick={() => { setSimType(t.value); setResults(null); }}
                  style={{ padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 6,
                    border: `1px solid ${simType === t.value ? 'var(--accent-blue)' : 'var(--border)'}`,
                    background: simType === t.value ? 'rgba(59,130,246,0.1)' : 'var(--bg-secondary)', transition: 'all 0.15s' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: simType === t.value ? 'var(--accent-blue-light)' : 'var(--text-primary)', marginBottom: 2 }}>{t.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.desc}</p>
                </div>
              ))}
            </div>

            {/* Parameters */}
            <div className="card" style={{ padding: 16 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Parameters</p>

              {simType === 'orbital' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label>Altitude (km)</label>
                    <input type="number" value={orbParams.altitude_km} onChange={e => setOrbParams(p => ({ ...p, altitude_km: parseFloat(e.target.value) }))} min="200" max="36000" />
                  </div>
                  <div>
                    <label>Inclination (°)</label>
                    <input type="number" value={orbParams.inclination_deg} onChange={e => setOrbParams(p => ({ ...p, inclination_deg: parseFloat(e.target.value) }))} min="0" max="180" />
                  </div>
                  <div>
                    <label>Duration (minutes)</label>
                    <input type="number" value={orbParams.duration_minutes} onChange={e => setOrbParams(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))} min="30" max="1440" />
                  </div>
                  {/* Quick presets */}
                  <div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Quick Presets:</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {[
                        { label: 'ISS', alt: 408, inc: 51.6 },
                        { label: 'Starlink', alt: 550, inc: 53 },
                        { label: 'Sun-sync', alt: 600, inc: 97.8 },
                        { label: 'GEO', alt: 35786, inc: 0 },
                      ].map(p => (
                        <button key={p.label} onClick={() => setOrbParams(prev => ({ ...prev, altitude_km: p.alt, inclination_deg: p.inc }))}
                          style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 }}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {simType === 'ascent' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label>Payload Mass (kg)</label>
                    <input type="number" value={ascentParams.payload_mass_kg} onChange={e => setAscentParams(p => ({ ...p, payload_mass_kg: parseFloat(e.target.value) }))} />
                  </div>
                  {ascentParams.stages.map((stage, i) => (
                    <div key={i} style={{ padding: 10, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 8 }}>Stage {i + 1}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {[
                          { key: 'thrust_n', label: 'Thrust (N)' },
                          { key: 'isp_s', label: 'Isp (s)' },
                          { key: 'propellant_mass_kg', label: 'Propellant (kg)' },
                          { key: 'dry_mass_kg', label: 'Dry Mass (kg)' },
                        ].map(f => (
                          <div key={f.key}>
                            <label style={{ fontSize: 10 }}>{f.label}</label>
                            <input type="number" value={stage[f.key]} style={{ padding: '6px 8px', fontSize: 12 }}
                              onChange={e => {
                                const stages = [...ascentParams.stages];
                                stages[i] = { ...stages[i], [f.key]: parseFloat(e.target.value) };
                                setAscentParams(p => ({ ...p, stages }));
                              }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: 'var(--accent-red)', fontSize: 13 }}>{error}</div>}

            <button className="btn-primary" onClick={runSimulation} disabled={running} style={{ justifyContent: 'center', padding: '14px', fontSize: 15 }}>
              {running ? '⚙️ Simulating...' : '▶ Run Simulation'}
            </button>

            {/* History */}
            {history.length > 0 && (
              <div className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Recent Runs</p>
                {history.slice(0, 5).map(sim => (
                  <div key={sim.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)', fontSize: 11 }}>
                    <p style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{sim.name}</p>
                    <p style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{new Date(sim.started_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Results */}
          <div>
            {!results && !running && (
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, padding: 40 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 60, marginBottom: 20 }}>⚙️</div>
                  <h3 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text-secondary)' }}>Ready to Simulate</h3>
                  <p style={{ fontSize: 13 }}>Configure parameters and click Run Simulation</p>
                </div>
              </div>
            )}

            {running && (
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16, animation: 'spin 1s linear infinite' }}>⚙️</div>
                  <p style={{ color: 'var(--accent-blue-light)', fontFamily: 'monospace', letterSpacing: 2 }}>COMPUTING TRAJECTORY...</p>
                  <style>{`@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }`}</style>
                </div>
              </div>
            )}

            {results && simType === 'orbital' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Orbital Elements */}
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--accent-blue-light)' }}>🛰️ Orbital Elements</h3>
                  <div className="grid-4">
                    {[
                      { label: 'Altitude', value: results.orbitalElements.altitudeKm, unit: 'km', color: 'var(--accent-cyan)' },
                      { label: 'Velocity', value: results.orbitalElements.velocityKms, unit: 'km/s', color: 'var(--accent-green)' },
                      { label: 'Period', value: results.orbitalElements.periodMinutes, unit: 'min', color: 'var(--accent-blue-light)' },
                      { label: 'Orbits/Day', value: results.orbitsPerDay, unit: '/day', color: 'var(--accent-purple)' },
                    ].map((s, i) => (
                      <div key={i} style={{ textAlign: 'center', padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</p>
                        <p style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Eclipse */}
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--accent-yellow)' }}>☀️ Eclipse Analysis</h3>
                  <div className="grid-3">
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Sunlight</p>
                      <p style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--accent-yellow)' }}>{parseFloat(results.eclipse.sunlightTimeS / 60).toFixed(1)}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>min / orbit</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Eclipse</p>
                      <p style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--accent-blue)' }}>{parseFloat(results.eclipse.eclipseTimeS / 60).toFixed(1)}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>min / orbit</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Eclipse Fraction</p>
                      <p style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--accent-cyan)' }}>{results.eclipse.eclipseFraction}%</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>of orbit</p>
                    </div>
                  </div>
                </div>

                {/* Ground Track Chart */}
                {results.groundTrack && (
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--accent-green)' }}>🌍 Ground Track</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,95,0.5)" />
                        <XAxis dataKey="lon_deg" name="Longitude" type="number" domain={[-180, 180]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} label={{ value: 'Longitude (°)', position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: 11 }} />
                        <YAxis dataKey="lat_deg" name="Latitude" type="number" domain={[-90, 90]} stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                          formatter={(val, name) => [`${parseFloat(val).toFixed(2)}°`, name]} />
                        <Scatter data={results.groundTrack} fill="var(--accent-cyan)" opacity={0.7} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {results && simType === 'ascent' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: 'var(--accent-red)' }}>🚀 Ascent Results</h3>
                  <div className="grid-3" style={{ marginBottom: 16 }}>
                    {[
                      { label: 'Max Altitude', value: parseFloat(results.maxAltitudeKm).toFixed(1), unit: 'km', color: 'var(--accent-cyan)' },
                      { label: 'Max Velocity', value: results.maxVelocityMs, unit: 'm/s', color: 'var(--accent-green)' },
                      { label: 'Stages', value: results.stageCount, unit: 'stages', color: 'var(--accent-red)' },
                    ].map((s, i) => (
                      <div key={i} style={{ textAlign: 'center', padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</p>
                        <p style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {results.trajectory && (
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Altitude vs Time</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={results.trajectory.filter(p => p.altitude_km !== undefined)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,95,0.5)" />
                        <XAxis dataKey="time_s" stroke="var(--text-muted)" tick={{ fontSize: 10 }} label={{ value: 'Time (s)', position: 'insideBottom', offset: -5, fill: 'var(--text-muted)', fontSize: 11 }} />
                        <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                        <Line type="monotone" dataKey="altitude_km" stroke="var(--accent-cyan)" dot={false} strokeWidth={2} name="Altitude (km)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {results.trajectory && (
                  <div className="card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Velocity vs Time</h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={results.trajectory.filter(p => p.velocity_ms !== undefined)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,58,95,0.5)" />
                        <XAxis dataKey="time_s" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                        <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                        <Line type="monotone" dataKey="velocity_ms" stroke="var(--accent-green)" dot={false} strokeWidth={2} name="Velocity (m/s)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
