ALTER TABLE `pedidos`
  ADD COLUMN `clienteToken` VARCHAR(80) NULL,
  ADD COLUMN `solicitudCancelacion` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `solicitudModificacion` JSON NULL;

CREATE UNIQUE INDEX `pedidos_clienteToken_key` ON `pedidos`(`clienteToken`);
