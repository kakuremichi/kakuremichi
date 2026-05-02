import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const acmeAccounts = sqliteTable(
  'acme_accounts',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    issuer: text('issuer', { length: 32 }).notNull().default('letsencrypt'),
    directoryUrl: text('directory_url', { length: 255 }).notNull(),
    email: text('email', { length: 255 }).notNull(),
    accountUrl: text('account_url'),
    accountKeyEncrypted: text('account_key_encrypted').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    issuerDirectoryEmailIdx: uniqueIndex('acme_accounts_issuer_directory_email_unique').on(
      table.issuer,
      table.directoryUrl,
      table.email
    ),
  })
);

export type AcmeAccount = typeof acmeAccounts.$inferSelect;
export type NewAcmeAccount = typeof acmeAccounts.$inferInsert;
