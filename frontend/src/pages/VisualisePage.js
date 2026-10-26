import React, { useState, useEffect } from 'react';
import OrbitalVisualiser from '../components/visualiser/OrbitalVisualiser';
import { spacecraft as scApi, tle as tleApi, errorText } from '../utils/api';

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

const tleField = (l2, a, b) => (l2 ? l2.slice(a, b).trim() : '');
const ageDays = (epoch) => (epoch ? (Date.now() - new Date(epoch).getTime()) / 86400000 : null);

// Link a twin to a real satellite (NORAD ID, live CelesTrak data) or paste an operator TLE.
const OrbitDataCard = ({ sc, onUpdated }) => {
  const [mode, setMode] = useState('norad');
  const [norad, setNorad] = useState('');
  const [preview, setPreview] = useState(null);
  const [l1, setL1] = useState('');
  const [l2, setL2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const linked = !!sc.tle_line1;
  const age = ageDays(sc.tle_epoch);

  useEffect(() => { setPreview(null); setErr(''); setNorad(''); setL1(''); setL2(''); }, [sc.id]);

  const lookup = async () => {
    setBusy(true); setErr(''); setPreview(null);
    try { setPreview((await tleApi.lookup(norad.trim())).data); }
    catch (e) { setErr(errorText(e, 'Lookup failed')); }
    finally { setBusy(false); }
  };
  const save = async (body) => {
    setBusy(true); setErr('');
    try {
      const res = await scApi.linkOrbit(sc.id, body);
      onUpdated(res.data);
      setPreview(null); setNorad(''); setL1(''); setL2('');
    } catch (e) { setErr(errorText(e, 'Could not update orbit')); }
    finally { setBusy(false); }
  };
  const pasteBlock = (text) => {
    const lines = text.split(/\r?\n/).map((x) => x.trimEnd()).filter(Boolean);
    const i = lines.findIndex((x) => x.startsWith('1 '));
    if (i >= 0 && lines[i + 1]) { setL1(lines[i]); setL2(lines[i + 1]); return true; }
    return false;
  };

  const small = { fontSize: 11, color: 'var(--text-muted)' };
  const row = (k, v, colour) => (
    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: colour || 'var(--accent-primary)' }}>{v}</span>
    </div>
  );

  return (
    <div className="card">
      <div className="section-title">Orbit Data</div>
      {linked ? (
        <>
          {row('Source', sc.tle_source === 'celestrak' ? 'CelesTrak (auto-refresh)' : 'Operator TLE')}
          {sc.norad_id && row('NORAD ID', sc.norad_id)}
          {row('TLE epoch', sc.tle_epoch ? new Date(sc.tle_epoch).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—')}
          {age != null && row('TLE age', `${age.toFixed(1)} days`, age > 7 ? 'var(--accent-red)' : age > 3 ? 'var(--accent-amber)' : 'var(--accent-green)')}
          {age != null && age > 7 && <div style={{ ...small, color: 'var(--accent-amber)', margin: '4px 0' }}>Old element set: screening accuracy is reduced.</div>}
          <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: 12, marginTop: 10 }} disabled={busy}
            onClick={() => window.confirm(`Unlink ${sc.name} from its real orbit and go back to the design orbit?`) && save({ source: 'none' })}>
            Unlink real orbit
          </button>
        </>
      ) : (
        <>
          <div style={{ ...small, marginBottom: 10 }}>This twin flies an idealised design orbit. Link it to a real satellite for SGP4 tracking and screening.</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {[['norad', 'NORAD ID'], ['tle', 'Paste TLE']].map(([k, l]) => (
              <button key={k} className="btn" onClick={() => { setMode(k); setErr(''); }} style={{
                flex: 1, justifyContent: 'center', padding: '6px 8px', fontSize: 11,
                background: mode === k ? 'var(--accent-primary)' : 'transparent', color: mode === k ? 'var(--bg-primary)' : 'var(--text-secondary)', border: '1px solid var(--border)',
              }}>{l}</button>
            ))}
          </div>
          {mode === 'norad' ? (
            <>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={norad} onChange={(e) => setNorad(e.target.value.replace(/[^0-9]/g, ''))} placeholder="e.g. 25544 (ISS)" style={{ fontSize: 12, padding: '8px 10px' }}
                  onKeyDown={(e) => e.key === 'Enter' && norad && lookup()} />
                <button className="btn btn-secondary" style={{ fontSize: 12, padding: '8px 12px' }} disabled={!norad || busy} onClick={lookup}>{busy && !preview ? '…' : 'Find'}</button>
              </div>
              {preview && (
                <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-secondary)', borderRadius: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{preview.name}</div>
                  {row('Perigee / apogee', `${preview.perigeeKm} / ${preview.apogeeKm} km`)}
                  {row('Inclination', `${preview.inclinationDeg}°`)}
                  {row('Period', `${preview.periodMin} min`)}
                  {row('TLE age', `${preview.ageDays} d`)}
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12, marginTop: 8 }} disabled={busy}
                    onClick={() => save({ source: 'celestrak', noradId: preview.noradId })}>
                    Link {sc.name} to NORAD {preview.noradId}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <textarea rows={3} value={l1 && l2 ? `${l1}\n${l2}` : l1} placeholder={'Paste both TLE lines\n1 25544U 98067A ...\n2 25544  51.64 ...'}
                onChange={(e) => { if (!pasteBlock(e.target.value)) { setL1(e.target.value); setL2(''); } }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: 8, whiteSpace: 'pre', overflowX: 'auto' }} />
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12, marginTop: 8 }} disabled={!l1 || !l2 || busy}
                onClick={() => save({ source: 'manual', line1: l1, line2: l2 })}>
                Use this TLE
              </button>
            </>
          )}
        </>
      )}
      {err && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--accent-red)' }}>{err}</div>}
    </div>
  );
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
  const period = altitude ? Math.round(2 * Math.PI * Math.sqrt(Math.pow((6378.137 + altitude) * 1000, 3) / 3.986004418e14) / 60) : null;
  const velocity = altitude ? Math.sqrt(398600.4418 / (6378.137 + altitude)).toFixed(3) : null;

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

              {['satellite', 'station'].includes(selected.type) && (
                <OrbitDataCard sc={selected} onUpdated={(u) => setSpacecraft((list) => list.map((s) => (String(s.id) === String(u.id) ? { ...s, ...u } : s)))} />
              )}

              {/* Orbital elements */}
              <div className="card">
                <div className="section-title">Orbital Elements</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(selected.tle_line2 ? [
                    ['Semi-major axis', altitude ? `${(6378.137 + altitude).toFixed(1)} km` : 'N/A'],
                    ['Eccentricity', `0.${tleField(selected.tle_line2, 26, 33)}`],
                    ['Inclination', `${Number(tleField(selected.tle_line2, 8, 16)).toFixed(4)}°`],
                    ['RAAN', `${Number(tleField(selected.tle_line2, 17, 25)).toFixed(4)}°`],
                    ['Arg. of perigee', `${Number(tleField(selected.tle_line2, 34, 42)).toFixed(4)}°`],
                    ['Mean motion', `${Number(tleField(selected.tle_line2, 52, 63)).toFixed(6)} rev/day`],
                  ] : [
                    ['Semi-major axis', altitude ? `${(6378.137 + altitude).toFixed(0)} km` : 'N/A'],
                    ['Eccentricity', '0.0000 (circular)'],
                    ['Inclination', inclination != null ? `${inclination.toFixed(2)}°` : 'N/A'],
                    ['RAAN', `${raan.toFixed(1)}°`],
                  ]).map(([label, value]) => (
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
