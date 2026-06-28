const { z } = require('zod');

// Auth schemas
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*]/, 'Password must contain at least one special character'),
  organisation: z.string().max(150).trim().optional(),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1, 'Password required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

// Spacecraft schemas
const spacecraftSchema = z.object({
  name: z.string().min(1, 'Name required').max(150).trim(),
  type: z.enum(['satellite', 'rocket', 'station', 'rover'], {
    errorMap: () => ({ message: 'Type must be: satellite, rocket, station, or rover' })
  }),
  description: z.string().max(1000).trim().optional(),
  components: z.array(z.object({
    id: z.string(),
    name: z.string(),
    mass: z.number().min(0),
    cost: z.number().min(0),
    instanceId: z.number().optional(),
  })).max(100).default([]),
  config: z.object({
    altitude: z.number().min(200).max(100000).optional(),
    inclination: z.number().min(0).max(180).optional(),
    deltaV: z.number().min(0).max(100000).optional(),
    powerConsumption: z.number().min(0).max(100000).optional(),
  }).default({}),
});

const spacecraftUpdateSchema = spacecraftSchema.partial().extend({
  status: z.enum(['designed', 'simulating', 'archived']).optional(),
});

// Mission schemas
const missionSchema = z.object({
  name: z.string().min(1, 'Mission name required').max(150).trim(),
  spacecraftId: z.string().uuid('Invalid spacecraft ID').optional(),
  description: z.string().max(2000).trim().optional(),
  objectives: z.array(z.string().max(500)).max(20).default([]),
  timeline: z.array(z.object({
    phase: z.string(),
    startDate: z.string().optional(),
    duration: z.string().optional(),
  })).max(50).default([]),
});

// AI query schema
const aiQuerySchema = z.object({
  spacecraftId: z.string().uuid().optional().nullable(),
  telemetry: z.record(z.any()).optional().default({}),
  question: z.string().min(1, 'Question required').max(2000).trim(),
});

// Fault injection schema
const faultSchema = z.object({
  type: z.enum(['solar_panel', 'thermal_control', 'antenna', 'battery', 'thruster', 'gyroscope']),
  severity: z.enum(['minor', 'major', 'critical']).default('major'),
  description: z.string().max(500).optional(),
});

// Pagination schema
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().max(200).trim().optional(),
});

module.exports = {
  registerSchema, loginSchema, refreshTokenSchema,
  spacecraftSchema, spacecraftUpdateSchema,
  missionSchema, aiQuerySchema, faultSchema, paginationSchema,
};
