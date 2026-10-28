const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const RADIO_MAXIMO_METROS = Number.parseInt(process.env.RADIO_FICHAJE_METROS, 10) || 150;
const LOCAL_LAT = Number.parseFloat(process.env.LOCAL_LAT);
const LOCAL_LNG = Number.parseFloat(process.env.LOCAL_LNG);
const VALIDAR_GEOFENCE = Number.isFinite(LOCAL_LAT) && Number.isFinite(LOCAL_LNG);

function distanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const rad = (v) => (v * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function estadoFichaje(req, res) {
  try {
    const ultimo = await prisma.fichaje.findFirst({
      where: { usuarioId: req.usuario.id },
      orderBy: { creadoEn: "desc" },
    });
    res.json({
      ultimo,
      dentro: ultimo?.tipo === "INGRESO",
      recordatorioHoras: 4,
    });
  } catch (error) {
    console.error("Error consultando estado de fichaje:", error);
    res.status(500).json({ error: "No se pudo consultar tu estado de fichaje." });
  }
}

async function registrarFichajeAutenticado(req, res) {
  try {
    const latitud = Number(req.body.latitud);
    const longitud = Number(req.body.longitud);
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud) ||
        Math.abs(latitud) > 90 || Math.abs(longitud) > 180) {
      return res.status(400).json({ error: "No pudimos validar la ubicación del dispositivo." });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario.id } });
    if (!usuario || !usuario.activo) return res.status(401).json({ error: "Tu usuario está inactivo. Consultá al administrador." });

    const ultimo = await prisma.fichaje.findFirst({
      where: { usuarioId: usuario.id },
      orderBy: { creadoEn: "desc" },
    });
    const tipo = ultimo?.tipo === "INGRESO" ? "EGRESO" : "INGRESO";
    if (ultimo && (Date.now() - ultimo.creadoEn.getTime()) < 30000) {
      return res.status(429).json({ error: "Esperá unos segundos antes de volver a fichar." });
    }

    const distancia = VALIDAR_GEOFENCE ? distanciaMetros(LOCAL_LAT, LOCAL_LNG, latitud, longitud) : null;
    if (VALIDAR_GEOFENCE && distancia > RADIO_MAXIMO_METROS) {
      return res.status(403).json({ error: `Estás a ${Math.round(distancia)} m del local. El fichaje solo se permite dentro de ${RADIO_MAXIMO_METROS} m.` });
    }

    const fichaje = await prisma.fichaje.create({
      data: {
        usuarioId: usuario.id,
        tipo,
        latitud,
        longitud,
        distanciaM: distancia === null ? null : Math.round(distancia),
      },
    });
    res.status(201).json({
      success: true,
      mensaje: tipo === "INGRESO" ? "Ingreso registrado. ¡Buen turno!" : "Salida registrada. ¡Buen descanso!",
      aviso: VALIDAR_GEOFENCE ? null : "Modo de prueba: se guardó tu ubicación, pero todavía no se valida la distancia al local.",
      fichaje,
    });
  } catch (error) {
    console.error("Error registrando fichaje autenticado:", error);
    res.status(500).json({ error: "No se pudo registrar el fichaje." });
  }
}

module.exports = { estadoFichaje, registrarFichajeAutenticado };
