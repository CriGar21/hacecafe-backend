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

// ─── Dashboard ────────────────────────────────────────────────
router.get("/dashboard", getDashboard);

// ─── Productos ────────────────────────────────────────────────
router.get("/productos", getProductos);
router.post("/productos", crearProducto);
router.put("/productos/:id", editarProducto);
router.patch("/productos/:id/stock", actualizarStock);

// ─── Usuarios ─────────────────────────────────────────────────
router.get("/usuarios", getUsuarios);
router.post("/usuarios", crearUsuario);
router.put("/usuarios/:id", editarUsuario);
router.patch("/usuarios/:id/toggle", toggleUsuario);

// ─── Caja ─────────────────────────────────────────────────────
router.get("/caja", getCaja);

// ─── Categorías ───────────────────────────────────────────────
router.get("/categorias", getCategorias);
router.post("/categorias", crearCategoria);
router.patch("/categorias/:id", actualizarCategoria);

module.exports = router;
