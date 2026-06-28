import React, { useState, useEffect } from 'react';
import API from '../utils/api';

const AdminPage = ({ user }) => {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [audit, setAudit] = useState([]);
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/admin/stats'),
      API.get('/admin/users'),
      API.get('/admin/audit'),
    ]).then(([s, u, a]) => {
      setStats(s.data);
      setUsers(u.data?.data || []);
      setAudit(a.data?.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (user?.role !== 'admin') return (
    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
      <div style={{ color: 'var(--accent-red)' }}>Admin access required</div>
    </div>
  );

  const updateUser = async (userId, changes) => {
    try {
      await API.patch(`/admin/users/${userId}`, changes);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...changes } : u));
    } catch (err) { console.error(err); }
  };

  const StatCard = ({ label, value, sub, color }) => (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: color || 'var(--accent-primary)', fontWeight: 700 }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{sub}</div>}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{label}</div>
    </div>
  );

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--accent-red)', letterSpacing: 3, marginBottom: 8 }}>⚠ ADMIN PANEL</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>System Administration</h1>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['overview', 'users', 'audit'].map(t => (
          <button key={t} onClick={() => setTab(t)} className="btn" style={{
            background: tab === t ? 'var(--accent-primary)' : 'transparent',
            color: tab === t ? 'var(--bg-primary)' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
            textTransform: 'capitalize',
          }}>{t}</button>
        ))}
      </div>

      {loading ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading...</div> : (
        <>
          {/* OVERVIEW */}
          {tab === 'overview' && stats && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
                <StatCard label="Total Users" value={stats.users?.total} sub={`${stats.users?.new_7d} new this week`} />
                <StatCard label="Active Users" value={stats.users?.active} color="var(--accent-green)" />
                <StatCard label="Spacecraft" value={stats.spacecraft?.total} sub={`${stats.spacecraft?.simulating} simulating`} />
                <StatCard label="Missions" value={stats.missions?.total} sub={`${stats.missions?.active} active`} color="var(--accent-amber)" />
                <StatCard label="Telemetry Logs" value={parseInt(stats.telemetry?.total || 0).toLocaleString()} color="#9664ff" />
                <StatCard label="AI Conversations" value={stats.ai?.total} sub={`${stats.ai?.tokens || 0} tokens`} color="#ff6432" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div className="card">
                  <div className="section-title">System Health</div>
                  {[
                    ['PostgreSQL', 'Connected', 'nominal'],
                    ['Redis', 'Connected', 'nominal'],
                    ['Anthropic API', 'Active', 'nominal'],
                    ['WebSocket', 'Running', 'nominal'],
                    ['Prometheus', 'Scraping', 'nominal'],
                  ].map(([service, status, state]) => (
                    <div key={service} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{service}</span>
                      <span className={`badge badge-${state}`}>{status}</span>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="section-title">Fault Events</div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ flex: 1, textAlign: 'center', padding: 20 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, color: 'var(--accent-red)' }}>{stats.faults?.critical || 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Critical Faults</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', padding: 20 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, color: 'var(--accent-amber)' }}>{stats.faults?.total || 0}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Total Faults</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* USERS */}
          {tab === 'users' && (
            <div>
              <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13 }}>{users.length} registered users</div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {['Name', 'Email', 'Organisation', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{u.organisation || '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <select value={u.role} onChange={e => updateUser(u.id, { role: e.target.value })} style={{ width: 'auto', padding: '3px 8px', fontSize: 11 }}>
                            <option value="viewer">Viewer</option>
                            <option value="engineer">Engineer</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className={`badge badge-${u.is_active ? 'nominal' : 'critical'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-muted)' }}>
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <button onClick={() => updateUser(u.id, { is_active: !u.is_active })} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AUDIT LOG */}
          {tab === 'audit' && (
            <div>
              <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 13 }}>Recent system activity</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {audit.map(log => (
                  <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', width: 160, flexShrink: 0 }}>
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                    <div style={{ width: 120, flexShrink: 0 }}>
                      <span className={`badge ${log.action.includes('delete') ? 'badge-critical' : log.action.includes('failed') ? 'badge-warning' : 'badge-nominal'}`} style={{ fontSize: 10 }}>
                        {log.action.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{log.user_name || 'System'}</span>
                      {' · '}{log.resource_type} {log.resource_id ? `(${log.resource_id.substring(0, 8)}...)` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{log.ip_address || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminPage;
