import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { spacecraft as scApi, simulation } from '../utils/api';

const FAULTS = [
  { type: 'solar_panel', label: 'Solar Panel Failure', icon: '☀️' },
  { type: 'thermal_control', label: 'Thermal Control Loss', icon: '🌡️' },
  { type: 'antenna', label: 'Antenna Malfunction', icon: '📡' },
  { type: 'battery', label: 'Battery Degradation', icon: '🔋' },
];

const GaugeBar = ({ value, max, label, unit, color, warn, crit }) => {
  const pct = Math.min(100, (value / max) * 100);
  const status = value <= (crit || 0) ? 'critical' : value <= (warn || 0) ? 'warning' : 'nominal';
  const barColor = status === 'critical' ? 'var(--accent-red)' : status === 'warning' ? 'var(--accent-amber)' : color || 'var(--accent-green)';
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: barColor }}>{typeof value === 'number' ? value.toFixed(1) : value}{unit}</span>
      </div>
      <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3, transition: 'width 0.5s, background 0.3s' }} />
      </div>
    </div>
  );
};

const TelemetryPage = () => {
  const { id } = useParams();
  const [sc, setSc] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [history, setHistory] = useState([]);
  const [simRunning, setSimRunning] = useState(false);
  const [injectedFaults, setInjectedFaults] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    scApi.getOne(id).then(res => setSc(res.data)).catch(console.error);
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
    const socketBase = apiUrl.startsWith('/') ? window.location.origin : apiUrl.replace(/\/api\/?$/, '');
    socketRef.current = io(socketBase, { auth: { token: localStorage.getItem('astra_token') } });
    socketRef.current.on('telemetry_update', (data) => {
      if (data.spacecraftId === id) {
        setTelemetry(data);
        setHistory(prev => [...prev.slice(-59), { time: new Date().toLocaleTimeString(), battery: data.power?.batteryLevel, temp: data.thermal?.internalTemp, signal: data.comms?.signalStrength }]);
      }
    });
    return () => socketRef.current?.disconnect();
  }, [id]);

  const startSim = async () => {
    try {
      const res = await simulation.start(id);
      socketRef.current.emit('start_simulation', { spacecraftId: id, config: res.data.config });
      setSimRunning(true);
    } catch (err) { console.error(err); }
  };

  const stopSim = async () => {
    socketRef.current.emit('stop_simulation', { spacecraftId: id });
    await simulation.stop(id);
    setSimRunning(false);
    setTelemetry(null);
    setInjectedFaults([]);
  };

  const injectFault = (fault) => {
    socketRef.current.emit('inject_fault', { spacecraftId: id, fault });
    setInjectedFaults(prev => [...prev, fault.type]);
  };

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>TELEMETRY DASHBOARD</div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>{sc?.name || 'Loading...'}</h1>
          {sc && <span className={`badge badge-${sc.type}`} style={{ marginTop: 8, display: 'inline-flex' }}>{sc.type}</span>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {!simRunning
            ? <button onClick={startSim} className="btn btn-primary">▶ Start Simulation</button>
            : <button onClick={stopSim} className="btn btn-danger">■ Stop Simulation</button>
          }
        </div>
      </div>

      {!simRunning && !telemetry && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>Simulation not running</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Press Start Simulation to begin real-time telemetry</div>
        </div>
      )}

      {telemetry && (
        <>
          {/* Status bar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {telemetry.anomalies?.map((a, i) => (
              <div key={i} className={`badge badge-${a.severity}`} style={{ fontSize: 12, padding: '6px 14px' }}>
                ⚠ {a.system.toUpperCase()}: {a.message}
              </div>
            ))}
            {telemetry.anomalies?.length === 0 && <div className="badge badge-nominal" style={{ fontSize: 12, padding: '6px 14px' }}>● ALL SYSTEMS NOMINAL</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Power */}
            <div className="card">
              <div className="section-title">⚡ Power</div>
              <GaugeBar value={telemetry.power?.batteryLevel} max={100} label="Battery Level" unit="%" crit={20} warn={40} />
              <GaugeBar value={telemetry.power?.solarInput} max={1000} label="Solar Input" unit="W" color="var(--accent-amber)" />
              <GaugeBar value={telemetry.power?.consumption} max={500} label="Consumption" unit="W" color="var(--accent-primary)" />
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Eclipse</span>
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: telemetry.orbital?.inEclipse ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
                  {telemetry.orbital?.inEclipse ? '● IN ECLIPSE' : '● SUNLIT'}
                </span>
              </div>
            </div>

            {/* Thermal */}
            <div className="card">
              <div className="section-title">🌡️ Thermal</div>
              <GaugeBar value={telemetry.thermal?.internalTemp + 100} max={250} label="Internal Temp" unit="" color="var(--accent-amber)" warn={160} crit={180} />
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Internal</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-primary)' }}>{telemetry.thermal?.internalTemp?.toFixed(1)}°C</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>External</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>{telemetry.thermal?.externalTemp?.toFixed(1)}°C</span>
                </div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Status</span>
                <span className={`badge badge-${telemetry.thermal?.status}`}>{telemetry.thermal?.status}</span>
              </div>
            </div>

            {/* Comms */}
            <div className="card">
              <div className="section-title">📡 Communications</div>
              <GaugeBar value={telemetry.comms?.signalStrength} max={100} label="Signal Strength" unit="%" crit={30} warn={60} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Uplink</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-primary)' }}>{telemetry.comms?.uplinkRate} Mbps</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Downlink</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-primary)' }}>{telemetry.comms?.downlinkRate} Mbps</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ground Contact</span>
                  <span className={`badge badge-${telemetry.comms?.groundContact ? 'nominal' : 'critical'}`}>{telemetry.comms?.groundContact ? 'LINK' : 'LOST'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            <div className="card">
              <div className="section-title">Battery History</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="battery" stroke="var(--accent-green)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="section-title">Signal Strength History</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="time" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Line type="monotone" dataKey="signal" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fault injection */}
          <div className="card">
            <div className="section-title">⚠️ Failure Lab — Fault Injection</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {FAULTS.map(fault => {
                const active = injectedFaults.includes(fault.type);
                return (
                  <button key={fault.type} onClick={() => !active && injectFault(fault)} className="btn" style={{
                    justifyContent: 'center', flexDirection: 'column', gap: 6, padding: '16px 12px',
                    background: active ? 'rgba(255,68,68,0.15)' : 'var(--bg-secondary)',
                    color: active ? 'var(--accent-red)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'rgba(255,68,68,0.4)' : 'var(--border)'}`,
                    cursor: active ? 'not-allowed' : 'pointer', fontSize: 12, textAlign: 'center'
                  }}>
                    <span style={{ fontSize: 20 }}>{fault.icon}</span>
                    {fault.label}
                    {active && <span style={{ fontSize: 10, color: 'var(--accent-red)' }}>● ACTIVE</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TelemetryPage;
