import React, { useState, useEffect } from 'react';
import { spacecraft as scApi } from '../utils/api';
import API from '../utils/api';

// Accepts any API response shape and returns the spacecraft array
const toList = (res) => {
  const body = res && res.data !== undefined ? res.data : res;
  const candidates = [
    body,
    body?.data,
    body?.spacecraft,
    body?.data?.spacecraft,
    body?.items,
    body?.data?.items,
    body?.results,
  ];
  return candidates.find(Array.isArray) || [];
};

// Accepts any API response shape and returns the inner object
const toObj = (res, key) => {
  const body = res && res.data !== undefined ? res.data : res;
  if (body && body[key] !== undefined) return body;
  if (body?.data && body.data[key] !== undefined) return body.data;
  return body?.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : body;
};

const ConjunctionPage = () => {
  const [spacecraft, setSpacecraft] = useState([]);
  const [selectedSc, setSelectedSc] = useState('');
  const [events, setEvents] = useState(null);
  const [manoeuvre, setManoeuvre] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('events');

  useEffect(() => {
    scApi.getAll()
      .then(res => {
        const scs = toList(res);
        setSpacecraft(scs);
        if (scs.length) setSelectedSc(String(scs[0].id));
      })
      .catch(err => {
        console.error(err);
        setError('Could not load spacecraft. Check that the backend is running.');
      })
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSc) return;
    setLoading(true);
    setError('');
    Promise.all([
      API.get(`/conjunction/${selectedSc}`),
      API.get(`/conjunction/${selectedSc}/manoeuvre`),
    ]).then(([e, m]) => {
      const ev = toObj(e, 'events');
      setEvents({ ...ev, events: Array.isArray(ev?.events) ? ev.events : [] });
      const mv = toObj(m, 'manoeuvre');
      setManoeuvre(mv && mv.manoeuvre ? mv : null);
    }).catch(err => {
      console.error(err);
      setEvents(null);
      setManoeuvre(null);
      setError(err?.response?.data?.error || 'Conjunction screening failed. See backend logs for details.');
    }).finally(() => setLoading(false));
  }, [selectedSc]);

  const sevColor = { critical: 'var(--accent-red)', warning: 'var(--accent-amber)', nominal: 'var(--accent-green)' };
  const sevBadge = { critical: 'badge-critical', warning: 'badge-warning', nominal: 'badge-nominal' };

  const total = Number(events?.totalEvents ?? events?.events?.length ?? 0);
  const critical = Number(events?.criticalCount ?? 0);
  const warning = Number(events?.warningCount ?? 0);

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>CONJUNCTION ANALYSIS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600 }}>Space Traffic Management</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Close approach detection · Collision probability · Avoidance manoeuvres</p>
          </div>
          <select value={selectedSc} onChange={e => setSelectedSc(e.target.value)} style={{ width: 240 }} disabled={!spacecraft.length}>
            {listLoading && <option value="">Loading spacecraft…</option>}
            {!listLoading && !spacecraft.length && <option value="">No spacecraft — create one in Builder</option>}
            {spacecraft.map(sc => <option key={sc.id} value={String(sc.id)}>{sc.name}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {events?.screening && (
        <div className="card" style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
          <span>📡 <strong style={{ color: 'var(--accent-primary)' }}>{Number(events.screening.catalogObjects).toLocaleString()}</strong> tracked objects (CelesTrak)</span>
          <span><strong style={{ color: 'var(--accent-primary)' }}>{Number(events.screening.candidatesScreened).toLocaleString()}</strong> in ±30 km shell, propagated with SGP4</span>
          <span>Window: next {events.screening.windowHours} h · alert radius {events.screening.reportThresholdKm} km</span>
          <span>Data: {new Date(events.screening.catalogFetchedAt).toLocaleString()}{events.screening.catalogStale ? ' (STALE — CelesTrak unreachable)' : ''}</span>
          <span style={{ color: 'var(--text-muted)', flexBasis: '100%' }}>Pc is an estimate from TLE accuracy, not an operational CDM. Confirm with Space-Track / EU SST before manoeuvring.</span>
        </div>
      )}

      {events && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Events', value: total, color: 'var(--accent-primary)' },
            { label: 'Critical', value: critical, color: 'var(--accent-red)' },
            { label: 'Warning', value: warning, color: 'var(--accent-amber)' },
            { label: 'Nominal', value: Math.max(0, total - critical - warning), color: 'var(--accent-green)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: s.color, fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['events', 'manoeuvre'].map(t => (
          <button key={t} onClick={() => setTab(t)} className="btn" style={{
            background: tab === t ? 'var(--accent-primary)' : 'transparent',
            color: tab === t ? 'var(--bg-primary)' : 'var(--text-secondary)',
            border: '1px solid var(--border)', textTransform: 'capitalize'
          }}>{t === 'events' ? '⚠️ Conjunction Events' : '🚀 Manoeuvre Planner'}</button>
        ))}
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 60 }}>Screening against the live catalogue… the first run downloads CelesTrak data and can take up to a minute.</div> : (
        <>
          {tab === 'events' && events && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.events.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <div style={{ color: 'var(--accent-green)' }}>No conjunction events detected</div>
                </div>
              ) : events.events.map((ev, i) => {
                const sev = sevColor[ev.severity] ? ev.severity : 'nominal';
                return (
                  <div key={ev.id || i} className="card" style={{ borderLeft: `3px solid ${sevColor[sev]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{ev.objectName}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span className={`badge ${sevBadge[sev]}`}>{sev.toUpperCase()}</span>
                          <span className="badge badge-satellite">{ev.source === 'ASTRA fleet' ? ev.objectId : `NORAD ${ev.objectId}`}</span>
                          {ev.tleAgeDays != null && ev.source !== 'ASTRA fleet' && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>TLE age {ev.tleAgeDays} d</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: sevColor[sev], fontWeight: 700 }}>
                          {ev.hoursToTCA}h
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>to TCA</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                      {[
                        ['Miss Distance', `${ev.missDistance} km`],
                        ['Rel. Velocity', `${ev.relativeVelocity} km/s`],
                        ['Collision Pc', ev.collisionProbability],
                        ['TCA', ev.tcaTime ? new Date(ev.tcaTime).toLocaleString() : '—'],
                      ].map(([l, v]) => (
                        <div key={l} style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 6 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{l}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {ev.recommendation && (
                      <div style={{ padding: '10px 14px', background: sev === 'critical' ? 'rgba(255,68,68,0.08)' : sev === 'warning' ? 'rgba(255,170,0,0.08)' : 'rgba(0,255,136,0.08)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                        <strong style={{ color: sevColor[sev] }}>ARIA Recommendation: </strong>{ev.recommendation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'manoeuvre' && !manoeuvre && !error && selectedSc && (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              No manoeuvre required for this spacecraft.
            </div>
          )}

          {tab === 'manoeuvre' && manoeuvre && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card">
                <div className="section-title">🚀 Avoidance Manoeuvre</div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Hohmann transfer to avoid <strong style={{ color: 'var(--accent-amber)' }}>{manoeuvre.threat?.objectName}</strong>
                    {manoeuvre.threat && <> (miss {manoeuvre.threat.missDistance} km, Pc {manoeuvre.threat.collisionProbability})</>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--accent-primary)' }}>{manoeuvre.currentAltitude} km</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Current</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', fontSize: 20, color: 'var(--accent-amber)' }}>→</div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--accent-green)' }}>{manoeuvre.recommendedAltitude} km</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Safe Altitude</div>
                    </div>
                  </div>
                </div>
                {Object.entries(manoeuvre.manoeuvre || {}).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="section-title">⛽ ΔV Budget Impact</div>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Before manoeuvre</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{manoeuvre.deltaVBudgetRemaining} m/s</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ width: '100%', height: '100%', background: 'var(--accent-green)', borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>After manoeuvre</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: parseFloat(manoeuvre.budgetAfterManoeuvre) < 30 ? 'var(--accent-red)' : 'var(--accent-amber)' }}>{manoeuvre.budgetAfterManoeuvre} m/s</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(0, Math.min(100, (parseFloat(manoeuvre.budgetAfterManoeuvre) / (parseFloat(manoeuvre.deltaVBudgetRemaining) || 1)) * 100))}%`,
                      height: '100%', background: 'var(--accent-amber)', borderRadius: 4, transition: 'width 1s'
                    }} />
                  </div>
                </div>
                {manoeuvre.warning && (
                  <div style={{ padding: '12px 14px', background: 'rgba(255,170,0,0.1)', border: '1px solid rgba(255,170,0,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--accent-amber)' }}>
                    ⚠️ {manoeuvre.warning}
                  </div>
                )}
                <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>BURN SEQUENCE</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    1. Request refined tracking / CDM for {manoeuvre.threat?.objectName}<br />
                    2. Upload manoeuvre parameters to the spacecraft<br />
                    3. {manoeuvre.manoeuvre?.burn1Time}: Burn 1, prograde ({manoeuvre.manoeuvre?.dv1})<br />
                    4. {manoeuvre.manoeuvre?.burn2Time}: Burn 2, circularise ({manoeuvre.manoeuvre?.dv2})<br />
                    5. Re-screen the new orbit before TCA ({manoeuvre.threat?.tcaTime ? new Date(manoeuvre.threat.tcaTime).toLocaleString() : '—'})
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConjunctionPage;
