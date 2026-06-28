const request = require('supertest');
const { app } = require('../../server');
const { query } = require('../../utils/database');
const { testUser, testSpacecraft, invalidSpacecraft } = require('../fixtures/testData');

let authToken;
let userId;
let spacecraftId;

describe('Auth API - Integration Tests', () => {
  const uniqueEmail = `test_${Date.now()}@astra.space`;

  describe('POST /api/auth/register', () => {
    test('should register a new user successfully', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Integration Test User',
        email: uniqueEmail,
        password: 'TestPass123!',
        organisation: 'ASTRA Tests',
      });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(uniqueEmail);
      expect(res.body.user.password).toBeUndefined();
      authToken = res.body.token;
      userId = res.body.user.id;
    });

    test('should reject duplicate email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Duplicate User',
        email: uniqueEmail,
        password: 'TestPass123!',
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toBeDefined();
    });

    test('should reject weak password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test',
        email: 'weak@test.com',
        password: 'weak',
      });
      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
    });

    test('should reject missing required fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: uniqueEmail,
        password: 'TestPass123!',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.user).toBeDefined();
    });

    test('should reject wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: uniqueEmail,
        password: 'WrongPass123!',
      });
      expect(res.status).toBe(401);
    });

    test('should reject non-existent email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@nowhere.com',
        password: 'TestPass123!',
      });
      expect(res.status).toBe(401);
    });

    test('should not reveal whether email exists in error message', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@nowhere.com',
        password: 'WrongPass123!',
      });
      expect(res.body.error).toBe('Invalid credentials');
    });
  });
});

describe('Spacecraft API - Integration Tests', () => {
  beforeAll(async () => {
    if (!authToken) {
      const uniqueEmail2 = `sc_test_${Date.now()}@astra.space`;
      const res = await request(app).post('/api/auth/register').send({
        name: 'SC Test User', email: uniqueEmail2, password: 'TestPass123!'
      });
      authToken = res.body.token;
      userId = res.body.user.id;
    }
  });

  describe('POST /api/spacecraft', () => {
    test('should create spacecraft with valid data', async () => {
      const res = await request(app)
        .post('/api/spacecraft')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testSpacecraft);
      expect(res.status).toBe(201);
      expect(res.body.name).toBe(testSpacecraft.name);
      expect(res.body.type).toBe(testSpacecraft.type);
      expect(res.body.id).toBeDefined();
      spacecraftId = res.body.id;
    });

    test('should reject unauthenticated request', async () => {
      const res = await request(app).post('/api/spacecraft').send(testSpacecraft);
      expect(res.status).toBe(401);
    });

    test('should reject invalid spacecraft type', async () => {
      const res = await request(app)
        .post('/api/spacecraft')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidSpacecraft);
      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
    });

    test('should reject XSS in name field', async () => {
      const res = await request(app)
        .post('/api/spacecraft')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ ...testSpacecraft, name: '<script>alert("xss")</script>' });
      if (res.status === 201) {
        expect(res.body.name).not.toContain('<script>');
      }
    });
  });

  describe('GET /api/spacecraft', () => {
    test('should return user spacecraft list', async () => {
      const res = await request(app)
        .get('/api/spacecraft')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    test('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/spacecraft');
      expect(res.status).toBe(401);
    });

    test('should support pagination', async () => {
      const res = await request(app)
        .get('/api/spacecraft?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });
  });

  describe('GET /api/spacecraft/:id', () => {
    test('should return specific spacecraft', async () => {
      if (!spacecraftId) return;
      const res = await request(app)
        .get(`/api/spacecraft/${spacecraftId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(spacecraftId);
    });

    test('should return 404 for non-existent spacecraft', async () => {
      const res = await request(app)
        .get('/api/spacecraft/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/spacecraft/:id', () => {
    test('should soft-delete spacecraft', async () => {
      if (!spacecraftId) return;
      const res = await request(app)
        .delete(`/api/spacecraft/${spacecraftId}`)
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      // Verify soft delete - should not appear in list
      const listRes = await request(app)
        .get('/api/spacecraft')
        .set('Authorization', `Bearer ${authToken}`);
      const found = listRes.body.data?.find(s => s.id === spacecraftId);
      expect(found).toBeUndefined();
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (userId) {
      try { await query('DELETE FROM users WHERE id = $1', [userId]); } catch { /* ignore */ }
    }
  });
});

describe('Health Check', () => {
  test('GET /api/health should return 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });
});
