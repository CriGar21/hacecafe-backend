const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();
const { verificarToken, soloRoles } = require("./middlewares/auth");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());

app.use((req, res, next) => {
  req.io = io;
  next();
});

// Ruta pública — ANTES del router de pedidos protegido
app.post("/pedidos/publico", async (req, res) => {
  const { mesa, items, notas } = req.body;

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
        notas: item.notas || null,
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
          usuarioId: 1,
          mesa,
          notas,
          total,
          estado: "ESPERANDO_APROBACION",
          items: {
            create: itemsValidados.map((i) => ({
              productoId: i.producto.id,
              cantidad: i.cantidad,
              precioUnit: i.producto.precio,
              subtotal: i.subtotal,
              notas: i.notas || null,
            })),
          },
        },
        include: { items: { include: { producto: true } } },
      });

      for (const item of itemsValidados) {
        await tx.producto.update({
          where: { id: item.producto.id },
          data: { stockActual: { decrement: item.cantidad } },
        });
      }

      return nuevoPedido;
    });

    console.log("Emitiendo a", io.engine.clientsCount, "clientes conectados");
    io.emit("solicitud_cliente", pedido);

    res.status(201).json(pedido);
  } catch (error) {
    console.error("Error pedido publico:", error);
    res.status(500).json({ error: "Error al crear pedido" });
  }
});

// Rutas protegidas — DESPUÉS de la ruta pública
app.use("/auth", require("./routes/auth"));
app.use("/pedidos", require("./routes/pedidos"));
app.use("/admin", require("./routes/admin"));

app.get("/categorias/todas", verificarToken, async (req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: { ordenDisplay: "asc" },
    });
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.post(
  "/categorias/nueva",
  verificarToken,
  soloRoles("DUEÑO", "EMPLEADO"),
  async (req, res) => {
    const { nombre, icono } = req.body;
    try {
      const categoria = await prisma.categoria.create({
        data: { nombre, icono },
      });
      res.status(201).json(categoria);
    } catch (error) {
      res.status(500).json({ error: "Error al crear categoría" });
    }
  },
);

app.get("/productos", async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { disponible: true },
      include: { categoria: true },
      orderBy: { ordenDisplay: "asc" },
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener productos" });
  }
});

app.get("/categorias", async (req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({
      where: { activa: true },
      orderBy: { ordenDisplay: "asc" },
    });
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener categorías" });
  }
});

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

app.get("/", (req, res) => {
  res.json({ mensaje: "Servidor HaceCafe funcionando", version: "2.0" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor HaceCafe corriendo en puerto ${PORT}`);
});
