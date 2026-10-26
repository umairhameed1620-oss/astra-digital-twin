import React, { useCallback, useEffect, useState } from 'react';
import { auth as authApi, errorText } from '../utils/api';

const codeInput = { fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: 6, textAlign: 'center', maxWidth: 200 };

const RecoveryCodes = ({ codes, onDone }) => {
  const text = `ASTRA recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join('\n')}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'astra-recovery-codes.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
        <strong style={{ color: 'var(--accent-amber)' }}>Save these recovery codes now.</strong> If you lose your phone, each one lets you log in once.
        They won't be shown again.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 14, background: 'var(--bg-secondary)', padding: 14, borderRadius: 8, marginBottom: 12 }}>
        {codes.map((c) => <div key={c}>{c}</div>)}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" onClick={download}>Download .txt</button>
        <button className="btn btn-secondary" onClick={() => { try { navigator.clipboard.writeText(codes.join('\n')); } catch (e) { /* ignore */ } }}>Copy</button>
        <button className="btn btn-primary" onClick={onDone}>I've saved them</button>
      </div>
    </div>
  );
};

const AccountPage = ({ user, onUserChange }) => {
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState({ password: '', code: '', action: null });
  const required = (() => { try { return new URLSearchParams(window.location.search).get('setup2fa') === '1'; } catch (e) { return false; } })() || user.mustSetup2fa;

  const load = useCallback(() => authApi.twoFactor().then((r) => setStatus(r.data)).catch((e) => setMsg(errorText(e))), []);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setBusy('setup'); setMsg('');
    try { const r = await authApi.setup2fa(); setSetup(r.data); setCode(''); } catch (e) { setMsg(errorText(e)); } finally { setBusy(''); }
  };

  const enable = async (e) => {
    e.preventDefault();
    setBusy('enable'); setMsg('');
    try {
      const r = await authApi.enable2fa(code);
      localStorage.setItem('astra_token', r.data.token);
      onUserChange(r.data.user);
      setCodes(r.data.recoveryCodes);
      setSetup(null);
      await load();
    } catch (err) { setMsg(errorText(err)); } finally { setBusy(''); }
  };

  const confirmed = async (e) => {
    e.preventDefault();
    setBusy(confirm.action); setMsg('');
    try {
      if (confirm.action === 'disable') {
        await authApi.disable2fa(confirm.password, confirm.code);
        const me = await authApi.me();
        onUserChange(me.data.user);
        setMsg('Two-factor login is off.');
      } else {
        const r = await authApi.newRecoveryCodes(confirm.password, confirm.code);
        setCodes(r.data.recoveryCodes);
      }
      setConfirm({ password: '', code: '', action: null });
      await load();
    } catch (err) { setMsg(errorText(err)); } finally { setBusy(''); }
  };

  return (
    <div className="animate-in" style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>ACCOUNT</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>{user.name}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>{user.email} · {user.orgRole} in {user.organisation}</p>
      </div>

      {required && status && !status.enabled && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent-amber)', fontSize: 13 }}>
          Your team requires two-factor login. Set it up below to continue using ASTRA.
        </div>
      )}
      {msg && <div className="card" style={{ marginBottom: 16, fontSize: 13, borderLeft: '3px solid var(--accent-primary)' }}>{msg}</div>}

      <div className="card">
        <div className="section-title">Two-factor login</div>
        {!status ? <div style={{ color: 'var(--text-muted)' }}>Loading…</div> : codes ? (
          <RecoveryCodes codes={codes} onDone={() => { setCodes(null); setMsg('Two-factor login is on.'); if (required) window.location.href = '/'; }} />
        ) : status.enabled ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--accent-green)', marginBottom: 6 }}>✓ On since {new Date(status.enabledAt).toLocaleDateString()}</div>
            <div style={{ fontSize: 12, color: status.recoveryCodesLeft <= 2 ? 'var(--accent-amber)' : 'var(--text-muted)', marginBottom: 16 }}>{status.recoveryCodesLeft} recovery codes left</div>
            {!confirm.action ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setConfirm({ password: '', code: '', action: 'codes' })}>New recovery codes</button>
                <button className="btn btn-secondary" style={{ color: 'var(--accent-red)' }} onClick={() => setConfirm({ password: '', code: '', action: 'disable' })}>Turn off</button>
              </div>
            ) : (
              <form onSubmit={confirmed} style={{ maxWidth: 360 }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  {confirm.action === 'disable' ? 'Confirm with your password and a current code to turn two-factor login off.' : 'Confirm with your password and a current code. Your old recovery codes stop working.'}
                </p>
                <div className="form-group"><label>Password</label><input type="password" value={confirm.password} onChange={(e) => setConfirm({ ...confirm, password: e.target.value })} required autoComplete="current-password" /></div>
                <div className="form-group"><label>Code from your app</label><input value={confirm.code} onChange={(e) => setConfirm({ ...confirm, code: e.target.value })} inputMode="numeric" required style={codeInput} /></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" disabled={!!busy}>{busy ? 'Checking…' : 'Confirm'}</button>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirm({ password: '', code: '', action: null })}>Cancel</button>
                </div>
              </form>
            )}
          </>
        ) : setup ? (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ background: '#fff', padding: 8, borderRadius: 8 }}><img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} /></div>
            <form onSubmit={enable} style={{ flex: 1, minWidth: 260 }}>
              <ol style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8, paddingLeft: 18, marginBottom: 14 }}>
                <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</li>
                <li>Scan the QR code. Can't scan? Enter this key: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', userSelect: 'all' }}>{setup.secret}</code></li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              <div className="form-group"><input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required autoFocus style={codeInput} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" disabled={!!busy}>{busy === 'enable' ? 'Checking…' : 'Turn on'}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setSetup(null)}>Cancel</button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>
              Off. With two-factor login, signing in also needs a 6-digit code from an app on your phone, so a stolen password alone isn't enough.
            </p>
            <button className="btn btn-primary" onClick={start} disabled={!!busy}>{busy === 'setup' ? 'Starting…' : 'Set up two-factor login'}</button>
          </>
        )}
      </div>
    </div>
  );
};

export default AccountPage;
