// Collision-avoidance manoeuvre trade study.
// Candidate impulsive burns are applied to the twin's state, propagated with a J2 numerical model,
// and the resulting position change is added to the twin's nominal (SGP4 or design) trajectory.
// Each option is re-evaluated against the threat (miss distance + Foster Pc); the recommended option
// is then re-screened against the full catalogue to check it does not create a new conjunction.
const O = require('./orbit');
const PC = require('./pc');

const TARGET_PC = Number(process.env.PC_TARGET) || 1e-6;
const MIN_MISS_KM = Number(process.env.MANOEUVRE_MIN_MISS_KM) || 1;
const MIN_LEAD_MS = 15 * 60 * 1000; // earliest burn: 15 minutes from now (time to upload commands)
const PHI = (Math.sqrt(5) - 1) / 2;

const goldenMin = (f, lo, hi) => {
  let a = lo, b = hi;
  let c = b - PHI * (b - a), d = a + PHI * (b - a);
  let fc = f(c), fd = f(d);
  for (let k = 0; k < 50; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - PHI * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + PHI * (b - a); fd = f(d); }
  }
  return fc < fd ? { t: c, d: fc } : { t: d, d: fd };
};

const objectStateFn = (ev) => {
  if (ev.tle) {
    const rec = O.satrec(ev.tle.l1, ev.tle.l2);
    return (ms) => O.sgp4State(rec, ms);
  }
  if (ev.model) return O.stateFn(ev.model);
  throw new Error('No orbit available for the threat object');
};

