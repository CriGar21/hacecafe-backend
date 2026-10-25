ALTER TABLE `pedidos`
  ADD COLUMN `subtotal` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `descuentoPorcentaje` DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN `descuentoMonto` DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN `descuentoMotivo` VARCHAR(160) NULL,
  ADD COLUMN `descuentoOrigen` VARCHAR(30) NULL,
  ADD COLUMN `descuentoCodigo` VARCHAR(80) NULL,
  ADD COLUMN `juegoJugado` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `juegoPremio` DECIMAL(5,2) NOT NULL DEFAULT 0;

UPDATE `pedidos` SET `subtotal` = `total` WHERE `subtotal` = 0;

CREATE TABLE `promociones` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `descripcion` TEXT NULL,
  `imagenUrl` VARCHAR(300) NULL,
  `tipo` VARCHAR(30) NOT NULL DEFAULT 'DESCUENTO',
  `valor` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `activa` BOOLEAN NOT NULL DEFAULT true,
  `mostrarMenu` BOOLEAN NOT NULL DEFAULT true,
  `desde` DATETIME(3) NULL,
  `hasta` DATETIME(3) NULL,
  `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `actualizadoEn` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `promociones_activa_mostrarMenu_idx` (`activa`, `mostrarMenu`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `juegos_config` (
  `id` INTEGER NOT NULL DEFAULT 1,
  `activo` BOOLEAN NOT NULL DEFAULT false,
  `nombre` VARCHAR(100) NOT NULL DEFAULT 'Ruleta de descuentos',
  `premios` JSON NOT NULL,
  `actualizadoEn` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `juegos_config` (`id`, `activo`, `nombre`, `premios`, `actualizadoEn`)
VALUES (1, false, 'Ruleta de descuentos', JSON_ARRAY(
  JSON_OBJECT('valor', 5, 'probabilidad', 45),
  JSON_OBJECT('valor', 10, 'probabilidad', 30),
  JSON_OBJECT('valor', 15, 'probabilidad', 20),
  JSON_OBJECT('valor', 20, 'probabilidad', 5)
), CURRENT_TIMESTAMP(3));
