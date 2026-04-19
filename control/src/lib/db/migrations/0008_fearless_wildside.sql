PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text(256) NOT NULL,
	`password_hash` text NOT NULL,
	`role` text(16) DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "password_hash", "role", "created_at", "updated_at") SELECT "id", "email", "password_hash", "role", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `tunnels_subnet_unique` ON `tunnels` (`subnet`);--> statement-breakpoint
CREATE UNIQUE INDEX `tunnels_agent_ip_unique` ON `tunnels` (`agent_ip`);