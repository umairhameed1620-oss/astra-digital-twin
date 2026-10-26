import React, { useEffect, useState } from 'react';
import { alerts as alertsApi, errorText } from '../utils/api';

const sevColor = { critical: 'var(--accent-red)', warning: 'var(--accent-amber)', nominal: 'var(--accent-green)' };
const th = { textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 10px', borderBottom: '1px solid var(--border)' };
const td = { fontSize: 12, padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', verticalAlign: 'top' };

const Toggle = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--text-primary)' }}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, padding: 0 }} />
    {label}
  </label>
);

const AlertsPage = () => {
  const [form, setForm] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const loadHistory = () => alertsApi.list().then((r) => setHistory(r.data.data || [])).catch(() => {});

  useEffect(() => {
    alertsApi.getSettings().then((r) => {
      const s = r.data;
      setForm({
        email_enabled: !!s.email_enabled,
        email_to: s.email_to || s.emailDefault || '',
        slack_enabled: !!s.slack_enabled,
        slack_webhook_url: s.slack_webhook_url || '',
        min_severity: s.min_severity || 'warning',
        screening_interval_hours: s.screening_interval_hours || 6,
      });
    }).catch((e) => setMsg(errorText(e)));
    alertsApi.status().then((r) => setStatus(r.data)).catch(() => {});
    loadHistory();
  }, []);

  const save = async () => {
    setBusy('save'); setMsg('');
    try {
      const r = await alertsApi.saveSettings(form);
      setForm((f) => ({ ...f, slack_webhook_url: r.data.slack_webhook_url || '' }));
      setMsg('Alert settings saved.');
    } catch (e) { setMsg(errorText(e, 'Could not save settings')); }
    finally { setBusy(''); }
  };

  const test = async () => {
    setBusy('test'); setMsg('');
    try {
      const r = await alertsApi.test();
      setMsg(r.data.results.map((x) => `${x.channel}: ${x.status}${x.error ? ` (${x.error})` : ''}`).join(' · '));
      loadHistory();
    } catch (e) { setMsg(errorText(e, 'Test failed')); }
    finally { setBusy(''); }
  };

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>ALERTS</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Conjunction Alerts</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          ASTRA automatically screens every Launched or Operational twin and notifies you when a close approach is new or gets worse.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' }}>
        <div className="card">
          <div className="section-title">Delivery</div>
          {!form ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : (
            <>
              <div className="form-group">
                <Toggle checked={form.email_enabled} onChange={(v) => setForm({ ...form, email_enabled: v })} label="Email alerts" />
                <input style={{ marginTop: 8 }} type="email" value={form.email_to} disabled={!form.email_enabled}
                  onChange={(e) => setForm({ ...form, email_to: e.target.value })} placeholder="ops@yourcompany.com" />
                {status && !status.emailConfigured && <div style={{ fontSize: 11, color: 'var(--accent-amber)', marginTop: 6 }}>The server has no SMTP settings yet, so email alerts will be recorded as failed until SMTP_HOST / SMTP_FROM are set.</div>}
              </div>
              <div className="form-group">
                <Toggle checked={form.slack_enabled} onChange={(v) => setForm({ ...form, slack_enabled: v })} label="Slack alerts" />
                <input style={{ marginTop: 8 }} value={form.slack_webhook_url} disabled={!form.slack_enabled}
                  onChange={(e) => setForm({ ...form, slack_webhook_url: e.target.value })} placeholder="https://hooks.slack.com/services/…" />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>Create an incoming webhook in Slack (Apps → Incoming Webhooks) and paste its URL.</div>
              </div>
              <div className="form-group">
                <label>Alert me for</label>
                <select value={form.min_severity} onChange={(e) => setForm({ ...form, min_severity: e.target.value })}>
                  <option value="warning">Warning and critical</option>
                  <option value="critical">Critical only</option>
                </select>
              </div>
              <div className="form-group">
                <label>Screen every</label>
                <select value={form.screening_interval_hours} onChange={(e) => setForm({ ...form, screening_interval_hours: Number(e.target.value) })}>
                  {[1, 2, 3, 6, 8, 12, 24].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
                <button className="btn btn-secondary" onClick={test} disabled={!!busy}>{busy === 'test' ? 'Sending…' : 'Send test alert'}</button>
              </div>
              {msg && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>{msg}</div>}
              {status && (
                <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                  Scheduler: {status.schedulerEnabled ? `running (last check ${status.scheduler.lastTickAt ? new Date(status.scheduler.lastTickAt).toLocaleTimeString() : 'pending'})` : 'disabled'}<br />
                  Space-Track CDM import: {status.spaceTrackConfigured ? 'on' : 'off (no account configured)'}
                  {status.scheduler?.lastError && <><br /><span style={{ color: 'var(--accent-amber)' }}>Last error: {status.scheduler.lastError}</span></>}
                </div>
              )}
            </>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="section-title" style={{ padding: '16px 20px 0' }}>Alert history</div>
          {history.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No alerts yet.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Time', 'Severity', 'Spacecraft', 'Alert', 'Channel', 'Status'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</td>
                    <td style={{ ...td, color: sevColor[a.severity] || 'var(--text-secondary)', textTransform: 'uppercase', fontSize: 11 }}>{a.severity}</td>
                    <td style={td}>{a.spacecraft_name || '—'}</td>
                    <td style={{ ...td, color: 'var(--text-primary)' }} title={a.message}>{a.title}</td>
                    <td style={td}>{a.channel}</td>
                    <td style={{ ...td, color: a.status === 'sent' ? 'var(--accent-green)' : 'var(--accent-amber)' }} title={a.error || ''}>{a.status}{a.error ? ' ⓘ' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertsPage;
