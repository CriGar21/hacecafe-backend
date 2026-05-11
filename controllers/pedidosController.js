const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const crearPedidoPublico = async (req, res) => {
  const { mesa, items } = req.body;

  try {
    let total = 0;
    const itemsValidados = [];

    for (const item of items) {
      const producto = await prisma.producto.findUnique({
        where: { id: item.productoId },
      });

      if (!producto || !producto.disponible) {
        return res.status(400).json({ error: "Producto no disponible" });
      }

      const subtotal = Number(producto.precio) * item.cantidad;
      total += subtotal;

      itemsValidados.push({
        producto,
        cantidad: item.cantidad,
        subtotal,
        notas: item.notas,
      });
    }

    const ultimoPedido = await prisma.pedido.findFirst({
      orderBy: { numero: "desc" },
    });

    const numero = (ultimoPedido?.numero || 0) + 1;

    const pedido = await prisma.pedido.create({
      data: {
        numero,
        mesa,
        total,
        estado: "ESPERANDO_APROBACION",
        items: {
          create: itemsValidados.map((i) => ({
            productoId: i.producto.id,
            cantidad: i.cantidad,
            precioUnit: i.producto.precio,
            subtotal: i.subtotal,
            notas: i.notas,
          })),
        },
      },
      include: {
        items: { include: { producto: true } },
      },
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
    let total = 0;
    const itemsValidados = [];

    for (const item of items) {
      const producto = await prisma.producto.findUnique({
        where: { id: item.productoId },
      });
      if (!producto || !producto.disponible) {
        return res
          .status(400)
          .json({ error: `Producto ${item.productoId} no disponible` });
      }
      if (producto.stockActual < item.cantidad) {
        return res
          .status(400)
          .json({ error: `Stock insuficiente de ${producto.nombre}` });
      }
      const subtotal = Number(producto.precio) * item.cantidad;
      total += subtotal;
      itemsValidados.push({
        producto,
        cantidad: item.cantidad,
        subtotal,
        notas: item.notas,
      });
    }

    const ultimoPedido = await prisma.pedido.findFirst({
      orderBy: { numero: "desc" },
    });
    const numero = (ultimoPedido?.numero || 0) + 1;

    const pedido = await prisma.$transaction(async (tx) => {
      const nuevoPedido = await tx.pedido.create({
        data: {
          numero,
          usuarioId,
          mesa,
          notas,
          total,
          items: {
            create: itemsValidados.map((i) => ({
              productoId: i.producto.id,
              cantidad: i.cantidad,
              precioUnit: i.producto.precio,
              subtotal: i.subtotal,
              notas: i.notas,
            })),
          },
        },
        include: { items: { include: { producto: true } }, usuario: true },
      });

      for (const item of itemsValidados) {
        await tx.producto.update({
          where: { id: item.producto.id },
          data: { stockActual: { decrement: item.cantidad } },
        });
      }

      return nuevoPedido;
    });

    req.io.emit("nuevo_pedido", pedido);
    res.status(201).json(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear pedido" });
  }
};

const obtenerPedidos = async (req, res) => {
  const { estado } = req.query;
  try {
    const pedidos = await prisma.pedido.findMany({
      where: estado ? { estado } : {},
      include: { items: { include: { producto: true } }, usuario: true },
      orderBy: { creadoEn: "desc" },
    });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
};

const actualizarEstado = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  try {
    const pedido = await prisma.pedido.update({
      where: { id: Number(id) },
      data: { estado },
      include: { items: { include: { producto: true } } },
    });
    req.io.emit("pedido_actualizado", pedido);
    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar pedido" });
  }
};

const obtenerPedidosPorMesa = async (req, res) => {
  const { mesa } = req.params;
  try {
    const pedidos = await prisma.pedido.findMany({
      where: { mesa, cobrado: false, estado: { notIn: ["CANCELADO"] } },
      include: { items: { include: { producto: true } } },
      orderBy: { creadoEn: "asc" },
    });
    res.json(pedidos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener pedidos de mesa" });
  }
};

const aprobarPedido = async (req, res) => {
  const { id } = req.params;
  try {
    const pedido = await prisma.pedido.update({
      where: { id: Number(id) },
      data: { estado: "PENDIENTE" },
      include: { items: { include: { producto: true } }, usuario: true },
    });
    req.io.emit("pedido_aprobado", pedido);
    req.io.emit("nuevo_pedido", pedido);
    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: "Error al aprobar pedido" });
  }
};

const rechazarPedido = async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  try {
    const pedido = await prisma.pedido.update({
      where: { id: Number(id) },
      data: { estado: "CANCELADO" },
      include: { items: { include: { producto: true } } },
    });
    // Devolver stock
    await prisma.$transaction(async (tx) => {
      for (const item of pedido.items) {
        await tx.producto.update({
          where: { id: item.productoId },
          data: { stockActual: { increment: item.cantidad } },
        });
      }
    });
    req.io.emit("pedido_rechazado", { pedidoId: pedido.id, motivo });
    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: "Error al rechazar pedido" });
  }
};

