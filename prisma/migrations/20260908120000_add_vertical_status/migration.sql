ALTER TABLE `vertical`
ADD COLUMN `status` ENUM('active', 'deleted') NOT NULL DEFAULT 'active';
