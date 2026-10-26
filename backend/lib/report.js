// PDF conjunction assessment report (pdfkit, built-in fonts only).
const PDFDocument = require('pdfkit');
const crypto = require('crypto');

const C = { ink: '#0b1726', muted: '#5b6b7f', accent: '#0077aa', line: '#c9d3df', crit: '#c62828', warn: '#b26a00', ok: '#2e7d32', band: '#0b1726' };
const sevColour = (s) => (s === 'critical' ? C.crit : s === 'warning' ? C.warn : C.ok);
const utc = (d) => (d ? `${new Date(d).toISOString().replace('T', ' ').slice(0, 19)} UTC` : '-');
const ascii = (s) => String(s == null ? '-' : s).replace(/Δ/g, 'd').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[^\x20-\x7E]/g, '');

/**
 * Build the report. data: { sc, report, manoeuvre, cdms, user }
 * Returns a Promise<Buffer>.
 */
const build = (data) => new Promise((resolve, reject) => {
  const { sc, report, manoeuvre, cdms = [], user } = data;
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `ASTRA conjunction report - ${ascii(sc.name)}`, Author: 'ASTRA Digital Twin' } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const W = doc.page.width - 96;
  const reportId = crypto.createHash('sha1').update(`${sc.id}${report.generatedAt}`).digest('hex').slice(0, 10).toUpperCase();

  const ensure = (h) => { if (doc.y + h > doc.page.height - 60) doc.addPage(); };
  const heading = (t) => {
    ensure(40);
    doc.moveDown(0.6);
    doc.fillColor(C.accent).font('Helvetica-Bold').fontSize(11).text(ascii(t).toUpperCase(), 48, doc.y, { characterSpacing: 1, width: W });
    doc.moveTo(48, doc.y + 2).lineTo(48 + W, doc.y + 2).strokeColor(C.line).lineWidth(0.7).stroke();
    doc.moveDown(0.5).fillColor(C.ink).font('Helvetica').fontSize(9.5);
    doc.x = 48;
  };
  const kv = (rows) => {
    rows.forEach(([k, v]) => {
      ensure(14);
      const y = doc.y;
      doc.font('Helvetica').fillColor(C.muted).text(ascii(k), 48, y, { width: 170 });
      doc.font('Helvetica').fillColor(C.ink).text(ascii(v), 220, y, { width: W - 172 });
      doc.moveDown(0.15);
    });
    doc.x = 48;
  };
  const table = (cols, rows, colourCol) => {
    const widths = cols.map((c) => c.w * W);
    const drawRow = (cells, bold, colour) => {
      ensure(16);
      const y = doc.y;
      let x = 48;
      let h = 0;
      cells.forEach((cell, i) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
          .fillColor(colour && i === colourCol ? colour : bold ? C.muted : C.ink)
          .text(ascii(cell), x + 2, y, { width: widths[i] - 4 });
        h = Math.max(h, doc.y - y);
        x += widths[i];
      });
      doc.y = y + h + 3;
      doc.moveTo(48, doc.y - 1).lineTo(48 + W, doc.y - 1).strokeColor(C.line).lineWidth(0.4).stroke();
      doc.x = 48;
    };
    drawRow(cols.map((c) => c.t), true);
    rows.forEach((r) => drawRow(r.cells, false, r.colour));
    doc.moveDown(0.3);
  };

  // ---- Title band ----
  doc.rect(0, 0, doc.page.width, 92).fill(C.band);
  doc.fillColor('#00d4ff').font('Helvetica-Bold').fontSize(18).text('ASTRA', 48, 26, { characterSpacing: 3 });
  doc.fillColor('#ffffff').font('Helvetica').fontSize(12).text('Conjunction Assessment Report', 48, 50);
  doc.fillColor('#9fb3c8').fontSize(8.5).text(`Report ${reportId}   |   Generated ${utc(report.generatedAt)}   |   ${ascii(user ? user.name : '')}`, 48, 68);
  doc.y = 112;
  doc.x = 48;

  const worst = report.criticalCount ? 'critical' : report.warningCount ? 'warning' : 'nominal';
  doc.font('Helvetica-Bold').fontSize(12).fillColor(sevColour(worst))
    .text(`Overall status: ${worst.toUpperCase()}  -  ${report.totalEvents} close approach(es) within ${report.screening.reportThresholdKm} km in the next ${report.screening.windowHours} h`);
  doc.fillColor(C.ink).font('Helvetica').fontSize(9.5)
    .text(`${report.criticalCount} critical, ${report.warningCount} warning (critical: Pc >= ${report.screening.thresholds.critical.toExponential(0)}, warning: Pc >= ${report.screening.thresholds.warning.toExponential(0)} or miss < 1 km).`);

  heading('Spacecraft');
  kv([
    ['Name', sc.name],
    ['NORAD ID', sc.norad_id || 'Not linked (design orbit)'],
    ['Orbit source', report.twin.orbitSource === 'tle' ? `TLE (${sc.tle_source || 'manual'})` : 'Idealised circular design orbit'],
    ['TLE epoch / age', report.twin.tleEpoch ? `${utc(report.twin.tleEpoch)} / ${report.twin.tleAgeDays} days` : '-'],
    ['Perigee / apogee', `${report.twin.perigeeKm} km / ${report.twin.apogeeKm} km`],
    ['Inclination', `${report.twin.inclinationDeg} deg`],
  ]);

  heading('Screening');
  const s = report.screening;
  kv([
    ['Window', `${utc(s.windowStart)} + ${s.windowHours} h, ${s.stepSeconds} s grid, alert radius ${s.reportThresholdKm} km`],
    ['Catalogue', `${s.catalogObjects} tracked objects (CelesTrak GP data, fetched ${utc(s.catalogFetchedAt)}${s.catalogStale ? ', STALE' : ''})`],
    ['Screened', `${s.candidatesScreened} objects in the altitude shell, ${s.fleetTwinsScreened} fleet twin(s)`],
    ['Method', s.method],
    ['Probability model', s.pcModel],
  ]);

  heading('Close approaches (highest risk first)');
  if (!report.events.length) doc.text('No close approaches within the alert radius.');
  else {
    table(
      [{ t: 'Object', w: 0.24 }, { t: 'ID', w: 0.14 }, { t: 'TCA (UTC)', w: 0.19 }, { t: 'Miss km', w: 0.09 }, { t: 'Rel. km/s', w: 0.09 }, { t: 'Pc', w: 0.11 }, { t: 'Severity', w: 0.14 }],
      report.events.slice(0, 15).map((e) => ({
        cells: [e.objectName, e.objectId, utc(e.tcaTime).replace(' UTC', ''), e.missDistance, e.relativeVelocity, e.collisionProbability, e.severity.toUpperCase()],
        colour: sevColour(e.severity),
      })),
      6
    );
  }

  if (cdms.length) {
    heading('Conjunction Data Messages');
    table(
      [{ t: 'CDM ID', w: 0.16 }, { t: 'Source', w: 0.11 }, { t: 'Object', w: 0.22 }, { t: 'TCA (UTC)', w: 0.2 }, { t: 'Miss km', w: 0.09 }, { t: 'Pc reported', w: 0.11 }, { t: 'Pc Foster', w: 0.11 }],
      cdms.slice(0, 12).map((c) => ({
        cells: [c.cdm_id, c.source, c.object_name || c.object_id, utc(c.tca).replace(' UTC', ''), c.miss_km != null ? Number(c.miss_km).toFixed(3) : '-',
          c.pc_reported != null ? Number(c.pc_reported).toExponential(1) : '-', c.pc_foster != null ? Number(c.pc_foster).toExponential(1) : '-'],
      }))
    );
  }

  heading('Collision avoidance');
  if (!manoeuvre || !manoeuvre.required) {
    doc.text(manoeuvre && manoeuvre.message ? manoeuvre.message : 'No manoeuvre required.');
  } else {
    const t = manoeuvre.threat;
    kv([
      ['Threat', `${t.objectName} (${t.objectId}), ${t.severity.toUpperCase()}`],
      ['TCA / miss / Pc', `${utc(t.tcaTime)} / ${t.missDistance} km / ${t.collisionProbability}`],
      ['Target', `Pc < ${Number(manoeuvre.targetPc).toExponential(0)} and miss >= ${manoeuvre.minMissKm} km`],
      ['Options evaluated', String(manoeuvre.optionsEvaluated)],
    ]);
    doc.moveDown(0.3);
    table(
      [{ t: '#', w: 0.05 }, { t: 'Option', w: 0.45 }, { t: 'Total dV m/s', w: 0.13 }, { t: 'Miss after km', w: 0.13 }, { t: 'Pc after', w: 0.12 }, { t: 'Meets target', w: 0.12 }],
      manoeuvre.options.slice(0, 8).map((o, i) => ({
        cells: [i === 0 ? '* 1' : String(i + 1), o.label, o.totalDeltaVms.toFixed(3), o.missAfterKm.toFixed(3), o.pcAfter.toExponential(1), o.feasible ? 'yes' : 'no'],
        colour: o.feasible ? C.ok : C.warn,
      })),
      5
    );
    if (manoeuvre.manoeuvre) {
      const m = manoeuvre.manoeuvre;
      doc.font('Helvetica-Bold').fillColor(C.ink).text('Recommended (option * 1):', 48, doc.y, { width: W });
      doc.font('Helvetica').text(ascii(`${m.strategy}. Burn 1 at ${m.burn1Time}: ${m.dv1}${m.burn2Time ? `. Burn 2 at ${m.burn2Time}: ${m.dv2}` : ''}. Total ${m.totalDeltaV}; predicted miss ${m.missAfter}, Pc ${m.pcAfter}.`));
      doc.text(ascii(`dV budget: ${manoeuvre.deltaVBudgetRemaining} m/s before, ${manoeuvre.budgetAfterManoeuvre} m/s after.`));
    }
    if (manoeuvre.rescreen) {
      const r = manoeuvre.rescreen;
      doc.moveDown(0.3).font('Helvetica-Bold').text('Post-manoeuvre re-screening:');
      doc.font('Helvetica').text(r.clean
        ? `No new warning/critical conjunctions introduced (${r.totalEventsAfter} approaches within the alert radius after the burn).`
        : `${r.newRiskEvents.length} new warning/critical conjunction(s) introduced: ${r.newRiskEvents.map((e) => `${e.objectName} (${e.missDistance} km, Pc ${e.collisionProbability})`).join('; ')}`);
    }
    if (manoeuvre.warning) doc.moveDown(0.2).fillColor(C.warn).text(ascii(`Note: ${manoeuvre.warning}`)).fillColor(C.ink);
  }

  heading('Limitations');
  doc.fontSize(8.5).fillColor(C.muted).text(
    'Screening uses public two-line element sets propagated with SGP4. TLE accuracy is typically around 1 km and degrades with age. '
    + 'Where no CDM covariance is available, collision probability is computed with Foster\'s method using covariance estimated from TLE age, '
    + 'and should be treated as an indicator, not an operational value. Before executing a manoeuvre, confirm the event with the '
    + '18th/19th Space Defense Squadron (Space-Track CDMs), EU SST or a commercial SSA provider, and coordinate with the other operator if the object is active. '
    + 'Manoeuvre effects are modelled as impulsive burns with J2 propagation.'
  );
  doc.moveDown(1.2).fontSize(9.5).fillColor(C.ink).text('Reviewed by: ______________________________      Decision: ____________________      Date: ____________');

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.fontSize(7.5).fillColor(C.muted).text(`ASTRA Digital Twin  |  Report ${reportId}  |  Page ${i + 1} of ${range.count}`, 48, doc.page.height - 36, { width: W, align: 'center' });
  }
  doc.end();
});

module.exports = { build };
