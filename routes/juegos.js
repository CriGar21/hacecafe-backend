const express = require("express");
const router = express.Router();
const { verificarToken, soloRoles } = require("../middlewares/auth");
const c = require("../controllers/juegosController");

router.get("/", c.obtenerJuego);
router.post("/ruleta/:id", c.jugarRuleta);
router.patch("/", verificarToken, soloRoles("DUENO"), c.actualizarJuego);
module.exports = router;
