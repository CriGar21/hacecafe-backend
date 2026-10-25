const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const stock = async (tx, productoId, cantidad) => {
  const r = await tx.producto.updateMany({ where: { id: productoId, disponible: true, stockActual: { gte: cantidad } }, data: { stockActual: { decrement: cantidad } } });
  if (r.count !== 1) throw new Error("Stock insuficiente");
};
const completo = { items: { include: { producto: true } }, usuario: true };
const tokenCliente = () => crypto.randomBytes(30).toString("hex");

async function validarPublico(id, token) {
  return prisma.pedido.findFirst({ where: { id: Number(id), clienteToken: token, cobrado: false }, include: { items: { include: { producto: true } } } });
}

const crearPedidoPublico = async (req, res) => {
  const { mesa, items, notas } = req.body;
  try {
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "El pedido debe contener al menos un producto" });
    const val = []; let total = 0;
    for (const i of items) {
      const cantidad = Number(i.cantidad); const producto = await prisma.producto.findUnique({ where: { id: Number(i.productoId) } });
      if (!producto || !producto.disponible) return res.status(400).json({ error: "Producto no disponible" });
      if (!Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ error: "Cantidad inválida" });
      if (producto.stockActual < cantidad) return res.status(400).json({ error: `Stock insuficiente de ${producto.nombre}` });
      const subtotal = Number(producto.precio) * cantidad; total += subtotal; val.push({ producto, cantidad, subtotal, notas: i.notas || null });
    }
    const last = await prisma.pedido.findFirst({ orderBy: { numero: "desc" } });
    const numero = (last?.numero || 0) + 1; const clienteToken = tokenCliente();
    const pedido = await prisma.$transaction(async tx => {
      const u = await tx.usuario.findFirst({ where: { activo: true }, orderBy: { id: "asc" } });
      if (!u) throw new Error("No hay usuario activo");
      const p = await tx.pedido.create({ data: { numero, usuarioId: u.id, mesa, notas: notas || null, total, clienteToken, estado: "ESPERANDO_APROBACION", items: { create: val.map(i => ({ productoId: i.producto.id, cantidad: i.cantidad, precioUnit: i.producto.precio, subtotal: i.subtotal, notas: i.notas })) } }, include: { items: { include: { producto: true } } } });
      for (const i of val) await stock(tx, i.producto.id, i.cantidad);
      return p;
    });
    req.io.emit("solicitud_cliente", pedido); res.status(201).json(pedido);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message === "Stock insuficiente" || e.message === "No hay usuario activo" ? e.message : "Error al crear pedido" }); }
};

const crearPedido = async (req, res) => {
  const { mesa, items, notas } = req.body;
  try {
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "El pedido debe contener al menos un producto" });
    const val = []; let total = 0;
    for (const i of items) {
      const cantidad = Number(i.cantidad); const producto = await prisma.producto.findUnique({ where: { id: Number(i.productoId) } });
      if (!producto || !producto.disponible || !Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ error: "Producto o cantidad inválida" });
      if (producto.stockActual < cantidad) return res.status(400).json({ error: `Stock insuficiente de ${producto.nombre}` });
      const subtotal = Number(producto.precio) * cantidad; total += subtotal; val.push({ producto, cantidad, subtotal, notas: i.notas || null });
    }
    const last = await prisma.pedido.findFirst({ orderBy: { numero: "desc" } }); const numero = (last?.numero || 0) + 1;
    const pedido = await prisma.$transaction(async tx => {
      const p = await tx.pedido.create({ data: { numero, usuarioId: req.usuario.id, mesa, notas: notas || null, total, items: { create: val.map(i => ({ productoId: i.producto.id, cantidad: i.cantidad, precioUnit: i.producto.precio, subtotal: i.subtotal, notas: i.notas })) } }, include: completo });
      for (const i of val) await stock(tx, i.producto.id, i.cantidad); return p;
    });
    req.io.emit("nuevo_pedido", pedido); res.status(201).json(pedido);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message === "Stock insuficiente" ? e.message : "Error al crear pedido" }); }
};

