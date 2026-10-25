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

app.use(cors({ origin: ["http://localhost:5173", "https://hacecafe-frontend.vercel.app", process.env.FRONTEND_URL].filter(Boolean), methods: ["GET", "POST", "PUT", "PATCH", "DELETE"], credentials: true }));
app.use(express.json());
app.use((req, res, next) => { req.io = io; next(); });

app.use("/auth", require("./routes/auth"));
app.use("/pedidos", require("./routes/pedidos"));
app.use("/admin", require("./routes/admin"));
app.use("/config", require("./routes/config"));
app.use("/comercial", require("./routes/comercial"));
app.use("/juegos", require("./routes/juegos"));

app.get("/categorias/todas", verificarToken, async (req, res) => {
  try { res.json(await prisma.categoria.findMany({ orderBy: { ordenDisplay: "asc" } })); }
  catch { res.status(500).json({ error: "Error" }); }
});

app.post("/categorias/nueva", verificarToken, soloRoles("DUENO", "EMPLEADO"), async (req, res) => {
  const { nombre, icono } = req.body;
  try { res.status(201).json(await prisma.categoria.create({ data: { nombre, icono } })); }
  catch { res.status(500).json({ error: "Error al crear categoría" }); }
});

app.get("/productos", async (req, res) => {
  try { res.json(await prisma.producto.findMany({ where: { disponible: true }, include: { categoria: true }, orderBy: { ordenDisplay: "asc" } })); }
  catch { res.status(500).json({ error: "Error al obtener productos" }); }
});

app.get("/categorias", async (req, res) => {
  try { res.json(await prisma.categoria.findMany({ where: { activa: true }, orderBy: { ordenDisplay: "asc" } })); }
  catch { res.status(500).json({ error: "Error al obtener categorías" }); }
});

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);
  socket.on("disconnect", () => console.log("Cliente desconectado:", socket.id));
});

app.get("/", (req, res) => res.json({ mensaje: "Servidor HaceCafe funcionando", version: "2.0" }));
server.listen(PORT, "0.0.0.0", () => console.log(`Servidor HaceCafe corriendo en puerto ${PORT}`));
