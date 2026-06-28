import React, { useState, useEffect, useRef } from 'react';
import { spacecraft as scApi, ai } from '../utils/api';

const AIBriefing = () => {
  const [spacecraft, setSpacecraft] = useState([]);
  const [selectedSc, setSelectedSc] = useState('');
  const [messages, setMessages] = useState([{ role: 'aria', content: "Hello, I'm ARIA — your Autonomous Reasoning & Intelligence for Aerospace co-pilot. Select a spacecraft and ask me anything about your mission." }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { scApi.getAll().then(res => setSpacecraft(res.data || [])).catch(console.error); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const res = await ai.analyse({ spacecraftId: selectedSc || null, telemetry: {}, question });
      setMessages(prev => [...prev, { role: 'aria', content: res.data.response }]);
    } catch {
      setMessages(prev => [...prev, { role: 'aria', content: 'Analysis unavailable. Please check your connection.' }]);
    } finally { setLoading(false); }
  };

  const quickPrompts = ['Analyse current mission health', 'What are the biggest risks?', 'Recommend power optimisation', 'Generate daily briefing report', 'Explain orbital mechanics for this mission'];

  return (
    <div className="animate-in" style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 8 }}>ARIA AI CO-PILOT</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>Mission Intelligence</h1>
          <select value={selectedSc} onChange={e => setSelectedSc(e.target.value)} style={{ width: 240 }}>
            <option value="">— Select Spacecraft —</option>
            {spacecraft.map(sc => <option key={sc.id} value={sc.id}>{sc.name} ({sc.type})</option>)}
          </select>
        </div>
      </div>

      {/* Chat */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: m.role === 'aria' ? 'linear-gradient(135deg, #00d4ff, #0066cc)' : 'linear-gradient(135deg, #9664ff, #6644cc)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
              }}>{m.role === 'aria' ? '🤖' : '👨‍🚀'}</div>
              <div style={{
                maxWidth: '75%', padding: '12px 16px', borderRadius: 12,
                background: m.role === 'aria' ? 'var(--bg-secondary)' : 'rgba(150,100,255,0.15)',
                border: `1px solid ${m.role === 'aria' ? 'var(--border)' : 'rgba(150,100,255,0.3)'}`,
                fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap'
              }}>
                {m.role === 'aria' && <div style={{ fontSize: 10, color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)', letterSpacing: 1, marginBottom: 6 }}>ARIA</div>}
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #00d4ff, #0066cc)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🤖</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                <span className="pulse">ARIA is analysing</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>...</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts */}
        <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {quickPrompts.map((p, i) => (
            <button key={i} onClick={() => setInput(p)} style={{
              padding: '5px 12px', fontSize: 12, background: 'var(--bg-secondary)',
              border: '1px solid var(--border)', borderRadius: 20, color: 'var(--text-secondary)',
              cursor: 'pointer', transition: 'all 0.2s'
            }}>{p}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask ARIA anything about your spacecraft or mission..."
            style={{ flex: 1 }}
          />
          <button onClick={send} className="btn btn-primary" disabled={loading || !input.trim()} style={{ padding: '10px 20px', flexShrink: 0 }}>
            Send →
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIBriefing;
