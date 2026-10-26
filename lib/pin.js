const crypto = require("crypto");

// El PIN se guarda como HMAC-SHA256 con el JWT_SECRET: es determinista (permite
// buscar al empleado por PIN y garantizar que sea único) y no se puede leer
// de la base de datos. Un PIN corto sigue siendo adivinable por fuerza bruta,
// por eso el endpoint de fichaje tiene límite de intentos.
const PIN_REGEX = /^\d{4,6}$/;

const hashPin = (pin) =>
  crypto.createHmac("sha256", process.env.JWT_SECRET).update(String(pin)).digest("hex");

module.exports = { PIN_REGEX, hashPin };
