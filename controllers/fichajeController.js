const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// Ubicación del local (configurable en .env)
const LOCAL_LAT = Number.parseFloat(process.env.LOCAL_LAT);
const LOCAL_LNG = Number.parseFloat(process.env.LOCAL_LNG);
// En entorno de prueba, si no se configuró el punto fijo del local,
// se registra la ubicación del navegador sin bloquear por distancia.
// Para producción, configurar LOCAL_LAT y LOCAL_LNG en Render.
const VALIDAR_GEOFENCE = Number.isFinite(LOCAL_LAT) && Number.isFinite(LOCAL_LNG);
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
    // Se ficha con las mismas credenciales del login: email + contraseña
    const email = String(req.body.email ?? "").trim();
    const password = String(req.body.password ?? "");
    const { tipo } = req.body;
    const latitud = Number(req.body.latitud);
    const longitud = Number(req.body.longitud);

    if (!email || !password) {
      return res.status(400).json({ error: "Ingresá tu email y contraseña." });
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
    //    distancia a quien no tiene credenciales válidas). Mismo mensaje si el
    //    email no existe o la contraseña es incorrecta.
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    const passwordValida = usuario
      ? await bcrypt.compare(password, usuario.password)
      : false;
    if (!usuario || !usuario.activo || !passwordValida) {
      return res.status(401).json({ error: "Email o contraseña incorrectos." });
    }

    // 2. Validar ubicación
    const distancia = VALIDAR_GEOFENCE
      ? calcularDistancia(LOCAL_LAT, LOCAL_LNG, latitud, longitud)
      : null;
    if (VALIDAR_GEOFENCE && distancia > RADIO_MAXIMO_METROS) {
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
      data: { usuarioId: usuario.id, tipo, latitud, longitud, distanciaM: distancia === null ? null : Math.round(distancia) },
    });

    res.status(201).json({
      success: true,
      ...(VALIDAR_GEOFENCE ? {} : { aviso: "Modo de prueba: se guardó la ubicación, pero no se validó la distancia al local." }),
      mensaje: `${tipo === "INGRESO" ? "Ingreso" : "Egreso"} registrado para ${usuario.nombre}.`,
      fichaje: { id: fichaje.id, tipo: fichaje.tipo, creadoEn: fichaje.creadoEn },
    });
  } catch (error) {
    console.error("Error al fichar:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
};

// Solo dueño. Filtros opcionales: ?desde=<fecha ISO>&hasta=<fecha ISO>&usuarioId=N
// El frontend manda el rango ya convertido desde la hora local del dueño.
const obtenerFichajes = async (req, res) => {
  try {
    const { desde, hasta, usuarioId } = req.query;
    const creadoEn = {};
    if (desde) {
      const d = new Date(desde);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Fecha 'desde' inválida." });
      creadoEn.gte = d;
    }
    if (hasta) {
      const h = new Date(hasta);
      if (Number.isNaN(h.getTime())) return res.status(400).json({ error: "Fecha 'hasta' inválida." });
      creadoEn.lte = h;
    }

    const fichajes = await prisma.fichaje.findMany({
      where: {
        ...(usuarioId ? { usuarioId: Number(usuarioId) } : {}),
        ...(desde || hasta ? { creadoEn } : {}),
      },
      include: { usuario: { select: { id: true, nombre: true, email: true, rol: true } } },
      orderBy: { creadoEn: "desc" },
      take: 1000,
    });
    res.json(fichajes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar registros de fichaje." });
  }
};

module.exports = { registrarFichaje, obtenerFichajes };
