CREATE TABLE `dns_managed_records` (
	`id` text PRIMARY KEY NOT NULL,
	`sync_setting_id` text NOT NULL,
	`gateway_id` text,
	`provider_record_id` text(128) NOT NULL,
	`name` text(255) NOT NULL,
	`type` text(8) NOT NULL,
	`content` text(255) NOT NULL,
	`ttl` integer NOT NULL,
	`proxied` integer DEFAULT false NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`sync_setting_id`) REFERENCES `dns_sync_settings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gateway_id`) REFERENCES `gateways`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `dns_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text(64) NOT NULL,
	`type` text(32) NOT NULL,
	`encrypted_config` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dns_sync_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`tunnel_id` text NOT NULL,
	`zone_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`record_type` text(8) DEFAULT 'A' NOT NULL,
	`strategy` text(32) DEFAULT 'all_gateways' NOT NULL,
	`ttl` integer DEFAULT 60 NOT NULL,
	`proxied` integer DEFAULT false NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tunnel_id`) REFERENCES `tunnels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`zone_id`) REFERENCES `dns_zones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dns_sync_settings_tunnel_id_unique` ON `dns_sync_settings` (`tunnel_id`);--> statement-breakpoint
CREATE TABLE `dns_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`name` text(255) NOT NULL,
	`provider_zone_id` text(128) NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `dns_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
