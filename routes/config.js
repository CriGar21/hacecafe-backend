const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { verificarToken, soloRoles } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

const DEFAULTS = {
  nombre: "HaceCafe",
  subtitulo: "Gastronomía artesanal",
  bienvenida: "",
  logoUrl: "",
  heroBgUrl: "",
  colorPrimario: "#C8913A",
  colorFondo: "#0f0d0b",
  colorCard: "#1a1712",
  colorTexto: "#F0E6D3",
  fuenteId: "georgia",
};

async function asegurarTabla() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS apariencia (
    id INT NOT NULL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL DEFAULT 'HaceCafe',
    subtitulo VARCHAR(180) NOT NULL DEFAULT 'Gastronomía artesanal',
    bienvenida TEXT NULL,
    logoUrl VARCHAR(500) NULL,
    heroBgUrl VARCHAR(500) NULL,
    colorPrimario VARCHAR(20) NOT NULL DEFAULT '#C8913A',
    colorFondo VARCHAR(20) NOT NULL DEFAULT '#0f0d0b',
    colorCard VARCHAR(20) NOT NULL DEFAULT '#1a1712',
    colorTexto VARCHAR(20) NOT NULL DEFAULT '#F0E6D3',
    fuenteId VARCHAR(40) NOT NULL DEFAULT 'georgia',
    actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await prisma.$executeRawUnsafe(`INSERT IGNORE INTO apariencia (id) VALUES (1)`);
}

router.get("/apariencia", async (req, res) => {
  try {
    await asegurarTabla();
    const rows = await prisma.$queryRawUnsafe("SELECT * FROM apariencia WHERE id = 1 LIMIT 1");
    res.json({ ...DEFAULTS, ...(rows[0] || {}) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener la apariencia" });
  }
});

router.put("/apariencia", verificarToken, soloRoles("DUENO"), async (req, res) => {
  try {
    await asegurarTabla();
    const c = { ...DEFAULTS, ...req.body };
    await prisma.$executeRawUnsafe(
      `UPDATE apariencia SET nombre=?, subtitulo=?, bienvenida=?, logoUrl=?, heroBgUrl=?, colorPrimario=?, colorFondo=?, colorCard=?, colorTexto=?, fuenteId=? WHERE id=1`,
      c.nombre, c.subtitulo, c.bienvenida || null, c.logoUrl || null, c.heroBgUrl || null,
      c.colorPrimario, c.colorFondo, c.colorCard, c.colorTexto, c.fuenteId,
    );
    const rows = await prisma.$queryRawUnsafe("SELECT * FROM apariencia WHERE id = 1 LIMIT 1");
    res.json({ ...DEFAULTS, ...(rows[0] || {}) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar la apariencia" });
  }
});

module.exports = router;
