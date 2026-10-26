const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function aplicarDescuentoPedido(req, res) {
  const id = Number(req.params.id);
  const porcentajeRecibido = Number(req.body.porcentaje);
  if (!Number.isFinite(porcentajeRecibido) || porcentajeRecibido < 0 || porcentajeRecibido > 100) {
    return res.status(400).json({ error: "El descuento debe ser un porcentaje entre 0 y 100" });
  }
  const porcentaje = porcentajeRecibido;
  try {
    const pedido = await prisma.pedido.findUnique({ where: { id }, include: { items: true } });
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.cobrado || pedido.estado === "CANCELADO" || pedido.estado === "COBRADO") return res.status(409).json({ error: "El pedido ya no admite descuentos" });
    if (pedido.juegoJugado && req.body.origen !== "JUEGO") return res.status(409).json({ error: "Este pedido ya usó el juego; no se pueden combinar descuentos." });
    if (pedido.descuentoOrigen === "JUEGO" && req.body.origen !== "JUEGO") return res.status(409).json({ error: "El descuento de juego no se puede reemplazar ni combinar." });
    // Recalcular siempre desde los renglones del pedido: subtotal puede estar
    // vacío o desactualizado en pedidos creados antes de habilitar descuentos.
    const subtotal = round(pedido.items.reduce((s, item) => s + Number(item.subtotal || 0), 0));
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return res.status(400).json({ error: "No se pudo calcular el subtotal del pedido" });
    }
    const descuento = round(subtotal * porcentaje / 100);
    const total = round(subtotal - descuento);
    const actualizado = await prisma.pedido.update({ where: { id }, data: { subtotal, descuentoPorcentaje: porcentaje, descuentoMonto: descuento, descuentoMotivo: String(req.body.motivo || "Descuento manual").slice(0,160), descuentoOrigen: req.body.origen === "JUEGO" ? "JUEGO" : "MANUAL", descuentoCodigo: req.body.codigo || null, total }, include: { items: { include: { producto: true } }, usuario: true } });
    req.io?.emit("pedido_actualizado", actualizado);
    res.json(actualizado);
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo aplicar el descuento" }); }
}

async function listarPromocionesPublicas(req, res) {
  const ahora = new Date();
  try {
    const data = await prisma.promocion.findMany({ where: { activa: true, mostrarMenu: true, AND: [{ OR: [{ desde: null }, { desde: { lte: ahora } }] }, { OR: [{ hasta: null }, { hasta: { gte: ahora } }] }] }, orderBy: { creadoEn: "desc" } });
    res.json(data);
  } catch { res.status(500).json({ error: "No se pudieron cargar las promociones" }); }
}

async function listarPromocionesAdmin(req, res) {
  try { res.json(await prisma.promocion.findMany({ orderBy: { creadoEn: "desc" } })); }
  catch { res.status(500).json({ error: "No se pudieron cargar las promociones" }); }
}

async function crearPromocion(req, res) {
  const { nombre, descripcion, imagenUrl, tipo, valor, activa, mostrarMenu, desde, hasta } = req.body;
  if (!nombre?.trim()) return res.status(400).json({ error: "El nombre es obligatorio" });
  try {
    const tiposPermitidos = ["DESCUENTO", "MONTO_FIJO", "COMBO", "2X1", "REGALO", "INFORMATIVA"];
    const tipoSeguro = tipo || "DESCUENTO";
    const valorSeguro = Number(valor || 0);
    if (!tiposPermitidos.includes(tipoSeguro)) return res.status(400).json({ error: "Tipo de promoción inválido." });
    if (!Number.isFinite(valorSeguro) || valorSeguro < 0 || (tipoSeguro === "DESCUENTO" && valorSeguro > 100)) return res.status(400).json({ error: "El valor de la promoción no es válido." });
    const fechaDesde = desde ? new Date(desde) : null;
    const fechaHasta = hasta ? new Date(hasta) : null;
    if ((fechaDesde && Number.isNaN(fechaDesde.getTime())) || (fechaHasta && Number.isNaN(fechaHasta.getTime())) || (fechaDesde && fechaHasta && fechaHasta < fechaDesde)) return res.status(400).json({ error: "Revisá las fechas de vigencia." });
    const data = await prisma.promocion.create({ data: { nombre: nombre.trim(), descripcion: descripcion || null, imagenUrl: imagenUrl || null, tipo: tipoSeguro, valor: valorSeguro, activa: activa !== false, mostrarMenu: mostrarMenu !== false, desde: fechaDesde, hasta: fechaHasta } });
    res.status(201).json(data);
  } catch { res.status(400).json({ error: "No se pudo crear la promoción" }); }
}

async function actualizarPromocion(req, res) {
  try {
    const tiposPermitidos = ["DESCUENTO", "MONTO_FIJO", "COMBO", "2X1", "REGALO", "INFORMATIVA"];
    const data = {};
    for (const campo of ["nombre", "descripcion", "imagenUrl", "activa", "mostrarMenu"]) if (req.body[campo] !== undefined) data[campo] = req.body[campo];
    if (data.nombre !== undefined && !String(data.nombre).trim()) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (req.body.tipo !== undefined) {
      if (!tiposPermitidos.includes(req.body.tipo)) return res.status(400).json({ error: "Tipo de promoción inválido." });
      data.tipo = req.body.tipo;
    }
    if (req.body.valor !== undefined) {
      const valor = Number(req.body.valor);
      const tipo = req.body.tipo || (await prisma.promocion.findUnique({ where: { id: Number(req.params.id) }, select: { tipo: true } }))?.tipo;
      if (!Number.isFinite(valor) || valor < 0 || (tipo === "DESCUENTO" && valor > 100)) return res.status(400).json({ error: "El valor de la promoción no es válido." });
      data.valor = valor;
    }
    if (req.body.desde !== undefined) data.desde = req.body.desde ? new Date(req.body.desde) : null;
    if (req.body.hasta !== undefined) data.hasta = req.body.hasta ? new Date(req.body.hasta) : null;
    if ((data.desde && Number.isNaN(data.desde.getTime())) || (data.hasta && Number.isNaN(data.hasta.getTime()))) return res.status(400).json({ error: "Revisá las fechas de vigencia." });
    const existente = await prisma.promocion.findUnique({ where: { id: Number(req.params.id) }, select: { desde: true, hasta: true } });
    const desdeFinal = data.desde !== undefined ? data.desde : existente?.desde;
    const hastaFinal = data.hasta !== undefined ? data.hasta : existente?.hasta;
    if (desdeFinal && hastaFinal && hastaFinal < desdeFinal) return res.status(400).json({ error: "La fecha de fin debe ser posterior al inicio." });
    res.json(await prisma.promocion.update({ where: { id: Number(req.params.id) }, data }));
  } catch { res.status(400).json({ error: "No se pudo actualizar la promoción" }); }
}

async function eliminarPromocion(req, res) {
  try { await prisma.promocion.update({ where: { id: Number(req.params.id) }, data: { activa: false, mostrarMenu: false } }); res.json({ ok: true }); }
  catch { res.status(400).json({ error: "No se pudo desactivar la promoción" }); }
}

module.exports = { aplicarDescuentoPedido, listarPromocionesPublicas, listarPromocionesAdmin, crearPromocion, actualizarPromocion, eliminarPromocion };
