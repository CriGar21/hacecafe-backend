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
  editarPedidoPendiente,
  rechazarPedido,
  modificarPedidoPublico,
  cancelarPedidoPublico,
  aprobarCancelacion,
  rechazarCancelacion,
  aprobarModificacion,
  rechazarModificacion,
} = require("../controllers/pedidosController");
const { verificarToken, soloRoles } = require("../middlewares/auth");

router.post("/publico/llamar-mozo", (req, res) => {
  const mesa = String(req.body?.mesa || "").trim();
  const motivo = String(req.body?.motivo || "Necesita asistencia").trim().slice(0, 240);
  const numeroPedido = req.body?.numeroPedido ?? null;
  if (!mesa && !numeroPedido) return res.status(400).json({ error: "Indicá la mesa o el número de pedido" });
  const llamada = { mesa: mesa || null, numeroPedido, motivo, creadoEn: new Date().toISOString() };
  req.io.emit("llamada_mozo", llamada);
  return res.status(202).json({ ok: true, mensaje: "Aviso enviado al personal" });
});
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
router.patch("/:id/editar-pendiente", soloRoles("DUENO", "EMPLEADO"), editarPedidoPendiente);
router.patch("/:id/rechazar", soloRoles("DUENO", "EMPLEADO"), rechazarPedido);
router.patch("/:id/cancelacion/aprobar", soloRoles("DUENO", "EMPLEADO"), aprobarCancelacion);
router.patch("/:id/cancelacion/rechazar", soloRoles("DUENO", "EMPLEADO"), rechazarCancelacion);
router.patch("/:id/modificacion/aprobar", soloRoles("DUENO", "EMPLEADO"), aprobarModificacion);
router.patch("/:id/modificacion/rechazar", soloRoles("DUENO", "EMPLEADO"), rechazarModificacion);

module.exports = router;
