ALTER TABLE `usuarios`
  ADD COLUMN `pinHash` VARCHAR(64) NULL;

CREATE UNIQUE INDEX `usuarios_pinHash_key` ON `usuarios`(`pinHash`);

CREATE TABLE `fichajes` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `usuarioId` INTEGER NOT NULL,
  `tipo` VARCHAR(10) NOT NULL,
  `latitud` DOUBLE NOT NULL,
  `longitud` DOUBLE NOT NULL,
  `distanciaM` INTEGER NULL,
  `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `fichajes_usuarioId_creadoEn_idx`(`usuarioId`, `creadoEn`),
  INDEX `fichajes_creadoEn_idx`(`creadoEn`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `fichajes`
  ADD CONSTRAINT `fichajes_usuarioId_fkey`
  FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
