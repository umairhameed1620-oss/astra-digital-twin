import React, { useCallback, useEffect, useState } from 'react';
import { spacecraft as scApi, errorText } from '../../utils/api';

const utc = (d) => (d ? `${new Date(d).toISOString().replace('T', ' ').slice(0, 16)} UTC` : '—');
const MAX_BYTES = 11 * 1024 * 1024;

// Upload an operator ephemeris (CCSDS OEM) for a twin. ASTRA then uses it instead of the public TLE while it covers the time.
const EphemerisCard = ({ sc, canWrite = true }) => {
  const [list, setList] = useState([]);
  const [inUse, setInUse] = useState(null);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => scApi.ephemerides(sc.id).then((r) => { setList(r.data.data || []); setInUse(r.data.inUse); }).catch(() => {}), [sc.id]);
  useEffect(() => { setResult(null); setMsg(''); load(); }, [load]);

  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_BYTES) { setMsg('That file is larger than 11 MB. Use a coarser step (60 s is plenty) or a shorter span.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true); setMsg(''); setResult(null);
      try {
        const r = await scApi.uploadEphemeris(sc.id, String(reader.result), f.name);
        setResult(r.data);
        await load();
      } catch (err) { setMsg(errorText(err, 'Upload failed')); }
      finally { setBusy(false); }
    };
    reader.readAsText(f);
  };

  const remove = async (id) => {
    if (!window.confirm('Stop using this ephemeris? ASTRA goes back to the public TLE.')) return;
    try { await scApi.removeEphemeris(sc.id, id); setResult(null); await load(); } catch (err) { setMsg(errorText(err)); }
  };

  const active = list.find((x) => x.id === inUse);
  const cmp = result?.tleComparison;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-title">Operator ephemeris (CCSDS OEM)</div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
        Upload your own predicted orbit (usually from GPS orbit determination). While it covers the time, ASTRA uses it instead of the public TLE
        for screening, collision probability and manoeuvre planning. KVN or XML; EME2000, GCRF, ITRF or TEME; UTC, GPS, TAI or TT time; covariance optional.
      </p>

      {active ? (
        <div style={{ fontSize: 12, padding: '10px 12px', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 6, marginBottom: 12, lineHeight: 1.7 }}>
          <div style={{ color: 'var(--accent-green)', fontWeight: 600 }}>✓ In use: {active.objectName || 'ephemeris'}{active.objectId ? ` (${active.objectId})` : ''}</div>
          <div style={{ color: 'var(--text-secondary)' }}>{utc(active.start)} → {utc(active.stop)} · {active.points.toLocaleString()} states · {active.sourceFrame} · {active.covariance ? `${active.covariance} covariance blocks` : 'no covariance (default uncertainty used)'}</div>
          {new Date(active.stop) < new Date() && <div style={{ color: 'var(--accent-amber)' }}>This ephemeris has ended; ASTRA is using the TLE again. Upload a newer one.</div>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>No ephemeris in use — screening uses {sc.tle_line1 ? 'the public TLE' : 'the design orbit'}.</div>
      )}

      {canWrite && (
        <label className="btn btn-secondary" style={{ display: 'inline-flex', cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Reading and converting…' : '⬆ Upload OEM file'}
          <input type="file" accept=".oem,.txt,.xml,.kvn,text/plain,application/xml" onChange={onFile} disabled={busy} style={{ display: 'none' }} />
        </label>
      )}
      {msg && <div style={{ fontSize: 12, color: 'var(--accent-red)', marginTop: 10 }}>{msg}</div>}

      {result && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div>Loaded {result.points.toLocaleString()} states every {result.stepSec} s, converted from {result.sourceFrame} / {result.timeSystem} to TEME.</div>
          <div>Position uncertainty (1σ R/T/N): {(result.sigmaKm.r * 1000).toFixed(0)} / {(result.sigmaKm.t * 1000).toFixed(0)} / {(result.sigmaKm.n * 1000).toFixed(0)} m — {result.sigmaKm.source}.</div>
          {cmp && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Public TLE vs your ephemeris: up to {cmp.maxKm.toFixed(2)} km apart</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 4 }}>
                <thead><tr>{['Time', 'Total', 'Radial', 'Along-track', 'Cross-track'].map((h) => <th key={h} style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 400, padding: '3px 6px' }}>{h}</th>)}</tr></thead>
                <tbody>{cmp.samples.map((s) => (
                  <tr key={s.at}><td style={{ padding: '3px 6px' }}>{utc(s.at)}</td><td style={{ padding: '3px 6px' }}>{s.totalKm.toFixed(3)} km</td><td style={{ padding: '3px 6px' }}>{s.radialKm.toFixed(3)}</td><td style={{ padding: '3px 6px' }}>{s.alongTrackKm.toFixed(3)}</td><td style={{ padding: '3px 6px' }}>{s.crossTrackKm.toFixed(3)}</td></tr>
                ))}</tbody>
              </table>
              <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>Differences of a few km, mostly along-track, are normal: that is the TLE error your ephemeris removes. Hundreds of km means a frame or time mistake in the file.</div>
            </div>
          )}
        </div>
      )}

      {list.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>History</div>
          {list.map((e) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '5px 0', borderBottom: '1px solid var(--border)', color: e.id === inUse ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <div style={{ flex: 1 }}>{utc(e.createdAt)} · {utc(e.start)} → {utc(e.stop)}{e.uploadedBy ? ` · ${e.uploadedBy}` : ''}</div>
              {e.id === inUse && canWrite && <button className="btn btn-secondary" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => remove(e.id)}>Stop using</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EphemerisCard;
