// dotenv va primero: middlewares/auth.js lee JWT_SECRET al cargarse.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const prisma = require("./lib/prisma");
const { ErrorNegocio } = require("./lib/errores");
const {
  decodificarToken,
  cargarUsuarioActivo,
  esStaff,
} = require("./middlewares/auth");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Detrás de un proxy (Render, Railway, Fly...) para que el límite de peticiones
// vea la IP real del cliente y no la del proxy. Quítalo si corres sin proxy.
app.set("trust proxy", 1);

// ---------------------------------------------------------------------
// Origins: un solo lugar para Express y Socket.IO
// ---------------------------------------------------------------------
const allowedOrigins = [
  "http://localhost:5173",
  "https://hacecafe-frontend.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());

// ---------------------------------------------------------------------
// Socket.IO
//  - Quien conecta con un JWT válido de DUENO/EMPLEADO/COCINA entra a la sala "staff"
//    y recibe los pedidos completos.
//  - Los demás (clientes) pueden conectarse, pero solo reciben resúmenes.
//  - Frontend del personal: io(API_URL, { auth: { token } })
//  - Para la demo, si el frontend todavía no envía el token:
//    SOCKET_ABIERTO=true en .env devuelve el comportamiento anterior.
// ---------------------------------------------------------------------
const SOCKET_ABIERTO = process.env.SOCKET_ABIERTO === "true";

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

io.on("connection", async (socket) => {
  const token = socket.handshake.auth?.token;

  if (token) {
    try {
      // Se consulta la cuenta real: un usuario desactivado no entra a "staff"
      const usuario = await cargarUsuarioActivo(decodificarToken(token));
      if (!usuario) {
        socket.emit("auth_error", "CUENTA_INACTIVA");
      } else if (esStaff(usuario)) {
        socket.join("staff");
        // Sala propia: permite cortarle el socket si luego lo desactivan
        socket.join(`usuario:${usuario.id}`);
      }
    } catch (error) {
      // El frontend puede escuchar "auth_error" y llevar al login
      socket.emit(
        "auth_error",
        error.name === "TokenExpiredError" ? "TOKEN_EXPIRADO" : "TOKEN_INVALIDO",
      );
    }
  }

  if (SOCKET_ABIERTO) socket.join("staff");
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

// ---------------------------------------------------------------------
// Rutas
// (/pedidos/publico vive solo en routes/pedidos.js: se borró la copia de aquí)
// ---------------------------------------------------------------------
app.get("/", (req, res) => {
  res.json({ mensaje: "Servidor HaceCafe funcionando", version: "2.0" });
});

app.use("/auth", require("./routes/auth"));
app.use("/pedidos", require("./routes/pedidos"));
app.use("/admin", require("./routes/admin"));
app.use("/config", require("./routes/config"));
app.use("/fichajes", require("./routes/fichaje"));
app.use("/comercial", require("./routes/comercial"));
app.use("/juegos", require("./routes/juegos"));
app.use(require("./routes/catalogo")); // /productos, /categorias...

app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// ---------------------------------------------------------------------
// Manejador central de errores
// (Express 5 reenvía aquí los errores de funciones async)
// ---------------------------------------------------------------------
app.use((error, req, res, next) => {
  if (error instanceof ErrorNegocio) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "JSON inválido" });
  }
  if (error.code === "P2025") {
    return res.status(404).json({ error: "No encontrado" });
  }
  if (error.code === "P2003") {
    return res.status(400).json({ error: "Referencia inválida (no existe)" });
  }
  if (error.code === "P2000") {
    return res.status(400).json({ error: "Un valor es demasiado largo" });
  }
  if (error.name === "PrismaClientValidationError") {
    return res.status(400).json({ error: "Datos inválidos" });
  }
  console.error(error);
  res.status(500).json({ error: "Error interno del servidor" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor HaceCafe corriendo en puerto ${PORT}`);
});

const cerrar = async () => {
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
