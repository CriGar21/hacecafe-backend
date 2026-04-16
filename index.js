const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Inyectar io en cada request para usarlo desde los controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Rutas
app.use("/auth", require("./routes/auth"));
app.use("/pedidos", require("./routes/pedidos"));

// Rutas de productos y categorías (sin autenticación por ahora)
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

// Socket.IO — conexiones en tiempo real
io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

// Ruta de salud
app.get("/", (req, res) => {
  res.json({ mensaje: "Servidor HaceCafe funcionando", version: "2.0" });
});

server.listen(PORT, () => {
  console.log(`Servidor HaceCafe corriendo en http://localhost:${PORT}`);
});
