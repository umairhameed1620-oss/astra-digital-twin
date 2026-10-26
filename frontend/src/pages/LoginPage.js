import React, { useEffect, useState } from 'react';
import { auth, team as teamApi, errorText } from '../utils/api';

const inviteFromUrl = () => {
  try { return new URLSearchParams(window.location.search).get('invite'); } catch (e) { return null; }
};

const Banner = ({ children, color = 'var(--accent-primary)' }) => (
  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18, padding: '12px 14px', borderRadius: 8, border: `1px solid ${color}`, background: 'rgba(0,212,255,0.06)', lineHeight: 1.6 }}>{children}</div>
);

const LoginPage = ({ onLogin }) => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', organisation: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [invite, setInvite] = useState(null);
  const inviteToken = inviteFromUrl();

  useEffect(() => {
    if (!inviteToken) return;
    teamApi.lookup(inviteToken)
      .then((r) => {
        setInvite(r.data);
        setForm((f) => ({ ...f, email: r.data.email }));
        setMode(r.data.registered ? 'login' : 'register');
      })
      .catch((e) => setError(errorText(e, 'This invitation link is not valid.')));
  }, [inviteToken]);

  // Logged in: accept the invitation (if any) before entering the app.
  const finish = async (data) => {
    if (inviteToken && invite) {
      try {
        if (!(mode === 'register')) {
          localStorage.setItem('astra_token', data.token);
          await teamApi.accept(inviteToken);
          const me = await auth.me();
          data = { ...data, user: me.data.user };
        }
      } catch (e) {
        if (!/already in this team/i.test(errorText(e, ''))) {
          setError(errorText(e, 'Could not join the team'));
          localStorage.removeItem('astra_token');
          return;
        }
      }
      window.history.replaceState({}, '', '/');
    }
    onLogin(data.user, data.token);
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = mode === 'login'
        ? await auth.login({ email: form.email, password: form.password })
        : await auth.register({ ...form, inviteToken: invite ? inviteToken : undefined });
      if (res.data.twoFactorRequired) { setChallenge(res.data.challenge); setCode(''); return; }
      await finish(res.data);
    } catch (err) {
      setError(errorText(err, 'Authentication failed'));
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await auth.verify2fa(challenge, code);
      await finish(res.data);
    } catch (err) {
      const msg = errorText(err, 'That code is not valid');
      if (/expired/i.test(msg)) { setChallenge(null); setForm((f) => ({ ...f, password: '' })); }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, rgba(0,100,200,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 440, padding: '0 20px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px', background: 'linear-gradient(135deg, #00d4ff, #0066cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, boxShadow: '0 0 40px rgba(0,212,255,0.4)' }}>🛸</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, color: 'var(--accent-primary)', letterSpacing: 4, marginBottom: 8 }}>ASTRA</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>Collision avoidance for satellite operators</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          {challenge ? (
            <form onSubmit={submitCode}>
              <div className="section-title">Two-factor login</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                {useRecovery ? 'Enter one of the recovery codes you saved when you turned on two-factor login. Each code works once.' : 'Open your authenticator app and enter the 6-digit code for ASTRA.'}
              </p>
              <div className="form-group">
                <label>{useRecovery ? 'Recovery code' : 'Code'}</label>
                <input value={code} onChange={(e) => setCode(e.target.value)} autoFocus required
                  inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" placeholder={useRecovery ? 'xxxx-xxxx-xxxx' : '123456'}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: useRecovery ? 1 : 6, textAlign: 'center' }} />
              </div>
              {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 16 }}>{error}</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14 }} disabled={loading}>{loading ? 'Checking…' : '→ Verify'}</button>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 12 }}>
                <button type="button" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: 0 }}>
                  {useRecovery ? 'Use the authenticator app' : 'Lost your phone? Use a recovery code'}
                </button>
                <button type="button" onClick={() => { setChallenge(null); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>Back</button>
              </div>
            </form>
          ) : (
            <>
              {invite && (
                <Banner>
                  You've been invited to join <strong style={{ color: 'var(--text-primary)' }}>{invite.team}</strong> as <strong>{invite.role}</strong>.{' '}
                  {invite.registered ? 'Sign in with ' : 'Create your account with '}<strong>{invite.email}</strong> to accept.
                </Banner>
              )}
              {!invite && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  {['login', 'register'].map((m) => (
                    <button key={m} onClick={() => { setMode(m); setError(''); }} className="btn" style={{
                      flex: 1, justifyContent: 'center',
                      background: mode === m ? 'var(--accent-primary)' : 'transparent',
                      color: mode === m ? 'var(--bg-primary)' : 'var(--text-secondary)',
                      border: mode === m ? 'none' : '1px solid var(--border)',
                    }}>{m === 'login' ? 'Sign In' : 'Register'}</button>
                  ))}
                </div>
              )}

              <form onSubmit={submit}>
                {mode === 'register' && (
                  <>
                    <div className="form-group">
                      <label>Full name</label>
                      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Foster" required />
                    </div>
                    {!invite && (
                      <div className="form-group">
                        <label>Company or team name</label>
                        <input value={form.organisation} onChange={(e) => setForm({ ...form, organisation: e.target.value })} placeholder="Orbital Ops Ltd" />
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>You become the owner of this team and can invite colleagues from the Team page.</div>
                      </div>
                    )}
                  </>
                )}
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} readOnly={!!invite} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="engineer@company.com" required autoComplete="username" />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={mode === 'register' ? 'At least 10 characters' : '••••••••'} required
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
                </div>
                {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(255,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(255,68,68,0.3)' }}>{error}</div>}
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }} disabled={loading}>
                  {loading ? 'Please wait…' : mode === 'login' ? (invite ? '→ Sign in and join' : '→ Enter ASTRA') : (invite ? '→ Create account and join' : '→ Create account')}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, marginTop: 20, letterSpacing: 1 }}>POWERED BY FC TECHNOLOGIES</p>
      </div>
    </div>
  );
};

export default LoginPage;
