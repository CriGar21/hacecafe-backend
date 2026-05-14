const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

// ─── DASHBOARD ────────────────────────────────────────────────

const getDashboard = async (req, res) => {
  try {
    const { fecha, desde, hasta, productoId } = req.query;

    // Soporta tanto ?fecha=YYYY-MM-DD (un día) como ?desde=...&hasta=... (rango)
    let fechaDesde, fechaHasta;

    if (desde && hasta) {
      fechaDesde = new Date(desde + "T00:00:00");
      fechaHasta = new Date(hasta + "T23:59:59");
    } else {
      // compatibilidad con el parámetro ?fecha= anterior
      const dia = fecha ? new Date(fecha + "T00:00:00") : new Date();
      dia.setHours(0, 0, 0, 0);
      fechaDesde = dia;
      fechaHasta = new Date(dia);
      fechaHasta.setHours(23, 59, 59, 999);
    }

    const pedidosDelPeriodo = await prisma.pedido.findMany({
      where: {
        cobrado: true,
        actualizadoEn: { gte: fechaDesde, lte: fechaHasta },
      },
      include: { items: { include: { producto: true } } },
    });

    // Filtrar por producto si se especifica
    const pedidosFiltrados = productoId
      ? pedidosDelPeriodo.filter((p) =>
          p.items.some((i) => i.productoId === Number(productoId)),
        )
      : pedidosDelPeriodo;

    const totalDia = pedidosFiltrados.reduce(
      (acc, p) => acc + Number(p.total),
      0,
    );
    const cantidadPedidos = pedidosFiltrados.length;

    let gananciaEstimada = 0;
    pedidosFiltrados.forEach((pedido) => {
      pedido.items.forEach((item) => {
        const precioCosto = Number(item.producto.precioCosto || 0);
        gananciaEstimada +=
          (Number(item.producto.precio) - precioCosto) * item.cantidad;
      });
    });

    const itemsDelPeriodo = pedidosFiltrados.flatMap((p) => p.items);
    const productosMap = {};
    itemsDelPeriodo.forEach((item) => {
      const nombre = item.producto.nombre;
      const precioCosto = Number(item.producto.precioCosto || 0);
      if (!productosMap[nombre])
        productosMap[nombre] = { nombre, cantidad: 0, total: 0, margen: 0 };
      productosMap[nombre].cantidad += item.cantidad;
      productosMap[nombre].total += Number(item.subtotal);
      productosMap[nombre].margen +=
        (Number(item.producto.precio) - precioCosto) * item.cantidad;
    });
    const topProductos = Object.values(productosMap)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // Ventas por hora — útil para 1 día; para rangos muestra el acumulado por hora del día
    const ventasPorHora = Array(24)
      .fill(0)
      .map((_, hora) => ({ hora, total: 0, pedidos: 0 }));
    pedidosFiltrados.forEach((pedido) => {
      const hora = new Date(pedido.actualizadoEn).getHours();
      ventasPorHora[hora].total += Number(pedido.total);
      ventasPorHora[hora].pedidos += 1;
    });

    const pedidosActivos = await prisma.pedido.count({
      where: { estado: { notIn: ["ENTREGADO", "CANCELADO", "COBRADO"] } },
    });

    const todosProductos = await prisma.producto.findMany({
      where: { disponible: true },
      select: { id: true, nombre: true, stockActual: true, stockMinimo: true },
    });
    const stockBajo = todosProductos.filter(
      (p) => p.stockActual <= p.stockMinimo,
    );

    res.json({
      totalDia,
      gananciaEstimada: Math.round(gananciaEstimada),
      cantidadPedidos,
      pedidosActivos,
      topProductos,
      ventasPorHora: ventasPorHora.filter((v) => v.pedidos > 0),
      stockBajo,
      fechaDesde,
      fechaHasta,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener dashboard" });
  }
};

// ─── PRODUCTOS ────────────────────────────────────────────────

const getProductos = async (req, res) => {
  try {
    const productos = await prisma.producto.findMany({
      include: { categoria: true },
      orderBy: [{ categoriaId: "asc" }, { ordenDisplay: "asc" }],
    });
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener productos" });
  }
};

const crearProducto = async (req, res) => {
  const {
    categoriaId,
    nombre,
    descripcion,
    precio,
    precioCosto,
    stockActual,
    stockMinimo,
    tiempoPreparacion,
    imagenUrl,
  } = req.body;
  try {
    const producto = await prisma.producto.create({
      data: {
        categoriaId: Number(categoriaId),
        nombre,
        descripcion,
        precio: Number(precio),
        precioCosto: precioCosto ? Number(precioCosto) : null,
        stockActual: Number(stockActual) || 0,
        stockMinimo: Number(stockMinimo) || 5,
        tiempoPreparacion: tiempoPreparacion ? Number(tiempoPreparacion) : null,
        imagenUrl,
      },
      include: { categoria: true },
    });
    res.status(201).json(producto);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al crear producto" });
  }
};

const editarProducto = async (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    descripcion,
    precio,
    precioCosto,
    stockMinimo,
    tiempoPreparacion,
    imagenUrl,
    disponible,
    categoriaId,
  } = req.body;
  try {
    const producto = await prisma.producto.update({
      where: { id: Number(id) },
      data: {
        nombre,
        descripcion,
        precio: precio !== undefined ? Number(precio) : undefined,
        precioCosto:
          precioCosto !== undefined ? Number(precioCosto) : undefined,
        stockMinimo:
          stockMinimo !== undefined ? Number(stockMinimo) : undefined,
        tiempoPreparacion:
          tiempoPreparacion !== undefined
            ? Number(tiempoPreparacion)
            : undefined,
        imagenUrl,
        disponible,
        categoriaId:
          categoriaId !== undefined ? Number(categoriaId) : undefined,
      },
      include: { categoria: true },
    });
    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: "Error al editar producto" });
  }
};

