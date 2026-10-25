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
  modificarPedidoPublico,
  cancelarPedidoPublico,
  aprobarCancelacion,
  rechazarCancelacion,
  aprobarModificacion,
  rechazarModificacion,
} = require("../controllers/pedidosController");
const { verificarToken, soloRoles } = require("../middlewares/auth");

router.post("/publico", crearPedidoPublico);
router.patch("/publico/:id/modificar", modificarPedidoPublico);
router.post("/publico/:id/cancelar", cancelarPedidoPublico);

router.use(verificarToken);
router.post("/", soloRoles("DUENO", "EMPLEADO"), crearPedido);
router.get("/", obtenerPedidos);
router.patch("/:id/estado", soloRoles("DUENO", "EMPLEADO", "COCINA"), actualizarEstado);
router.get("/mesa/:mesa", obtenerPedidosPorMesa);
router.get("/numero/:numero", obtenerPedidoPorNumero);
router.post("/cobrar", soloRoles("DUENO", "EMPLEADO"), cobrarMesa);
router.patch("/:id/aprobar", soloRoles("DUENO", "EMPLEADO"), aprobarPedido);
router.patch("/:id/rechazar", soloRoles("DUENO", "EMPLEADO"), rechazarPedido);
router.patch("/:id/cancelacion/aprobar", soloRoles("DUENO", "EMPLEADO"), aprobarCancelacion);
router.patch("/:id/cancelacion/rechazar", soloRoles("DUENO", "EMPLEADO"), rechazarCancelacion);
router.patch("/:id/modificacion/aprobar", soloRoles("DUENO", "EMPLEADO"), aprobarModificacion);
router.patch("/:id/modificacion/rechazar", soloRoles("DUENO", "EMPLEADO"), rechazarModificacion);

module.exports = router;
