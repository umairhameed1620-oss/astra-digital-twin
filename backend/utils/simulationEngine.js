class SimulationEngine {
  constructor(spacecraftId, config) {
    this.spacecraftId = spacecraftId;
    this.config = config;
    this.running = false;
    this.interval = null;
    this.time = new Date();
    this.faults = new Set();
    this.state = this.initState(config);
  }

  initState(config) {
    const type = config.type || 'satellite';
    return {
      type,
      power: { batteryLevel: 100, solarInput: type === 'satellite' ? 850 : 0, consumption: config.powerConsumption || 200, status: 'nominal' },
      thermal: { internalTemp: 20, externalTemp: -120, heaterActive: false, status: 'nominal' },
      propulsion: { fuelLevel: 100, thrusterStatus: 'standby', deltaVRemaining: config.deltaV || 500, status: 'nominal' },
      comms: { signalStrength: 95, dataRate: 100, groundContact: true, uplinkRate: 1.2, downlinkRate: 8.4, status: 'nominal' },
      attitude: { roll: 0, pitch: 0, yaw: 0, angularVelocity: { x: 0.001, y: 0.0005, z: 0.0002 }, mode: 'nadir_pointing', status: 'nominal' },
      orbital: type === 'satellite' ? { altitude: config.altitude || 550, inclination: config.inclination || 53, eccentricity: 0.0001, period: 95.5, trueAnomaly: 0, inEclipse: false } : null,
      rocket: type === 'rocket' ? { altitude: 0, velocity: 0, acceleration: 0, stage: 1, thrustLevel: 0, maxQ: false, meco: false } : null,
      rover: type === 'rover' ? { latitude: 4.5895, longitude: 137.4417, speed: 0, heading: 90, distanceTravelled: 0, slopeAngle: 0, terrainType: 'basalt' } : null,
      station: type === 'station' ? { altitude: 408, crewCount: 7, oxygenLevel: 21.0, co2Level: 0.4, pressure: 101.3, dockingPortsOccupied: 2 } : null,
      anomalies: [],
      timestamp: new Date().toISOString()
    };
  }

  updateState() {
    const s = this.state;
    if (s.orbital) {
      s.orbital.trueAnomaly = (s.orbital.trueAnomaly + 0.063) % 360;
      s.orbital.inEclipse = s.orbital.trueAnomaly > 180 && s.orbital.trueAnomaly < 220;
    }
    const solarActual = s.orbital?.inEclipse ? 0 : s.power.solarInput;
    const effectiveSolar = this.faults.has('solar_panel') ? solarActual * 0.1 : solarActual;
    const netPower = effectiveSolar - s.power.consumption;
    s.power.batteryLevel = Math.max(0, Math.min(100, s.power.batteryLevel + (netPower / 3600)));
    s.power.status = s.power.batteryLevel < 20 ? 'critical' : s.power.batteryLevel < 40 ? 'warning' : 'nominal';
    const targetTemp = s.orbital?.inEclipse ? -80 : 25;
    s.thermal.internalTemp += (targetTemp - s.thermal.internalTemp) * 0.001;
    if (this.faults.has('thermal_control')) s.thermal.internalTemp += 0.5;
    s.thermal.status = s.thermal.internalTemp > 80 ? 'critical' : s.thermal.internalTemp > 60 ? 'warning' : 'nominal';
    s.comms.signalStrength = Math.max(0, Math.min(100, 95 - Math.random() * 5 + (this.faults.has('antenna') ? -40 : 0)));
    s.comms.groundContact = s.comms.signalStrength > 20;
    s.comms.status = s.comms.signalStrength < 30 ? 'critical' : s.comms.signalStrength < 60 ? 'warning' : 'nominal';
    if (s.rocket && s.rocket.thrustLevel > 0) {
      s.rocket.acceleration = (s.rocket.thrustLevel * 30) - 9.81;
      s.rocket.velocity += s.rocket.acceleration;
      s.rocket.altitude += s.rocket.velocity / 1000;
      s.propulsion.fuelLevel -= 0.05;
      s.rocket.maxQ = s.rocket.altitude > 10 && s.rocket.altitude < 15;
      if (s.rocket.altitude > 80 && s.rocket.stage === 1) { s.rocket.stage = 2; s.rocket.thrustLevel = 0.85; }
    }
    if (s.rover && s.rover.speed > 0) {
      const d = (s.rover.speed / 3600);
      s.rover.distanceTravelled += d;
      s.rover.latitude += (d / 111) * Math.cos(s.rover.heading * Math.PI / 180);
      s.rover.longitude += (d / 111) * Math.sin(s.rover.heading * Math.PI / 180);
    }
    if (s.station) {
      s.station.co2Level = Math.min(0.5, s.station.co2Level + 0.0001);
      s.station.oxygenLevel = Math.max(19, s.station.oxygenLevel - 0.00005);
    }
    s.anomalies = [];
    if (s.power.status !== 'nominal') s.anomalies.push({ system: 'power', severity: s.power.status, message: `Battery at ${s.power.batteryLevel.toFixed(1)}%` });
    if (s.thermal.status !== 'nominal') s.anomalies.push({ system: 'thermal', severity: s.thermal.status, message: `Temperature at ${s.thermal.internalTemp.toFixed(1)}°C` });
    if (s.comms.status !== 'nominal') s.anomalies.push({ system: 'comms', severity: s.comms.status, message: `Signal at ${s.comms.signalStrength.toFixed(1)}%` });
    s.timestamp = new Date().toISOString();
    return s;
  }

  injectFault(fault) { this.faults.add(fault.type); }
  clearFault(faultType) { this.faults.delete(faultType); }

  start(onTick) {
    this.running = true;
    this.interval = setInterval(() => {
      if (this.running) onTick({ spacecraftId: this.spacecraftId, ...this.updateState() });
    }, 1000);
  }

  stop() {
    this.running = false;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }
}

module.exports = { SimulationEngine };
