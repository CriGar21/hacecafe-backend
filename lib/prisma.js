const { PrismaClient } = require("@prisma/client");

// Reutiliza una única instancia de Prisma durante la vida del servidor.
const prisma = new PrismaClient();

module.exports = prisma;
