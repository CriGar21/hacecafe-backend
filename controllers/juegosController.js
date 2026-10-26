const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function obtenerJuego(req, res) {
  try {
    let juego = await prisma.juegoConfig.findUnique({ where: { id: 1 } });
    if (!juego) juego = await prisma.juegoConfig.create({ data: { id: 1, activo: false, nombre: "Ruleta de descuentos", premios: [{ valor: 5, probabilidad: 45 }, { valor: 10, probabilidad: 30 }, { valor: 15, probabilidad: 20 }, { valor: 20, probabilidad: 5 }] } });
    res.json(juego);
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo cargar el juego" }); }
}

async function actualizarJuego(req, res) {
  const nombre = String(req.body.nombre || "Ruleta de descuentos").trim().slice(0, 100);
  const premios = req.body.premios;
  if (Array.isArray(premios)) {
    if (!premios.length || premios.length > 12) return res.status(400).json({ error: "Configurá entre 1 y 12 premios." });
    for (const p of premios) {
      const valor = Number(p.valor); const probabilidad = Number(p.probabilidad);
      if (!Number.isFinite(valor) || valor < 0 || valor > 100 || !Number.isFinite(probabilidad) || probabilidad < 0 || probabilidad > 100) {
        return res.status(400).json({ error: "Cada premio debe tener descuento de 0 a 100 y probabilidad de 0 a 100." });
      }
    }
    if (premios.reduce((s, p) => s + Number(p.probabilidad), 0) <= 0) return res.status(400).json({ error: "La suma de probabilidades debe ser mayor que cero." });
  }
  try {
    let existente = await prisma.juegoConfig.findUnique({ where: { id: 1 } });
    if (!existente) existente = await prisma.juegoConfig.create({ data: { id: 1, activo: false, nombre: "Ruleta de descuentos", premios: [] } });
    const data = { activo: Boolean(req.body.activo), nombre: nombre || "Ruleta de descuentos" };
    if (Array.isArray(premios)) data.premios = premios.map(p => ({ valor: Number(p.valor), probabilidad: Number(p.probabilidad) }));
    res.json(await prisma.juegoConfig.update({ where: { id: 1 }, data }));
  } catch (e) { console.error(e); res.status(400).json({ error: "No se pudo guardar la configuración" }); }
}

async function jugarRuleta(req, res) {
  const id = Number(req.params.id);
  const token = String(req.body?.token || "");
  if (!Number.isInteger(id) || id <= 0 || !token) return res.status(400).json({ error: "Falta el pedido o su token de autorización." });
  try {
    const juego = await prisma.juegoConfig.findUnique({ where: { id: 1 } });
    if (!juego?.activo) return res.status(409).json({ error: "El juego no está disponible" });
    const resultado = await prisma.$transaction(async tx => {
      const pedido = await tx.pedido.findFirst({ where: { id, clienteToken: token }, include: { items: true } });
      if (!pedido) throw Object.assign(new Error("Pedido no autorizado"), { status: 403 });
      if (pedido.cobrado || pedido.estado === "CANCELADO" || pedido.estado === "COBRADO") throw Object.assign(new Error("Este pedido ya no puede participar."), { status: 409 });
      if (pedido.juegoJugado) throw Object.assign(new Error("Este pedido ya utilizó su juego"), { status: 409 });
      if (pedido.descuentoOrigen && pedido.descuentoOrigen !== "JUEGO" && Number(pedido.descuentoMonto) > 0) throw Object.assign(new Error("Este pedido ya tiene un descuento aplicado y no puede combinarlo con el juego."), { status: 409 });
      const premios = Array.isArray(juego.premios) ? juego.premios.filter(p => Number(p.valor) >= 0 && Number(p.valor) <= 100 && Number(p.probabilidad) > 0) : [];
      if (!premios.length) throw Object.assign(new Error("No hay premios configurados"), { status: 409 });
      const totalProb = premios.reduce((a, p) => a + Number(p.probabilidad), 0);
      let r = Math.random() * totalProb;
      let premio = premios[premios.length - 1];
      for (const p of premios) { r -= Number(p.probabilidad); if (r < 0) { premio = p; break; } }
      const porcentaje = Math.min(100, Math.max(0, Number(premio.valor)));
      const subtotal = round(pedido.items.reduce((s, item) => s + Number(item.subtotal || 0), 0));
      if (subtotal <= 0) throw Object.assign(new Error("El pedido no tiene un subtotal válido."), { status: 409 });
      const descuento = round(subtotal * porcentaje / 100);
      const total = round(Math.max(0, subtotal - descuento));
      const codigo = `RULETA-${pedido.numero}-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`;
      const actualizado = await tx.pedido.updateMany({
        where: { id, juegoJugado: false, cobrado: false },
        data: { subtotal, descuentoPorcentaje: porcentaje, descuentoMonto: descuento, descuentoMotivo: "Premio ruleta", descuentoOrigen: "JUEGO", descuentoCodigo: codigo, total, juegoJugado: true, juegoPremio: porcentaje }
      });
      if (actualizado.count !== 1) throw Object.assign(new Error("El pedido ya participó o cambió de estado. Actualizá e intentá nuevamente."), { status: 409 });
      return { premio: porcentaje, codigo, total, descuento };
    });
    req.io?.emit("pedido_actualizado", { id, juegoJugado: true });
    res.json(resultado);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e); res.status(500).json({ error: "No se pudo jugar la ruleta" });
  }
}

module.exports = { obtenerJuego, actualizarJuego, jugarRuleta };
