const express = require("express");
const rateLimit = require("express-rate-limit");
const { verificarToken, soloRoles } = require("../middlewares/auth");
const { registrarFichaje, obtenerFichajes } = require("../controllers/fichajeController");
const { estadoFichaje, registrarFichajeAutenticado } = require("../controllers/fichajeAutenticadoController");

const router = express.Router();
const limitarFichaje = rateLimit({ windowMs: 10 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados intentos. Probá de nuevo en unos minutos." } });
router.get("/mio", verificarToken, estadoFichaje);
router.post("/mio", verificarToken, limitarFichaje, registrarFichajeAutenticado);
router.post("/", limitarFichaje, registrarFichaje);
router.get("/", verificarToken, soloRoles("DUEÑO"), obtenerFichajes);
module.exports = router;
