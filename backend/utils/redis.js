const Redis = require('ioredis');
const config = require('../config');
const logger = require('../monitoring/logger');

let redisClient = null;
let redisSubscriber = null;

const createClient = () => {
  const client = new Redis(config.redis.url, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 100, 3000);
      logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
};

const getRedis = () => {
  if (!redisClient) redisClient = createClient();
  return redisClient;
};

const getSubscriber = () => {
  if (!redisSubscriber) redisSubscriber = createClient();
  return redisSubscriber;
};

const connectRedis = async () => {
  const client = getRedis();
  await client.connect();
  return client;
};

// Cache helpers
const cache = {
  get: async (key) => {
    try {
      const val = await getRedis().get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },
  set: async (key, value, ttl = config.redis.ttl) => {
    try {
      await getRedis().setex(key, ttl, JSON.stringify(value));
    } catch (err) {
      logger.warn('Cache set failed', { key, error: err.message });
    }
  },
  del: async (...keys) => {
    try { await getRedis().del(...keys); } catch { /* ignore */ }
  },
  delPattern: async (pattern) => {
    try {
      const keys = await getRedis().keys(pattern);
      if (keys.length) await getRedis().del(...keys);
    } catch { /* ignore */ }
  },
  // Store refresh tokens with expiry
  setRefreshToken: async (userId, token, ttlSeconds = 7 * 24 * 3600) => {
    await getRedis().setex(`refresh:${userId}:${token.substring(0, 20)}`, ttlSeconds, token);
  },
  invalidateRefreshToken: async (userId, token) => {
    await getRedis().del(`refresh:${userId}:${token.substring(0, 20)}`);
  },
  invalidateAllRefreshTokens: async (userId) => {
    const keys = await getRedis().keys(`refresh:${userId}:*`);
    if (keys.length) await getRedis().del(...keys);
  },
};

module.exports = { getRedis, getSubscriber, connectRedis, cache };
