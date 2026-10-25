const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const crearPedidoPublico = async (req, res) => {
  const { mesa, items, notas } = req.body;
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "El pedido debe contener al menos un producto" });
    }
    let total = 0;
    const itemsValidados = [];
    for (const item of items) {
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        return res.status(400).json({ error: "Cantidad inválida" });
      }
      const producto = await prisma.producto.findUnique({ where: { id: Number(item.productoId) } });
      if (!producto || !producto.disponible) return res.status(400).json({ error: "Producto no disponible" });
      if (producto.stockActual < cantidad) return res.status(400).json({ error: `Stock insuficiente de ${producto.nombre}` });
      const subtotal = Number(producto.precio) * cantidad;
      total += subtotal;
      itemsValidados.push({ producto, cantidad, subtotal, notas: item.notas || null });
    }
    const ultimoPedido = await prisma.pedido.findFirst({ orderBy: { numero: "desc" } });
    const numero = (ultimoPedido?.numero || 0) + 1;
    const pedido = await prisma.$transaction(async (tx) => {
      const nuevoPedido = await tx.pedido.create({
        data: {
          numero,
          usuarioId: 1,
          mesa,
          notas: notas || null,
          total,
          estado: "ESPERANDO_APROBACION",
          items: { create: itemsValidados.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad, precioUnit: i.producto.precio, subtotal: i.subtotal, notas: i.notas })) },
        },
        include: { items: { include: { producto: true } } },
      });
      for (const item of itemsValidados) {
        await tx.producto.update({ where: { id: item.producto.id }, data: { stockActual: { decrement: item.cantidad } } });
      }
      return nuevoPedido;
    });
    req.io.emit("solicitud_cliente", pedido);
    res.status(201).json(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear pedido" });
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
      const nuevoPedido = await tx.pedido.create({
        data: { numero, usuarioId, mesa, notas: notas || null, total, items: { create: itemsValidados.map((i) => ({ productoId: i.producto.id, cantidad: i.cantidad, precioUnit: i.producto.precio, subtotal: i.subtotal, notas: i.notas })) } },
        include: { items: { include: { producto: true } }, usuario: true },
      });
      for (const item of itemsValidados) await tx.producto.update({ where: { id: item.producto.id }, data: { stockActual: { decrement: item.cantidad } } });
      return nuevoPedido;
    });
    req.io.emit("nuevo_pedido", pedido);
    res.status(201).json(pedido);
  } catch (error) { console.error(error); res.status(500).json({ error: "Error al crear pedido" }); }
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
  try {
    const pedido = await prisma.pedido.update({ where: { id: Number(id) }, data: { estado }, include: { items: { include: { producto: true } } } });
    req.io.emit("pedido_actualizado", pedido); res.json(pedido);
  } catch (error) { res.status(500).json({ error: "Error al actualizar pedido" }); }
};

const obtenerPedidosPorMesa = async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({ where: { mesa: req.params.mesa, cobrado: false, estado: { notIn: ["CANCELADO"] } }, include: { items: { include: { producto: true } } }, orderBy: { creadoEn: "asc" } });
    res.json(pedidos);
  } catch (error) { res.status(500).json({ error: "Error al obtener pedidos de mesa" }); }
};

const aprobarPedido = async (req, res) => {
  try {
    const pedido = await prisma.pedido.update({ where: { id: Number(req.params.id) }, data: { estado: "PENDIENTE" }, include: { items: { include: { producto: true } }, usuario: true } });
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
      const actualizado = await tx.pedido.update({ where: { id: actual.id }, data: { estado: "CANCELADO" }, include: { items: true } });
      for (const item of actual.items) await tx.producto.update({ where: { id: item.productoId }, data: { stockActual: { increment: item.cantidad } } });
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

module.exports = { crearPedido, crearPedidoPublico, obtenerPedidos, actualizarEstado, obtenerPedidosPorMesa, obtenerPedidoPorNumero, cobrarMesa, aprobarPedido, rechazarPedido };
