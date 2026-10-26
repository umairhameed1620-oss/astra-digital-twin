import React, { useCallback, useEffect, useState } from 'react';
import { spacecraft as scApi, validation as vApi, alerts as alertsApi, errorText } from '../utils/api';

// Well-known LEO satellites (public NORAD IDs) that regularly have close approaches in busy orbits.
const STARTER = [
  [25544, 'ISS'], [48274, 'Tiangong'], [20580, 'Hubble'], [25994, 'Terra'], [27424, 'Aqua'], [39084, 'Landsat 8'],
  [49260, 'Landsat 9'], [37849, 'Suomi NPP'], [43013, 'NOAA-20'], [39634, 'Sentinel-1A'], [40697, 'Sentinel-2A'],
  [42063, 'Sentinel-2B'], [41335, 'Sentinel-3A'], [36508, 'CryoSat-2'], [38771, 'MetOp-B'], [43689, 'MetOp-C'],
  [43613, 'ICESat-2'], [54754, 'SWOT'], [46984, 'Sentinel-6'], [43476, 'GRACE-FO 1'],
];

const sevColor = { critical: 'var(--accent-red)', warning: 'var(--accent-amber)', nominal: 'var(--accent-green)' };
const th = { textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
const td = { fontSize: 12, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', verticalAlign: 'top' };
const utc = (d) => (d ? `${new Date(d).toISOString().replace('T', ' ').slice(0, 16)} UTC` : '—');
const rate = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const fx = (x, d, unit = '') => (x == null ? '—' : `${Number(x).toFixed(d)}${unit}`);
const pcf = (x) => (x == null ? '—' : Number(x) === 0 ? '0' : Number(x).toExponential(1));

const Stat = ({ label, value, hint }) => (
  <div className="card" style={{ padding: 16 }}>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, color: 'var(--text-primary)', fontWeight: 700, marginTop: 6 }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
  </div>
);

const download = (blob, name, type) => {
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

const parseIds = (text) => [...new Set(String(text).split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n > 0))];

const ValidationPage = () => {
  const [tracked, setTracked] = useState([]);
  const [ids, setIds] = useState('');
  const [addResult, setAddResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    scApi.getAll().then((r) => setTracked((r.data || []).filter((s) => s.norad_id && s.tle_line1))).catch(() => {});
    vApi.summary().then((r) => setSummary(r.data)).catch((e) => setMsg(errorText(e)));
    vApi.list().then((r) => setHistory(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    alertsApi.status().then((r) => setStatus(r.data)).catch(() => {});
  }, [load]);

  const add = async (list) => {
    const noradIds = list || parseIds(ids);
    if (!noradIds.length) { setMsg('Enter one or more NORAD IDs.'); return; }
    if (noradIds.length > 25) { setMsg('Add at most 25 satellites at a time.'); return; }
    setBusy('add'); setMsg(''); setAddResult(null);
    try {
      const r = await scApi.bulkNorad(noradIds, { status: 'operational', muteAlerts: true });
      setAddResult(r.data.results);
      setIds('');
      load();
    } catch (e) { setMsg(errorText(e, 'Could not add satellites')); }
    finally { setBusy(''); }
  };

  const run = async () => {
    setBusy('run'); setMsg('');
    try {
      const r = await vApi.run();
      const s = r.data.summary;
      setMsg(s.cdms ? `Compared ${s.compared} of ${s.cdms} CDMs across ${s.satellites} satellites.` : 'No CDMs to compare yet. See “Where the CDMs come from” below.');
      load();
    } catch (e) { setMsg(errorText(e, 'Validation failed')); }
    finally { setBusy(''); }
  };

  const toggleMute = async (sc) => {
    try { await scApi.setAlertsMuted(sc.id, !sc.alerts_muted); load(); } catch (e) { setMsg(errorText(e)); }
  };

  const exportRun = async (id, kind) => {
    setBusy(`${kind}:${id}`);
    try {
      const r = kind === 'pdf' ? await vApi.pdf(id) : await vApi.csv(id);
      const day = new Date().toISOString().slice(0, 10);
      download(r.data, `ASTRA_validation_${day}.${kind}`, kind === 'pdf' ? 'application/pdf' : 'text/csv');
    } catch (e) { setMsg(`Could not download the ${kind.toUpperCase()}.`); }
    finally { setBusy(''); }
  };

  const cum = summary?.cumulative;
  const latest = summary?.latest;
  const trackedIds = new Set(tracked.map((t) => Number(t.norad_id)));
  const starterLeft = STARTER.filter(([n]) => !trackedIds.has(n));

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>VALIDATION</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>ASTRA vs official conjunction data</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4, maxWidth: 900 }}>
          For every Conjunction Data Message (CDM) issued for your tracked satellites, ASTRA makes its own prediction for the same pair of objects
          and records how far its time of closest approach, miss distance, collision probability and severity are from the CDM. Runs automatically every day.
        </p>
      </div>

      {status && !status.spaceTrackConfigured && (
        <div className="card" style={{ borderColor: 'var(--accent-amber)', marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--accent-amber)' }}>Space-Track is not connected.</strong> ASTRA needs it to download the official CDMs automatically.
          Create a free account at space-track.org, add <code>SPACETRACK_USER</code> and <code>SPACETRACK_PASSWORD</code> to <code>.env</code> and restart the backend.
          You can still upload CDMs by hand on the Conjunction page.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Stat label="CDMs compared" value={cum ? cum.compared : '—'} hint={cum ? `${cum.runs} runs · ${tracked.length} satellites tracked` : ''} />
        <Stat label="Median |ΔTCA|" value={fx(cum?.medianAbsDTcaSec, 1, ' s')} hint={cum?.p90AbsDTcaSec != null ? `90% within ${fx(cum.p90AbsDTcaSec, 1, ' s')}` : ''} />
        <Stat label="Median |Δ miss|" value={fx(cum?.medianAbsDMissKm, 2, ' km')} hint={cum?.p90AbsDMissKm != null ? `90% within ${fx(cum.p90AbsDMissKm, 2, ' km')}` : ''} />
        <Stat label="Flagged by ASTRA" value={rate(cum?.flaggedRate)} hint={`CDM pairs ASTRA screening would report (< ${cum?.reportThresholdKm || 10} km)`} />
        <Stat label="Severity agreement" value={rate(cum?.severityAgreementRate)} hint={cum?.pcWithin1OrderRate != null ? `Pc within 10× of CDM: ${rate(cum.pcWithin1OrderRate)}` : ''} />
        <Stat label="High-risk CDMs caught" value={cum?.highRiskCdms ? rate(cum.highRiskCaughtRate) : '—'} hint={cum?.highRiskCdms ? `of ${cum.highRiskCdms} warning/critical CDMs` : 'none yet'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="section-title">Tracked satellites</div>
          <div className="form-group">
            <label>Add by NORAD ID</label>
            <textarea rows={3} value={ids} onChange={(e) => setIds(e.target.value)} placeholder="e.g. 25544, 39634, 43013" style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => add()} disabled={!!busy}>{busy === 'add' ? 'Adding…' : 'Add satellites'}</button>
            {starterLeft.length > 0 && (
              <button className="btn btn-secondary" onClick={() => add(starterLeft.slice(0, 25).map(([n]) => n))} disabled={!!busy}
                title={starterLeft.map(([n, name]) => `${name} (${n})`).join(', ')}>
                Add starter set ({starterLeft.length})
              </button>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
            Satellites are added as Operational with alerts off, so they are screened and validated without filling your inbox. The starter set is 20 well-known LEO satellites (ISS, Hubble, Sentinels, Landsat…).
          </div>
          {addResult && (
            <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>
              {addResult.map((r) => (
                <div key={r.norad} style={{ color: r.status === 'added' ? 'var(--accent-green)' : r.status === 'exists' ? 'var(--text-muted)' : 'var(--accent-amber)' }}>
                  {r.norad}: {r.status === 'added' ? `added (${r.name})` : r.status === 'exists' ? 'already tracked' : r.error}
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, maxHeight: 360, overflow: 'auto' }}>
            {tracked.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No NORAD-linked satellites yet.</div> : tracked.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>NORAD {s.norad_id} · {s.status}</div>
                </div>
                <button className="btn btn-secondary" style={{ fontSize: 10, padding: '4px 8px' }} onClick={() => toggleMute(s)} title="Conjunction alerts for this satellite">
                  {s.alerts_muted ? '🔕 Alerts off' : '🔔 Alerts on'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="section-title" style={{ margin: 0, flex: 1 }}>Latest run {latest ? `· ${utc(latest.created_at)} (${latest.trigger})` : ''}</div>
              {latest && <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => exportRun(latest.id, 'csv')} disabled={!!busy}>CSV</button>}
              {latest && <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => exportRun(latest.id, 'pdf')} disabled={!!busy}>{busy === `pdf:${latest.id}` ? 'Building…' : 'PDF report'}</button>}
              <button className="btn btn-primary" onClick={run} disabled={!!busy || !tracked.length}>{busy === 'run' ? 'Validating…' : 'Run validation now'}</button>
            </div>
            {msg && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>{msg}</div>}
            {!latest ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No validation runs yet. Add satellites, then click Run validation now.</div>
            ) : !(latest.rows || []).length ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No CDMs in the last {latest.summary.lookbackDays} days for these satellites.
                {latest.summary.cdmRefresh && !latest.summary.cdmRefresh.fetched && <> Space-Track: {latest.summary.cdmRefresh.reason}.</>}
              </div>
            ) : (
              <div style={{ overflow: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Satellite', 'Object', 'CDM TCA', 'ΔTCA', 'Miss CDM / ASTRA', 'Pc CDM / ASTRA', 'Severity CDM / ASTRA', 'Result'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {latest.rows.map((r) => (
                      <tr key={`${r.spacecraftId}-${r.cdmId}`}>
                        <td style={{ ...td, fontFamily: 'inherit', color: 'var(--text-primary)' }}>{r.spacecraft}<div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.norad}</div></td>
                        <td style={{ ...td, fontFamily: 'inherit' }}>{r.objectName || '—'}<div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.objectId}</div></td>
                        <td style={td}>{utc(r.cdmTca)}{r.upcoming && <div style={{ fontSize: 10, color: 'var(--accent-primary)' }}>upcoming</div>}</td>
                        <td style={td}>{r.dTcaSec != null ? `${r.dTcaSec.toFixed(1)} s` : '—'}</td>
                        <td style={td}>{fx(r.cdmMissKm, 3)} / {fx(r.astraMissKm, 3)} km</td>
                        <td style={td}>{pcf(r.cdmPc)} / {pcf(r.astraPc)}</td>
                        <td style={td}>
                          <span style={{ color: sevColor[r.cdmSeverity] || 'inherit' }}>{r.cdmSeverity || '—'}</span> / <span style={{ color: sevColor[r.astraSeverity] || 'inherit' }}>{r.astraSeverity || '—'}</span>
                        </td>
                        <td style={{ ...td, fontFamily: 'inherit', color: r.status !== 'compared' ? 'var(--text-muted)' : r.severityAgrees === false ? 'var(--accent-amber)' : 'var(--accent-green)' }} title={r.note || ''}>
                          {r.status === 'compared' ? (r.severityAgrees === false ? 'Severity differs' : 'Match') : r.status.replace(/_/g, ' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Run history</div>
            {history.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No runs yet.</div> : (
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Run', 'Trigger', 'Compared', 'Median ΔTCA', 'Median Δ miss', 'Severity agreement', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td style={td}>{utc(h.created_at)}</td>
                        <td style={td}>{h.trigger}</td>
                        <td style={td}>{h.summary.compared} / {h.summary.cdms}</td>
                        <td style={td}>{fx(h.summary.medianAbsDTcaSec, 1, ' s')}</td>
                        <td style={td}>{fx(h.summary.medianAbsDMissKm, 2, ' km')}</td>
                        <td style={td}>{rate(h.summary.severityAgreementRate)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px', marginRight: 6 }} onClick={() => exportRun(h.id, 'csv')} disabled={!!busy}>CSV</button>
                          <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => exportRun(h.id, 'pdf')} disabled={!!busy}>PDF</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <div className="section-title">Where the CDMs come from</div>
            CDMs are downloaded from Space-Track (public CDMs, issued by the US Space Force from its high-accuracy catalogue) every few hours for satellites that are Launched or Operational,
            and you can upload CDMs from an operator on the Conjunction page. ASTRA uses public TLEs, which are less precise, so differences of a few kilometres in miss distance are normal.
            The goal is to show that ASTRA catches the same risks early. Public CDMs only cover events that meet Space-Track's reporting criteria, so a quiet week can have no CDMs at all.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValidationPage;