const obtenerPedidoPorNumero = async (req, res) => {
  const { numero } = req.params;
  try {
    const pedido = await prisma.pedido.findFirst({
      where: { numero: Number(numero), cobrado: false },
      include: { items: { include: { producto: true } } },
    });
    if (!pedido)
      return res
        .status(404)
        .json({ error: "Pedido no encontrado o ya cobrado" });
    res.json([pedido]);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener pedido" });
  }
};

const cobrarMesa = async (req, res) => {
  const { mesa, numeroPedido, metodoPago } = req.body;
  const usuarioId = req.usuario.id;

  try {
    let pedidos = [];

    if (numeroPedido) {
      const pedido = await prisma.pedido.findFirst({
        where: { numero: Number(numeroPedido), cobrado: false },
        include: { items: { include: { producto: true } } },
      });
      if (!pedido)
        return res
          .status(400)
          .json({ error: "Pedido no encontrado o ya cobrado" });
      pedidos = [pedido];
    } else if (mesa) {
      pedidos = await prisma.pedido.findMany({
        where: { mesa, cobrado: false, estado: { notIn: ["CANCELADO"] } },
        include: { items: { include: { producto: true } } },
      });
      if (pedidos.length === 0) {
        return res
          .status(400)
          .json({ error: "No hay pedidos sin cobrar en esta mesa" });
      }
    } else {
      return res.status(400).json({ error: "Indicá mesa o número de pedido" });
    }

    const totalCobrado = pedidos.reduce((acc, p) => acc + Number(p.total), 0);

    await prisma.$transaction(async (tx) => {
      for (const pedido of pedidos) {
        await tx.pedido.update({
          where: { id: pedido.id },
          data: {
            cobrado: true,
            metodoPago: metodoPago || "EFECTIVO",
            // Solo marca COBRADO si ya fue entregado, sino mantiene su estado
            estado: ["PENDIENTE", "EN_PREPARACION", "LISTO"].includes(
              pedido.estado,
            )
              ? pedido.estado // mantener el estado actual para que cocina lo siga viendo
              : "COBRADO",
          },
        });
      }
    });

    req.io.emit("mesa_cobrada", {
      mesa: mesa || null,
      pedidoIds: pedidos.map((p) => p.id),
      totalCobrado,
      metodoPago,
    });

    res.json({
      mensaje: "Cobrado correctamente",
      mesa: mesa || null,
      numeroPedido: numeroPedido || null,
      totalCobrado,
      cantidadPedidos: pedidos.length,
      metodoPago,
      pedidos,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al cobrar" });
  }
};

module.exports = {
  crearPedido,
  crearPedidoPublico,
  obtenerPedidos,
  actualizarEstado,
  obtenerPedidosPorMesa,
  obtenerPedidoPorNumero,
  cobrarMesa,
  aprobarPedido,
  rechazarPedido,
};
