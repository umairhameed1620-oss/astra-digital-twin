import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <nav style={{
      background: 'rgba(10,15,26,0.9)',
      borderBottom: '1px solid var(--border)',
      backdropFilter: 'blur(12px)',
      position: 'sticky', top: 0, zIndex: 100,
      padding: '0 24px'
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', height: 60, gap: 24 }}>
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 24 }}>🛸</span>
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 900, color: 'var(--accent-blue-light)', letterSpacing: 3 }}>
            ASTRA
          </span>
        </Link>

        {/* Nav items */}
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {[
            { path: '/', label: 'Fleet', icon: '🛸' },
          ].map(item => (
            <Link key={item.path} to={item.path} style={{
              textDecoration: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
              color: location.pathname === item.path ? 'var(--accent-blue-light)' : 'var(--text-muted)',
              background: location.pathname === item.path ? 'rgba(59,130,246,0.1)' : 'transparent',
              transition: 'all 0.15s'
            }}>
              {item.icon} {item.label}
            </Link>
          ))}
        </div>

        {/* User menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.fullName}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user?.organisation || 'Independent'}</p>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
            {user?.fullName?.[0]?.toUpperCase()}
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px 10px', borderRadius: 6, fontSize: 13, transition: 'color 0.15s' }}
            onMouseOver={e => e.target.style.color = 'var(--accent-red)'}
            onMouseOut={e => e.target.style.color = 'var(--text-muted)'}>
            ⏻ Exit
          </button>
        </div>
      </div>
    </nav>
  );
}
