const config = require('../config');
const logger = require('../monitoring/logger');

// Dummy cache when Redis is not available
const cache = {
  get: async () => null,
  set: async () => null,
  del: async () => null,
  delPattern: async () => null,
  setRefreshToken: async () => null,
  invalidateRefreshToken: async () => null,
  invalidateAllRefreshTokens: async () => null,
};

const getRedis = () => null;
const getSubscriber = () => null;
const connectRedis = async () => {
  logger.warn('Redis not available — running without cache');
};

module.exports = { getRedis, getSubscriber, connectRedis, cache };
