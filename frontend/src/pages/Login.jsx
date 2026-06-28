import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function Login() {
  const { login, apiUrl } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      {/* Background grid */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(59,130,246,0.05) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(6,182,212,0.05) 0%, transparent 50%)', pointerEvents: 'none' }} />
      
      <div style={{ width: '100%', maxWidth: 420, animation: 'fadeIn 0.5s ease-out' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛸</div>
          <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 28, fontWeight: 900, color: 'var(--accent-blue-light)', letterSpacing: 4 }}>ASTRA</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6, letterSpacing: 2 }}>SPACECRAFT DIGITAL TWIN PLATFORM</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, color: 'var(--text-primary)' }}>Mission Control Access</h2>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--accent-red)', fontSize: 13 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label>Email Address</label>
              <input type="email" placeholder="engineer@agency.space" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label>Password</label>
              <input type="password" placeholder="••••••••" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
            </div>
            <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 8, justifyContent: 'center', padding: '12px 20px', fontSize: 15 }}>
              {loading ? 'Authenticating...' : '⚡ Launch Mission Control'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
            New to ASTRA?{' '}
            <Link to="/register" style={{ color: 'var(--accent-blue-light)', textDecoration: 'none', fontWeight: 600 }}>Create account</Link>
          </p>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-muted)', letterSpacing: 1 }}>
          ASTRA v1.0 · FC TECHNOLOGIES · BUILT FOR THE SPACE AGE
        </p>
      </div>
    </div>
  );
}
