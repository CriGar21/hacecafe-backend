const { PrismaClient } = require("@prisma/client");
const { hashPin, PIN_REGEX } = require("../lib/pin");

const prisma = new PrismaClient();

// Ubicación del local (configurable en .env)
const LOCAL_LAT = Number.parseFloat(process.env.LOCAL_LAT) || -38.5714;
const LOCAL_LNG = Number.parseFloat(process.env.LOCAL_LNG) || -58.7333;
const RADIO_MAXIMO_METROS = Number.parseInt(process.env.RADIO_FICHAJE_METROS, 10) || 150;
// Evita fichajes duplicados por doble toque
const SEGUNDOS_MINIMOS_ENTRE_FICHAJES = 30;

// Haversine: distancia en metros entre dos coordenadas
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const registrarFichaje = async (req, res) => {
  try {
    const { pin, tipo } = req.body;
    const latitud = Number(req.body.latitud);
    const longitud = Number(req.body.longitud);

    if (!PIN_REGEX.test(String(pin ?? ""))) {
      return res.status(400).json({ error: "El PIN debe tener entre 4 y 6 dígitos." });
    }
    if (!["INGRESO", "EGRESO"].includes(tipo)) {
      return res.status(400).json({ error: "Tipo de fichaje inválido." });
    }
    if (
      !Number.isFinite(latitud) || !Number.isFinite(longitud) ||
      Math.abs(latitud) > 90 || Math.abs(longitud) > 180
    ) {
      return res.status(400).json({ error: "Ubicación inválida." });
    }

    // 1. Identificar al empleado (antes que el GPS, para no revelar la
    //    distancia a quien no tiene un PIN válido)
    const usuario = await prisma.usuario.findUnique({ where: { pinHash: hashPin(pin) } });
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: "PIN incorrecto o inválido." });
    }

    // 2. Validar ubicación
    const distancia = calcularDistancia(LOCAL_LAT, LOCAL_LNG, latitud, longitud);
    if (distancia > RADIO_MAXIMO_METROS) {
      return res.status(403).json({
        error: `Te encontrás fuera del rango del local (${Math.round(distancia)} m).`,
      });
    }

    // 3. Coherencia con el último fichaje
    const ultimo = await prisma.fichaje.findFirst({
      where: { usuarioId: usuario.id },
      orderBy: { creadoEn: "desc" },
    });
    if (ultimo) {
      const segundos = (Date.now() - ultimo.creadoEn.getTime()) / 1000;
      if (segundos < SEGUNDOS_MINIMOS_ENTRE_FICHAJES) {
        return res.status(429).json({ error: "Ya fichaste hace instantes." });
      }
      if (ultimo.tipo === tipo) {
        return res.status(409).json({
          error: `Tu último fichaje ya fue un ${tipo}. Corresponde registrar un ${tipo === "INGRESO" ? "EGRESO" : "INGRESO"}.`,
        });
      }
    } else if (tipo === "EGRESO") {
      return res.status(409).json({ error: "Todavía no registraste un INGRESO." });
    }

    const fichaje = await prisma.fichaje.create({
      data: { usuarioId: usuario.id, tipo, latitud, longitud, distanciaM: Math.round(distancia) },
    });

    res.status(201).json({
      success: true,
      mensaje: `${tipo === "INGRESO" ? "Ingreso" : "Egreso"} registrado para ${usuario.nombre}.`,
      fichaje: { id: fichaje.id, tipo: fichaje.tipo, creadoEn: fichaje.creadoEn },
    });
  } catch (error) {
    console.error("Error al fichar:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
};

// Solo dueño. Filtros opcionales: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&usuarioId=N
const obtenerFichajes = async (req, res) => {
  try {
    const { desde, hasta, usuarioId } = req.query;
    const creadoEn = {};
    if (desde) creadoEn.gte = new Date(`${desde}T00:00:00`);
    if (hasta) creadoEn.lte = new Date(`${hasta}T23:59:59.999`);

    const fichajes = await prisma.fichaje.findMany({
      where: {
        ...(usuarioId ? { usuarioId: Number(usuarioId) } : {}),
        ...(desde || hasta ? { creadoEn } : {}),
      },
      include: { usuario: { select: { id: true, nombre: true, email: true, rol: true } } },
      orderBy: { creadoEn: "desc" },
      take: 500,
    });
    res.json(fichajes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar registros de fichaje." });
  }
};

module.exports = { registrarFichaje, obtenerFichajes };
