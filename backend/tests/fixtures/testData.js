const { v4: uuidv4 } = require('uuid');

const testUser = {
  id: uuidv4(),
  name: 'Test Engineer',
  email: 'test@astra.space',
  password: 'TestPass123!',
  organisation: 'ASTRA Test',
  role: 'engineer',
};

const testAdmin = {
  id: uuidv4(),
  name: 'Test Admin',
  email: 'admin@astra.space',
  password: 'AdminPass123!',
  role: 'admin',
};

const testSpacecraft = {
  name: 'TEST-SAT-1',
  type: 'satellite',
  description: 'Test satellite',
  components: [{ id: 'solar_1', name: 'Solar Array', mass: 45, cost: 120000, instanceId: 1 }],
  config: { altitude: 550, inclination: 53, deltaV: 500, powerConsumption: 200 },
};

const invalidSpacecraft = { name: '', type: 'invalid_type', config: { altitude: -100 } };

const testTelemetry = {
  power: { batteryLevel: 85.5, solarInput: 850, consumption: 200, status: 'nominal' },
  thermal: { internalTemp: 22.3, externalTemp: -120, status: 'nominal' },
  comms: { signalStrength: 94.1, groundContact: true, status: 'nominal' },
  anomalies: [],
};

module.exports = { testUser, testAdmin, testSpacecraft, invalidSpacecraft, testTelemetry };
