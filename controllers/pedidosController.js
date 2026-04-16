const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const crearPedido = async (req, res) => {
  const { mesa, items, notas } = req.body;
  const usuarioId = req.usuario.id;

  try {
    // Calcular total y verificar stock
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

    // Número de pedido autoincremental del día
    const ultimoPedido = await prisma.pedido.findFirst({
      orderBy: { numero: "desc" },
    });
    const numero = (ultimoPedido?.numero || 0) + 1;

    // Crear pedido con sus ítems en una sola transacción
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

      // Descontar stock de cada producto
      for (const item of itemsValidados) {
        await tx.producto.update({
          where: { id: item.producto.id },
          data: { stockActual: { decrement: item.cantidad } },
        });
      }

      return nuevoPedido;
    });

    // Emitir evento en tiempo real a la pantalla de cocina
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

    // Notificar cambio de estado en tiempo real
    req.io.emit("pedido_actualizado", pedido);

    res.json(pedido);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar pedido" });
  }
};

module.exports = { crearPedido, obtenerPedidos, actualizarEstado };
