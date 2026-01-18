import User from "../models/User.js";
import jwt from "jsonwebtoken";

export async function register(req, res) {
  try {
    const { fullname, email, username, password, role = 'user', branchId } = req.body;
    // Email validation and normalization
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ message: "Email inválido: formato incorrecto." });
    }
    // Basic input validation: allow letters, numbers and _ . ! (no spaces or other special chars)
    const basicRegex = /^[A-Za-z0-9_.!]+$/;
    const cleanUsername = typeof username === 'string' ? username.trim() : username;
    if (!basicRegex.test(cleanUsername)) {
      return res.status(400).json({ message: "Usuario inválido: solo letras, números y caracteres '_', '.', '!' — sin espacios ni otros caracteres especiales." });
    }
    if (typeof password !== 'string' || !basicRegex.test(password)) {
      return res.status(400).json({ message: "Contraseña inválida: solo letras, números y caracteres '_', '.', '!' — sin espacios ni otros caracteres especiales." });
    }

    const exists = await User.findOne({ $or: [{ email }, { username: cleanUsername }] });
    if (exists) {
      return res.status(400).json({ message: "Email o usuario ya registrado." });
    }

    // Validate role
    const validRoles = ['user', 'admin_sucursal', 'admin_central'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ message: "Rol inválido" });
    }

    // Branch admins must have a branchId
    if (role === 'admin_sucursal' && !branchId) {
      return res.status(400).json({ message: "branchId requerido para administrador de sucursal" });
    }

    // Create user with role and branchId
    const newUser = await User.create({ 
      fullname, 
      email: cleanEmail, 
      username: cleanUsername, 
      password,
      role: role || 'user',
      branchId: role === 'admin_sucursal' ? branchId : null,
      isAdmin: role !== 'user' // For backward compatibility
    });

    return res.json({ message: "Usuario registrado correctamente", user: newUser });
  } catch (err) {
    return res.status(500).json({ message: "Error registrando usuario", error: err.message });
  }
}

export async function login(req, res) {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username }).populate('branchId', 'name city');
    if (!user) return res.status(400).json({ message: "Usuario no encontrado" });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(400).json({ message: "Contraseña incorrecta" });

    const token = jwt.sign(
      { 
        id: user._id, 
        isAdmin: user.isAdmin,
        role: user.role || (user.isAdmin ? 'admin_sucursal' : 'user'),
        branchId: user.branchId
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    return res.json({ message: "Login exitoso", token, user });
  } catch (err) {
    return res.status(500).json({ message: "Error al iniciar sesión", error: err.message });
  }
}