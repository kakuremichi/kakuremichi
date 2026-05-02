CREATE TABLE `tunnel_backends` (
	`id` text PRIMARY KEY NOT NULL,
	`tunnel_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`target` text(255) NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`draining` integer DEFAULT false NOT NULL,
	`weight` integer DEFAULT 100 NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`agent_ip` text(15) NOT NULL,
	`status` text(32) DEFAULT 'unknown' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tunnel_id`) REFERENCES `tunnels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tunnel_backends_agent_ip_unique` ON `tunnel_backends` (`agent_ip`);
--> statement-breakpoint
INSERT INTO `tunnel_backends` (
	`id`,
	`tunnel_id`,
	`agent_id`,
	`target`,
	`enabled`,
	`draining`,
	`weight`,
	`priority`,
	`agent_ip`,
	`status`,
	`last_error`,
	`created_at`,
	`updated_at`
)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))),
	`tunnels`.`id`,
	`tunnels`.`agent_id`,
	`tunnels`.`target`,
	`tunnels`.`enabled`,
	false,
	100,
	0,
	`tunnels`.`agent_ip`,
	'unknown',
	NULL,
	`tunnels`.`created_at`,
	`tunnels`.`updated_at`
FROM `tunnels`
WHERE `tunnels`.`agent_ip` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM `tunnel_backends`
		WHERE `tunnel_backends`.`tunnel_id` = `tunnels`.`id`
	);
