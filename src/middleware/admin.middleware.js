const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'No autenticado' });
  }
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Se requiere rol administrador' });
  }
  next();
};

export default isAdmin;