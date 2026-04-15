const express = require('express')
const cors = require('cors')
const { PrismaClient } = require('@prisma/client')
require('dotenv').config()

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3001

// Middlewares — procesan cada request antes de llegar a las rutas
app.use(cors())
app.use(express.json())

// Ruta de prueba — para verificar que el servidor vive
app.get('/', (req, res) => {
  res.json({ mensaje: 'Servidor HaceCafe funcionando', version: '1.0' })
})

// Ruta real — devuelve todos los productos con su categoría
app.get('/productos', async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      where: { disponible: true },
      include: { categoria: true },
      orderBy: { ordenDisplay: 'asc' }
    })
    res.json(productos)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener productos' })
  }
})

// Ruta — devuelve todas las categorías activas
app.get('/categorias', async (req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({
      where: { activa: true },
      orderBy: { ordenDisplay: 'asc' }
    })
    res.json(categorias)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener categorías' })
  }
})

// Arrancar el servidor
app.listen(PORT, () => {
  console.log(`Servidor HaceCafe corriendo en http://localhost:${PORT}`)
})