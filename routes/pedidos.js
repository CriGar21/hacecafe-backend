const express = require('express')
const router = express.Router()
const {
  crearPedido,
  obtenerPedidos,
  actualizarEstado,
  obtenerPedidosPorMesa,
  obtenerPedidoPorNumero,
  cobrarMesa
} = require('../controllers/pedidosController')
const { verificarToken, soloRoles } = require('../middlewares/auth')

router.use(verificarToken)

router.post('/', crearPedido)
router.get('/', obtenerPedidos)
router.patch('/:id/estado', actualizarEstado)
router.get('/mesa/:mesa', obtenerPedidosPorMesa)
router.get('/numero/:numero', obtenerPedidoPorNumero)
router.post('/cobrar', soloRoles('DUEÑO', 'EMPLEADO'), cobrarMesa)

module.exports = router