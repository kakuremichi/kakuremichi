CREATE TABLE `acme_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text(32) DEFAULT 'letsencrypt' NOT NULL,
	`directory_url` text(255) NOT NULL,
	`email` text(255) NOT NULL,
	`account_url` text,
	`account_key_encrypted` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acme_accounts_issuer_directory_email_unique` ON `acme_accounts` (`issuer`,`directory_url`,`email`);--> statement-breakpoint
CREATE TABLE `tunnel_tls_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`tunnel_id` text NOT NULL,
	`mode` text(32) DEFAULT 'disabled' NOT NULL,
	`certificate_id` text,
	`force_https` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tunnel_id`) REFERENCES `tunnels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`certificate_id`) REFERENCES `certificates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tunnel_tls_settings_tunnel_id_unique` ON `tunnel_tls_settings` (`tunnel_id`);