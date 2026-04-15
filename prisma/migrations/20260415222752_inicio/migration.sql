-- CreateTable
CREATE TABLE `categorias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(80) NOT NULL,
    `icono` VARCHAR(10) NULL,
    `activa` BOOLEAN NOT NULL DEFAULT true,
    `ordenDisplay` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `categoriaId` INTEGER NOT NULL,
    `nombre` VARCHAR(120) NOT NULL,
    `descripcion` TEXT NULL,
    `precio` DECIMAL(10, 2) NOT NULL,
    `precioCosto` DECIMAL(10, 2) NULL,
    `disponible` BOOLEAN NOT NULL DEFAULT true,
    `imagenUrl` VARCHAR(300) NULL,
    `stockActual` INTEGER NOT NULL DEFAULT 0,
    `stockMinimo` INTEGER NOT NULL DEFAULT 5,
    `tiempoPreparacion` INTEGER NULL,
    `ordenDisplay` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizadoEn` DATETIME(3) NOT NULL,

    INDEX `productos_disponible_idx`(`disponible`),
    INDEX `productos_categoriaId_idx`(`categoriaId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_categoriaId_fkey` FOREIGN KEY (`categoriaId`) REFERENCES `categorias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
