require("dotenv").config();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("./lib/prisma");

// Se puede ejecutar varias veces: solo crea lo que falta.

async function crearDueno() {
  const email = (process.env.SEED_DUENO_EMAIL || "dueno@hacecafe.com")
    .trim()
    .toLowerCase();

  const existe = await prisma.usuario.findUnique({ where: { email } });
  if (existe) {
    console.log(`Dueño ya existente: ${email}`);
    return;
  }

  const generada = !process.env.SEED_DUENO_PASSWORD;
  const password =
    process.env.SEED_DUENO_PASSWORD || crypto.randomBytes(6).toString("base64url");

  await prisma.usuario.create({
    data: {
      nombre: "Dueño",
      email,
      password: await bcrypt.hash(password, 10),
      rol: "DUENO",
    },
  });

  console.log(`Dueño creado: ${email}`);
  if (generada) console.log(`Contraseña generada (guardala): ${password}`);
}

async function crearCatalogo() {
  if ((await prisma.categoria.count()) > 0) {
    console.log("Ya hay categorías: se omite el catálogo de ejemplo");
    return;
  }

  const cafes = await prisma.categoria.create({
    data: { nombre: "Cafés", icono: "☕", ordenDisplay: 1 },
  });
  const comidas = await prisma.categoria.create({
    data: { nombre: "Comidas", icono: "🥐", ordenDisplay: 2 },
  });
  const frias = await prisma.categoria.create({
    data: { nombre: "Bebidas frías", icono: "🧃", ordenDisplay: 3 },
  });

  await prisma.producto.createMany({
    data: [
      { categoriaId: cafes.id, nombre: "Café con leche", precio: 1500, precioCosto: 400, stockActual: 100, stockMinimo: 20, tiempoPreparacion: 3, ordenDisplay: 1 },
      { categoriaId: cafes.id, nombre: "Cortado", precio: 1200, precioCosto: 350, stockActual: 100, stockMinimo: 20, tiempoPreparacion: 2, ordenDisplay: 2 },
      { categoriaId: cafes.id, nombre: "Café negro", precio: 1000, precioCosto: 300, stockActual: 100, stockMinimo: 20, tiempoPreparacion: 2, ordenDisplay: 3 },
      { categoriaId: comidas.id, nombre: "Medialunas x3", precio: 1800, precioCosto: 600, stockActual: 30, stockMinimo: 10, tiempoPreparacion: 1, ordenDisplay: 1 },
      { categoriaId: comidas.id, nombre: "Tostado jamón y queso", precio: 2500, precioCosto: 900, stockActual: 20, stockMinimo: 5, tiempoPreparacion: 5, ordenDisplay: 2 },
      { categoriaId: frias.id, nombre: "Agua mineral", precio: 800, precioCosto: 200, stockActual: 50, stockMinimo: 10, tiempoPreparacion: 1, ordenDisplay: 1 },
    ],
  });

  console.log("Catálogo de ejemplo cargado");
}

crearDueno()
  .then(crearCatalogo)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
