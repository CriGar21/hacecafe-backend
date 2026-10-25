const jwt = require("jsonwebtoken");

const normalizarRol = (rol) => (rol === "DUEÑO" ? "DUENO" : rol);

const verificarToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token requerido" });
  try {
    const usuario = jwt.verify(token, process.env.JWT_SECRET);
    usuario.rol = normalizarRol(usuario.rol);
    req.usuario = usuario;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Token inválido o expirado" });
  }
};

const soloRoles = (...roles) => {
  const rolesNormalizados = roles.map(normalizarRol);
  return (req, res, next) => {
    const rol = normalizarRol(req.usuario?.rol);
    if (!rolesNormalizados.includes(rol)) {
      return res.status(403).json({ error: "No tenés permiso para esta acción" });
    }
    next();
  };
};

module.exports = { verificarToken, soloRoles, normalizarRol };
