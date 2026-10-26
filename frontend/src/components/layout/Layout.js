import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const getNav = (role) => [
  { path: '/', label: 'Overview', icon: '⬡' },
  { path: '/builder', label: 'Spacecraft Builder', icon: '🔧' },
  { path: '/visualise', label: '3D Visualiser', icon: '🌍' },
  { path: '/conjunction', label: 'Conjunction', icon: '⚠️' },
  { path: '/missions', label: 'Mission Control', icon: '🎯' },
  { path: '/alerts', label: 'Alerts', icon: '🔔' },
  { path: '/validation', label: 'Validation', icon: '✅' },
  { path: '/team', label: 'Team', icon: '👥' },
  { path: '/ai', label: 'ARIA AI', icon: '🤖' },
  { path: '/analytics', label: 'Analytics', icon: '📊' },
  ...(role === 'admin' ? [{ path: '/admin', label: 'Admin', icon: '🔐' }] : []),
  { path: '/help', label: 'Help & guide', icon: '📘' },
];

const Layout = ({ children, user, onLogout }) => {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const nav = getNav(user?.role);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      <aside style={{ width:collapsed?64:240, background:'var(--bg-secondary)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', transition:'width 0.3s', flexShrink:0, overflow:'hidden' }}>
        <div style={{ padding:'20px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:8, background:'linear-gradient(135deg,#00d4ff,#0066cc)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, boxShadow:'0 0 20px rgba(0,212,255,0.3)' }}>🛸</div>
          {!collapsed && <div><div style={{ fontFamily:'var(--font-display)', fontSize:16, color:'var(--accent-primary)', letterSpacing:2 }}>ASTRA</div><div style={{ fontSize:10, color:'var(--text-muted)', letterSpacing:1 }}>DIGITAL TWIN v2.0</div></div>}
        </div>
        <nav style={{ flex:1, padding:'12px 8px', overflowY:'auto' }}>
          {nav.map(item => {
            const active = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link key={item.path} to={item.path} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:8, marginBottom:4, textDecoration:'none', background:active?'var(--accent-glow)':'transparent', color:active?'var(--accent-primary)':'var(--text-secondary)', borderLeft:active?'2px solid var(--accent-primary)':'2px solid transparent', transition:'all 0.2s', whiteSpace:'nowrap', overflow:'hidden' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>
                {!collapsed && <span style={{ fontSize:13, fontWeight:active?600:400 }}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div style={{ padding:'16px 12px', borderTop:'1px solid var(--border)' }}>
          {!collapsed && <div style={{ marginBottom:12 }}>
            <Link to="/account" title="Account and two-factor login" style={{ textDecoration:'none' }}>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)' }}>{user?.name} {user?.totpEnabled ? <span title="Two-factor login on" style={{ fontSize:11 }}>🔒</span> : null}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>{user?.organisation}{user?.orgRole ? ` · ${user.orgRole}` : ''}</div>
              <div style={{ fontSize:11, color:'var(--text-muted)' }}>{user?.email}</div>
            </Link>
          </div>}
          <button onClick={onLogout} className="btn btn-secondary" style={{ width:'100%', justifyContent:'center', padding:'8px 12px', fontSize:12 }}>{collapsed?'↩':'↩ Logout'}</button>
        </div>
        <button onClick={() => setCollapsed(!collapsed)} style={{ background:'none', border:'none', color:'var(--text-muted)', padding:'8px', cursor:'pointer', borderTop:'1px solid var(--border)', fontSize:16 }}>{collapsed?'→':'←'}</button>
      </aside>
      <main style={{ flex:1, overflow:'auto', background:'var(--bg-primary)' }}>
        <div style={{ padding:'14px 24px', borderBottom:'1px solid var(--border)', background:'var(--bg-secondary)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent-green)', display:'inline-block', animation:'pulse 2s infinite' }} />
            <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>ASTRA ENTERPRISE ONLINE</span>
          </div>
          <div style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>{new Date().toUTCString().replace('GMT','UTC')}</div>
        </div>
        <div style={{ padding:'24px' }}>{children}</div>
      </main>
    </div>
  );
};

export default Layout;
