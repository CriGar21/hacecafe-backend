const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const descontarStock = async (tx, item) => {
  const resultado = await tx.producto.updateMany({
    where: { id: item.producto.id, disponible: true, stockActual: { gte: item.cantidad } },
    data: { stockActual: { decrement: item.cantidad } },
  });
  if (resultado.count !== 1) throw new Error(`Stock insuficiente de ${item.producto.nombre}`);
};

const usuarioSistema = async (tx) => {
  const usuario = await tx.usuario.findFirst({ where: { activo: true }, orderBy: { id: "asc" } });
  if (!usuario) throw new Error("No hay un usuario activo para registrar el pedido");
  return usuario.id;
};

const crearTokenCliente = () => crypto.randomBytes(30).toString("hex");

const cargarPedidoCompleto = (tx, id) => tx.pedido.findUnique({
  where: { id },
  include: { items: { include: { producto: true } }, usuario: true },
});

const crearPedidoPublico = async (req, res) => {
  const { mesa, items, notas } = req.body;
  try {
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "El pedido debe contener al menos un producto" });
    let total = 0;
    const itemsValidados = [];
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ error: "Cantidad inválida" });
      const producto = await prisma.producto.findUnique({ where: { id: Number(item.productoId) } });
      if (!producto || !producto.disponible) return res.status(400).json({ error: "Producto no disponible" });
      if (producto.stockActual < cantidad) return res.status(400).json({ error: `Stock insuficiente de ${producto.nombre}` });
      const subtotal = Number(producto.precio) * cantidad;
      total += subtotal;
      itemsValidados.push({ producto, cantidad, subtotal, notas: item.notas || null });
    }
    const ultimoPedido = await prisma.pedido.findFirst({ orderBy: { numero: "desc" } });
    const numero = (ultimoPedido?.numero || 0) + 1;
    const clienteToken = crearTokenCliente();
    const pedido = await prisma.$transaction(async (tx) => {
      const usuarioId = await usuarioSistema(tx);
      const nuevoPedido = await tx.pedido.create({
        data: {
          numero, usuarioId, mesa, notas: notas || null, total, clienteToken,
          estado: "ESPERANDO_APROBACION",
          items: { create: itemsValidados.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad, precioUnit: i.producto.precio, subtotal: i.subtotal, notas: i.notas })) },
        },
        include: { items: { include: { producto: true } } },
      });
      for (const item of itemsValidados) await descontarStock(tx, item);
      return nuevoPedido;
    });
    req.io.emit("solicitud_cliente", pedido);
    res.status(201).json(pedido);
  } catch (error) {
    console.error(error);
    const mensaje = error.message?.startsWith("Stock insuficiente") || error.message?.startsWith("No hay un usuario") ? error.message : "Error al crear pedido";
    res.status(500).json({ error: mensaje });
  }
};

const crearPedido = async (req, res) => {
  const { mesa, items, notas } = req.body;
  const usuarioId = req.usuario.id;
  try {
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "El pedido debe contener al menos un producto" });
    let total = 0;
    const itemsValidados = [];
    for (const item of items) {
      const producto = await prisma.producto.findUnique({ where: { id: Number(item.productoId) } });
      const cantidad = Number(item.cantidad);
      if (!producto || !producto.disponible) return res.status(400).json({ error: `Producto ${item.productoId} no disponible` });
      if (!Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ error: "Cantidad inválida" });
      if (producto.stockActual < cantidad) return res.status(400).json({ error: `Stock insuficiente de ${producto.nombre}` });
      const subtotal = Number(producto.precio) * cantidad;
      total += subtotal;
      itemsValidados.push({ producto, cantidad, subtotal, notas: item.notas || null });
    }
    const ultimoPedido = await prisma.pedido.findFirst({ orderBy: { numero: "desc" } });
    const numero = (ultimoPedido?.numero || 0) + 1;
    const pedido = await prisma.$transaction(async (tx) => {
      const nuevoPedido = await tx.pedido.create({ data: { numero, usuarioId, mesa, notas: notas || null, total, items: { create: itemsValidados.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad, precioUnit: i.producto.precio, subtotal: i.subtotal, notas: i.notas })) } }, include: { items: { include: { producto: true } }, usuario: true } });
      for (const item of itemsValidados) await descontarStock(tx, item);
      return nuevoPedido;
    });
    req.io.emit("nuevo_pedido", pedido);
    res.status(201).json(pedido);
  } catch (error) {
    console.error(error);
    const mensaje = error.message?.startsWith("Stock insuficiente") ? error.message : "Error al crear pedido";
    res.status(500).json({ error: mensaje });
  }
};

