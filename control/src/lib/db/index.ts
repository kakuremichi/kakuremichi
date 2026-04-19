import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DATABASE_URL || './data/kakuremichi.db';

// Ensure data directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
// Allow tests to use journal_mode=DELETE so two processes (HTTP + WS) sharing
// the same DB file don't trip over WAL state. Production defaults to WAL.
const journalMode = (process.env.SQLITE_JOURNAL_MODE || 'WAL').toUpperCase();
sqlite.pragma(`journal_mode = ${journalMode}`);
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });

export * from './schema';
