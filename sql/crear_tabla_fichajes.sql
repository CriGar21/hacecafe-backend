-- HaceCafe: crear la tabla de fichajes si todavía no existe.
-- Ejecutar sobre la misma base MySQL indicada por DATABASE_URL en Render.
-- No borra ni modifica registros de otras tablas.

CREATE TABLE IF NOT EXISTS `fichajes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuarioId` INT NOT NULL,
  `tipo` VARCHAR(10) NOT NULL,
  `latitud` DOUBLE NOT NULL,
  `longitud` DOUBLE NOT NULL,
  `distanciaM` INT NULL,
  `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `fichajes_usuarioId_creadoEn_idx` (`usuarioId`, `creadoEn`),
  INDEX `fichajes_creadoEn_idx` (`creadoEn`),
  CONSTRAINT `fichajes_usuarioId_fkey`
    FOREIGN KEY (`usuarioId`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
