import React, { useState, useEffect } from 'react';
import { spacecraft as scApi } from '../utils/api';
import API from '../utils/api';

const ConjunctionPage = () => {
  const [spacecraft, setSpacecraft] = useState([]);
  const [selectedSc, setSelectedSc] = useState('');
  const [events, setEvents] = useState(null);
  const [manoeuvre, setManoeuvre] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('events');

  useEffect(() => {
    scApi.getAll().then(res => {
      const scs = res.data?.data || [];
      setSpacecraft(scs);
      if (scs.length) setSelectedSc(scs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedSc) return;
    setLoading(true);
    Promise.all([
      API.get(`/conjunction/${selectedSc}`),
      API.get(`/conjunction/${selectedSc}/manoeuvre`),
    ]).then(([e, m]) => {
      setEvents(e.data);
      setManoeuvre(m.data);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedSc]);

  const sevColor = { critical: 'var(--accent-red)', warning: 'var(--accent-amber)', nominal: 'var(--accent-green)' };
  const sevBadge = { critical: 'badge-critical', warning: 'badge-warning', nominal: 'badge-nominal' };

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>CONJUNCTION ANALYSIS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600 }}>Space Traffic Management</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Close approach detection · Collision probability · Avoidance manoeuvres</p>
          </div>
          <select value={selectedSc} onChange={e => setSelectedSc(e.target.value)} style={{ width: 240 }}>
            {spacecraft.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
          </select>
        </div>
      </div>

      {events && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Events', value: events.totalEvents, color: 'var(--accent-primary)' },
            { label: 'Critical', value: events.criticalCount, color: 'var(--accent-red)' },
            { label: 'Warning', value: events.warningCount, color: 'var(--accent-amber)' },
            { label: 'Nominal', value: events.totalEvents - events.criticalCount - events.warningCount, color: 'var(--accent-green)' },
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

      {loading ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 60 }}>Analysing conjunction data...</div> : (
        <>
          {tab === 'events' && events && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.events.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <div style={{ color: 'var(--accent-green)' }}>No conjunction events detected</div>
                </div>
              ) : events.events.map(ev => (
                <div key={ev.id} className="card" style={{ borderLeft: `3px solid ${sevColor[ev.severity]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{ev.objectName}</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span className={`badge ${sevBadge[ev.severity]}`}>{ev.severity.toUpperCase()}</span>
                        <span className="badge badge-satellite">{ev.objectId}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: sevColor[ev.severity], fontWeight: 700 }}>
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
                      ['TCA', new Date(ev.tcaTime).toLocaleString()],
                    ].map(([l, v]) => (
                      <div key={l} style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 6 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{l}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: '10px 14px', background: ev.severity === 'critical' ? 'rgba(255,68,68,0.08)' : ev.severity === 'warning' ? 'rgba(255,170,0,0.08)' : 'rgba(0,255,136,0.08)', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: sevColor[ev.severity] }}>ARIA Recommendation: </strong>{ev.recommendation}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'manoeuvre' && manoeuvre && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card">
                <div className="section-title">🚀 Avoidance Manoeuvre</div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>Hohmann Transfer (Collision Avoidance)</div>
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
                {Object.entries(manoeuvre.manoeuvre).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>{v}</span>
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
                    <span style={{ fontFamily: 'var(--font-mono)', color: parseFloat(manoeuvre.budgetAfterManoeuvre) < 100 ? 'var(--accent-red)' : 'var(--accent-amber)' }}>{manoeuvre.budgetAfterManoeuvre} m/s</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${(parseFloat(manoeuvre.budgetAfterManoeuvre) / manoeuvre.deltaVBudgetRemaining) * 100}%`, height: '100%', background: 'var(--accent-amber)', borderRadius: 4, transition: 'width 1s' }} />
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
                    1. T-24h: Verify tracking data<br />
                    2. T-6h: Upload manoeuvre parameters<br />
                    3. TCA-24h: Execute Burn 1 ({manoeuvre.manoeuvre.dv1})<br />
                    4. T+{manoeuvre.manoeuvre.transferTime}: Execute Burn 2 ({manoeuvre.manoeuvre.dv2})<br />
                    5. Verify new orbit, update TLE
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
