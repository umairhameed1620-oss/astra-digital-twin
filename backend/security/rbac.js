const ROLES = {
  ADMIN: 'admin',
  ENGINEER: 'engineer',
  VIEWER: 'viewer',
};

const PERMISSIONS = {
  'spacecraft:create': [ROLES.ADMIN, ROLES.ENGINEER],
  'spacecraft:read': [ROLES.ADMIN, ROLES.ENGINEER, ROLES.VIEWER],
  'spacecraft:update': [ROLES.ADMIN, ROLES.ENGINEER],
  'spacecraft:delete': [ROLES.ADMIN],
  'simulation:start': [ROLES.ADMIN, ROLES.ENGINEER],
  'simulation:stop': [ROLES.ADMIN, ROLES.ENGINEER],
  'simulation:inject_fault': [ROLES.ADMIN, ROLES.ENGINEER],
  'mission:create': [ROLES.ADMIN, ROLES.ENGINEER],
  'mission:read': [ROLES.ADMIN, ROLES.ENGINEER, ROLES.VIEWER],
  'ai:query': [ROLES.ADMIN, ROLES.ENGINEER],
  'admin:users': [ROLES.ADMIN],
  'admin:metrics': [ROLES.ADMIN],
};

const hasPermission = (role, permission) => {
  const allowed = PERMISSIONS[permission] || [];
  return allowed.includes(role);
};

const requirePermission = (permission) => (req, res, next) => {
  const userRole = req.user?.role || ROLES.VIEWER;
  if (!hasPermission(userRole, permission)) {
    return res.status(403).json({
      error: 'Insufficient permissions',
      required: permission,
      yourRole: userRole,
    });
  }
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Access denied', requiredRoles: roles });
  }
  next();
};

module.exports = { ROLES, PERMISSIONS, hasPermission, requirePermission, requireRole };
