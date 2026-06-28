import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { spacecraft as scApi, missions as mApi } from '../utils/api';

const typeIcons = { satellite: '🛰️', rocket: '🚀', station: '🔭', rover: '🤖' };
const typeColors = { satellite: 'satellite', rocket: 'rocket', station: 'station', rover: 'rover' };

const StatCard = ({ value, label, unit, color }) => (
  <div className="card" style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 36, fontWeight: 700, color: color || 'var(--accent-primary)' }}>{value}</div>
    {unit && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{unit}</div>}
    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{label}</div>
  </div>
);

const Dashboard = ({ user }) => {
  const [spacecraft, setSpacecraft] = useState([]);
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([scApi.getAll(), mApi.getAll()]).then(([sc, ms]) => {
      setSpacecraft(sc.data || []);
      setMissions(ms.data || []);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const counts = spacecraft.reduce((acc, s) => { acc[s.type] = (acc[s.type] || 0) + 1; return acc; }, {});
  const simulating = spacecraft.filter(s => s.status === 'simulating').length;
  const activeMissions = missions.filter(m => m.status === 'active').length;

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 40, textAlign: 'center' }}>Loading ASTRA Systems...</div>;

  return (
    <div className="animate-in">
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>MISSION OVERVIEW</div>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--text-primary)' }}>
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          {spacecraft.length} spacecraft twins active · {activeMissions} missions in progress
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <StatCard value={spacecraft.length} label="Total Twins" color="var(--accent-primary)" />
        <StatCard value={simulating} label="Simulating" color="var(--accent-green)" />
        <StatCard value={activeMissions} label="Active Missions" color="var(--accent-amber)" />
        <StatCard value={spacecraft.filter(s => s.status === 'designed').length} label="In Design" color="#9664ff" />
      </div>

      {/* Fleet type breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {['satellite', 'rocket', 'station', 'rover'].map(type => (
          <div key={type} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 24 }}>{typeIcons[type]}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, color: 'var(--text-primary)' }}>{counts[type] || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{type}s</div>
            </div>
          </div>
        ))}
      </div>

      {/* Spacecraft list */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div>
          <div className="section-title">Active Fleet</div>
          {spacecraft.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🛸</div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>No spacecraft twins yet</div>
              <Link to="/builder" className="btn btn-primary">+ Create First Twin</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {spacecraft.map(sc => (
                <div key={sc.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
                  <span style={{ fontSize: 28 }}>{typeIcons[sc.type]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{sc.name}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span className={`badge badge-${typeColors[sc.type]}`}>{sc.type}</span>
                      <span className={`badge badge-${sc.status === 'simulating' ? 'nominal' : 'warning'}`}>
                        {sc.status === 'simulating' ? '● LIVE' : sc.status}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Link to={`/telemetry/${sc.id}`} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>Telemetry</Link>
                    <Link to={`/builder/${sc.id}`} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>Edit</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Link to="/builder" className="btn btn-primary">+ New Spacecraft Twin</Link>
          </div>
        </div>

        {/* Missions panel */}
        <div>
          <div className="section-title">Missions</div>
          {missions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 30 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 13 }}>No missions planned</div>
              <Link to="/missions" className="btn btn-secondary" style={{ fontSize: 12 }}>Plan Mission</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {missions.slice(0, 5).map(m => (
                <div key={m.id} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{m.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.spacecraft_name || 'No spacecraft'}</span>
                    <span className={`badge badge-${m.status === 'active' ? 'nominal' : 'warning'}`}>{m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Link to="/missions" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>View All Missions</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
