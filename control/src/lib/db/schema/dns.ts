import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { tunnels } from './tunnels';
import { gateways } from './gateways';

export const dnsProviders = sqliteTable('dns_providers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name', { length: 64 }).notNull(),
  type: text('type', { length: 32 }).notNull(),
  encryptedConfig: text('encrypted_config').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dnsZones = sqliteTable('dns_zones', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  providerId: text('provider_id')
    .notNull()
    .references(() => dnsProviders.id, { onDelete: 'cascade' }),
  name: text('name', { length: 255 }).notNull(),
  providerZoneId: text('provider_zone_id', { length: 128 }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dnsSyncSettings = sqliteTable('dns_sync_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tunnelId: text('tunnel_id')
    .notNull()
    .unique()
    .references(() => tunnels.id, { onDelete: 'cascade' }),
  zoneId: text('zone_id')
    .notNull()
    .references(() => dnsZones.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  recordType: text('record_type', { length: 8 }).notNull().default('A'),
  strategy: text('strategy', { length: 32 }).notNull().default('all_gateways'),
  ttl: integer('ttl').notNull().default(60),
  proxied: integer('proxied', { mode: 'boolean' }).notNull().default(false),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dnsManagedRecords = sqliteTable('dns_managed_records', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  syncSettingId: text('sync_setting_id')
    .notNull()
    .references(() => dnsSyncSettings.id, { onDelete: 'cascade' }),
  gatewayId: text('gateway_id').references(() => gateways.id, { onDelete: 'set null' }),
  providerRecordId: text('provider_record_id', { length: 128 }).notNull(),
  name: text('name', { length: 255 }).notNull(),
  type: text('type', { length: 8 }).notNull(),
  content: text('content', { length: 255 }).notNull(),
  ttl: integer('ttl').notNull(),
  proxied: integer('proxied', { mode: 'boolean' }).notNull().default(false),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type DnsProvider = typeof dnsProviders.$inferSelect;
export type NewDnsProvider = typeof dnsProviders.$inferInsert;
export type DnsZone = typeof dnsZones.$inferSelect;
export type NewDnsZone = typeof dnsZones.$inferInsert;
export type DnsSyncSetting = typeof dnsSyncSettings.$inferSelect;
export type NewDnsSyncSetting = typeof dnsSyncSettings.$inferInsert;
export type DnsManagedRecord = typeof dnsManagedRecords.$inferSelect;
export type NewDnsManagedRecord = typeof dnsManagedRecords.$inferInsert;
