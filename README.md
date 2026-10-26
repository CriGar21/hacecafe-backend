# HaceCafe · Backend

API de HaceCafe (Node + Express 5 + Prisma + MySQL + Socket.IO). Maneja el menú, los pedidos en tiempo real, cocina, caja, usuarios y la configuración del negocio.

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completá DATABASE_URL y JWT_SECRET
npx prisma db push        # crea / actualiza las tablas
npm run seed              # crea el dueño y un catálogo de ejemplo
npm run dev
```

`npm run seed` se puede repetir sin problema: solo crea lo que falta. Si no definís `SEED_DUENO_PASSWORD`, genera una contraseña y la muestra en pantalla una sola vez.

> Si ya tenías la base creada con una versión anterior, corré `npx prisma db push` otra vez: agrega la tabla `configuracion` y la columna `pedidos.cobradoEn`.

## Base de datos en Aiven

Si usan el MySQL gratuito de Aiven:

- En la consola de Aiven, servicio MySQL → *Overview* → copiá el **Service URI** a `DATABASE_URL`. Trae host, puerto (no es 3306), usuario, contraseña y `ssl-mode=REQUIRED`. Si la contraseña tiene caracteres especiales, hay que codificarlos (`@` → `%40`).
- Agregá `&connection_limit=3` al final de la URL: el plan gratuito tiene pocas conexiones y cada persona que corre el backend abre varias.
- **Una base por persona.** Todos comparten el mismo servicio, pero cada uno puede crear su propia base (pestaña *Databases* del servicio) y poner su nombre en la URL. Así `npx prisma db push` y `npm run seed` de uno no pisan los datos de otro. Una base aparte queda para el grupo.
- `npx prisma db push` te muestra qué va a cambiar antes de aplicarlo. Si dice que va a borrar datos, **no lo aceptes** hasta entender por qué (no uses `--accept-data-loss` por costumbre).
- El plan gratuito **se apaga solo si no se usa** (avisa por mail antes). Antes de una demo, entrá a la consola y confirmá que el servicio esté encendido.
- La contraseña de la base va solo en tu `.env` (ya está en `.gitignore`). No la pegues en el repo ni en chats públicos.

## Variables de entorno

| Variable | Para qué sirve |
| --- | --- |
| `DATABASE_URL` | Conexión MySQL (obligatoria) |
| `JWT_SECRET` | Firma de sesiones (obligatoria: el servidor no arranca sin ella) |
| `PORT` | Puerto (por defecto 3001) |
| `FRONTEND_URL` | Origen permitido por CORS además de `localhost:5173` y la app de Vercel |
| `REGISTRO_ABIERTO` | `true` permite crear cuentas sin ser dueño. Solo para la primera cuenta |
| `SOCKET_ABIERTO` | `true` hace que todos los sockets reciban los pedidos completos (modo anterior) |

## Roles

`DUENO`, `EMPLEADO` y `COCINA`. El rol viaja en el token sin tilde (`DUENO`); en la base se guarda como `DUEÑO`.

| Quién | Qué puede |
| --- | --- |
| Público | Ver menú, hacer un pedido (`POST /pedidos/publico`, máx. 5 por minuto), leer la apariencia |
| Cocina | Ver y avanzar pedidos, ver y reponer stock |
| Empleado | Lo de cocina + aprobar / rechazar pedidos, tomar pedidos, cobrar |
| Dueño | Todo, más `/admin` (dashboard, productos, usuarios, caja, categorías) y la configuración |

## Rutas principales

- `POST /auth/login` · `POST /auth/registro` (solo dueño)
- `GET /productos`, `GET /categorias` (públicas)
- `GET /productos/inventario`, `PATCH /productos/:id/stock` (personal)
- `GET /pedidos/historial?desde=&hasta=` (empleado / dueño: tickets cobrados, sin costos)
- `GET /pedidos?estado=A,B&cobrado=false` · `POST /pedidos` · `PATCH /pedidos/:id/{estado,aprobar,rechazar}` · `POST /pedidos/cobrar`
- `GET /config/apariencia` (pública) · `GET /config/local` (empleado / dueño) · `PUT /config/{apariencia,local}` (dueño)
- `/admin/*` (solo dueño)

## Tiempo real

El personal se conecta con `io(URL, { auth: { token } })` y recibe `solicitud_cliente`, `nuevo_pedido`, `pedido_aprobado`, `pedido_actualizado`, `mesa_cobrada` y `stock_bajo`. Los clientes se conectan sin token y solo reciben un resumen (id, número, mesa, estado) de sus pedidos. Si el token vence o la cuenta se desactiva, el servidor emite `auth_error`.

Para el despliegue hace falta un servidor persistente (Render, Railway, Fly…): los websockets no funcionan en funciones serverless.