const obtenerPedidos = async (req, res) => { try { res.json(await prisma.pedido.findMany({ where: req.query.estado ? { estado: req.query.estado } : {}, include: completo, orderBy: { creadoEn: "desc" } })); } catch { res.status(500).json({ error: "Error al obtener pedidos" }); } };

const actualizarEstado = async (req, res) => {
  const validos = ["ESPERANDO_APROBACION", "PENDIENTE", "EN_PREPARACION", "LISTO", "ENTREGADO", "COBRADO", "CANCELADO"];
  if (!validos.includes(req.body.estado)) return res.status(400).json({ error: "Estado de pedido inválido" });
  try {
    const p = await prisma.$transaction(async tx => {
      const a = await tx.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } }); if (!a) throw new Error("Pedido no encontrado");
      if (req.body.estado === "CANCELADO" && a.estado !== "CANCELADO") for (const i of a.items) await tx.producto.update({ where: { id: i.productoId }, data: { stockActual: { increment: i.cantidad } } });
      return tx.pedido.update({ where: { id: a.id }, data: { estado: req.body.estado, solicitudCancelacion: false }, include: completo });
    });
    req.io.emit("pedido_actualizado", p); res.json(p);
  } catch (e) { res.status(500).json({ error: e.message || "Error al actualizar pedido" }); }
};

const obtenerPedidosPorMesa = async (req, res) => { try { res.json(await prisma.pedido.findMany({ where: { mesa: req.params.mesa, cobrado: false, estado: { notIn: ["CANCELADO"] } }, include: { items: { include: { producto: true } } }, orderBy: { creadoEn: "asc" } })); } catch { res.status(500).json({ error: "Error al obtener pedidos de mesa" }); } };
const obtenerPedidoPorNumero = async (req, res) => { try { const p = await prisma.pedido.findFirst({ where: { numero: Number(req.params.numero), cobrado: false }, include: { items: { include: { producto: true } } } }); if (!p) return res.status(404).json({ error: "Pedido no encontrado o ya cobrado" }); res.json([p]); } catch { res.status(500).json({ error: "Error al obtener pedido" }); } };

const aprobarPedido = async (req, res) => { try { const p = await prisma.pedido.update({ where: { id: Number(req.params.id) }, data: { estado: "PENDIENTE", solicitudCancelacion: false, solicitudModificacion: null }, include: completo }); req.io.emit("pedido_aprobado", p); req.io.emit("nuevo_pedido", p); res.json(p); } catch { res.status(500).json({ error: "Error al aprobar pedido" }); } };
const rechazarPedido = async (req, res) => {
  try {
    const p = await prisma.$transaction(async tx => {
      const a = await tx.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } }); if (!a) throw new Error("Pedido no encontrado"); if (a.estado === "CANCELADO") return a;
      const r = await tx.pedido.update({ where: { id: a.id }, data: { estado: "CANCELADO", solicitudCancelacion: false, solicitudModificacion: null }, include: completo });
      for (const i of a.items) await tx.producto.update({ where: { id: i.productoId }, data: { stockActual: { increment: i.cantidad } } }); return r;
    }); req.io.emit("pedido_rechazado", { pedidoId: p.id, motivo: req.body.motivo }); res.json(p);
  } catch { res.status(500).json({ error: "Error al rechazar pedido" }); }
};

const cobrarMesa = async (req, res) => {
  const { mesa, numeroPedido, metodoPago } = req.body;
  try {
    let pedidos = [];
    if (numeroPedido) { const p = await prisma.pedido.findFirst({ where: { numero: Number(numeroPedido), cobrado: false }, include: { items: { include: { producto: true } } } }); if (!p) return res.status(400).json({ error: "Pedido no encontrado o ya cobrado" }); pedidos = [p]; }
    else if (mesa) pedidos = await prisma.pedido.findMany({ where: { mesa, cobrado: false, estado: { notIn: ["CANCELADO"] } }, include: { items: { include: { producto: true } } } });
    else return res.status(400).json({ error: "Indicá mesa o número de pedido" });
    if (!pedidos.length) return res.status(400).json({ error: "No hay pedidos sin cobrar" });
    const totalCobrado = pedidos.reduce((a, p) => a + Number(p.total), 0);
    await prisma.$transaction(async tx => { for (const p of pedidos) await tx.pedido.update({ where: { id: p.id }, data: { cobrado: true, metodoPago: metodoPago || "EFECTIVO", estado: ["PENDIENTE", "EN_PREPARACION", "LISTO"].includes(p.estado) ? p.estado : "COBRADO" } }); });
    req.io.emit("mesa_cobrada", { mesa: mesa || null, pedidoIds: pedidos.map(p => p.id), totalCobrado, metodoPago: metodoPago || "EFECTIVO" });
    res.json({ mensaje: "Cobrado correctamente", mesa: mesa || null, numeroPedido: numeroPedido || null, totalCobrado, cantidadPedidos: pedidos.length, metodoPago: metodoPago || "EFECTIVO", pedidos });
  } catch { res.status(500).json({ error: "Error al cobrar" }); }
};

