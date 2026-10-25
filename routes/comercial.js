const express = require("express");
const router = express.Router();
const { verificarToken, soloRoles } = require("../middlewares/auth");
const c = require("../controllers/comercialController");

router.get("/promociones", c.listarPromocionesPublicas);
router.use(verificarToken);
router.get("/promociones/admin", soloRoles("DUENO"), c.listarPromocionesAdmin);
router.post("/promociones", soloRoles("DUENO"), c.crearPromocion);
router.patch("/promociones/:id", soloRoles("DUENO"), c.actualizarPromocion);
router.delete("/promociones/:id", soloRoles("DUENO"), c.eliminarPromocion);
router.patch("/pedidos/:id/descuento", soloRoles("DUENO", "EMPLEADO"), c.aplicarDescuentoPedido);
module.exports = router;
