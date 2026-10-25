const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { verificarToken, soloRoles } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();

const DEFAULTS_APARIENCIA = {
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

const DEFAULTS_NEGOCIO = {
  rs_nombre: "HaceCafe",
  rs_subtitulo: "Cafetería & Cocina Artesanal",
  rs_direccion: "",
  rs_telefono: "",
  rs_cuit: "",
  rs_mesas: "7",
  rs_dominio: "",
  mp_alias: "",
  mp_cbu: "",
  mp_titular: "",
  mp_qr_url: "",
  transfer_alias: "",
  transfer_cbu: "",
  transfer_titular: "",
  transfer_banco: "",
};

async function asegurarTablaApariencia() {
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

async function asegurarTablaNegocio() {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS configuracion_negocio (
    id INT NOT NULL PRIMARY KEY,
    rs_nombre VARCHAR(150) NOT NULL DEFAULT 'HaceCafe',
    rs_subtitulo VARCHAR(180) NOT NULL DEFAULT 'Cafetería & Cocina Artesanal',
    rs_direccion VARCHAR(255) NULL,
    rs_telefono VARCHAR(60) NULL,
    rs_cuit VARCHAR(60) NULL,
    rs_mesas INT NOT NULL DEFAULT 7,
    rs_dominio VARCHAR(500) NULL,
    mp_alias VARCHAR(150) NULL,
    mp_cbu VARCHAR(100) NULL,
    mp_titular VARCHAR(150) NULL,
    mp_qr_url VARCHAR(500) NULL,
    transfer_alias VARCHAR(150) NULL,
    transfer_cbu VARCHAR(100) NULL,
    transfer_titular VARCHAR(150) NULL,
    transfer_banco VARCHAR(150) NULL,
    actualizadoEn DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  )`);
  await prisma.$executeRawUnsafe(`INSERT IGNORE INTO configuracion_negocio (id) VALUES (1)`);
}

router.get("/apariencia", async (req, res) => {
  try {
    await asegurarTablaApariencia();
    const rows = await prisma.$queryRawUnsafe("SELECT * FROM apariencia WHERE id = 1 LIMIT 1");
    res.json({ ...DEFAULTS_APARIENCIA, ...(rows[0] || {}) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener la apariencia" });
  }
});

router.put("/apariencia", verificarToken, soloRoles("DUENO"), async (req, res) => {
  try {
    await asegurarTablaApariencia();
    const c = { ...DEFAULTS_APARIENCIA, ...req.body };
    await prisma.$executeRawUnsafe(
      `UPDATE apariencia SET nombre=?, subtitulo=?, bienvenida=?, logoUrl=?, heroBgUrl=?, colorPrimario=?, colorFondo=?, colorCard=?, colorTexto=?, fuenteId=? WHERE id=1`,
      c.nombre, c.subtitulo, c.bienvenida || null, c.logoUrl || null, c.heroBgUrl || null,
      c.colorPrimario, c.colorFondo, c.colorCard, c.colorTexto, c.fuenteId,
    );
    const rows = await prisma.$queryRawUnsafe("SELECT * FROM apariencia WHERE id = 1 LIMIT 1");
    res.json({ ...DEFAULTS_APARIENCIA, ...(rows[0] || {}) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar la apariencia" });
  }
});

router.get("/negocio", async (req, res) => {
  try {
    await asegurarTablaNegocio();
    const rows = await prisma.$queryRawUnsafe("SELECT * FROM configuracion_negocio WHERE id = 1 LIMIT 1");
    const row = rows[0] || {};
    res.json({ ...DEFAULTS_NEGOCIO, ...row, rs_mesas: String(row.rs_mesas ?? DEFAULTS_NEGOCIO.rs_mesas) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener la configuración del negocio" });
  }
});

router.put("/negocio", verificarToken, soloRoles("DUENO"), async (req, res) => {
  try {
    await asegurarTablaNegocio();
    const c = { ...DEFAULTS_NEGOCIO, ...req.body };
    const mesas = Math.max(1, Math.min(99, Number.parseInt(c.rs_mesas, 10) || 7));
    await prisma.$executeRawUnsafe(
      `UPDATE configuracion_negocio SET rs_nombre=?, rs_subtitulo=?, rs_direccion=?, rs_telefono=?, rs_cuit=?, rs_mesas=?, rs_dominio=?, mp_alias=?, mp_cbu=?, mp_titular=?, mp_qr_url=?, transfer_alias=?, transfer_cbu=?, transfer_titular=?, transfer_banco=? WHERE id=1`,
      c.rs_nombre, c.rs_subtitulo, c.rs_direccion || null, c.rs_telefono || null, c.rs_cuit || null,
      mesas, c.rs_dominio || null, c.mp_alias || null, c.mp_cbu || null, c.mp_titular || null, c.mp_qr_url || null,
      c.transfer_alias || null, c.transfer_cbu || null, c.transfer_titular || null, c.transfer_banco || null,
    );
    const rows = await prisma.$queryRawUnsafe("SELECT * FROM configuracion_negocio WHERE id = 1 LIMIT 1");
    const row = rows[0] || {};
    res.json({ ...DEFAULTS_NEGOCIO, ...row, rs_mesas: String(row.rs_mesas ?? mesas) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar la configuración del negocio" });
  }
});

module.exports = router;
