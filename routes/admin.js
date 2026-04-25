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
  toggleUsuario,
  getCaja,
  getCategorias,
  crearCategoria,
  actualizarCategoria,
} = require("../controllers/adminController");

router.use(verificarToken);
router.use(soloRoles("DUEÑO"));

router.get("/dashboard", getDashboard);

router.get("/productos", getProductos);
router.post("/productos", crearProducto);
router.put("/productos/:id", editarProducto);
router.patch("/productos/:id/stock", actualizarStock);

router.get("/usuarios", getUsuarios);
router.post("/usuarios", crearUsuario);
router.patch("/usuarios/:id/toggle", toggleUsuario);

router.get("/caja", getCaja);

router.get("/categorias", getCategorias);
router.post("/categorias", crearCategoria);
router.patch("/categorias/:id", actualizarCategoria);

module.exports = router;

router.put("/usuarios/:id", soloRoles("DUEÑO"), async (req, res) => {
  const { nombre, rol, password } = req.body;
  try {
    const data = { nombre, rol };
    if (password) {
      const bcrypt = require("bcryptjs");
      data.password = await bcrypt.hash(password, 10);
    }
    const usuario = await prisma.usuario.update({
      where: { id: Number(req.params.id) },
      data,
    });
    res.json(usuario);
  } catch (e) {
    res.status(500).json({ error: "Error al editar usuario" });
  }
});
