const express = require("express");
const router = express.Router();
const {
  crearPedido,
  obtenerPedidos,
  actualizarEstado,
} = require("../controllers/pedidosController");
const { verificarToken, soloRoles } = require("../middlewares/auth");

router.use(verificarToken);

router.post("/", crearPedido);
router.get("/", obtenerPedidos);
router.patch(
  "/:id/estado",
  soloRoles("DUEÑO", "EMPLEADO", "COCINA"),
  actualizarEstado,
);

module.exports = router;
