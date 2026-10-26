import React, { useEffect, useMemo, useState } from 'react';

// Renders public/user-guide.md (the same file is the guide in the repository) with a small, safe Markdown subset:
// headings, paragraphs, ordered/unordered lists, tables, fenced code and inline **bold**, *italic*, `code`, [links](url).
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const inline = (text, key = 'i') => {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0; let m; let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2]) out.push(<strong key={k} style={{ color: 'var(--text-primary)' }}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3]}</em>);
    else if (m[4]) out.push(<code key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92em', background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>{m[4]}</code>);
    else if (m[5]) {
      const href = /^(https?:|mailto:|#|\/)/.test(m[6]) ? m[6] : '#';
      out.push(<a key={k} href={href} style={{ color: 'var(--accent-primary)' }} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{m[5]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
};

const parse = (md) => {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++; blocks.push({ type: 'code', text: buf.join('\n') }); continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) { blocks.push({ type: 'h', level: h[1].length, text: h[2] }); i++; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      blocks.push({ type: 'table', head: cells(rows[0]), rows: rows.slice(2).map(cells) }); continue;
    }
    if (/^(\d+\.|-)\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^(\d+\.|-)\s+/.test(lines[i])) items.push(lines[i++].replace(/^(\d+\.|-)\s+/, ''));
      blocks.push({ type: 'list', ordered, items }); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|```|\||\d+\.\s|-\s)/.test(lines[i])) buf.push(lines[i++]);
    blocks.push({ type: 'p', text: buf.join(' ') });
  }
  return blocks;
};

const th = { textAlign: 'left', fontSize: 11, color: 'var(--text-muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontWeight: 600 };
const td = { fontSize: 13, padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)', verticalAlign: 'top' };

const HelpPage = () => {
  const [md, setMd] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/user-guide.md', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
      .then(setMd)
      .catch(() => setError('The user guide could not be loaded.'));
  }, []);

  const blocks = useMemo(() => (md ? parse(md) : []), [md]);
  const toc = blocks.filter((b) => b.type === 'h' && b.level === 2);

  // Search: show only sections whose text contains the query.
  const sections = useMemo(() => {
    const out = []; let cur = { head: null, blocks: [] };
    for (const b of blocks) {
      if (b.type === 'h' && b.level === 2) { out.push(cur); cur = { head: b, blocks: [] }; } else cur.blocks.push(b);
    }
    out.push(cur);
    if (!q.trim()) return out;
    const needle = q.toLowerCase();
    return out.filter((s) => JSON.stringify(s).toLowerCase().includes(needle));
  }, [blocks, q]);

  const render = (b, k) => {
    switch (b.type) {
      case 'h':
        if (b.level === 1) return <h1 key={k} style={{ fontSize: 26, fontWeight: 600, marginBottom: 12 }}>{b.text}</h1>;
        return React.createElement(`h${b.level}`, { key: k, id: slug(b.text), style: { fontSize: b.level === 2 ? 19 : 15, fontWeight: 600, margin: '28px 0 10px', color: 'var(--text-primary)', scrollMarginTop: 70 } }, b.text);
      case 'p': return <p key={k} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, marginBottom: 12 }}>{inline(b.text, k)}</p>;
      case 'list': {
        const Tag = b.ordered ? 'ol' : 'ul';
        return <Tag key={k} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, paddingLeft: 22, marginBottom: 12 }}>{b.items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{inline(it, `${k}-${j}`)}</li>)}</Tag>;
      }
      case 'table':
        return (
          <div key={k} style={{ overflowX: 'auto', marginBottom: 14 }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>{b.head.map((h, j) => <th key={j} style={th}>{inline(h, `${k}h${j}`)}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, x) => <td key={x} style={td}>{inline(c, `${k}-${j}-${x}`)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
      case 'code': return <pre key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg-secondary)', padding: 14, borderRadius: 8, overflowX: 'auto', marginBottom: 14, color: 'var(--text-primary)' }}>{b.text}</pre>;
      default: return null;
    }
  };

  return (
    <div className="animate-in" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 230px) minmax(0, 860px)', gap: 28, alignItems: 'start' }}>
      <div style={{ position: 'sticky', top: 70 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: 3, marginBottom: 12 }}>HELP</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guide…" style={{ marginBottom: 12 }} />
        <nav>
          {toc.map((h) => (
            <a key={h.text} href={`#${slug(h.text)}`} onClick={() => setQ('')} style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>{h.text}</a>
          ))}
        </nav>
      </div>
      <div className="card" style={{ padding: '28px 32px' }}>
        {error && <div style={{ color: 'var(--accent-red)' }}>{error}</div>}
        {!md && !error && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
        {sections.map((s, si) => (
          <section key={si}>
            {s.head && render(s.head, `s${si}h`)}
            {s.blocks.map((b, bi) => render(b, `s${si}b${bi}`))}
          </section>
        ))}
        {md && q && sections.length === 0 && <div style={{ color: 'var(--text-muted)' }}>Nothing in the guide matches “{q}”.</div>}
      </div>
    </div>
  );
};

export default HelpPage;
