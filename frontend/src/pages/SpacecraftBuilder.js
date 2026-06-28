import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { spacecraft as scApi } from '../utils/api';

const COMPONENT_LIBRARY = {
  power: [
    { id: 'solar_1', name: 'Triple-Junction Solar Array', mass: 45, power: 850, cost: 120000 },
    { id: 'solar_2', name: 'Flexible Solar Panel', mass: 12, power: 320, cost: 45000 },
    { id: 'battery_1', name: 'Li-Ion Battery Pack (100Ah)', mass: 28, power: -200, capacity: 3600, cost: 85000 },
    { id: 'battery_2', name: 'Solid-State Battery (200Ah)', mass: 35, power: -300, capacity: 7200, cost: 160000 },
  ],
  propulsion: [
    { id: 'thruster_1', name: 'Hall-Effect Thruster', mass: 8, thrust: 0.08, isp: 1600, deltaV: 2000, cost: 200000 },
    { id: 'thruster_2', name: 'Cold Gas Thruster', mass: 2, thrust: 0.5, isp: 70, deltaV: 50, cost: 8000 },
    { id: 'engine_1', name: 'Merlin Engine', mass: 470, thrust: 845000, isp: 311, deltaV: 3000, cost: 1200000 },
    { id: 'engine_2', name: 'Ion Drive System', mass: 15, thrust: 0.092, isp: 3200, deltaV: 5000, cost: 350000 },
  ],
  comms: [
    { id: 'antenna_1', name: 'X-Band Patch Antenna', mass: 0.5, dataRate: 100, gain: 12, cost: 15000 },
    { id: 'antenna_2', name: 'Ka-Band High Gain Antenna', mass: 4, dataRate: 1000, gain: 45, cost: 85000 },
    { id: 'radio_1', name: 'S-Band Transponder', mass: 1.2, dataRate: 10, gain: 8, cost: 28000 },
  ],
  attitude: [
    { id: 'rw_1', name: 'Reaction Wheel Assembly (3-axis)', mass: 12, torque: 0.2, cost: 180000 },
    { id: 'gyro_1', name: 'Ring Laser Gyroscope', mass: 1.8, accuracy: 0.001, cost: 95000 },
    { id: 'star_1', name: 'Star Tracker', mass: 0.9, accuracy: 0.0001, cost: 120000 },
  ],
  structure: [
    { id: 'bus_1', name: '6U CubeSat Bus', mass: 8, volume: 6, cost: 25000 },
    { id: 'bus_2', name: '12U CubeSat Bus', mass: 14, volume: 12, cost: 45000 },
    { id: 'bus_3', name: 'ESPA Class Bus', mass: 180, volume: 150, cost: 800000 },
    { id: 'bus_4', name: 'GEO Platform Bus', mass: 1200, volume: 800, cost: 5000000 },
  ]
};