const modificarPedidoPublico = async (req, res) => {
  const p = await validarPublico(req.params.id, req.body?.token); if (!p) return res.status(403).json({ error: "No autorizado para modificar este pedido" });
  if (!["ESPERANDO_APROBACION", "PENDIENTE"].includes(p.estado)) return res.status(409).json({ error: "El pedido ya no puede modificarse en este estado" });
  const items = Array.isArray(req.body.items) ? req.body.items : []; if (!items.length) return res.status(400).json({ error: "El pedido debe contener al menos un producto" });
  try {
    const r = await prisma.$transaction(async tx => {
      const a = await tx.pedido.findUnique({ where: { id: p.id }, include: { items: true } }); if (!a || a.clienteToken !== req.body.token) throw new Error("No autorizado");
      const val = []; let total = 0;
      for (const i of items) { const cantidad = Number(i.cantidad); const prod = await tx.producto.findUnique({ where: { id: Number(i.productoId) } }); if (!prod || !prod.disponible || !Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Producto o cantidad inválida"); const anterior = a.items.filter(x => x.productoId === prod.id).reduce((s, x) => s + x.cantidad, 0); if (prod.stockActual + anterior < cantidad) throw new Error(`Stock insuficiente de ${prod.nombre}`); const subtotal = Number(prod.precio) * cantidad; total += subtotal; val.push({ prod, cantidad, subtotal, notas: i.notas || null }); }
      if (a.estado === "PENDIENTE") return tx.pedido.update({ where: { id: a.id }, data: { solicitudModificacion: { items, notas: req.body.notas ?? a.notas, total, creadoEn: new Date().toISOString() } }, include: completo });
      for (const old of a.items) await tx.producto.update({ where: { id: old.productoId }, data: { stockActual: { increment: old.cantidad } } });
      for (const i of val) await stock(tx, i.prod.id, i.cantidad);
      await tx.itemPedido.deleteMany({ where: { pedidoId: a.id } });
      return tx.pedido.update({ where: { id: a.id }, data: { total, notas: req.body.notas ?? a.notas, solicitudModificacion: null }, include: completo });
    });
    const solicitud = p.estado === "PENDIENTE"; req.io.emit(solicitud ? "solicitud_modificacion" : "pedido_modificado", r); res.status(solicitud ? 202 : 200).json({ ...r, mensaje: solicitud ? "La modificación quedó pendiente de aprobación" : "Pedido modificado correctamente" });
  } catch (e) { res.status(400).json({ error: e.message || "No se pudo modificar el pedido" }); }
};

const cancelarPedidoPublico = async (req, res) => {
  const p = await validarPublico(req.params.id, req.body?.token); if (!p) return res.status(403).json({ error: "No autorizado para cancelar este pedido" });
  if (!["ESPERANDO_APROBACION", "PENDIENTE", "EN_PREPARACION"].includes(p.estado)) return res.status(409).json({ error: "El pedido ya no puede cancelarse en este estado" });
  try {
    if (p.estado === "ESPERANDO_APROBACION") {
      const r = await prisma.$transaction(async tx => { const a = await tx.pedido.findUnique({ where: { id: p.id }, include: { items: true } }); const x = await tx.pedido.update({ where: { id: p.id }, data: { estado: "CANCELADO", solicitudCancelacion: false }, include: completo }); for (const i of a.items) await tx.producto.update({ where: { id: i.productoId }, data: { stockActual: { increment: i.cantidad } } }); return x; });
      req.io.emit("pedido_rechazado", { pedidoId: r.id, motivo: "Cancelado por el cliente" }); return res.json({ ...r, mensaje: "Pedido cancelado" });
    }
    const r = await prisma.pedido.update({ where: { id: p.id }, data: { solicitudCancelacion: true }, include: completo }); req.io.emit("solicitud_cancelacion", r); res.status(202).json({ ...r, mensaje: "La cancelación quedó pendiente de aprobación" });
  } catch (e) { res.status(400).json({ error: e.message || "No se pudo cancelar el pedido" }); }
};

const aprobarCancelacion = async (req, res) => {
  try {
    const r = await prisma.$transaction(async tx => { const a = await tx.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } }); if (!a?.solicitudCancelacion) throw new Error("No hay una solicitud de cancelación pendiente"); if (["CANCELADO", "COBRADO", "ENTREGADO", "LISTO"].includes(a.estado)) throw new Error("El pedido ya no puede cancelarse"); const x = await tx.pedido.update({ where: { id: a.id }, data: { estado: "CANCELADO", solicitudCancelacion: false }, include: completo }); for (const i of a.items) await tx.producto.update({ where: { id: i.productoId }, data: { stockActual: { increment: i.cantidad } } }); return x; }); req.io.emit("pedido_actualizado", r); res.json(r);
  } catch (e) { res.status(400).json({ error: e.message || "No se pudo aprobar la cancelación" }); }
};
const rechazarCancelacion = async (req, res) => { try { const r = await prisma.pedido.update({ where: { id: Number(req.params.id) }, data: { solicitudCancelacion: false }, include: completo }); req.io.emit("pedido_actualizado", r); res.json(r); } catch { res.status(400).json({ error: "No se pudo rechazar la cancelación" }); } };

