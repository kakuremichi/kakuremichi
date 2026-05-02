import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { dnsZones } from './dns';

export const certificates = sqliteTable('certificates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text('domain', { length: 255 }).notNull(),
  dnsZoneId: text('dns_zone_id').references(() => dnsZones.id, { onDelete: 'set null' }),
  issuer: text('issuer', { length: 32 }).notNull().default('letsencrypt'),
  challengeType: text('challenge_type', { length: 16 }).notNull().default('dns-01'),
  status: text('status', { length: 32 }).notNull().default('pending'),
  certificatePemEncrypted: text('certificate_pem_encrypted'),
  privateKeyPemEncrypted: text('private_key_pem_encrypted'),
  notBefore: integer('not_before', { mode: 'timestamp' }),
  notAfter: integer('not_after', { mode: 'timestamp' }),
  renewAfter: integer('renew_after', { mode: 'timestamp' }),
  fingerprintSha256: text('fingerprint_sha256', { length: 64 }),
  lastIssuedAt: integer('last_issued_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