const SpacecraftBuilder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState('satellite');
  const [description, setDescription] = useState('');
  const [selectedComponents, setSelectedComponents] = useState([]);
  const [config, setConfig] = useState({ altitude: 550, inclination: 53, deltaV: 500, powerConsumption: 200 });
  const [activeTab, setActiveTab] = useState('power');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      scApi.getOne(id).then(res => {
        const sc = res.data;
        setName(sc.name);
        setType(sc.type);
        setDescription(sc.description || '');
        setSelectedComponents(sc.components || []);
        setConfig(sc.config || {});
      }).catch(console.error);
    }
  }, [id]);

  const totalMass = selectedComponents.reduce((sum, c) => sum + (c.mass || 0), 0);
  const totalPower = selectedComponents.reduce((sum, c) => sum + (c.power || 0), 0);
  const totalCost = selectedComponents.reduce((sum, c) => sum + (c.cost || 0), 0);
  const powerBudget = totalPower;

  const addComponent = (comp) => {
    setSelectedComponents([...selectedComponents, { ...comp, instanceId: Date.now() }]);
  };

  const removeComponent = (instanceId) => {
    setSelectedComponents(selectedComponents.filter(c => c.instanceId !== instanceId));
  };

  const save = async () => {
    if (!name.trim()) { setError('Name required'); return; }
    setSaving(true); setError('');
    try {
      const data = { name, type, description, components: selectedComponents, config };
      if (id) await scApi.update(id, data);
      else await scApi.create(data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>SPACECRAFT BUILDER</div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>{id ? 'Edit Twin' : 'New Digital Twin'}</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        {/* Left - Builder */}
        <div>
          {/* Basic config */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Identity</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Spacecraft Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SENTINEL-1A" />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Type</label>
                <select value={type} onChange={e => setType(e.target.value)}>
                  <option value="satellite">🛰️ Satellite</option>
                  <option value="rocket">🚀 Rocket</option>
                  <option value="station">🔭 Space Station</option>
                  <option value="rover">🤖 Rover</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
              <label>Mission Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe mission objectives..." rows={2} />
            </div>
          </div>

          {/* Mission config */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Mission Parameters</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {type === 'satellite' && <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Altitude (km)</label>
                  <input type="number" value={config.altitude} onChange={e => setConfig({...config, altitude: +e.target.value})} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Inclination (°)</label>
                  <input type="number" value={config.inclination} onChange={e => setConfig({...config, inclination: +e.target.value})} />
                </div>
              </>}
              <div className="form-group" style={{ margin: 0 }}>
                <label>ΔV Budget (m/s)</label>
                <input type="number" value={config.deltaV} onChange={e => setConfig({...config, deltaV: +e.target.value})} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Power Draw (W)</label>
                <input type="number" value={config.powerConsumption} onChange={e => setConfig({...config, powerConsumption: +e.target.value})} />
              </div>
            </div>
          </div>

          {/* Component library */}
          <div className="card">
            <div className="section-title">Component Library</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {Object.keys(COMPONENT_LIBRARY).map(cat => (
                <button key={cat} onClick={() => setActiveTab(cat)} className="btn" style={{
                  padding: '6px 16px', fontSize: 12,
                  background: activeTab === cat ? 'var(--accent-primary)' : 'transparent',
                  color: activeTab === cat ? 'var(--bg-primary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  textTransform: 'capitalize'
                }}>{cat}</button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {COMPONENT_LIBRARY[activeTab].map(comp => (
                <div key={comp.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', background: 'var(--bg-secondary)',
                  borderRadius: 8, border: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 4 }}>{comp.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {comp.mass}kg · £{(comp.cost/1000).toFixed(0)}k
                      {comp.power && ` · ${comp.power > 0 ? '+' : ''}${comp.power}W`}
                      {comp.thrust && ` · ${comp.thrust > 1000 ? (comp.thrust/1000).toFixed(0)+'kN' : comp.thrust+'N'}`}
                    </div>
                  </div>
                  <button onClick={() => addComponent(comp)} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: 12 }}>+ Add</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right - Summary */}
        <div>
          {/* Budget panel */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Budget Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Total Mass</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-primary)' }}>{totalMass.toFixed(1)} kg</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Power Balance</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: powerBudget >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {powerBudget >= 0 ? '+' : ''}{powerBudget.toFixed(0)} W
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Est. Cost</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)' }}>£{(totalCost/1000000).toFixed(2)}M</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Components</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{selectedComponents.length}</span>
              </div>
            </div>
          </div>

          {/* Selected components */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Installed ({selectedComponents.length})</div>
            {selectedComponents.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 20 }}>No components added yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {selectedComponents.map(c => (
                  <div key={c.instanceId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{c.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.mass}kg</div>
                    </div>
                    <button onClick={() => removeComponent(c.instanceId)} style={{ background: 'none', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12, padding: '10px 14px', background: 'rgba(255,68,68,0.1)', borderRadius: 8 }}>{error}</div>}

          <button onClick={save} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14 }} disabled={saving}>
            {saving ? 'Saving...' : id ? '✓ Update Twin' : '✓ Create Twin'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpacecraftBuilder;
