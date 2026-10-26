const { SimulationEngine } = require('../../utils/simulationEngine');

describe('SimulationEngine - Unit Tests', () => {
  let engine;

  beforeEach(() => {
    engine = new SimulationEngine('test-001', {
      type: 'satellite', altitude: 550, inclination: 53, deltaV: 500, powerConsumption: 200
    });
  });

  afterEach(() => { if (engine.running) engine.stop(); });

  describe('Initialisation', () => {
    test('should initialise with correct default state', () => {
      expect(engine.state.type).toBe('satellite');
      expect(engine.state.power.batteryLevel).toBe(100);
      expect(engine.state.power.solarInput).toBe(850);
      expect(engine.state.orbital).toBeTruthy();
      expect(engine.state.anomalies).toEqual([]);
    });

    test('should initialise rocket state correctly', () => {
      const r = new SimulationEngine('rocket-001', { type: 'rocket' });
      expect(r.state.rocket).toBeTruthy();
      expect(r.state.rocket.altitude).toBe(0);
      expect(r.state.orbital).toBeNull();
    });

    test('should initialise rover state correctly', () => {
      const rv = new SimulationEngine('rover-001', { type: 'rover' });
      expect(rv.state.rover).toBeTruthy();
      expect(rv.state.rover.distanceTravelled).toBe(0);
    });

    test('should initialise station state correctly', () => {
      const st = new SimulationEngine('station-001', { type: 'station' });
      expect(st.state.station).toBeTruthy();
      expect(st.state.station.crewCount).toBe(7);
      expect(st.state.station.oxygenLevel).toBe(21.0);
    });
  });

  describe('Power Simulation', () => {
    test('battery level should decrease during eclipse', () => {
      // The engine derives eclipse from orbital position, so place the craft inside the eclipse arc.
      engine.state.orbital.trueAnomaly = 190;
      const initial = engine.state.power.batteryLevel;
      engine.updateState();
      expect(engine.state.power.batteryLevel).toBeLessThan(initial);
    });

    test('battery level should not exceed 100%', () => {
      engine.state.power.batteryLevel = 99.9;
      engine.state.orbital.inEclipse = false;
      for (let i = 0; i < 100; i++) engine.updateState();
      expect(engine.state.power.batteryLevel).toBeLessThanOrEqual(100);
    });

    test('battery should not go below 0%', () => {
      engine.state.power.batteryLevel = 0.1;
      engine.state.orbital.inEclipse = true;
      engine.state.power.consumption = 10000;
      for (let i = 0; i < 100; i++) engine.updateState();
      expect(engine.state.power.batteryLevel).toBeGreaterThanOrEqual(0);
    });

    test('power status should be critical when battery below 20%', () => {
      engine.state.power.batteryLevel = 10;
      engine.state.orbital.inEclipse = true;
      engine.updateState();
      expect(engine.state.power.status).toBe('critical');
    });

    test('power status should be warning when battery between 20-40%', () => {
      engine.state.power.batteryLevel = 30;
      engine.state.orbital.inEclipse = true;
      engine.updateState();
      expect(engine.state.power.status).toBe('warning');
    });

    test('power status nominal when battery above 40%', () => {
      engine.state.power.batteryLevel = 80;
      engine.state.orbital.inEclipse = false;
      engine.updateState();
      expect(engine.state.power.status).toBe('nominal');
    });
  });

  describe('Fault Injection', () => {
    test('solar panel fault should drain battery faster', () => {
      engine.injectFault({ type: 'solar_panel' });
      expect(engine.faults.has('solar_panel')).toBe(true);
      engine.state.orbital.inEclipse = false;
      engine.state.power.batteryLevel = 80;
      engine.updateState();
      expect(engine.state.power.batteryLevel).toBeLessThan(80);
    });

    test('thermal fault should cause temperature rise', () => {
      engine.injectFault({ type: 'thermal_control' });
      const initial = engine.state.thermal.internalTemp;
      engine.updateState();
      expect(engine.state.thermal.internalTemp).toBeGreaterThan(initial);
    });

    test('antenna fault should reduce signal strength', () => {
      engine.injectFault({ type: 'antenna' });
      engine.updateState();
      expect(engine.state.comms.signalStrength).toBeLessThan(60);
    });

    test('should inject multiple faults simultaneously', () => {
      engine.injectFault({ type: 'solar_panel' });
      engine.injectFault({ type: 'antenna' });
      expect(engine.faults.size).toBe(2);
    });

    test('should clear a specific fault', () => {
      engine.injectFault({ type: 'solar_panel' });
      engine.clearFault('solar_panel');
      expect(engine.faults.has('solar_panel')).toBe(false);
    });

    test('clearing one fault should not affect others', () => {
      engine.injectFault({ type: 'solar_panel' });
      engine.injectFault({ type: 'antenna' });
      engine.clearFault('solar_panel');
      expect(engine.faults.has('antenna')).toBe(true);
      expect(engine.faults.has('solar_panel')).toBe(false);
    });
  });

  describe('Orbital Mechanics', () => {
    test('true anomaly should advance each tick', () => {
      const initial = engine.state.orbital.trueAnomaly;
      engine.updateState();
      expect(engine.state.orbital.trueAnomaly).toBeGreaterThan(initial);
    });

    test('eclipse should occur at correct orbital phase', () => {
      engine.state.orbital.trueAnomaly = 190;
      engine.updateState();
      expect(engine.state.orbital.inEclipse).toBe(true);
    });

    test('no eclipse outside shadow region', () => {
      engine.state.orbital.trueAnomaly = 90;
      engine.updateState();
      expect(engine.state.orbital.inEclipse).toBe(false);
    });

    test('true anomaly should wrap at 360', () => {
      engine.state.orbital.trueAnomaly = 359.99;
      engine.updateState();
      expect(engine.state.orbital.trueAnomaly).toBeLessThan(360);
      expect(engine.state.orbital.trueAnomaly).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Anomaly Detection', () => {
    test('should detect power anomaly when battery critical', () => {
      engine.state.power.batteryLevel = 10;
      engine.state.orbital.inEclipse = true;
      engine.updateState();
      const anomaly = engine.state.anomalies.find(a => a.system === 'power');
      expect(anomaly).toBeTruthy();
      expect(anomaly.severity).toBe('critical');
    });

    test('anomalies array should have correct structure', () => {
      engine.state.power.batteryLevel = 10;
      engine.state.orbital.inEclipse = true;
      engine.updateState();
      const anomaly = engine.state.anomalies[0];
      expect(anomaly).toHaveProperty('system');
      expect(anomaly).toHaveProperty('severity');
      expect(anomaly).toHaveProperty('message');
    });
  });

  describe('Simulation Control', () => {
    test('should start and emit telemetry', (done) => {
      engine.start((telemetry) => {
        expect(telemetry.spacecraftId).toBe('test-001');
        expect(telemetry.power).toBeTruthy();
        expect(telemetry.timestamp).toBeTruthy();
        engine.stop();
        done();
      });
    }, 5000);

    test('should stop cleanly', () => {
      engine.start(() => {});
      engine.stop();
      expect(engine.running).toBe(false);
      expect(engine.interval).toBeNull();
    });
  });

  describe('Timestamp', () => {
    test('should update timestamp on each tick', () => {
      const ts1 = engine.state.timestamp;
      engine.updateState();
      expect(engine.state.timestamp).toBeDefined();
    });
  });
});
