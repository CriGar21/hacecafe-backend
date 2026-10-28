const express = require("express");
const { PrismaClient } = require("@prisma/client");

const router = express.Router();
const prisma = new PrismaClient();

// Catálogo público para el menú y las pantallas que necesitan listar productos.
router.get("/productos", async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { disponible: true },
      include: { categoria: true },
      orderBy: [{ categoriaId: "asc" }, { ordenDisplay: "asc" }, { nombre: "asc" }],
    });
    res.json(productos);
  } catch (error) {
    console.error("Error al consultar el catálogo de productos:", error);
    res.status(500).json({ error: "No se pudieron cargar los productos." });
  }
});

router.get("/categorias", async (req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({
      where: { activa: true },
      orderBy: [{ ordenDisplay: "asc" }, { nombre: "asc" }],
    });
    res.json(categorias);
  } catch (error) {
    console.error("Error al consultar el catálogo de categorías:", error);
    res.status(500).json({ error: "No se pudieron cargar las categorías." });
  }
});

module.exports = router;