const obtenerPedidos = async (req, res) => {
  const { estado } = req.query;
  try {
    const pedidos = await prisma.pedido.findMany({ where: estado ? { estado } : {}, include: { items: { include: { producto: true } }, usuario: true }, orderBy: { creadoEn: "desc" } });
    res.json(pedidos);
  } catch (error) { res.status(500).json({ error: "Error al obtener pedidos" }); }
};

const actualizarEstado = async (req, res) => {
  const { id } = req.params; const { estado } = req.body;
  const estadosValidos = ["ESPERANDO_APROBACION", "PENDIENTE", "EN_PREPARACION", "LISTO", "ENTREGADO", "COBRADO", "CANCELADO"];
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: "Estado de pedido inválido" });
  try {
    const pedido = await prisma.$transaction(async (tx) => {
      const actual = await tx.pedido.findUnique({ where: { id: Number(id) }, include: { items: true } });
      if (!actual) throw new Error("Pedido no encontrado");
      if (actual.estado !== "CANCELADO" && estado === "CANCELADO") {
        for (const item of actual.items) await tx.producto.update({ where: { id: item.productoId }, data: { stockActual: { increment: item.cantidad } } });
      }
      return tx.pedido.update({ where: { id: actual.id }, data: { estado, solicitudCancelacion: false }, include: { items: { include: { producto: true } } } });
    });
    req.io.emit("pedido_actualizado", pedido); res.json(pedido);
  } catch (error) { res.status(500).json({ error: error.message === "Pedido no encontrado" ? error.message : "Error al actualizar pedido" }); }
};

const obtenerPedidosPorMesa = async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({ where: { mesa: req.params.mesa, cobrado: false, estado: { notIn: ["CANCELADO"] } }, include: { items: { include: { producto: true } } }, orderBy: { creadoEn: "asc" } });
    res.json(pedidos);
  } catch (error) { res.status(500).json({ error: "Error al obtener pedidos de mesa" }); }
};

const aprobarPedido = async (req, res) => {
  try {
    const pedido = await prisma.pedido.update({ where: { id: Number(req.params.id) }, data: { estado: "PENDIENTE", solicitudCancelacion: false, solicitudModificacion: null }, include: { items: { include: { producto: true } }, usuario: true } });
    req.io.emit("pedido_aprobado", pedido); req.io.emit("nuevo_pedido", pedido); res.json(pedido);
  } catch (error) { res.status(500).json({ error: "Error al aprobar pedido" }); }
};

