const express = require("express");
const router = express.Router();
const {
  crearPedido,
  crearPedidoPublico,
  obtenerPedidos,
  actualizarEstado,
  obtenerPedidosPorMesa,
  obtenerPedidoPorNumero,
  cobrarMesa,
  aprobarPedido,
  rechazarPedido,
} = require("../controllers/pedidosController");
const { verificarToken, soloRoles } = require("../middlewares/auth");
router.post("/publico", crearPedidoPublico);

router.use(verificarToken);

router.post("/", crearPedido);
router.get("/", obtenerPedidos);
router.patch("/:id/estado", actualizarEstado);
router.get("/mesa/:mesa", obtenerPedidosPorMesa);
router.get("/numero/:numero", obtenerPedidoPorNumero);
router.post("/cobrar", soloRoles("DUEÑO", "EMPLEADO"), cobrarMesa);
router.patch("/:id/aprobar", soloRoles("DUEÑO", "EMPLEADO"), aprobarPedido);
router.patch("/:id/rechazar", soloRoles("DUEÑO", "EMPLEADO"), rechazarPedido);

module.exports = router;
