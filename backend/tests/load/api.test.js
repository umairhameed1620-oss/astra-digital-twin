// k6 Load Test for ASTRA API
// Run: k6 run tests/load/api.test.js
// Install k6: https://k6.io/docs/getting-started/installation/

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom metrics
const loginErrors = new Counter('login_errors');
const spacecraftCreated = new Counter('spacecraft_created');
const apiErrorRate = new Rate('api_error_rate');
const responseTimeTrend = new Trend('response_time_ms');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 50 },    // Ramp to 50 users
    { duration: '2m', target: 50 },    // Hold at 50 users
    { duration: '30s', target: 100 },  // Spike to 100 users
    { duration: '1m', target: 100 },   // Hold at 100
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],                   // Less than 1% errors
    api_error_rate: ['rate<0.05'],                    // Less than 5% API errors
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5001/api';

// Setup: create a test user and get token
export function setup() {
  const email = `loadtest_${Date.now()}@astra.space`;
  const registerRes = http.post(`${BASE_URL}/auth/register`, JSON.stringify({
    name: 'Load Test User',
    email,
    password: 'LoadTest123!',
  }), { headers: { 'Content-Type': 'application/json' } });

  check(registerRes, { 'registration successful': (r) => r.status === 201 });
  const token = registerRes.json('token');
  return { token, email };
}

export default function(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.token}`,
  };

  // Test 1: Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health check OK': (r) => r.status === 200 });
  responseTimeTrend.add(healthRes.timings.duration);
  apiErrorRate.add(healthRes.status !== 200);
  sleep(0.1);

  // Test 2: List spacecraft (paginated)
  const listRes = http.get(`${BASE_URL}/spacecraft?page=1&limit=20`, { headers });
  check(listRes, {
    'spacecraft list OK': (r) => r.status === 200,
    'has pagination': (r) => r.json('pagination') !== null,
  });
  responseTimeTrend.add(listRes.timings.duration);
  apiErrorRate.add(listRes.status !== 200);
  sleep(0.2);

  // Test 3: Create spacecraft
  const createRes = http.post(`${BASE_URL}/spacecraft`, JSON.stringify({
    name: `LOAD-TEST-SAT-${__VU}-${__ITER}`,
    type: 'satellite',
    config: { altitude: 550, inclination: 53 },
  }), { headers });

  const created = check(createRes, {
    'spacecraft created': (r) => r.status === 201,
    'has id': (r) => r.json('id') !== null,
  });
  if (created) spacecraftCreated.add(1);
  responseTimeTrend.add(createRes.timings.duration);
  apiErrorRate.add(createRes.status !== 201);

  const spacecraftId = createRes.json('id');
  sleep(0.3);

  // Test 4: Get specific spacecraft
  if (spacecraftId) {
    const getRes = http.get(`${BASE_URL}/spacecraft/${spacecraftId}`, { headers });
    check(getRes, { 'get spacecraft OK': (r) => r.status === 200 });
    responseTimeTrend.add(getRes.timings.duration);
    sleep(0.2);
  }

  sleep(1);
}

// Teardown
export function teardown(data) {
  console.log('Load test complete');
}