const rechazarPedido = async (req, res) => {
  const { motivo } = req.body;
  try {
    const pedido = await prisma.$transaction(async (tx) => {
      const actual = await tx.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
      if (!actual) throw new Error("Pedido no encontrado");
      if (actual.estado === "CANCELADO") return actual;
      const actualizado = await tx.pedido.update({ where: { id: actual.id }, data: { estado: "CANCELADO", solicitudCancelacion: false, solicitudModificacion: null }, include: { items: true } });
      for (const item of actual.items) await tx.producto.update({ where: { id: item.productoId }, data: { stockActual: { increment: item.cantidad } });
      return actualizado;
    });
    req.io.emit("pedido_rechazado", { pedidoId: pedido.id, motivo }); res.json(pedido);
  } catch (error) { console.error(error); res.status(500).json({ error: "Error al rechazar pedido" }); }
};

const obtenerPedidoPorNumero = async (req, res) => {
  try {
    const pedido = await prisma.pedido.findFirst({ where: { numero: Number(req.params.numero), cobrado: false }, include: { items: { include: { producto: true } } } });
    if (!pedido) return res.status(404).json({ error: "Pedido no encontrado o ya cobrado" });
    res.json([pedido]);
  } catch (error) { res.status(500).json({ error: "Error al obtener pedido" }); }
};

const cobrarMesa = async (req, res) => {
  const { mesa, numeroPedido, metodoPago } = req.body;
  try {
    let pedidos = [];
    if (numeroPedido) {
      const pedido = await prisma.pedido.findFirst({ where: { numero: Number(numeroPedido), cobrado: false }, include: { items: { include: { producto: true } } } });
      if (!pedido) return res.status(400).json({ error: "Pedido no encontrado o ya cobrado" });
      pedidos = [pedido];
    } else if (mesa) {
      pedidos = await prisma.pedido.findMany({ where: { mesa, cobrado: false, estado: { notIn: ["CANCELADO"] } }, include: { items: { include: { producto: true } } } });
      if (!pedidos.length) return res.status(400).json({ error: "No hay pedidos sin cobrar en esta mesa" });
    } else return res.status(400).json({ error: "Indicá mesa o número de pedido" });
    const totalCobrado = pedidos.reduce((acc, p) => acc + Number(p.total), 0);
    await prisma.$transaction(async (tx) => {
      for (const pedido of pedidos) await tx.pedido.update({ where: { id: pedido.id }, data: { cobrado: true, metodoPago: metodoPago || "EFECTIVO", estado: ["PENDIENTE", "EN_PREPARACION", "LISTO"].includes(pedido.estado) ? pedido.estado : "COBRADO" } });
    });
    req.io.emit("mesa_cobrada", { mesa: mesa || null, pedidoIds: pedidos.map((p) => p.id), totalCobrado, metodoPago: metodoPago || "EFECTIVO" });
    res.json({ mensaje: "Cobrado correctamente", mesa: mesa || null, numeroPedido: numeroPedido || null, totalCobrado, cantidadPedidos: pedidos.length, metodoPago: metodoPago || "EFECTIVO", pedidos });
  } catch (error) { console.error(error); res.status(500).json({ error: "Error al cobrar" }); }
};

const validarCliente = async (id, token) => {
  if (!token) return null;
  return prisma.pedido.findFirst({ where: { id: Number(id), clienteToken: token, cobrado: false }, include: { items: { include: { producto: true } } } });
};

const modificarPedidoPublico = async (req, res) => {
  const pedido = await validarCliente(req.params.id, req.body?.token);
  if (!pedido) return res.status(403).json({ error: "No autorizado para modificar este pedido" });
  if (!["ESPERANDO_APROBACION", "PENDIENTE"].includes(pedido.estado)) return res.status(409).json({ error: "El pedido ya no puede modificarse en este estado" });
  const nuevosItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!nuevosItems.length) return res.status(400).json({ error: "El pedido debe contener al menos un producto" });
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const actual = await tx.pedido.findUnique({ where: { id: pedido.id }, include: { items: true } });
      if (!actual || actual.clienteToken !== req.body.token || actual.cobrado) throw new Error("No autorizado");
      const validados = [];
      let total = 0;
      for (const item of nuevosItems) {
        const cantidad = Number(item.cantidad);
        if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Cantidad inválida");
        const producto = await tx.producto.findUnique({ where: { id: Number(item.productoId) } });
        if (!producto || !producto.disponible) throw new Error("Producto no disponible");
        const anterior = actual.items.filter((x) => x.productoId === producto.id).reduce((a, x) => a + x.cantidad, 0);
        const nuevaTotalProducto = cantidad;
        if (producto.stockActual + anterior < nuevaTotalProducto) throw new Error(`Stock insuficiente de ${producto.nombre}`);
        const subtotal = Number(producto.precio) * cantidad;
        total += subtotal;
        validados.push({ producto, cantidad, subtotal, notas: item.notas || null });
      }
      if (actual.estado === "PENDIENTE") {
        const solicitud = { items: nuevosItems, notas: req.body.notas ?? actual.notas ?? null, total, creadoEn: new Date().toISOString() };
        return tx.pedido.update({ where: { id: actual.id }, data: { solicitudModificacion: solicitud }, include: { items: { include: { producto: true } } } });
      }
      for (const viejo of actual.items) await tx.producto.update({ where: { id: viejo.productoId }, data: { stockActual: { increment: viejo.cantidad } } });
      for (const item of validados) await descontarStock(tx, item);
      await tx.itemPedido.deleteMany({ where: { pedidoId: actual.id } });
      return tx.pedido.update({ where: { id: actual.id }, data: { total, notas: req.body.notas ?? actual.notas, solicitudModificacion: null }, include: { items: { include: { producto: true } } } });
    });
    const esSolicitud = pedido.estado === "PENDIENTE";
    req.io.emit(esSolicitud ? "solicitud_modificacion" : "pedido_modificado", resultado);
    res.status(esSolicitud ? 202 : 200).json({ ...resultado, mensaje: esSolicitud ? "La modificación quedó pendiente de aprobación" : "Pedido modificado correctamente" });
  } catch (error) {
    res.status(400).json({ error: error.message || "No se pudo modificar el pedido" });
  }
};

