import React, { useState } from 'react';
import { auth } from '../utils/api';

const LoginPage = ({ onLogin }) => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', organisation: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = mode === 'login'
        ? await auth.login({ email: form.email, password: form.password })
        : await auth.register(form);
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Background stars effect */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 50%, rgba(0,100,200,0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 440, padding: '0 20px', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #00d4ff, #0066cc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, boxShadow: '0 0 40px rgba(0,212,255,0.4)'
          }}>🛸</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--accent-primary)', letterSpacing: 4, marginBottom: 8 }}>ASTRA</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Aerospace Spacecraft Twin & Reality Architect</p>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: 32 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => setMode(m)} className="btn" style={{
                flex: 1, justifyContent: 'center',
                background: mode === m ? 'var(--accent-primary)' : 'transparent',
                color: mode === m ? 'var(--bg-primary)' : 'var(--text-secondary)',
                border: mode === m ? 'none' : '1px solid var(--border)',
                textTransform: 'capitalize'
              }}>{m === 'login' ? 'Sign In' : 'Register'}</button>
            ))}
          </div>

          <form onSubmit={handle}>
            {mode === 'register' && (
              <>
                <div className="form-group">
                  <label>Full Name</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Dr. Jane Foster" required />
                </div>
                <div className="form-group">
                  <label>Organisation</label>
                  <input value={form.organisation} onChange={e => setForm({...form, organisation: e.target.value})} placeholder="SpaceX, NASA, ESA..." />
                </div>
              </>
            )}
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="engineer@aerospace.com" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} placeholder="••••••••" required />
            </div>
            {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(255,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(255,68,68,0.3)' }}>{error}</div>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }} disabled={loading}>
              {loading ? 'Authenticating...' : mode === 'login' ? '→ Enter ASTRA' : '→ Create Account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, marginTop: 20, letterSpacing: 1 }}>
          POWERED BY FC TECHNOLOGIES
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