const actualizarStock = async (req, res) => {
  const { id } = req.params;
  const { cantidad, operacion } = req.body;
  try {
    const producto = await prisma.producto.update({
      where: { id: Number(id) },
      data: {
        stockActual:
          operacion === "agregar"
            ? { increment: Number(cantidad) }
            : Number(cantidad),
      },
    });

    if (producto.stockActual <= producto.stockMinimo) {
      req.io.emit("stock_bajo", {
        id: producto.id,
        nombre: producto.nombre,
        stockActual: producto.stockActual,
        stockMinimo: producto.stockMinimo,
      });
    }

    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar stock" });
  }
};

// ─── USUARIOS ─────────────────────────────────────────────────

const getUsuarios = async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        creadoEn: true,
      },
      orderBy: { creadoEn: "asc" },
    });
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
};

const crearUsuario = async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  try {
    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (existe)
      return res.status(400).json({ error: "El email ya está registrado" });
    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await prisma.usuario.create({
      data: { nombre, email, password: passwordHash, rol },
      select: { id: true, nombre: true, email: true, rol: true, activo: true },
    });
    res.status(201).json(usuario);
  } catch (error) {
    res.status(500).json({ error: "Error al crear usuario" });
  }
};

const editarUsuario = async (req, res) => {
  const { id } = req.params;
  const { nombre, rol, password } = req.body;
  try {
    const data = { nombre, rol };
    if (password) data.password = await bcrypt.hash(password, 10);
    const usuario = await prisma.usuario.update({
      where: { id: Number(id) },
      data,
      select: { id: true, nombre: true, email: true, rol: true, activo: true },
    });
    res.json(usuario);
  } catch (error) {
    res.status(500).json({ error: "Error al editar usuario" });
  }
};

const toggleUsuario = async (req, res) => {
  const { id } = req.params;
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(id) },
    });
    const actualizado = await prisma.usuario.update({
      where: { id: Number(id) },
      data: { activo: !usuario.activo },
      select: { id: true, nombre: true, email: true, rol: true, activo: true },
    });
    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
};

// ─── CAJA ─────────────────────────────────────────────────────

const getCaja = async (req, res) => {
  try {
    const { desde, hasta, productoId } = req.query;

    const fechaDesde = desde
      ? new Date(desde + "T00:00:00")
      : (() => {
          const h = new Date();
          h.setHours(0, 0, 0, 0);
          return h;
        })();

    const fechaHasta = hasta
      ? new Date(hasta + "T23:59:59")
      : (() => {
          const h = new Date();
          h.setHours(23, 59, 59, 999);
          return h;
        })();

    const pedidos = await prisma.pedido.findMany({
      where: {
        cobrado: true,
        actualizadoEn: { gte: fechaDesde, lte: fechaHasta },
      },
      include: {
        items: { include: { producto: true } },
        usuario: { select: { id: true, nombre: true } },
      },
      orderBy: { actualizadoEn: "desc" },
    });

    const pedidosFiltrados = productoId
      ? pedidos.filter((p) =>
          p.items.some((i) => i.productoId === Number(productoId)),
        )
      : pedidos;

    const total = pedidosFiltrados.reduce((acc, p) => acc + Number(p.total), 0);

    const porVendedor = {};
    pedidosFiltrados.forEach((p) => {
      const nombre = p.usuario?.nombre || "Sistema";
      if (!porVendedor[nombre])
        porVendedor[nombre] = { nombre, pedidos: 0, total: 0 };
      porVendedor[nombre].pedidos += 1;
      porVendedor[nombre].total += Number(p.total);
    });

    const porMetodoPago = {};
    pedidosFiltrados.forEach((p) => {
      const metodo = p.metodoPago || "EFECTIVO";
      if (!porMetodoPago[metodo])
        porMetodoPago[metodo] = { metodo, pedidos: 0, total: 0 };
      porMetodoPago[metodo].pedidos += 1;
      porMetodoPago[metodo].total += Number(p.total);
    });

    res.json({
      pedidos: pedidosFiltrados,
      total,
      cantidad: pedidosFiltrados.length,
      porVendedor: Object.values(porVendedor),
      porMetodoPago: Object.values(porMetodoPago),
      fechaDesde,
      fechaHasta,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener caja" });
  }
};

// ─── CATEGORÍAS ───────────────────────────────────────────────

const getCategorias = async (req, res) => {
  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: { ordenDisplay: "asc" },
    });
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener categorías" });
  }
};

const crearCategoria = async (req, res) => {
  const { nombre, icono } = req.body;
  try {
    const categoria = await prisma.categoria.create({
      data: { nombre, icono },
    });
    res.status(201).json(categoria);
  } catch (error) {
    res.status(500).json({ error: "Error al crear categoría" });
  }
};

const actualizarCategoria = async (req, res) => {
  const { id } = req.params;
  const { nombre, icono, activa, ordenDisplay } = req.body;
  try {
    const data = {};
    if (nombre !== undefined) data.nombre = nombre;
    if (icono !== undefined) data.icono = icono;
    if (activa !== undefined) data.activa = activa;
    if (ordenDisplay !== undefined) data.ordenDisplay = Number(ordenDisplay);

    const categoria = await prisma.categoria.update({
      where: { id: Number(id) },
      data,
    });
    res.json(categoria);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar categoría" });
  }
};

module.exports = {
  getDashboard,
  getProductos,
  crearProducto,
  editarProducto,
  actualizarStock,
  getUsuarios,
  crearUsuario,
  editarUsuario,
  toggleUsuario,
  getCaja,
  getCategorias,
  crearCategoria,
  actualizarCategoria,
};
