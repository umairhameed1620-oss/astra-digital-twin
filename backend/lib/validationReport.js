// PDF validation report: ASTRA predictions compared with CDMs (pdfkit, built-in fonts only).
const PDFDocument = require('pdfkit');

const C = { ink: '#0b1726', muted: '#5b6b7f', accent: '#0077aa', line: '#c9d3df', band: '#0b1726', ok: '#2e7d32', warn: '#b26a00' };
const ascii = (s) => String(s == null ? '-' : s).replace(/±/g, '+/-').replace(/[^\x20-\x7E]/g, '');
const utc = (d) => (d ? `${new Date(d).toISOString().replace('T', ' ').slice(0, 16)} UTC` : '-');
const rate = (x) => (x == null ? '-' : `${(x * 100).toFixed(0)}%`);
const fx = (x, d = 2, unit = '') => (x == null ? '-' : `${Number(x).toFixed(d)}${unit}`);
const pcf = (x) => (x == null ? '-' : Number(x) === 0 ? '0' : Number(x).toExponential(1));

const build = ({ run, cumulative, user }) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, bufferPages: true, info: { Title: 'ASTRA validation report', Author: 'ASTRA Digital Twin' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  const W = doc.page.width - 80;
  const s = run.summary || {};
  const ensure = (h) => { if (doc.y + h > doc.page.height - 50) doc.addPage(); };
  const heading = (t) => {
    ensure(36);
    doc.moveDown(0.6);
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(10.5).text(ascii(t).toUpperCase(), 40, doc.y, { characterSpacing: 1, width: W });
    doc.moveTo(40, doc.y + 2).lineTo(40 + W, doc.y + 2).strokeColor(C.line).lineWidth(0.7).stroke();
    doc.moveDown(0.5).fillColor(C.ink).font('Helvetica').fontSize(9);
    doc.x = 40;
  };

  doc.rect(0, 0, doc.page.width, 70).fill(C.band);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('ASTRA validation report', 40, 22);
  doc.font('Helvetica').fontSize(9).fillColor('#9fb3c8')
    .text(`ASTRA predictions vs Conjunction Data Messages  |  run ${utc(run.created_at)}  |  ${ascii(user && user.email)}`, 40, 46);
  doc.y = 90; doc.x = 40;

  heading('Results');
  const cards = [
    ['CDMs compared', `${s.compared || 0} / ${s.cdms || 0}`],
    ['Satellites', String(s.satellites || 0)],
    [`Flagged by ASTRA (< ${s.reportThresholdKm || 10} km)`, rate(s.flaggedRate)],
    ['Median |dTCA|', fx(s.medianAbsDTcaSec, 1, ' s')],
    ['Median |d miss|', fx(s.medianAbsDMissKm, 3, ' km')],
    ['Pc within 10x of CDM', rate(s.pcWithin1OrderRate)],
    ['Severity agreement', rate(s.severityAgreementRate)],
    ['High-risk CDMs caught', s.highRiskCdms ? `${rate(s.highRiskCaughtRate)} of ${s.highRiskCdms}` : '-'],
  ];
  const cw = W / 4;
  const top = doc.y;
  cards.forEach(([k, v], i) => {
    const x = 40 + (i % 4) * cw;
    const y = top + Math.floor(i / 4) * 44;
    doc.roundedRect(x + 2, y, cw - 8, 38, 4).strokeColor(C.line).lineWidth(0.7).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(ascii(k), x + 10, y + 6, { width: cw - 24, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.ink).text(ascii(v), x + 10, y + 18, { width: cw - 24, lineBreak: false });
  });
  doc.y = top + 94; doc.x = 40;
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(
    `90th percentile: |dTCA| ${fx(s.p90AbsDTcaSec, 1, ' s')}, |d miss| ${fx(s.p90AbsDMissKm, 3, ' km')}.  ` +
    (cumulative ? `All runs to date (${cumulative.runs}): ${cumulative.compared} CDMs compared, median |d miss| ${fx(cumulative.medianAbsDMissKm, 3, ' km')}, severity agreement ${rate(cumulative.severityAgreementRate)}.` : ''),
    { width: W }
  );

  heading('Comparisons');
  const cols = [
    ['Spacecraft', 0.12], ['Object', 0.14], ['CDM TCA', 0.11], ['dTCA s', 0.06], ['CDM miss km', 0.08], ['ASTRA miss km', 0.08],
    ['CDM Pc', 0.07], ['ASTRA Pc', 0.07], ['CDM sev.', 0.07], ['ASTRA sev.', 0.07], ['Status', 0.13],
  ];
  const widths = cols.map((c) => c[1] * W);
  const row = (cells, bold) => {
    ensure(15);
    const y = doc.y; let x = 40; let h = 0;
    cells.forEach((cell, i) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5).fillColor(bold ? C.muted : C.ink).text(ascii(cell), x + 2, y, { width: widths[i] - 4 });
      h = Math.max(h, doc.y - y); x += widths[i];
    });
    doc.y = y + h + 3;
    doc.moveTo(40, doc.y - 1).lineTo(40 + W, doc.y - 1).strokeColor(C.line).lineWidth(0.4).stroke();
    doc.x = 40;
  };
  row(cols.map((c) => c[0]), true);
  const rows = (run.rows || []).slice(0, 300);
  if (!rows.length) doc.font('Helvetica').fontSize(9).fillColor(C.muted).text('No CDMs to compare yet. Link real satellites and connect Space-Track, or upload CDMs.', 40, doc.y);
  rows.forEach((r) => row([
    `${r.spacecraft} (${r.norad})`, `${r.objectName || '-'} (${r.objectId || '-'})`, utc(r.cdmTca),
    r.dTcaSec != null ? r.dTcaSec.toFixed(1) : '-', fx(r.cdmMissKm, 3), fx(r.astraMissKm, 3), pcf(r.cdmPc), pcf(r.astraPc),
    r.cdmSeverity || '-', r.astraSeverity || '-', r.status === 'compared' ? (r.severityAgrees === false ? 'compared, severity differs' : 'compared') : `${r.status.replace(/_/g, ' ')}`,
  ]));
  if ((run.rows || []).length > rows.length) doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(`... ${(run.rows.length - rows.length)} more rows in the CSV export.`, 40, doc.y + 4);

  heading('Method and limitations');
  doc.font('Helvetica').fontSize(8.5).fillColor(C.ink).text(ascii(s.method || ''), { width: W });
  doc.moveDown(0.4).text(ascii(
    'CDMs from Space-Track are produced by the 18th/19th Space Defense Squadrons from the high-accuracy special-perturbations catalogue; ' +
    'ASTRA uses public TLEs, which are less accurate (typically 1 km or more along-track, growing with TLE age). Differences in miss distance ' +
    'of a few km are expected and are the reason to treat ASTRA screening as early warning and to act on CDMs. Comparisons for past TCAs use ' +
    'the TLEs available at the time of the run, not the TLEs available before the event. Public CDMs only cover events that meet Space-Track\'s ' +
    'reporting criteria, so events ASTRA flags without a CDM are not counted as errors.'
  ), { width: W });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // footer sits inside the bottom margin; do not start a new page
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
      .text(`ASTRA validation report  |  page ${i + 1} of ${range.count}`, 40, doc.page.height - 30, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
});

module.exports = { build };