const hohmann = (r1, r2) => {
  const dv1 = Math.sqrt(O.MU / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
  const dv2 = Math.sqrt(O.MU / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  const transferSec = Math.PI * Math.sqrt(Math.pow((r1 + r2) / 2, 3) / O.MU);
  return { dv1, dv2, transferSec };
};

const fmtUtc = (ms) => `${new Date(ms).toISOString().replace('T', ' ').slice(0, 16)} UTC`;

/**
 * Position/velocity change of the twin caused by `burns`, relative to not burning.
 * Both trajectories start from the same state at the first burn, so propagation-model error cancels.
 */
const deltaAt = (twinFn, burns, tEval) => {
  const t0 = burns[0].ms;
  const s0 = twinFn(t0);
  if (!s0) return null;
  const nominal = O.propagate(s0, t0, tEval, []);
  const burned = O.propagate(s0, t0, tEval, burns);
  return { dr: O.sub(burned.r, nominal.r), dv: O.sub(burned.v, nominal.v) };
};

// Sampled position delta over the screening window for re-screening (zero before the first burn).
const deltaSeries = (twinFn, burns, startMs, hours, stepSec = 60) => {
  const n = Math.floor((hours * 3600) / stepSec) + 1;
  const dx = new Array(n).fill(0), dy = new Array(n).fill(0), dz = new Array(n).fill(0);
  const t0 = burns[0].ms;
  const s0 = twinFn(t0);
  let sN = { r: s0.r, v: s0.v };
  let sB = { r: s0.r, v: s0.v };
  let tPrev = t0;
  for (let i = 0; i < n; i++) {
    const t = startMs + i * stepSec * 1000;
    if (t <= t0) continue;
    sN = O.propagate(sN, tPrev, t, []);
    sB = O.propagate(sB, tPrev, t, burns.filter((b) => b.ms > tPrev || (tPrev === t0 && b.ms >= t0)));
    tPrev = t;
    const d = O.sub(sB.r, sN.r);
    dx[i] = d.x; dy[i] = d.y; dz[i] = d.z;
  }
  return { startMs, stepMs: stepSec * 1000, dx, dy, dz };
};

const MIN_BURN_TO_TCA_MS = 10 * 60 * 1000; // a burn needs at least ~10 minutes to change the geometry

// Impulsive single-burn options: tangential (phasing) and radial, at several lead times before TCA.
const buildOptions = (threat, periodSec, now) => {
  const tca = threat.tca;
  const P = periodSec * 1000;
  const earliest = now + MIN_LEAD_MS;
  const leads = [];
  for (const lead of [0.25, 0.5, 1.5, 3.5]) {
    const tb = tca - lead * P;
    if (tb >= earliest) leads.push({ tb, text: `${lead} orbit${lead === 1 ? '' : 's'} before TCA` });
  }
  // As soon as commands can be uploaded, if that is earlier than every standard lead time.
  if (tca - earliest >= MIN_BURN_TO_TCA_MS && !leads.some((l) => Math.abs(l.tb - earliest) < 5 * 60000)) {
    leads.push({ tb: earliest, text: `ASAP (${Math.round((tca - earliest) / 60000)} min before TCA)` });
  }
  const dirs = [
    { key: 'prograde', label: 'Prograde', rtn: (v) => ({ r: 0, t: v, n: 0 }), dvs: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5] },
    { key: 'retrograde', label: 'Retrograde', rtn: (v) => ({ r: 0, t: -v, n: 0 }), dvs: [0.01, 0.02, 0.05, 0.1, 0.2, 0.5] },
    { key: 'radial-out', label: 'Radial-out', rtn: (v) => ({ r: v, t: 0, n: 0 }), dvs: [0.05, 0.1, 0.2, 0.5, 1] },
    { key: 'radial-in', label: 'Radial-in', rtn: (v) => ({ r: -v, t: 0, n: 0 }), dvs: [0.05, 0.1, 0.2, 0.5, 1] },
  ];
  const opts = [];
  for (const l of leads) {
    for (const d of dirs) {
      for (const dvMs of d.dvs) {
        opts.push({
          type: d.key.startsWith('radial') ? 'radial-impulse' : 'along-track',
          label: `${d.label} ${dvMs.toFixed(2)} m/s, ${l.text}`,
          burns: [{ ms: l.tb, dvRtn: d.rtn(dvMs / 1000), dvMs, direction: d.key }],
        });
      }
    }
  }
  return opts;
};

const buildHohmannOptions = (threat, model, periodSec, now) => {
  const el = O.describe(model);
  const r1 = O.RE + el.altitudeKm;
  const opts = [];
  for (const dh of [0.5, 1, 2, -1]) {
    const { dv1, dv2, transferSec } = hohmann(r1, r1 + dh);
    // Complete the transfer one orbit before TCA so the new orbit is settled.
    const tb = threat.tca - transferSec * 1000 - periodSec * 1000;
    if (tb < now + MIN_LEAD_MS) continue;
    const dir = dh > 0 ? 1 : -1;
    opts.push({
      type: 'radial',
      label: `${dh > 0 ? 'Raise' : 'Lower'} orbit ${Math.abs(dh)} km (two-burn Hohmann)`,
      altitudeChangeKm: dh,
      transferSec,
      burns: [
        { ms: tb, dvRtn: { r: 0, t: dv1, n: 0 }, dvMs: Math.abs(dv1) * 1000, direction: dir > 0 ? 'prograde' : 'retrograde' },
        { ms: tb + transferSec * 1000, dvRtn: { r: 0, t: dv2, n: 0 }, dvMs: Math.abs(dv2) * 1000, direction: dir > 0 ? 'prograde' : 'retrograde' },
      ],
    });
  }
  return opts;
};

// Evaluate one option against the threat: new TCA, miss distance and Pc.
const evaluate = (opt, twinFn, objFn, threat) => {
  const ref = threat.tca;
  const d = deltaAt(twinFn, opt.burns, ref);
  if (!d) return null;
  const twinNew = (ms) => {
    const s = twinFn(ms);
    if (!s) return null;
    const dt = (ms - ref) / 1000;
    return { r: O.add(s.r, O.add(d.dr, O.scale(d.dv, dt))), v: O.add(s.v, d.dv) };
  };
  const dist = (ms) => {
    const a = twinNew(ms), b = objFn(ms);
    return a && b ? O.norm(O.sub(b.r, a.r)) : Infinity;
  };
  const m = goldenMin(dist, ref - 10 * 60000, ref + 10 * 60000);
  const s1 = twinNew(m.t), s2 = objFn(m.t);
  const est = PC.estimatePc(s1, s2, threat.ageTwin, threat.ageObj, threat.twinSigma ? { sigma1: threat.twinSigma } : {});
  const totalDvMs = opt.burns.reduce((s, b) => s + b.dvMs, 0);
  return {
    ...opt,
    totalDvMs,
    newTca: m.t,
    missAfterKm: m.d,
    pcAfter: est.pc,
    feasible: est.pc < TARGET_PC && m.d >= MIN_MISS_KM,
  };
};

const publicOption = (o, i) => ({
  id: i,
  type: o.type,
  label: o.label,
  burns: o.burns.map((b) => ({ time: new Date(b.ms).toISOString(), timeUtc: fmtUtc(b.ms), deltaVms: Number(b.dvMs.toFixed(4)), direction: b.direction })),
  totalDeltaVms: Number(o.totalDvMs.toFixed(4)),
  altitudeChangeKm: o.altitudeChangeKm || 0,
  missAfterKm: Number(o.missAfterKm.toFixed(3)),
  pcAfter: Number(o.pcAfter.toExponential(2)),
  feasible: o.feasible,
  meetsTarget: o.meetsTarget,
  withinBudget: o.withinBudget,
  rescreenClean: o.rescreen ? o.rescreen.clean : null,
});

/**
 * Plan avoidance options for the highest-risk event of a screening run.
 * @param base  result of conjunction.screenDetailed
 * @param sc    spacecraft row (for ΔV budget)
 * @param rescreen async (base, delta) => scored events
 */
const plan = async (base, sc, rescreen, { threatId } = {}) => {
  const cfg = O.parseConfig(sc.config);
  const budget = Number(cfg.deltaV ?? cfg.deltaVBudget ?? cfg.dv ?? 0);
  const now = Date.now();
  const actionable = (e) => e.tca - (now + MIN_LEAD_MS) >= MIN_BURN_TO_TCA_MS;
  const risky = base.events.filter((e) => e.severity !== 'nominal');
  const byId = (e) => `${e.objectId}-${Math.round(e.tca / 1000)}`;
  let threat;
  if (threatId) {
    threat = base.events.find((e) => byId(e) === threatId);
    if (threat && !actionable(threat)) {
      return {
        required: false,
        tooLate: true,
        message: `TCA with ${threat.objectName} is ${Math.round((threat.tca - now) / 60000)} min away, too soon to upload and execute a burn. Coordinate with the other operator / your SSA provider.`,
        deltaVBudgetRemaining: budget,
        targetPc: TARGET_PC,
      };
    }
  }
  if (!threat) {
    threat = risky.filter(actionable).find((e) => e.severity === 'critical') || risky.filter(actionable).find((e) => e.severity === 'warning');
  }
  if (!threat) {
    const late = risky.find((e) => !actionable(e));
    return {
      required: false,
      tooLate: !!late,
      message: late
        ? `The only risky event (${late.objectName}, TCA in ${Math.round((late.tca - now) / 60000)} min) is too soon for a planned burn.`
        : 'No critical or warning conjunctions in the screening window. No manoeuvre required.',
      deltaVBudgetRemaining: budget,
      targetPc: TARGET_PC,
    };
  }

  const twinFn = O.stateFn(base.model);
  const objFn = objectStateFn(threat);
  const el = O.describe(base.model);
  const periodSec = el.periodMin * 60;

  const options = [...buildOptions(threat, periodSec, now), ...buildHohmannOptions(threat, base.model, periodSec, now)]
    .map((o) => evaluate(o, twinFn, objFn, threat))
    .filter(Boolean);

  options.forEach((o) => {
    o.meetsTarget = o.feasible;
    o.withinBudget = o.totalDvMs <= budget + 1e-9;
    o.feasible = o.meetsTarget && o.withinBudget;
  });
  const feasible = options.filter((o) => o.feasible).sort((a, b) => a.totalDvMs - b.totalDvMs);
  let ranked = [
    ...feasible,
    ...options.filter((o) => !feasible.includes(o)).sort((a, b) => a.pcAfter - b.pcAfter || a.totalDvMs - b.totalDvMs),
  ];

  // Re-screen the cheapest few candidates against the whole catalogue; prefer one that creates no new risk.
  const before = new Set(base.events.filter((e) => e.severity !== 'nominal').map((e) => String(e.objectId)));
  const rescreenOne = async (opt) => {
    const delta = deltaSeries(twinFn, opt.burns, base.startMs, base.hours);
    const after = await rescreen(base, delta);
    const threatAfter = after.find((e) => e.objectId === threat.objectId && Math.abs(e.tca - threat.tca) < 30 * 60000);
    const introduced = after.filter((e) => e.severity !== 'nominal' && !before.has(String(e.objectId)));
    return {
      threatMissAfterKm: threatAfter ? Number(threatAfter.missKm.toFixed(3)) : null,
      threatPcAfter: threatAfter ? Number(threatAfter.pc.toExponential(2)) : null,
      threatClearedBeyondKm: threatAfter ? null : base.report.screening.reportThresholdKm,
      totalEventsAfter: after.length,
      newRiskEvents: introduced.slice(0, 10).map((e) => ({
        objectName: e.objectName, objectId: e.objectId, severity: e.severity,
        tcaTime: new Date(e.tca).toISOString(), missDistance: e.missKm.toFixed(3), collisionProbability: e.pc.toExponential(1),
      })),
      clean: introduced.length === 0,
    };
  };
  // Batches of 3 in parallel, up to 9 candidates, stopping at the first batch with a clean feasible option.
  const pool = ranked.slice(0, Math.min(9, ranked.length));
  let chosen = null;
  for (let i = 0; i < pool.length && !chosen; i += 3) {
    const batch = pool.slice(i, i + 3);
    const checks = await Promise.all(batch.map(rescreenOne));
    batch.forEach((o, k) => { o.rescreen = checks[k]; });
    chosen = batch.find((o) => o.feasible && o.rescreen.clean) || null;
    if (!feasible.length) break; // nothing meets the target: one batch is enough to report on
  }
  if (chosen && chosen !== ranked[0]) ranked = [chosen, ...ranked.filter((o) => o !== chosen)];
  const best = ranked[0];
  const rescreenResult = best ? best.rescreen || null : null;

  const totalBest = best ? best.totalDvMs : 0;
  const after = budget - totalBest;
  let warning = null;
  if (!best) warning = 'No manoeuvre option could be evaluated for this event.';
  else if (budget <= 0) warning = 'This twin has no ΔV budget (set it in Spacecraft Builder), so no option is within budget. Showing the lowest-risk option.';
  else if (!best.feasible && best.meetsTarget) warning = 'Options that reach the target exceed the ΔV budget; showing the lowest-risk option.';
  else if (!best.feasible) warning = `No option reaches the target (Pc < ${TARGET_PC.toExponential(0)} and miss ≥ ${MIN_MISS_KM} km) within the ΔV budget; showing the lowest-risk option.`;
  else if (rescreenResult && !rescreenResult.clean) warning = 'The recommended burn creates a new close approach. Review the re-screening results before committing.';
  else if (after < 30) warning = 'Low ΔV reserve after manoeuvre. Keep at least 30 m/s for end-of-life deorbit.';

  return {
    required: true,
    targetPc: TARGET_PC,
    minMissKm: MIN_MISS_KM,
    threat: {
      id: `${threat.objectId}-${Math.round(threat.tca / 1000)}`,
      objectName: threat.objectName,
      objectId: threat.objectId,
      severity: threat.severity,
      tcaTime: new Date(threat.tca).toISOString(),
      missDistance: threat.missKm.toFixed(3),
      collisionProbability: threat.pc.toExponential(1),
    },
    currentAltitude: Number(el.altitudeKm.toFixed(1)),
    recommendedAltitude: Number((el.altitudeKm + (best && best.altitudeChangeKm ? best.altitudeChangeKm : 0)).toFixed(1)),
    recommendedOptionId: best ? 0 : null,
    options: ranked.slice(0, 12).map(publicOption),
    optionsEvaluated: options.length,
    manoeuvre: best ? {
      strategy: best.label,
      burn1Time: fmtUtc(best.burns[0].ms),
      dv1: `${best.burns[0].dvMs.toFixed(3)} m/s ${best.burns[0].direction}`,
      ...(best.burns[1] ? { burn2Time: fmtUtc(best.burns[1].ms), dv2: `${best.burns[1].dvMs.toFixed(3)} m/s ${best.burns[1].direction}` } : {}),
      totalDeltaV: `${best.totalDvMs.toFixed(3)} m/s`,
      ...(best.transferSec ? { transferTime: `${(best.transferSec / 60).toFixed(1)} min` } : {}),
      missAfter: `${best.missAfterKm.toFixed(3)} km`,
      pcAfter: best.pcAfter.toExponential(1),
    } : null,
    rescreen: rescreenResult,
    deltaVBudgetRemaining: budget,
    budgetAfterManoeuvre: after.toFixed(2),
    warning,
  };
};

module.exports = { plan, hohmann, deltaAt, deltaSeries, TARGET_PC };
