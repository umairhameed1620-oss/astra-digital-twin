import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../App';

export default function Register() {
  const { login, apiUrl } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', fullName: '', organisation: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
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
      <div style={{ width: '100%', maxWidth: 440, animation: 'fadeIn 0.5s ease-out' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛸</div>
          <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 28, fontWeight: 900, color: 'var(--accent-blue-light)', letterSpacing: 4 }}>ASTRA</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6, letterSpacing: 2 }}>SPACECRAFT DIGITAL TWIN PLATFORM</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>Create Engineer Account</h2>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--accent-red)', fontSize: 13 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label>Full Name</label>
              <input placeholder="Dr. Jane Smith" value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required />
            </div>
            <div>
              <label>Email Address</label>
              <input type="email" placeholder="engineer@agency.space" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <div>
              <label>Organisation <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
              <input placeholder="NASA, ESA, SpaceX..." value={form.organisation}
                onChange={e => setForm(f => ({ ...f, organisation: e.target.value }))} />
            </div>
            <div>
              <label>Password</label>
              <input type="password" placeholder="Min. 8 characters" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
            </div>
            <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 8, justifyContent: 'center', padding: '12px 20px', fontSize: 15 }}>
              {loading ? 'Creating account...' : '🚀 Begin Mission'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-muted)' }}>
            Already have access?{' '}
            <Link to="/login" style={{ color: 'var(--accent-blue-light)', textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
