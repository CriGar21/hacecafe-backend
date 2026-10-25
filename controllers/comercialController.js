const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const round = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function aplicarDescuentoPedido(req, res) {
  const id = Number(req.params.id);
  const porcentaje = Math.min(100, Math.max(0, Number(req.body.porcentaje || 0)));
  if (!Number.isFinite(porcentaje)) return res.status(400).json({ error: "Porcentaje inválido" });
  try {
    const pedido = await prisma.pedido.findUnique({ where: { id }, include: { items: true } });
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado" });
    if (pedido.cobrado || pedido.estado === "CANCELADO") return res.status(409).json({ error: "El pedido ya no admite descuentos" });
    const subtotal = Number(pedido.subtotal || pedido.items.reduce((a, i) => a + Number(i.subtotal), 0));
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
    const data = await prisma.promocion.create({ data: { nombre: nombre.trim(), descripcion: descripcion || null, imagenUrl: imagenUrl || null, tipo: tipo || "DESCUENTO", valor: Number(valor || 0), activa: activa !== false, mostrarMenu: mostrarMenu !== false, desde: desde ? new Date(desde) : null, hasta: hasta ? new Date(hasta) : null } });
    res.status(201).json(data);
  } catch { res.status(400).json({ error: "No se pudo crear la promoción" }); }
}

async function actualizarPromocion(req, res) {
  try {
    const data = { nombre: req.body.nombre, descripcion: req.body.descripcion, imagenUrl: req.body.imagenUrl, tipo: req.body.tipo, activa: req.body.activa, mostrarMenu: req.body.mostrarMenu };
    if (req.body.valor !== undefined) data.valor = Number(req.body.valor);
    if (req.body.desde !== undefined) data.desde = req.body.desde ? new Date(req.body.desde) : null;
    if (req.body.hasta !== undefined) data.hasta = req.body.hasta ? new Date(req.body.hasta) : null;
    res.json(await prisma.promocion.update({ where: { id: Number(req.params.id) }, data }));
  } catch { res.status(400).json({ error: "No se pudo actualizar la promoción" }); }
}

async function eliminarPromocion(req, res) {
  try { await prisma.promocion.update({ where: { id: Number(req.params.id) }, data: { activa: false, mostrarMenu: false } }); res.json({ ok: true }); }
  catch { res.status(400).json({ error: "No se pudo desactivar la promoción" }); }
}

module.exports = { aplicarDescuentoPedido, listarPromocionesPublicas, listarPromocionesAdmin, crearPromocion, actualizarPromocion, eliminarPromocion };
