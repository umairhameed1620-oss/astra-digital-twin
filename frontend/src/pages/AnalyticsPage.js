import React, { useState, useEffect } from 'react';
import { spacecraft as scApi } from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#00d4ff', '#ff6432', '#9664ff', '#ffc832'];

const AnalyticsPage = () => {
  const [spacecraft, setSpacecraft] = useState([]);

  useEffect(() => { scApi.getAll().then(res => setSpacecraft(res.data || [])); }, []);

  const typeData = ['satellite', 'rocket', 'station', 'rover'].map(type => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    count: spacecraft.filter(s => s.type === type).length
  })).filter(d => d.count > 0);

  const statusData = ['designed', 'simulating', 'archived'].map(status => ({
    name: status.charAt(0).toUpperCase() + status.slice(1),
    count: spacecraft.filter(s => s.status === status).length
  })).filter(d => d.count > 0);

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>ANALYTICS</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Fleet Analytics</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="card">
          <div className="section-title">Fleet by Type</div>
          {typeData.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No data yet</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="count" fill="var(--accent-primary)" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="section-title">Status Distribution</div>
          {statusData.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No data yet</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="count" label={({ name, count }) => `${name}: ${count}`} labelLine={{ stroke: 'var(--text-muted)' }}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="section-title">Platform Capabilities</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[
            { label: 'Physics Engine', value: 'SGP4 + Custom', icon: '⚙️' },
            { label: 'Simulation Speed', value: '1s tick rate', icon: '⚡' },
            { label: 'AI Model', value: 'Claude Sonnet', icon: '🤖' },
            { label: 'Real-time Protocol', value: 'WebSocket', icon: '📡' },
            { label: 'Spacecraft Types', value: '4 supported', icon: '🛸' },
            { label: 'Fault Modes', value: '4 injectable', icon: '⚠️' },
          ].map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
              <span style={{ fontSize: 24 }}>{item.icon}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent-primary)' }}>{item.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{item.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;
