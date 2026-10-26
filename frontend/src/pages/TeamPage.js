import React, { useCallback, useEffect, useState } from 'react';
import { team as teamApi, auth as authApi, errorText } from '../utils/api';

const th = { textAlign: 'left', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 10px', borderBottom: '1px solid var(--border)' };
const td = { fontSize: 12, padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', verticalAlign: 'middle' };
const ROLE_HELP = {
  owner: 'Everything, including handing over the team',
  admin: 'Invite and remove engineers and viewers, team settings',
  engineer: 'Add and change satellites, run screenings, upload CDMs and ephemerides',
  viewer: 'Read only',
};
const ago = (d) => {
  if (!d) return 'never';
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 60) return `${m} min ago`;
  if (m < 2880) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

const TeamPage = ({ user, onUserChange }) => {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [invite, setInvite] = useState({ email: '', role: 'engineer' });
  const [link, setLink] = useState(null);
  const [name, setName] = useState('');

  const load = useCallback(() => teamApi.get().then((r) => { setData(r.data); setName(r.data.team.name); }).catch((e) => setMsg(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  const refreshMe = async () => { try { const r = await authApi.me(); onUserChange(r.data.user); } catch (e) { /* ignore */ } };
  const run = async (key, fn, ok) => {
    setBusy(key); setMsg('');
    try { const r = await fn(); if (ok) setMsg(typeof ok === 'function' ? ok(r) : ok); await load(); return r; } catch (e) { setMsg(errorText(e)); return null; } finally { setBusy(''); }
  };

  if (!data) return <div style={{ color: 'var(--text-muted)' }}>{msg || 'Loading…'}</div>;
  const me = data.me;
  const manage = ['owner', 'admin'].includes(me.role);
  const isOwner = me.role === 'owner';

  const sendInvite = async (e) => {
    e.preventDefault();
    setLink(null);
    const r = await run('invite', () => teamApi.invite(invite.email, invite.role), (x) => (x.data.emailed ? `Invitation emailed to ${x.data.email}.` : `Invitation created for ${x.data.email}. Send them the link below.`));
    if (r) { setLink(r.data); setInvite({ email: '', role: invite.role }); }
  };

  const copy = (text) => { try { navigator.clipboard.writeText(text); setMsg('Link copied.'); } catch (e) { setMsg('Select the link and copy it.'); } };

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>TEAM</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>{data.team.name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Everyone in the team shares the same satellites ({data.team.spacecraft}), missions ({data.team.missions}), CDMs and validation results. Each person chooses their own alerts.
        </p>
      </div>
      {msg && <div className="card" style={{ marginBottom: 16, fontSize: 13, borderLeft: '3px solid var(--accent-primary)' }}>{msg}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(300px, 380px)', gap: 20, alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <div className="section-title" style={{ padding: '16px 20px 0' }}>Members ({data.members.length})</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Name', 'Role', '2FA', 'Last login', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {data.members.map((m) => {
                const self = m.id === me.id;
                const canEditRole = manage && !self && m.role !== 'owner' && (isOwner || m.role !== 'admin');
                const canRemove = manage && !self && m.role !== 'owner' && (isOwner || !['admin'].includes(m.role));
                return (
                  <tr key={m.id}>
                    <td style={td}><div style={{ color: 'var(--text-primary)' }}>{m.name}{self ? ' (you)' : ''}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.email}</div></td>
                    <td style={td} title={ROLE_HELP[m.role]}>
                      {canEditRole ? (
                        <select value={m.role} onChange={(e) => run(`role:${m.id}`, () => teamApi.setRole(m.id, e.target.value), `${m.name} is now ${e.target.value}.`)} style={{ padding: '4px 8px', fontSize: 12 }}>
                          {(isOwner ? ['admin', 'engineer', 'viewer'] : ['engineer', 'viewer']).map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : <span style={{ textTransform: 'capitalize' }}>{m.role}</span>}
                    </td>
                    <td style={{ ...td, color: m.twoFactor ? 'var(--accent-green)' : 'var(--text-muted)' }}>{m.twoFactor ? 'On' : 'Off'}</td>
                    <td style={td}>{ago(m.lastLoginAt)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {isOwner && !self && (
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '4px 8px', marginRight: 6 }} disabled={!!busy}
                          onClick={() => window.confirm(`Make ${m.name} the owner? You will become an admin.`) && run('transfer', () => teamApi.transfer(m.id), `${m.name} is now the owner.`).then(refreshMe)}>Make owner</button>
                      )}
                      {canRemove && (
                        <button className="btn btn-secondary" style={{ fontSize: 10, padding: '4px 8px', color: 'var(--accent-red)' }} disabled={!!busy}
                          onClick={() => window.confirm(`Remove ${m.name} from the team? They lose access to the team's satellites straight away.`) && run(`rm:${m.id}`, () => teamApi.remove(m.id), `${m.name} was removed.`)}>Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '12px 20px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            {Object.entries(ROLE_HELP).map(([r, h]) => <div key={r}><strong style={{ textTransform: 'capitalize' }}>{r}:</strong> {h}</div>)}
          </div>
        </div>

        <div>
          {manage && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">Invite a colleague</div>
              <form onSubmit={sendInvite}>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="colleague@company.com" required />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                    {(isOwner ? ['admin', 'engineer', 'viewer'] : ['engineer', 'viewer']).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary" disabled={!!busy}>{busy === 'invite' ? 'Creating…' : 'Create invitation'}</button>
              </form>
              {!data.emailConfigured && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>Email isn't set up on this server, so send the link yourself.</div>}
              {link && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Invitation link (works once, expires {new Date(link.expiresAt).toLocaleDateString()}):</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input readOnly value={link.link} onFocus={(e) => e.target.select()} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
                    <button className="btn btn-secondary" type="button" onClick={() => copy(link.link)}>Copy</button>
                  </div>
                </div>
              )}
              {data.invitations.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Pending</div>
                  {data.invitations.map((i) => (
                    <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>{i.email} <span style={{ color: 'var(--text-muted)' }}>· {i.role}</span></div>
                      <button className="btn btn-secondary" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => run(`rv:${i.id}`, () => teamApi.revoke(i.id), 'Invitation cancelled.')}>Cancel</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Team settings</div>
            <div className="form-group">
              <label>Team name</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} />
                {manage && <button className="btn btn-secondary" disabled={!!busy || !name.trim() || name === data.team.name} onClick={() => run('name', () => teamApi.update({ name }), 'Team name saved.').then(refreshMe)}>Save</button>}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textTransform: 'none', letterSpacing: 0, fontSize: 13, color: 'var(--text-primary)', cursor: manage ? 'pointer' : 'default' }}>
              <input type="checkbox" checked={data.team.require2fa} disabled={!manage || !!busy} style={{ width: 16, height: 16, padding: 0, marginTop: 2 }}
                onChange={(e) => run('2fa', () => teamApi.update({ require2fa: e.target.checked }), e.target.checked ? 'Two-factor login is now required for everyone in the team.' : 'Two-factor login is now optional.')} />
              <span>Require two-factor login for everyone
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Members without it are asked to set it up before they can continue. Turn it on for your own account first (Account page).</div>
              </span>
            </label>
          </div>

          {!isOwner && (
            <div className="card">
              <div className="section-title">Leave team</div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>You'll get a new, empty team of your own. The satellites stay with {data.team.name}.</p>
              <button className="btn btn-secondary" style={{ color: 'var(--accent-red)' }} disabled={!!busy}
                onClick={() => window.confirm(`Leave ${data.team.name}?`) && run('leave', () => teamApi.leave(), 'You left the team.').then(refreshMe)}>Leave team</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamPage;
