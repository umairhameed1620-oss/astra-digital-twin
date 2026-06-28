import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../App';
import Navbar from '../components/Navbar';

const CATEGORY_ICONS = {
  power: '⚡', propulsion: '🔥', thermal: '🌡️', comms: '📡',
  attitude_control: '🧭', structure: '🔩', payload: '📷', navigation: '🗺️'
};

const CATEGORY_COLORS = {
  power: '#f59e0b', propulsion: '#ef4444', thermal: '#f97316',
  comms: '#06b6d4', attitude_control: '#8b5cf6', structure: '#6b7280',
  payload: '#10b981', navigation: '#3b82f6'
};

export default function Builder() {
  const { id } = useParams();
  const { token, apiUrl } = useAuth();
  const navigate = useNavigate();

  const [spacecraft, setSpacecraft] = useState(null);
  const [components, setComponents] = useState([]);
  const [library, setLibrary] = useState({});
  const [budget, setBudget] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('power');
  const [loading, setLoading] = useState(true);
  const [addingComponent, setAddingComponent] = useState(null);
  const [activeTab, setActiveTab] = useState('library'); // library | custom | budget

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/spacecraft/${id}`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${apiUrl}/components/library`, { headers: authHeaders }).then(r => r.json()),
      fetch(`${apiUrl}/budget/${id}`, { headers: authHeaders }).then(r => r.json()),
    ]).then(([scData, libData, budgetData]) => {
      setSpacecraft(scData.spacecraft);
      setComponents(scData.components || []);
      setLibrary(libData.library || {});
      setBudget(budgetData);
    }).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  const refreshBudget = async () => {
    const res = await fetch(`${apiUrl}/budget/${id}`, { headers: authHeaders });
    const data = await res.json();
    setBudget(data);
  };

  const addComponent = async (template) => {
    setAddingComponent(template.name);
    try {
      const res = await fetch(`${apiUrl}/components/spacecraft/${id}`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ ...template, category: selectedCategory })
      });
      const data = await res.json();
      if (res.ok) {
        setComponents(prev => [...prev, data.component]);
        await refreshBudget();
      }
    } catch (e) { console.error(e); }
    finally { setAddingComponent(null); }
  };

  const removeComponent = async (compId) => {
    try {
      await fetch(`${apiUrl}/components/${compId}`, { method: 'DELETE', headers: authHeaders });
      setComponents(prev => prev.filter(c => c.id !== compId));
      await refreshBudget();
    } catch (e) { console.error(e); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 60px)' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚙️</div>
          <p>Loading spacecraft builder...</p>
        </div>
      </div>
    </div>
  );

  const byCategory = components.reduce((acc, c) => {
    acc[c.category] = acc[c.category] || [];
    acc[c.category].push(c);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px' }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: 'var(--text-muted)' }}>
          <Link to="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Fleet</Link>
          <span>/</span>
          <Link to={`/spacecraft/${id}`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{spacecraft?.name}</Link>
          <span>/</span>
          <span style={{ color: 'var(--accent-blue-light)' }}>Builder</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
              🔧 {spacecraft?.name} — Component Builder
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              {components.length} components · {parseFloat(budget?.massBudget?.totalMassKg || 0).toFixed(1)} kg total mass
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={() => navigate(`/spacecraft/${id}`)}>← Overview</button>
            <button className="btn-primary" onClick={() => navigate(`/spacecraft/${id}/simulation`)}>⚙️ Run Simulation</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20 }}>
          {/* LEFT: Component Library Panel */}
          <div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'var(--bg-card)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
              {[['library', '📚 Library'], ['budget', '📊 Budget']].map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: '8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: activeTab === tab ? 'var(--accent-blue)' : 'transparent',
                  color: activeTab === tab ? 'white' : 'var(--text-muted)', transition: 'all 0.15s'
                }}>{label}</button>
              ))}
            </div>

            {activeTab === 'library' && (
              <div className="card" style={{ padding: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Subsystem Category</p>
                {/* Category selector */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {Object.keys(library).map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)} style={{
                      padding: '5px 10px', borderRadius: 20, border: `1px solid ${selectedCategory === cat ? CATEGORY_COLORS[cat] : 'var(--border)'}`,
                      background: selectedCategory === cat ? `${CATEGORY_COLORS[cat]}22` : 'transparent',
                      color: selectedCategory === cat ? CATEGORY_COLORS[cat] : 'var(--text-muted)',
                      cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s'
                    }}>
                      {CATEGORY_ICONS[cat]} {cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                {/* Components in selected category */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(library[selectedCategory] || []).map((comp, i) => (
                    <div key={i} style={{
                      padding: 12, borderRadius: 8, border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)', transition: 'all 0.15s'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>{comp.name}</p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: 'var(--accent-yellow)', fontFamily: 'monospace' }}>⚖️ {comp.mass_kg}kg</span>
                            {comp.power_consumption_w > 0 && <span style={{ fontSize: 10, color: 'var(--accent-red)', fontFamily: 'monospace' }}>⚡ -{comp.power_consumption_w}W</span>}
                            {comp.power_generation_w > 0 && <span style={{ fontSize: 10, color: 'var(--accent-green)', fontFamily: 'monospace' }}>⚡ +{comp.power_generation_w}W</span>}
                          </div>
                        </div>
                        <button onClick={() => addComponent({ ...comp, category: selectedCategory })}
                          disabled={addingComponent === comp.name}
                          style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: 'white', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0, opacity: addingComponent === comp.name ? 0.6 : 1 }}>
                          {addingComponent === comp.name ? '...' : '+ Add'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'budget' && budget && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Power Budget */}
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--accent-yellow)' }}>⚡ Power Budget</h4>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Generation</span>
                      <span style={{ color: 'var(--accent-green)', fontFamily: 'monospace' }}>+{budget.powerBudget?.totalGenerationW}W</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                      <span style={{ color: 'var(--text-muted)' }}>Consumption</span>
                      <span style={{ color: 'var(--accent-red)', fontFamily: 'monospace' }}>-{budget.powerBudget?.totalConsumptionW}W</span>
                    </div>
                    <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.abs(budget.powerBudget?.marginPct))}%`,
                        background: budget.powerBudget?.status === 'healthy' ? 'var(--accent-green)' : budget.powerBudget?.status === 'warning' ? 'var(--accent-yellow)' : 'var(--accent-red)',
                        borderRadius: 2 }} />
                    </div>
                    <p style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                      Margin: <span style={{ color: budget.powerBudget?.status === 'healthy' ? 'var(--accent-green)' : 'var(--accent-yellow)', fontFamily: 'monospace' }}>
                        {budget.powerBudget?.marginW}W ({budget.powerBudget?.marginPct}%)
                      </span>
                    </p>
                  </div>
                </div>

                {/* Mass Budget */}
                <div className="card" style={{ padding: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--accent-cyan)' }}>⚖️ Mass Budget</h4>
                  <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Orbitron, sans-serif', color: 'var(--accent-cyan)', marginBottom: 8 }}>
                    {budget.massBudget?.totalMassKg} kg
                  </p>
                  {Object.entries(budget.massBudget?.byCategory || {}).map(([cat, mass]) => (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{CATEGORY_ICONS[cat]} {cat.replace('_', ' ')}</span>
                      <span style={{ fontFamily: 'monospace', color: CATEGORY_COLORS[cat] }}>{mass.toFixed(2)} kg</span>
                    </div>
                  ))}
                </div>

                {/* Delta-V */}
                {budget.deltaVBudget && (
                  <div className="card" style={{ padding: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--accent-red)' }}>🔥 ΔV Budget</h4>
                    <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Orbitron, sans-serif', color: 'var(--accent-red)', marginBottom: 4 }}>
                      {budget.deltaVBudget.deltaVMs} m/s
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Isp: {budget.deltaVBudget.avgIspS}s · Propellant: {budget.deltaVBudget.propellantMassKg}kg</p>
                  </div>
                )}

                {/* Warnings */}
                {budget.warnings?.length > 0 && (
                  <div className="card" style={{ padding: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--accent-yellow)' }}>⚠️ Warnings</h4>
                    {budget.warnings.map((w, i) => (
                      <div key={i} style={{ fontSize: 11, color: w.severity === 'critical' ? 'var(--accent-red)' : w.severity === 'warning' ? 'var(--accent-yellow)' : 'var(--text-muted)',
                        marginBottom: 6, paddingLeft: 8, borderLeft: `2px solid ${w.severity === 'critical' ? 'var(--accent-red)' : w.severity === 'warning' ? 'var(--accent-yellow)' : 'var(--border)'}` }}>
                        {w.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Spacecraft Component View */}
          <div>
            <div className="card" style={{ padding: 20, minHeight: 500 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700 }}>Installed Components ({components.length})</h3>
                <span className={`badge badge-${budget?.overallHealth === 'nominal' ? 'green' : budget?.overallHealth === 'warning' ? 'yellow' : 'red'}`}>
                  {budget?.overallHealth || 'nominal'}
                </span>
              </div>

              {components.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🔩</div>
                  <p style={{ fontSize: 15, marginBottom: 8 }}>No components installed</p>
                  <p style={{ fontSize: 13 }}>Select a subsystem from the library and click + Add</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(byCategory).map(([category, comps]) => (
                    <div key={category}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 14 }}>{CATEGORY_ICONS[category]}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: CATEGORY_COLORS[category] }}>
                          {category.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({comps.length})</span>
                      </div>
                      {comps.map(comp => (
                        <div key={comp.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '10px 14px', borderRadius: 8, background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-light)', marginBottom: 4, gap: 8
                        }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{comp.name}</p>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, color: 'var(--accent-yellow)', fontFamily: 'monospace' }}>⚖️ {parseFloat(comp.mass_kg).toFixed(2)}kg</span>
                              {parseFloat(comp.power_consumption_w) > 0 && <span style={{ fontSize: 10, color: 'var(--accent-red)', fontFamily: 'monospace' }}>⚡ -{parseFloat(comp.power_consumption_w).toFixed(1)}W</span>}
                              {parseFloat(comp.power_generation_w) > 0 && <span style={{ fontSize: 10, color: 'var(--accent-green)', fontFamily: 'monospace' }}>⚡ +{parseFloat(comp.power_generation_w).toFixed(1)}W</span>}
                              <span className={`status-dot ${comp.status}`} />
                            </div>
                          </div>
                          <button onClick={() => removeComponent(comp.id)} style={{
                            background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6,
                            color: 'var(--accent-red)', cursor: 'pointer', padding: '4px 8px', fontSize: 11, flexShrink: 0
                          }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
