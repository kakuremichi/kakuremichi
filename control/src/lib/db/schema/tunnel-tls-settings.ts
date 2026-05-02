import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { tunnels } from './tunnels';
import { certificates } from './certificates';

export const tunnelTlsSettings = sqliteTable('tunnel_tls_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tunnelId: text('tunnel_id')
    .notNull()
    .unique()
    .references(() => tunnels.id, { onDelete: 'cascade' }),
  mode: text('mode', { length: 32 }).notNull().default('disabled'),
  certificateId: text('certificate_id').references(() => certificates.id, { onDelete: 'set null' }),
  forceHttps: integer('force_https', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type TunnelTlsSetting = typeof tunnelTlsSettings.$inferSelect;
export type NewTunnelTlsSetting = typeof tunnelTlsSettings.$inferInsert;
