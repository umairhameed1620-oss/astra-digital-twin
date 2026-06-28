const logger = require('../monitoring/logger');
const config = require('../config');

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

const globalErrorHandler = (err, req, res, next) => {
  // Default values
  err.statusCode = err.statusCode || 500;
  err.message = err.message || 'Internal server error';

  // Log errors
  if (err.statusCode >= 500) {
    logger.error('Unhandled error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?.id,
      ip: req.ip,
    });
  } else {
    logger.warn('Client error', {
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
      userId: req.user?.id,
    });
  }

  // PostgreSQL unique violation
  if (err.code === '23505') {
    const field = err.detail?.match(/\(([^)]+)\)/)?.[1] || 'field';
    return res.status(409).json({ error: `${field} already exists`, code: 'CONFLICT' });
  }

  // PostgreSQL foreign key violation
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource does not exist', code: 'FOREIGN_KEY_ERROR' });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
  }

  // Validation errors
  if (err.code === 'VALIDATION_ERROR') {
    return res.status(400).json({ error: err.message, code: err.code, details: err.details });
  }

  // Operational errors (safe to expose)
  if (err.isOperational) {
    return res.status(err.statusCode).json({ error: err.message, code: err.code });
  }

  // Unknown errors — hide details in production
  const response = { error: 'Internal server error', code: 'INTERNAL_ERROR' };
  if (config.env === 'development') {
    response.details = err.message;
    response.stack = err.stack;
  }
  res.status(500).json(response);
};

// 404 handler
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', { path: req.originalUrl, method: req.method });
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found`, code: 'ROUTE_NOT_FOUND' });
};

module.exports = { globalErrorHandler, notFoundHandler, AppError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, ValidationError };
