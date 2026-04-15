const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Crear categorías
  const cafes = await prisma.categoria.create({
    data: { nombre: "Cafés", icono: "☕", ordenDisplay: 1 },
  });
  const comidas = await prisma.categoria.create({
    data: { nombre: "Comidas", icono: "🥐", ordenDisplay: 2 },
  });
  const frias = await prisma.categoria.create({
    data: { nombre: "Bebidas frías", icono: "🧃", ordenDisplay: 3 },
  });

  // Crear productos
  await prisma.producto.createMany({
    data: [
      {
        categoriaId: cafes.id,
        nombre: "Café con leche",
        precio: 1500,
        precioCosto: 400,
        stockActual: 100,
        stockMinimo: 20,
        tiempoPreparacion: 3,
        ordenDisplay: 1,
      },
      {
        categoriaId: cafes.id,
        nombre: "Cortado",
        precio: 1200,
        precioCosto: 350,
        stockActual: 100,
        stockMinimo: 20,
        tiempoPreparacion: 2,
        ordenDisplay: 2,
      },
      {
        categoriaId: cafes.id,
        nombre: "Café negro",
        precio: 1000,
        precioCosto: 300,
        stockActual: 100,
        stockMinimo: 20,
        tiempoPreparacion: 2,
        ordenDisplay: 3,
      },
      {
        categoriaId: comidas.id,
        nombre: "Medialunas x3",
        precio: 1800,
        precioCosto: 600,
        stockActual: 30,
        stockMinimo: 10,
        tiempoPreparacion: 1,
        ordenDisplay: 1,
      },
      {
        categoriaId: comidas.id,
        nombre: "Tostado jamón y queso",
        precio: 2500,
        precioCosto: 900,
        stockActual: 20,
        stockMinimo: 5,
        tiempoPreparacion: 5,
        ordenDisplay: 2,
      },
      {
        categoriaId: frias.id,
        nombre: "Agua mineral",
        precio: 800,
        precioCosto: 200,
        stockActual: 50,
        stockMinimo: 10,
        tiempoPreparacion: 1,
        ordenDisplay: 1,
      },
    ],
  });

  console.log("Base de datos cargada con datos iniciales");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
