import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import SpacecraftBuilder from './pages/SpacecraftBuilder';
import TelemetryPage from './pages/TelemetryPage';
import MissionsPage from './pages/MissionsPage';
import AIBriefing from './pages/AIBriefing';
import AnalyticsPage from './pages/AnalyticsPage';
import VisualisePage from './pages/VisualisePage';
import ConjunctionPage from './pages/ConjunctionPage';
import AdminPage from './pages/AdminPage';
import AlertsPage from './pages/AlertsPage';
import ValidationPage from './pages/ValidationPage';
import LoginPage from './pages/LoginPage';
import TeamPage from './pages/TeamPage';
import AccountPage from './pages/AccountPage';
import HelpPage from './pages/HelpPage';
import { auth as authApi, team as teamApi, errorText } from './utils/api';

// A logged-in user opened an invitation link: offer to join that team.
const InviteBanner = ({ onJoined }) => {
  const token = (() => { try { return new URLSearchParams(window.location.search).get('invite'); } catch (e) { return null; } })();
  const [inv, setInv] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return;
    teamApi.lookup(token).then((r) => setInv(r.data)).catch((e) => setMsg(errorText(e, 'This invitation link is not valid.')));
  }, [token]);
  if (!token || (!inv && !msg)) return null;
  const clear = () => { window.history.replaceState({}, '', window.location.pathname); setInv(null); setMsg(''); };
  const accept = async () => {
    setBusy(true);
    try {
      const r = await teamApi.accept(token);
      const me = await authApi.me();
      onJoined(me.data.user);
      clear();
      window.alert(`You joined ${r.data.team} as ${r.data.role}.`);
    } catch (e) { setMsg(errorText(e, 'Could not join the team')); }
    finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent-primary)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
      <div style={{ flex: 1, color: 'var(--text-secondary)' }}>
        {inv ? <>Invitation to join <strong style={{ color: 'var(--text-primary)' }}>{inv.team}</strong> as <strong>{inv.role}</strong> (for {inv.email}). If this is your only team, your satellites move with you.</> : msg}
      </div>
      {inv && <button className="btn btn-primary" onClick={accept} disabled={busy}>{busy ? 'Joining…' : 'Join team'}</button>}
      <button className="btn btn-secondary" onClick={clear}>Dismiss</button>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('astra_token');
    const userData = localStorage.getItem('astra_user');
    if (token && userData) {
      setUser(JSON.parse(userData));
      // Refresh team, role and 2FA status; they can change while the user is away.
      authApi.me().then((r) => {
        localStorage.setItem('astra_user', JSON.stringify(r.data.user));
        setUser(r.data.user);
      }).catch(() => {});
    }
    setLoading(false);
  }, []);

  const updateUser = (u) => {
    localStorage.setItem('astra_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogin = (userData, token) => {
    localStorage.setItem('astra_token', token);
    localStorage.setItem('astra_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('astra_token');
    localStorage.removeItem('astra_user');
    setUser(null);
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#020408' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontFamily:'Orbitron,monospace', color:'#00d4ff', fontSize:28, marginBottom:12 }}>ASTRA</div>
        <div style={{ color:'#3d6b8a', fontSize:13 }}>Initialising Systems...</div>
      </div>
    </div>
  );

  if (!user) return <LoginPage onLogin={handleLogin} />;

  return (
    <Router>
      <Layout user={user} onLogout={handleLogout}>
        <InviteBanner onJoined={updateUser} />
        {user.mustSetup2fa && window.location.pathname !== '/account' && (
          <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--accent-amber)', fontSize: 13 }}>
            Your team requires two-factor login. <a href="/account?setup2fa=1" style={{ color: 'var(--accent-primary)' }}>Set it up now</a> to keep using ASTRA.
          </div>
        )}
        <Routes>
          <Route path="/team" element={<TeamPage user={user} onUserChange={updateUser} />} />
          <Route path="/account" element={<AccountPage user={user} onUserChange={updateUser} />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/builder" element={<SpacecraftBuilder />} />
          <Route path="/builder/:id" element={<SpacecraftBuilder />} />
          <Route path="/telemetry/:id" element={<TelemetryPage />} />
          <Route path="/visualise" element={<VisualisePage />} />
          <Route path="/conjunction" element={<ConjunctionPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/validation" element={<ValidationPage />} />
          <Route path="/ai" element={<AIBriefing />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          {user.role === 'admin' && <Route path="/admin" element={<AdminPage user={user} />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
