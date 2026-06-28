const { registerSchema, loginSchema, spacecraftSchema, aiQuerySchema, faultSchema, paginationSchema } = require('../../validation/schemas');

describe('Validation Schemas - Unit Tests', () => {

  describe('registerSchema', () => {
    test('valid registration data should pass', () => {
      const result = registerSchema.safeParse({
        name: 'Jane Foster',
        email: 'jane@astra.space',
        password: 'Secure123!',
        organisation: 'NASA',
      });
      expect(result.success).toBe(true);
    });

    test('should reject short name', () => {
      const result = registerSchema.safeParse({ name: 'J', email: 'jane@astra.space', password: 'Secure123!' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].path).toContain('name');
    });

    test('should reject invalid email', () => {
      const result = registerSchema.safeParse({ name: 'Jane', email: 'not-an-email', password: 'Secure123!' });
      expect(result.success).toBe(false);
      expect(result.error.errors[0].path).toContain('email');
    });

    test('should reject password without uppercase', () => {
      const result = registerSchema.safeParse({ name: 'Jane', email: 'jane@test.com', password: 'secure123!' });
      expect(result.success).toBe(false);
    });

    test('should reject password without number', () => {
      const result = registerSchema.safeParse({ name: 'Jane', email: 'jane@test.com', password: 'SecurePass!' });
      expect(result.success).toBe(false);
    });

    test('should reject password without special character', () => {
      const result = registerSchema.safeParse({ name: 'Jane', email: 'jane@test.com', password: 'Secure123' });
      expect(result.success).toBe(false);
    });

    test('should normalise email to lowercase', () => {
      const result = registerSchema.safeParse({ name: 'Jane', email: 'JANE@ASTRA.SPACE', password: 'Secure123!' });
      expect(result.success).toBe(true);
      expect(result.data.email).toBe('jane@astra.space');
    });

    test('organisation is optional', () => {
      const result = registerSchema.safeParse({ name: 'Jane', email: 'jane@astra.space', password: 'Secure123!' });
      expect(result.success).toBe(true);
    });
  });

  describe('spacecraftSchema', () => {
    test('valid satellite schema should pass', () => {
      const result = spacecraftSchema.safeParse({
        name: 'SENTINEL-1A',
        type: 'satellite',
        config: { altitude: 550, inclination: 53 },
      });
      expect(result.success).toBe(true);
    });

    test('should reject empty name', () => {
      const result = spacecraftSchema.safeParse({ name: '', type: 'satellite' });
      expect(result.success).toBe(false);
    });

    test('should reject invalid type', () => {
      const result = spacecraftSchema.safeParse({ name: 'Test', type: 'missile' });
      expect(result.success).toBe(false);
    });

    test('should accept all valid types', () => {
      ['satellite', 'rocket', 'station', 'rover'].forEach(type => {
        const result = spacecraftSchema.safeParse({ name: 'Test', type });
        expect(result.success).toBe(true);
      });
    });

    test('should reject altitude below minimum', () => {
      const result = spacecraftSchema.safeParse({ name: 'Test', type: 'satellite', config: { altitude: 100 } });
      expect(result.success).toBe(false);
    });

    test('should reject altitude above maximum', () => {
      const result = spacecraftSchema.safeParse({ name: 'Test', type: 'satellite', config: { altitude: 200000 } });
      expect(result.success).toBe(false);
    });

    test('components defaults to empty array', () => {
      const result = spacecraftSchema.safeParse({ name: 'Test', type: 'satellite' });
      expect(result.success).toBe(true);
      expect(result.data.components).toEqual([]);
    });
  });

  describe('faultSchema', () => {
    test('valid fault should pass', () => {
      const result = faultSchema.safeParse({ type: 'solar_panel', severity: 'major' });
      expect(result.success).toBe(true);
    });

    test('should reject invalid fault type', () => {
      const result = faultSchema.safeParse({ type: 'missile_launch' });
      expect(result.success).toBe(false);
    });

    test('all valid fault types should pass', () => {
      ['solar_panel', 'thermal_control', 'antenna', 'battery', 'thruster', 'gyroscope'].forEach(type => {
        const result = faultSchema.safeParse({ type });
        expect(result.success).toBe(true);
      });
    });

    test('severity defaults to major', () => {
      const result = faultSchema.safeParse({ type: 'antenna' });
      expect(result.success).toBe(true);
      expect(result.data.severity).toBe('major');
    });
  });

  describe('paginationSchema', () => {
    test('valid pagination should pass', () => {
      const result = paginationSchema.safeParse({ page: '1', limit: '20' });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    });

    test('should coerce string numbers', () => {
      const result = paginationSchema.safeParse({ page: '3', limit: '50' });
      expect(result.success).toBe(true);
      expect(result.data.page).toBe(3);
    });

    test('should reject limit above 100', () => {
      const result = paginationSchema.safeParse({ page: 1, limit: 500 });
      expect(result.success).toBe(false);
    });

    test('should reject page below 1', () => {
      const result = paginationSchema.safeParse({ page: 0, limit: 20 });
      expect(result.success).toBe(false);
    });
  });
});
