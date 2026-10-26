const express = require("express");
const rateLimit = require("express-rate-limit");
const { verificarToken, soloRoles } = require("../middlewares/auth");
const { registrarFichaje, obtenerFichajes } = require("../controllers/fichajeController");

const router = express.Router();

// El endpoint de fichaje es público (se usa con PIN), así que se limitan los
// intentos por IP para frenar la adivinación de PINs.
const limitarFichaje = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
});

router.post("/", limitarFichaje, registrarFichaje);
router.get("/", verificarToken, soloRoles("DUEÑO"), obtenerFichajes);

module.exports = router;
