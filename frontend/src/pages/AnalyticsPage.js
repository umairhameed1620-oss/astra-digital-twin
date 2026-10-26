import React, { useState, useEffect } from 'react';
import { spacecraft as scApi } from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const TYPE_COLORS = { satellite: '#00d4ff', rocket: '#ff6432', station: '#9664ff', rover: '#ffc832' };

// Every status a twin can have, in lifecycle order, each with its own colour
const STATUSES = [
  { key: 'designed', label: 'Designed', color: '#7a8ba8' },
  { key: 'launched', label: 'Launched', color: '#ffaa00' },
  { key: 'operational', label: 'Operational', color: '#00ff88' },
  { key: 'simulating', label: 'Simulating', color: '#00d4ff' },
  { key: 'decommissioned', label: 'Decommissioned', color: '#ff4444' },
  { key: 'archived', label: 'Archived', color: '#555f73' },
];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown');

const tooltipStyle = {
  contentStyle: { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 },
  itemStyle: { color: 'var(--text-primary)' },
  labelStyle: { color: 'var(--text-secondary)' },
};

const AnalyticsPage = () => {
  const [spacecraft, setSpacecraft] = useState([]);

  useEffect(() => {
    scApi.getAll()
      .then(res => setSpacecraft(Array.isArray(res.data) ? res.data : (res.data?.data || [])))
      .catch(console.error);
  }, []);

  const typeData = ['satellite', 'rocket', 'station', 'rover'].map(type => ({
    key: type,
    name: cap(type),
    count: spacecraft.filter(s => s.type === type).length,
  })).filter(d => d.count > 0);

  // Known statuses first, then anything unexpected so nothing is ever silently dropped
  const known = STATUSES.map(s => ({
    ...s,
    name: s.label,
    count: spacecraft.filter(sc => sc.status === s.key).length,
  }));
  const unknownKeys = [...new Set(spacecraft.map(sc => sc.status))].filter(k => !STATUSES.some(s => s.key === k));
  const unknown = unknownKeys.map(k => ({
    key: k, name: cap(k), label: cap(k), color: '#9664ff',
    count: spacecraft.filter(sc => sc.status === k).length,
  }));
  const statusData = [...known, ...unknown].filter(d => d.count > 0);

  const active = spacecraft.filter(s => s.status === 'operational' || s.status === 'launched').length;

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>ANALYTICS</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Fleet Analytics</h1>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Twins', value: spacecraft.length, color: 'var(--accent-primary)' },
          { label: 'In Orbit (Launched / Operational)', value: active, color: 'var(--accent-green)' },
          { label: 'Decommissioned', value: spacecraft.filter(s => s.status === 'decommissioned').length, color: 'var(--accent-red)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, color: s.color, fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div className="card">
          <div className="section-title">Fleet by Type</div>
          {typeData.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No data yet</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(0,212,255,0.06)' }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={90}>
                  {typeData.map(d => <Cell key={d.key} fill={TYPE_COLORS[d.key] || '#00d4ff'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <div className="section-title">Status Distribution</div>
          {statusData.length === 0 ? <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No data yet</div> : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={90}
                      paddingAngle={statusData.length > 1 ? 3 : 0}
                      dataKey="count"
                      stroke="none"
                    >
                      {statusData.map(d => <Cell key={d.key} fill={d.color} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                    <text x="50%" y="47%" textAnchor="middle" fill="var(--text-primary)" style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700 }}>
                      {spacecraft.length}
                    </text>
                    <text x="50%" y="58%" textAnchor="middle" fill="var(--text-muted)" style={{ fontSize: 10, letterSpacing: 1 }}>
                      TWINS
                    </text>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 140 }}>
                {statusData.map(d => (
                  <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                    <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{d.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: d.color }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
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
