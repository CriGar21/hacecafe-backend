const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function obtenerJuego(req, res) {
  try {
    let juego = await prisma.juegoConfig.findUnique({ where: { id: 1 } });
    if (!juego) juego = await prisma.juegoConfig.create({ data: { id: 1, activo: false, premios: [{ valor: 5, probabilidad: 45 }, { valor: 10, probabilidad: 30 }, { valor: 15, probabilidad: 20 }, { valor: 20, probabilidad: 5 }] } });
    res.json(juego);
  } catch { res.status(500).json({ error: "No se pudo cargar el juego" }); }
}

async function actualizarJuego(req, res) {
  try {
    const premios = Array.isArray(req.body.premios) ? req.body.premios.map(p => ({ valor: Math.max(0, Number(p.valor)), probabilidad: Math.max(0, Number(p.probabilidad)) })) : undefined;
    const data = { activo: Boolean(req.body.activo), nombre: String(req.body.nombre || "Ruleta de descuentos").slice(0, 100) };
    if (premios) data.premios = premios;
    res.json(await prisma.juegoConfig.update({ where: { id: 1 }, data }));
  } catch { res.status(400).json({ error: "No se pudo guardar la configuración" }); }
}

async function jugarRuleta(req, res) {
  const id = Number(req.params.id);
  try {
    const juego = await prisma.juegoConfig.findUnique({ where: { id: 1 } });
    if (!juego?.activo) return res.status(409).json({ error: "El juego no está disponible" });
    const pedido = await prisma.pedido.findFirst({ where: { id, clienteToken: req.body?.token, cobrado: false } });
    if (!pedido) return res.status(403).json({ error: "Pedido no autorizado" });
    if (pedido.juegoJugado) return res.status(409).json({ error: "Este pedido ya utilizó su juego" });
    const premios = Array.isArray(juego.premios) ? juego.premios.filter(p => Number(p.valor) > 0 && Number(p.probabilidad) > 0) : [];
    if (!premios.length) return res.status(409).json({ error: "No hay premios configurados" });
    const totalProb = premios.reduce((a, p) => a + Number(p.probabilidad), 0);
    let r = Math.random() * totalProb; let premio = premios[premios.length - 1];
    for (const p of premios) { r -= Number(p.probabilidad); if (r <= 0) { premio = p; break; } }
    const porcentaje = Math.min(100, Number(premio.valor));
    const subtotal = Number(pedido.subtotal || pedido.total);
    const descuento = round(subtotal * porcentaje / 100);
    const total = round(subtotal - descuento);
    const codigo = `RULETA-${pedido.numero}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const actualizado = await prisma.pedido.update({ where: { id }, data: { subtotal, descuentoPorcentaje: porcentaje, descuentoMonto: descuento, descuentoMotivo: "Premio ruleta", descuentoOrigen: "JUEGO", descuentoCodigo: codigo, total, juegoJugado: true, juegoPremio: porcentaje } });
    res.json({ premio: porcentaje, codigo, total: actualizado.total, descuento: actualizado.descuentoMonto });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo jugar la ruleta" }); }
}

module.exports = { obtenerJuego, actualizarJuego, jugarRuleta };
