import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { tunnels } from './tunnels';
import { agents } from './agents';

export const tunnelBackends = sqliteTable('tunnel_backends', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tunnelId: text('tunnel_id')
    .notNull()
    .references(() => tunnels.id, { onDelete: 'cascade' }),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  target: text('target', { length: 255 }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  draining: integer('draining', { mode: 'boolean' }).notNull().default(false),
  weight: integer('weight').notNull().default(100),
  priority: integer('priority').notNull().default(0),
  agentIp: text('agent_ip', { length: 15 }).notNull().unique(),
  status: text('status', { length: 32 }).notNull().default('unknown'),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type TunnelBackend = typeof tunnelBackends.$inferSelect;
export type NewTunnelBackend = typeof tunnelBackends.$inferInsert;
