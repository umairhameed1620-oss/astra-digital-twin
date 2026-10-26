import React, { useState, useEffect, useCallback } from 'react';
import { spacecraft as scApi, conjunction as cjApi, alerts as alertsApi, errorText } from '../utils/api';

const sevColor = { critical: 'var(--accent-red)', warning: 'var(--accent-amber)', nominal: 'var(--accent-green)' };
const sevBadge = { critical: 'badge-critical', warning: 'badge-warning', nominal: 'badge-nominal' };
const sevBg = { critical: 'rgba(255,68,68,0.08)', warning: 'rgba(255,170,0,0.08)', nominal: 'rgba(0,255,136,0.08)' };
const utc = (d) => (d ? `${new Date(d).toISOString().replace('T', ' ').slice(0, 16)} UTC` : '—');
const ago = (d) => {
  if (!d) return 'never';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};
const SCREENABLE = ['satellite', 'station'];

const Stat = ({ label, value, color }) => (
  <div className="card" style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color, fontWeight: 700 }}>{value}</div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{label}</div>
  </div>
);

const Cell = ({ label, value }) => (
  <div style={{ background: 'var(--bg-secondary)', padding: '10px 12px', borderRadius: 6 }}>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)' }}>{value}</div>
  </div>
);

const th = { textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 10px', borderBottom: '1px solid var(--border)' };
const td = { fontSize: 12, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' };

const ConjunctionPage = () => {
  const [spacecraft, setSpacecraft] = useState([]);
  const [selectedSc, setSelectedSc] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('events');
  const [threat, setThreat] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [cdms, setCdms] = useState([]);
  const [cdmText, setCdmText] = useState('');
  const [cdmMsg, setCdmMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [serverStatus, setServerStatus] = useState(null);

  const sc = spacecraft.find((s) => String(s.id) === String(selectedSc));

  useEffect(() => {
    scApi.getAll()
      .then((res) => {
        const scs = (res.data || []).filter((s) => SCREENABLE.includes(s.type));
        setSpacecraft(scs);
        if (scs.length) setSelectedSc(String(scs[0].id));
      })
      .catch((err) => setError(errorText(err, 'Could not load spacecraft. Check that the backend is running.')))
      .finally(() => setListLoading(false));
    alertsApi.status().then((r) => setServerStatus(r.data)).catch(() => {});
  }, []);

  const loadCdms = useCallback((id) => scApi.cdms(id).then((r) => setCdms(r.data.data || [])).catch(() => setCdms([])), []);

  useEffect(() => {
    if (!selectedSc) return;
    let current = true; // ignore a slower response for a twin that is no longer selected
    setLoading(true); setError(''); setReport(null); setPlan(null); setThreat(null); setNotice(''); setCdms([]);
    cjApi.screen(selectedSc)
      .then((r) => { if (current) setReport({ ...r.data, events: Array.isArray(r.data?.events) ? r.data.events : [] }); })
      .catch((err) => { if (current) setError(errorText(err, 'Conjunction screening failed. See backend logs for details.')); })
      .finally(() => { if (current) setLoading(false); });
    scApi.cdms(selectedSc).then((r) => { if (current) setCdms(r.data.data || []); }).catch(() => { if (current) setCdms([]); });
    return () => { current = false; };
  }, [selectedSc]);

  useEffect(() => {
    if (tab !== 'manoeuvre' || !selectedSc || !report || plan) return;
    setPlanLoading(true); setPlanError('');
    cjApi.manoeuvre(selectedSc, threat || undefined)
      .then((r) => setPlan(r.data))
      .catch((err) => setPlanError(errorText(err, 'Manoeuvre planning failed')))
      .finally(() => setPlanLoading(false));
  }, [tab, selectedSc, report, plan, threat]);

  const planFor = (eventId) => { setThreat(eventId); setPlan(null); setTab('manoeuvre'); };

  const screenNow = async () => {
    setBusy('screen'); setNotice('');
    try {
      const r = await scApi.screenNow(selectedSc);
      setReport({ ...r.data, events: r.data.events || [] });
      setPlan(null);
      setNotice(r.data.newOrEscalated
        ? `${r.data.newOrEscalated} new or escalated event(s) recorded, ${r.data.alertsSent} alert(s) sent.`
        : 'Screening complete. No new or escalated risks since the last run.');
    } catch (err) { setNotice(errorText(err, 'Screening failed')); }
    finally { setBusy(''); }
  };

  const downloadPdf = async () => {
    setBusy('pdf'); setNotice('');
    try {
      const r = await cjApi.reportPdf(selectedSc, threat || undefined);
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ASTRA_${(sc?.name || 'spacecraft').replace(/[^A-Za-z0-9_-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { setNotice('Could not generate the PDF report.'); }
    finally { setBusy(''); }
  };

  const uploadCdm = async (content) => {
    setBusy('cdm'); setCdmMsg('');
    try {
      const r = await scApi.uploadCdm(selectedSc, content);
      setCdmMsg(`Imported ${r.data.imported} CDM(s)${r.data.duplicates ? `, ${r.data.duplicates} already stored` : ''}${r.data.alerts ? `, ${r.data.alerts} alert(s) sent` : ''}.`);
      setCdmText('');
      loadCdms(selectedSc);
    } catch (err) { setCdmMsg(errorText(err, 'Upload failed')); }
    finally { setBusy(''); }
  };

  const onCdmFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 1_000_000) { setCdmMsg('File is larger than 1 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => uploadCdm(String(reader.result));
    reader.readAsText(f);
    e.target.value = '';
  };

  // Upcoming CDMs are risks too: classify them with the same thresholds as screening events.
  const thr = report?.screening?.thresholds || { critical: 1e-4, warning: 1e-6 };
  const cdmRisks = cdms
    .filter((c) => new Date(c.tca) > new Date())
    .map((c) => {
      const pc = c.pc_foster != null ? Number(c.pc_foster) : c.pc_reported != null ? Number(c.pc_reported) : null;
      const miss = c.miss_km != null ? Number(c.miss_km) : null;
      const severity = c.parsed?.emergency ? 'critical'
        : pc != null && pc >= thr.critical ? 'critical'
          : (pc != null && pc >= thr.warning) || (miss != null && miss < 1) ? 'warning' : 'nominal';
      return { ...c, pc, miss, severity };
    })
    .sort((a, b) => new Date(a.tca) - new Date(b.tca));
  const total = Number(report?.totalEvents ?? 0);
  const critical = Number(report?.criticalCount ?? 0) + cdmRisks.filter((c) => c.severity === 'critical').length;
  const warning = Number(report?.warningCount ?? 0) + cdmRisks.filter((c) => c.severity === 'warning').length;
  const scr = report?.screening;

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>CONJUNCTION ANALYSIS</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600 }}>Space Traffic Management</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>Close approach detection · Collision probability · Avoidance manoeuvres</p>
          </div>
          <select value={selectedSc} onChange={(e) => setSelectedSc(e.target.value)} style={{ width: 260 }} disabled={!spacecraft.length}>
            {listLoading && <option value="">Loading spacecraft…</option>}
            {!listLoading && !spacecraft.length && <option value="">No orbiting spacecraft — create one in Builder</option>}
            {spacecraft.map((s) => <option key={s.id} value={String(s.id)}>{s.name}{s.norad_id ? ` (NORAD ${s.norad_id})` : ''}</option>)}
          </select>
        </div>
      </div>

      {sc && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <button className="btn btn-primary" onClick={screenNow} disabled={!!busy || loading}>{busy === 'screen' ? 'Screening…' : '↻ Screen now & alert'}</button>
          <button className="btn btn-secondary" onClick={downloadPdf} disabled={!!busy || loading || !report}>{busy === 'pdf' ? 'Building PDF…' : '⤓ PDF report'}</button>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Automatic screening: {['launched', 'operational'].includes(sc.status)
              ? `every few hours (last ${ago(report?.lastAutomaticScreening || sc.last_screened_at)})`
              : 'off until this twin is Launched or Operational'}
          </span>
        </div>
      )}
      {notice && <div className="card" style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)', borderLeft: '3px solid var(--accent-primary)' }}>{notice}</div>}
      {error && <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: 13 }}>{error}</div>}

      {scr && (
        <div className="card" style={{ marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
          <span>🛰️ Twin orbit: <strong style={{ color: 'var(--accent-primary)' }}>{report.twin?.orbitSource === 'tle' ? `real TLE${report.twin.noradId ? `, NORAD ${report.twin.noradId}` : ''} (age ${report.twin.tleAgeDays} d)` : 'design orbit (not a real satellite)'}</strong></span>
          <span>📡 <strong style={{ color: 'var(--accent-primary)' }}>{Number(scr.catalogObjects).toLocaleString()}</strong> tracked objects (CelesTrak)</span>
          <span><strong style={{ color: 'var(--accent-primary)' }}>{Number(scr.candidatesScreened).toLocaleString()}</strong> in the altitude shell, propagated with SGP4</span>
          <span>Window: next {scr.windowHours} h · alert radius {scr.reportThresholdKm} km</span>
          <span>Data: {new Date(scr.catalogFetchedAt).toLocaleString()}{scr.catalogStale ? ' (STALE — CelesTrak unreachable)' : ''}</span>
          {scr.colocatedObjects?.length > 0 && (
            <span style={{ flexBasis: '100%' }}>🔗 Not counted as close approaches (stay within a few km all the time, e.g. docked modules): {scr.colocatedObjects.map((o) => `${o.name} (${o.id})`).join(', ')}</span>
          )}
          <span style={{ color: 'var(--text-muted)', flexBasis: '100%' }}>{scr.pcModel} Confirm with Space-Track / EU SST CDMs before manoeuvring.</span>
        </div>
      )}

      {report && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <Stat label="Close approaches" value={total} color="var(--accent-primary)" />
          <Stat label="Critical" value={critical} color="var(--accent-red)" />
          <Stat label="Warning" value={warning} color="var(--accent-amber)" />
          <Stat label="Upcoming CDMs" value={cdmRisks.length} color="var(--accent-green)" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[['events', '⚠️ Conjunction Events'], ['manoeuvre', '🚀 Manoeuvre Planner'], ['cdms', `📄 CDMs (${cdms.length})`]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className="btn" style={{
            background: tab === t ? 'var(--accent-primary)' : 'transparent',
            color: tab === t ? 'var(--bg-primary)' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 60 }}>Screening against the live catalogue… the first run downloads CelesTrak data and can take up to a minute.</div>}

      {!loading && tab === 'events' && report && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cdmRisks.map((c) => {
            const sev = c.severity;
            const h = ((new Date(c.tca) - Date.now()) / 3600000).toFixed(1);
            return (
              <div key={`cdm-${c.id}`} className="card" style={{ borderLeft: `3px solid ${sevColor[sev]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{c.object_name || c.object_id || 'Unknown object'}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className={`badge ${sevBadge[sev]}`}>{sev.toUpperCase()}</span>
                      {c.object_id && <span className="badge badge-satellite">NORAD {c.object_id}</span>}
                      <span style={{ fontSize: 10, color: 'var(--accent-primary)' }}>📄 From CDM ({c.source === 'spacetrack' ? 'Space-Track' : 'uploaded'})</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: sevColor[sev], fontWeight: 700 }}>{h}h</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>to TCA</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <Cell label="Miss distance" value={c.miss != null ? `${c.miss.toFixed(3)} km` : '—'} />
                  <Cell label="Pc (Foster)" value={c.pc_foster != null ? Number(c.pc_foster).toExponential(1) : '—'} />
                  <Cell label="Pc (reported)" value={c.pc_reported != null ? Number(c.pc_reported).toExponential(1) : '—'} />
                  <Cell label="TCA" value={utc(c.tca)} />
                </div>
                {sev !== 'nominal' && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: sevBg[sev], borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: sevColor[sev] }}>Recommendation: </strong>
                    {sev === 'critical' ? 'Official CDM shows high risk. Coordinate with the other operator and prepare a manoeuvre.' : 'Monitor the CDM updates for this event and keep a contingency manoeuvre ready.'}
                  </div>
                )}
              </div>
            );
          })}
          {report.events.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ color: 'var(--accent-green)' }}>No close approaches within {scr?.reportThresholdKm} km in the next {scr?.windowHours} h</div>
            </div>
          ) : report.events.map((ev, i) => {
            const sev = sevColor[ev.severity] ? ev.severity : 'nominal';
            return (
              <div key={ev.id || i} className="card" style={{ borderLeft: `3px solid ${sevColor[sev]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{ev.objectName}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className={`badge ${sevBadge[sev]}`}>{sev.toUpperCase()}</span>
                      <span className="badge badge-satellite">{ev.source === 'ASTRA fleet' ? ev.objectId : `NORAD ${ev.objectId}`}</span>
                      {ev.tleAgeDays != null && ev.source !== 'ASTRA fleet' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>TLE age {ev.tleAgeDays} d</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: sevColor[sev], fontWeight: 700 }}>{ev.hoursToTCA}h</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>to TCA</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                  <Cell label="Miss distance" value={`${ev.missDistance} km`} />
                  <Cell label="Rel. velocity" value={`${ev.relativeVelocity} km/s`} />
                  <Cell label="Collision Pc" value={ev.collisionProbability} />
                  <Cell label="TCA" value={utc(ev.tcaTime)} />
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1, padding: '10px 14px', background: sevBg[sev], borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <strong style={{ color: sevColor[sev] }}>Recommendation: </strong>{ev.recommendation}
                  </div>
                  {sev !== 'nominal' && <button className="btn btn-secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => planFor(ev.id)}>Plan avoidance →</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && tab === 'manoeuvre' && (
        <>
          {planLoading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 60 }}>Evaluating manoeuvre options and re-screening the best candidates against the catalogue…</div>}
          {planError && <div className="card" style={{ borderLeft: '3px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: 13 }}>{planError}</div>}
          {plan && !plan.required && <div className="card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>{plan.message}</div>}
          {plan && plan.required && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card" style={{ borderLeft: `3px solid ${sevColor[plan.threat.severity]}` }}>
                <div className="section-title">Threat</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <Cell label="Object" value={plan.threat.objectName} />
                  <Cell label="TCA" value={utc(plan.threat.tcaTime)} />
                  <Cell label="Miss distance" value={`${plan.threat.missDistance} km`} />
                  <Cell label="Collision Pc" value={plan.threat.collisionProbability} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                  Target: Pc below {Number(plan.targetPc).toExponential(0)} and miss distance at least {plan.minMissKm} km · {plan.optionsEvaluated} options evaluated
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card">
                  <div className="section-title">🚀 Recommended manoeuvre</div>
                  {plan.manoeuvre ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: plan.options[0]?.feasible ? 'var(--accent-green)' : 'var(--accent-amber)' }}>{plan.manoeuvre.strategy}</div>
                      {Object.entries(plan.manoeuvre).filter(([k]) => k !== 'strategy').map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{k.replace(/([A-Z0-9])/g, ' $1').trim()}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-primary)' }}>{String(v)}</span>
                        </div>
                      ))}
                      {plan.rescreen && (
                        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, fontSize: 12, background: plan.rescreen.clean ? 'rgba(0,255,136,0.08)' : 'rgba(255,170,0,0.08)', color: 'var(--text-secondary)' }}>
                          <strong style={{ color: plan.rescreen.clean ? 'var(--accent-green)' : 'var(--accent-amber)' }}>Post-burn re-screening: </strong>
                          {plan.rescreen.clean
                            ? `no new warning or critical conjunctions (${plan.rescreen.totalEventsAfter} approaches within the alert radius after the burn).`
                            : `creates ${plan.rescreen.newRiskEvents.length} new risk event(s): ${plan.rescreen.newRiskEvents.map((e) => `${e.objectName} (${e.missDistance} km)`).join(', ')}.`}
                        </div>
                      )}
                    </>
                  ) : <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No option could be evaluated.</div>}
                </div>

                <div className="card">
                  <div className="section-title">⛽ ΔV budget impact</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Before manoeuvre</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{plan.deltaVBudgetRemaining} m/s</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ width: '100%', height: '100%', background: 'var(--accent-green)', borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>After manoeuvre</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: parseFloat(plan.budgetAfterManoeuvre) < 30 ? 'var(--accent-red)' : 'var(--accent-amber)' }}>{plan.budgetAfterManoeuvre} m/s</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, (parseFloat(plan.budgetAfterManoeuvre) / (parseFloat(plan.deltaVBudgetRemaining) || 1)) * 100))}%`, height: '100%', background: 'var(--accent-amber)', borderRadius: 4 }} />
                  </div>
                  {plan.warning && (
                    <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(255,170,0,0.1)', border: '1px solid rgba(255,170,0,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--accent-amber)' }}>⚠️ {plan.warning}</div>
                  )}
                  {plan.manoeuvre && (
                    <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>BURN SEQUENCE</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                        1. Request a CDM / refined tracking for {plan.threat.objectName}<br />
                        2. Upload manoeuvre commands to the spacecraft<br />
                        3. {plan.manoeuvre.burn1Time}: Burn 1 ({plan.manoeuvre.dv1})<br />
                        {plan.manoeuvre.burn2Time && <>4. {plan.manoeuvre.burn2Time}: Burn 2 ({plan.manoeuvre.dv2})<br /></>}
                        {plan.manoeuvre.burn2Time ? 5 : 4}. Re-screen the new orbit before TCA ({utc(plan.threat.tcaTime)})
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card" style={{ padding: 0, overflow: 'auto' }}>
                <div className="section-title" style={{ padding: '16px 20px 0' }}>Options compared</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['#', 'Option', 'Total ΔV', 'Miss after', 'Pc after', 'Meets target', 'Re-screen'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {plan.options.map((o, i) => (
                      <tr key={o.id} style={{ background: i === 0 ? 'var(--accent-glow)' : 'transparent' }}>
                        <td style={td}>{i === 0 ? '★' : i + 1}</td>
                        <td style={{ ...td, fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}>{o.label}</td>
                        <td style={td}>{o.totalDeltaVms.toFixed(3)} m/s</td>
                        <td style={td}>{o.missAfterKm.toFixed(3)} km</td>
                        <td style={td}>{Number(o.pcAfter).toExponential(1)}</td>
                        <td style={{ ...td, color: o.feasible ? 'var(--accent-green)' : 'var(--accent-amber)' }}>{o.feasible ? 'yes' : o.meetsTarget ? 'over budget' : 'no'}</td>
                        <td style={{ ...td, color: o.rescreenClean === false ? 'var(--accent-amber)' : 'var(--text-muted)' }}>{o.rescreenClean == null ? '—' : o.rescreenClean ? 'clean' : 'new risk'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'cdms' && sc && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, alignItems: 'start' }}>
          <div className="card">
            <div className="section-title">Import CDM</div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              Upload a Conjunction Data Message (CCSDS KVN or XML, or Space-Track JSON). Where the CDM includes covariance, ASTRA recomputes Pc with Foster's method.
            </p>
            <input type="file" accept=".txt,.kvn,.cdm,.xml,.json" onChange={onCdmFile} disabled={!!busy} style={{ fontSize: 12, marginBottom: 10 }} />
            <textarea rows={6} value={cdmText} onChange={(e) => setCdmText(e.target.value)} placeholder="…or paste the CDM here" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={!cdmText.trim() || !!busy} onClick={() => uploadCdm(cdmText)}>
              {busy === 'cdm' ? 'Importing…' : 'Import'}
            </button>
            {cdmMsg && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>{cdmMsg}</div>}
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-muted)' }}>
              {serverStatus?.spaceTrackConfigured
                ? (sc.norad_id ? `Space-Track CDMs for NORAD ${sc.norad_id} are pulled automatically while this twin is Launched or Operational.` : 'Link this twin to a NORAD ID to pull its Space-Track CDMs automatically.')
                : 'Automatic Space-Track CDM import is off. The server admin can enable it by adding a Space-Track account (SPACETRACK_USER / SPACETRACK_PASSWORD).'}
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'auto' }}>
            <div className="section-title" style={{ padding: '16px 20px 0' }}>Stored CDMs</div>
            {cdms.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No CDMs for this spacecraft yet.</div> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['TCA', 'Object', 'Source', 'Miss', 'Pc reported', 'Pc (Foster)', 'Notes'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {cdms.map((c) => (
                    <tr key={c.id}>
                      <td style={td}>{utc(c.tca)}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-body)', color: 'var(--text-primary)' }}>{c.object_name || c.object_id || '—'}</td>
                      <td style={td}>{c.source}</td>
                      <td style={td}>{c.miss_km != null ? `${Number(c.miss_km).toFixed(3)} km` : '—'}</td>
                      <td style={td}>{c.pc_reported != null ? Number(c.pc_reported).toExponential(1) : '—'}</td>
                      <td style={td}>{c.pc_foster != null ? Number(c.pc_foster).toExponential(1) : '—'}</td>
                      <td style={{ ...td, fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', maxWidth: 260 }}>{c.pc_note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConjunctionPage;
