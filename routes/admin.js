const express = require("express");
const router = express.Router();
const { verificarToken, soloRoles } = require("../middlewares/auth");
const {
  getDashboard,
  getProductos,
  crearProducto,
  editarProducto,
  actualizarStock,
  getUsuarios,
  crearUsuario,
  editarUsuario,
  toggleUsuario,
  getCaja,
  getCategorias,
  crearCategoria,
  actualizarCategoria,
} = require("../controllers/adminController");

router.use(verificarToken);
router.use(soloRoles("DUEÑO"));

// â”€â”€â”€ Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/dashboard", getDashboard);

// â”€â”€â”€ Productos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/productos", getProductos);
router.post("/productos", crearProducto);
router.put("/productos/:id", editarProducto);
router.patch("/productos/:id/stock", actualizarStock);

// â”€â”€â”€ Usuarios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/usuarios", getUsuarios);
router.post("/usuarios", crearUsuario);
router.put("/usuarios/:id", editarUsuario);
router.patch("/usuarios/:id/toggle", toggleUsuario);

// â”€â”€â”€ Caja â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/caja", getCaja);

// â”€â”€â”€ CategorÃ­as â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/categorias", getCategorias);
router.post("/categorias", crearCategoria);
router.patch("/categorias/:id", actualizarCategoria);

module.exports = router;



