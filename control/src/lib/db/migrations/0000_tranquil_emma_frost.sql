CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(64) NOT NULL,
	`api_key` text(64) NOT NULL,
	`wireguard_public_key` text(256) NOT NULL,
	`virtual_ip` text(15) NOT NULL,
	`subnet` text(18) NOT NULL,
	`status` text(16) DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_api_key_unique` ON `agents` (`api_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_wireguard_public_key_unique` ON `agents` (`wireguard_public_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_virtual_ip_unique` ON `agents` (`virtual_ip`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_subnet_unique` ON `agents` (`subnet`);--> statement-breakpoint
CREATE TABLE `gateways` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(64) NOT NULL,
	`api_key` text(64) NOT NULL,
	`public_ip` text(15) NOT NULL,
	`wireguard_public_key` text(256) NOT NULL,
	`region` text(32),
	`status` text(16) DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gateways_api_key_unique` ON `gateways` (`api_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `gateways_public_ip_unique` ON `gateways` (`public_ip`);--> statement-breakpoint
CREATE UNIQUE INDEX `gateways_wireguard_public_key_unique` ON `gateways` (`wireguard_public_key`);--> statement-breakpoint
CREATE TABLE `tunnels` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text(255) NOT NULL,
	`agent_id` text NOT NULL,
	`target` text(255) NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tunnels_domain_unique` ON `tunnels` (`domain`);