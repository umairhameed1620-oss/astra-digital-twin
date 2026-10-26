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
import LoginPage from './pages/LoginPage';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('astra_token');
    const userData = localStorage.getItem('astra_user');
    if (token && userData) setUser(JSON.parse(userData));
    setLoading(false);
  }, []);

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
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/builder" element={<SpacecraftBuilder />} />
          <Route path="/builder/:id" element={<SpacecraftBuilder />} />
          <Route path="/telemetry/:id" element={<TelemetryPage />} />
          <Route path="/visualise" element={<VisualisePage />} />
          <Route path="/conjunction" element={<ConjunctionPage />} />
          <Route path="/missions" element={<MissionsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
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
