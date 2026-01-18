// Middleware for role-based access control
export const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado' });
    }

    const userRole = req.user.role || (req.user.isAdmin ? 'admin_sucursal' : 'user');
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ 
        message: `Acceso denegado. Roles permitidos: ${allowedRoles.join(', ')}` 
      });
    }

    next();
  };
};

// Middleware to check if user is managing their own branch (for branch admins)
export const requireBranchAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'No autorizado' });
  }

  // Central admin can access anything
  if (req.user.role === 'admin_central') {
    return next();
  }

  // Branch admin can only access their own branch
  if (req.user.role === 'admin_sucursal') {
    // support multiple ways the branch id can be provided in routes: /:id, /:branchId, body or query
    const branchId = req.params?.branchId || req.params?.id || req.body?.branchId || req.query?.branchId;
    const rawUserBranch = req.user?.branchId;
    const userBranchId = (typeof rawUserBranch === 'object' && rawUserBranch?._id) ? String(rawUserBranch._id) : (rawUserBranch ? String(rawUserBranch) : null);

    // if a branchId is provided in the request, ensure it matches the user's branch
    if (branchId && userBranchId && userBranchId !== String(branchId)) {
      return res.status(403).json({ message: 'No tiene acceso a esta sucursal' });
    }

    // allow if no branchId provided (some endpoints may not include it)
    return next();
  }

  return res.status(403).json({ message: 'Acceso denegado' });
};

// Middleware to ensure central admin only
export const requireCentralAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'No autorizado' });
  }

  if (req.user.role !== 'admin_central') {
    return res.status(403).json({ message: 'Solo el administrador central puede realizar esta acción' });
  }

  next();
};
