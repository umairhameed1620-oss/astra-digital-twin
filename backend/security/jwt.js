const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../monitoring/logger');

const generateTokens = (payload) => {
  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: 'astra-platform',
    audience: 'astra-client',
  });
  const refreshToken = jwt.sign({ id: payload.id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: 'astra-platform',
    audience: 'astra-refresh',
  });
  return { accessToken, refreshToken };
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.secret, {
    issuer: 'astra-platform',
    audience: 'astra-client',
  });
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret, {
    issuer: 'astra-platform',
    audience: 'astra-refresh',
  });
};

module.exports = { generateTokens, verifyAccessToken, verifyRefreshToken };