const aprobarModificacion = async (req, res) => {
  try {
    const p = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } }); if (!p?.solicitudModificacion) return res.status(400).json({ error: "No hay una modificación pendiente" });
    const s = p.solicitudModificacion; const items = Array.isArray(s.items) ? s.items : [];
    const r = await prisma.$transaction(async tx => {
      const a = await tx.pedido.findUnique({ where: { id: p.id }, include: { items: true } }); const val = []; let total = 0;
      for (const i of items) { const cantidad = Number(i.cantidad); const prod = await tx.producto.findUnique({ where: { id: Number(i.productoId) } }); if (!prod || !prod.disponible || !Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Producto o cantidad inválida"); const anterior = a.items.filter(x => x.productoId === prod.id).reduce((z, x) => z + x.cantidad, 0); if (prod.stockActual + anterior < cantidad) throw new Error(`Stock insuficiente de ${prod.nombre}`); const subtotal = Number(prod.precio) * cantidad; total += subtotal; val.push({ prod, cantidad, subtotal, notas: i.notas || null }); }
      for (const old of a.items) await tx.producto.update({ where: { id: old.productoId }, data: { stockActual: { increment: old.cantidad } } }); for (const i of val) await stock(tx, i.prod.id, i.cantidad); await tx.itemPedido.deleteMany({ where: { pedidoId: a.id } }); return tx.pedido.update({ where: { id: a.id }, data: { total, notas: s.notas ?? a.notas, solicitudModificacion: null }, include: completo });
    }); req.io.emit("pedido_modificado", r); res.json(r);
  } catch (e) { res.status(400).json({ error: e.message || "No se pudo aprobar la modificación" }); }
};
const rechazarModificacion = async (req, res) => { try { const r = await prisma.pedido.update({ where: { id: Number(req.params.id) }, data: { solicitudModificacion: null }, include: completo }); req.io.emit("pedido_actualizado", r); res.json(r); } catch { res.status(400).json({ error: "No se pudo rechazar la modificación" }); } };

module.exports = { crearPedido, crearPedidoPublico, obtenerPedidos, actualizarEstado, obtenerPedidosPorMesa, obtenerPedidoPorNumero, cobrarMesa, aprobarPedido, rechazarPedido, modificarPedidoPublico, cancelarPedidoPublico, aprobarCancelacion, rechazarCancelacion, aprobarModificacion, rechazarModificacion };