const cancelarPedidoPublico = async (req, res) => {
  const pedido = await validarCliente(req.params.id, req.body?.token);
  if (!pedido) return res.status(403).json({ error: "No autorizado para cancelar este pedido" });
  if (!["ESPERANDO_APROBACION", "PENDIENTE", "EN_PREPARACION"].includes(pedido.estado)) return res.status(409).json({ error: "El pedido ya no puede cancelarse en este estado" });
  try {
    if (pedido.estado === "ESPERANDO_APROBACION") {
      const cancelado = await prisma.$transaction(async (tx) => {
        const actual = await tx.pedido.findUnique({ where: { id: pedido.id }, include: { items: true } });
        if (!actual || actual.clienteToken !== req.body.token || actual.cobrado) throw new Error("No autorizado");
        const result = await tx.pedido.update({ where: { id: actual.id }, data: { estado: "CANCELADO", solicitudCancelacion: false }, include: { items: { include: { producto: true } } } });
        for (const item of actual.items) await tx.producto.update({ where: { id: item.productoId }, data: { stockActual: { increment: item.cantidad } } });
        return result;
      });
      req.io.emit("pedido_rechazado", { pedidoId: cancelado.id, motivo: "Cancelado por el cliente" });
      return res.json({ ...cancelado, mensaje: "Pedido cancelado" });
    }
    const solicitud = await prisma.pedido.update({ where: { id: pedido.id }, data: { solicitudCancelacion: true }, include: { items: { include: { producto: true } } } });
    req.io.emit("solicitud_cancelacion", solicitud);
    res.status(202).json({ ...solicitud, mensaje: "La cancelación quedó pendiente de aprobación" });
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo cancelar el pedido" }); }
};

const aprobarCancelacionPublica = async (req, res) => {
  try {
    const cancelado = await prisma.$transaction(async (tx) => {
      const actual = await tx.pedido.findUnique({ where: { id: Number(req.params.id) }, include: { items: true } });
      if (!actual) throw new Error("Pedido no encontrado");
      if (!actual.solicitudCancelacion) throw new Error("No hay una solicitud de cancelación pendiente");
      if (["CANCELADO", "COBRADO", "ENTREGADO", "LISTO"].includes(actual.estado)) throw new Error("El pedido ya no puede cancelarse");
      const result = await tx.pedido.update({ where: { id: actual.id }, data: { estado: "CANCELADO", solicitudCancelacion: false }, include: { items: { include: { producto: true } } } });
      for (const item of actual.items) await tx.producto.update({ where: { id: item.productoId }, data: { stockActual: { increment: item.cantidad } } });
      return result;
    });
    req.io.emit("pedido_actualizado", cancelado); req.io.emit("pedido_cancelado", cancelado);
    res.json(cancelado);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo aprobar la cancelación" }); }
};

const rechazarCancelacionPublica = async (req, res) => {
  try {
    const pedido = await prisma.pedido.update({ where: { id: Number(req.params.id) }, data: { solicitudCancelacion: false }, include: { items: { include: { producto: true } } } });
    req.io.emit("pedido_actualizado", pedido);
    res.json(pedido);
  } catch (error) { res.status(400).json({ error: "No se pudo rechazar la cancelación" }); }
};

const aprobarModificacionPublica = async (req, res) => {
  try {
    const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) } });
    if (!pedido?.solicitudModificacion) return res.status(400).json({ error: "No hay una modificación pendiente" });
    const solicitud = pedido.solicitudModificacion;
    const items = Array.isArray(solicitud.items) ? solicitud.items : [];
    const resultado = await prisma.$transaction(async (tx) => {
      const actual = await tx.pedido.findUnique({ where: { id: pedido.id }, include: { items: true } });
      const validados = []; let total = 0;
      for (const item of items) {
        const cantidad = Number(item.cantidad); const producto = await tx.producto.findUnique({ where: { id: Number(item.productoId) } });
        if (!producto || !producto.disponible || !Number.isInteger(cantidad) || cantidad <= 0) throw new Error("Producto o cantidad inválida");
        const anterior = actual.items.filter((x) => x.productoId === producto.id).reduce((a, x) => a + x.cantidad, 0);
        if (producto.stockActual + anterior < cantidad) throw new Error(`Stock insuficiente de ${producto.nombre}`);
        const subtotal = Number(producto.precio) * cantidad; total += subtotal; validados.push({ producto, cantidad, subtotal, notas: item.notas || null });
      }
      for (const viejo of actual.items) await tx.producto.update({ where: { id: viejo.productoId }, data: { stockActual: { increment: viejo.cantidad } } });
      for (const item of validados) await descontarStock(tx, item);
      await tx.itemPedido.deleteMany({ where: { pedidoId: actual.id } });
      return tx.pedido.update({ where: { id: actual.id }, data: { total, notas: solicitud.notas ?? actual.notas, solicitudModificacion: null }, include: { items: { include: { producto: true } } } });
    });
    req.io.emit("pedido_modificado", resultado);
    res.json(resultado);
  } catch (error) { res.status(400).json({ error: error.message || "No se pudo aprobar la modificación" }); }
};

const rechazarModificacionPublica = async (req, res) => {
  try {
    const pedido = await prisma.pedido.update({ where: { id: Number(req.params.id) }, data: { solicitudModificacion: null }, include: { items: { include: { producto: true } } } });
    req.io.emit("pedido_actualizado", pedido);
    res.json(pedido);
  } catch (error) { res.status(400).json({ error: "No se pudo rechazar la modificación" }); }
};

module.exports = {
  crearPedido, crearPedidoPublico, obtenerPedidos, actualizarEstado, obtenerPedidosPorMesa, obtenerPedidoPorNumero,
  cobrarMesa, aprobarPedido, rechazarPedido, modificarPedidoPublico, cancelarPedidoPublico,
  aprobarCancelacionPublica, rechazarCancelacionPublica, aprobarModificacionPublica, rechazarModificacionPublica,
};
