CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text(255) NOT NULL,
	`dns_zone_id` text,
	`issuer` text(32) DEFAULT 'letsencrypt' NOT NULL,
	`challenge_type` text(16) DEFAULT 'dns-01' NOT NULL,
	`status` text(32) DEFAULT 'pending' NOT NULL,
	`certificate_pem_encrypted` text,
	`private_key_pem_encrypted` text,
	`not_before` integer,
	`not_after` integer,
	`renew_after` integer,
	`fingerprint_sha256` text(64),
	`last_issued_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`dns_zone_id`) REFERENCES `dns_zones`(`id`) ON UPDATE no action ON DELETE set null
);
