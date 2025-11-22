# Control - データベース

## 概要

ControlサーバーのDrizzle ORM実装。SQLiteデータベースの管理、スキーマ定義、マイグレーション。

**パス**: `control/src/lib/db/`

---

## 責務

1. データベース接続管理
2. スキーマ定義（Agent、Gateway、Tunnel、Certificate）
3. マイグレーション管理
4. クエリヘルパー

---

## 依存パッケージ

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
```

---

## ディレクトリ構成

```
control/src/lib/db/
├── index.ts              # DB接続、エクスポート
├── schema/               # スキーマ定義
│   ├── agents.ts
│   ├── gateways.ts
│   ├── tunnels.ts
│   ├── certificates.ts
│   └── index.ts
├── migrations/           # マイグレーションファイル（自動生成）
│   ├── 0000_initial.sql
│   ├── 0001_add_metadata.sql
│   └── meta/
└── queries/              # 複雑なクエリヘルパー
    ├── agents.ts
    ├── gateways.ts
    └── tunnels.ts
```

---

## スキーマ定義

### Agent

```typescript
// control/src/lib/db/schema/agents.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull().unique(),
  wireguardPublicKey: text('wireguard_public_key').notNull().unique(),
  wireguardPrivateKey: text('wireguard_private_key').notNull(), // 秘密鍵も保存（Agentに送信）
  virtualIp: text('virtual_ip').notNull().unique(),
  subnet: text('subnet').notNull().unique(),
  status: text('status', { enum: ['online', 'offline', 'error'] })
    .notNull()
    .default('offline'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
```

---

### Gateway

```typescript
// control/src/lib/db/schema/gateways.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const gateways = sqliteTable('gateways', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  apiKey: text('api_key').notNull().unique(),
  publicIp: text('public_ip').notNull(),
  wireguardPublicKey: text('wireguard_public_key').notNull().unique(),
  wireguardPrivateKey: text('wireguard_private_key').notNull(),
  region: text('region'),
  status: text('status', { enum: ['online', 'offline', 'error'] })
    .notNull()
    .default('offline'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, any>>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Gateway = typeof gateways.$inferSelect;
export type NewGateway = typeof gateways.$inferInsert;
```

---

### Tunnel

```typescript
// control/src/lib/db/schema/tunnels.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { agents } from './agents';

export const tunnels = sqliteTable('tunnels', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text('domain').notNull().unique(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  target: text('target').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Tunnel = typeof tunnels.$inferSelect;
export type NewTunnel = typeof tunnels.$inferInsert;
```

---

### Certificate

```typescript
// control/src/lib/db/schema/certificates.ts

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const certificates = sqliteTable('certificates', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  domain: text('domain').notNull().unique(),
  certificate: text('certificate').notNull(),
  privateKey: text('private_key').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  autoRenew: integer('auto_renew', { mode: 'boolean' }).notNull().default(true),
  lastRenewedAt: integer('last_renewed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Certificate = typeof certificates.$inferSelect;
export type NewCertificate = typeof certificates.$inferInsert;
```

---

### スキーマインデックス

```typescript
// control/src/lib/db/schema/index.ts

export * from './agents';
export * from './gateways';
export * from './tunnels';
export * from './certificates';
```

---

## データベース接続

```typescript
// control/src/lib/db/index.ts

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL || './data/kakuremichi.db';

// SQLiteデータベース接続
const sqlite = new Database(DATABASE_URL);

// Drizzleインスタンス
export const db = drizzle(sqlite, { schema });

// データベースを閉じる
export function closeDatabase() {
  sqlite.close();
}
```

---

## マイグレーション

### 設定ファイル

```typescript
// control/drizzle.config.ts

import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema/index.ts',
  out: './src/lib/db/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || './data/kakuremichi.db',
  },
} satisfies Config;
```

---

### マイグレーション実行

```typescript
// control/src/lib/db/migrate.ts

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const DATABASE_URL = process.env.DATABASE_URL || './data/kakuremichi.db';

export async function runMigrations() {
  const sqlite = new Database(DATABASE_URL);
  const db = drizzle(sqlite);

  console.log('Running migrations...');
  migrate(db, { migrationsFolder: './src/lib/db/migrations' });
  console.log('Migrations completed');

  sqlite.close();
}

// CLIから実行
if (require.main === module) {
  runMigrations().catch(console.error);
}
```

---

### package.jsonスクリプト

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate:sqlite",
    "db:migrate": "tsx src/lib/db/migrate.ts",
    "db:studio": "drizzle-kit studio"
  }
}
```

**使用方法**:
```bash
# スキーマ変更後、マイグレーションファイル生成
npm run db:generate

# マイグレーション実行
npm run db:migrate

# Drizzle Studio起動（GUIでデータベース確認）
npm run db:studio
```

---

## クエリヘルパー

### Agent関連

```typescript
// control/src/lib/db/queries/agents.ts

import { db } from '../index';
import { agents } from '../schema';
import { eq, desc } from 'drizzle-orm';

export async function createAgent(data: {
  name: string;
  apiKey: string;
  wireguardPublicKey: string;
  wireguardPrivateKey: string;
  virtualIp: string;
  subnet: string;
}) {
  const [agent] = await db.insert(agents).values(data).returning();
  return agent;
}

export async function getAgentById(id: string) {
  return db.query.agents.findFirst({
    where: eq(agents.id, id),
  });
}

export async function getAgentByApiKey(apiKey: string) {
  return db.query.agents.findFirst({
    where: eq(agents.apiKey, apiKey),
  });
}

export async function getAllAgents() {
  return db.query.agents.findMany({
    orderBy: [desc(agents.createdAt)],
  });
}

export async function updateAgentStatus(id: string, status: 'online' | 'offline' | 'error') {
  const [updated] = await db
    .update(agents)
    .set({
      status,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();
  return updated;
}

export async function deleteAgent(id: string) {
  await db.delete(agents).where(eq(agents.id, id));
}

export async function getNextAvailableSubnet(): Promise<string> {
  const allAgents = await db.select({ subnet: agents.subnet }).from(agents);

  const usedNumbers = allAgents.map(a => {
    const match = a.subnet.match(/^10\.(\d+)\.0\.0\/24$/);
    return match ? parseInt(match[1]) : 0;
  });

  let nextNumber = 1;
  while (usedNumbers.includes(nextNumber) && nextNumber <= 254) {
    nextNumber++;
  }

  if (nextNumber > 254) {
    throw new Error('No available subnets (max 254 agents)');
  }

  return `10.${nextNumber}.0.0/24`;
}
```

---

### Tunnel関連

```typescript
// control/src/lib/db/queries/tunnels.ts

import { db } from '../index';
import { tunnels, agents } from '../schema';
import { eq, desc } from 'drizzle-orm';

export async function createTunnel(data: {
  domain: string;
  agentId: string;
  target: string;
  description?: string;
}) {
  const [tunnel] = await db.insert(tunnels).values(data).returning();
  return tunnel;
}

export async function getTunnelById(id: string) {
  return db.query.tunnels.findFirst({
    where: eq(tunnels.id, id),
    with: {
      agent: true,
    },
  });
}

export async function getAllTunnels() {
  return db.query.tunnels.findMany({
    orderBy: [desc(tunnels.createdAt)],
    with: {
      agent: true,
    },
  });
}

export async function getTunnelsByAgentId(agentId: string) {
  return db.query.tunnels.findMany({
    where: eq(tunnels.agentId, agentId),
  });
}

export async function updateTunnel(id: string, data: {
  target?: string;
  enabled?: boolean;
  description?: string;
}) {
  const [updated] = await db
    .update(tunnels)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(tunnels.id, id))
    .returning();
  return updated;
}

export async function deleteTunnel(id: string) {
  await db.delete(tunnels).where(eq(tunnels.id, id));
}
```

---

## リレーション定義

```typescript
// control/src/lib/db/schema/relations.ts

import { relations } from 'drizzle-orm';
import { agents, tunnels } from './index';

export const agentsRelations = relations(agents, ({ many }) => ({
  tunnels: many(tunnels),
}));

export const tunnelsRelations = relations(tunnels, ({ one }) => ({
  agent: one(agents, {
    fields: [tunnels.agentId],
    references: [agents.id],
  }),
}));
```

スキーマインデックスに追加:
```typescript
// control/src/lib/db/schema/index.ts

export * from './agents';
export * from './gateways';
export * from './tunnels';
export * from './certificates';
export * from './relations';
```

---

## 使用例

```typescript
// control/src/app/api/agents/route.ts

import { createAgent, getAllAgents, getNextAvailableSubnet } from '@/lib/db/queries/agents';
import { generateWireGuardKeyPair, generateApiKey } from '@/lib/utils';

export async function POST(req: Request) {
  const { name } = await req.json();

  // WireGuard鍵ペア生成
  const { publicKey, privateKey } = generateWireGuardKeyPair();

  // API Key生成
  const apiKey = generateApiKey('agt');

  // サブネット自動割り当て
  const subnet = await getNextAvailableSubnet();
  const virtualIp = subnet.replace('.0.0/24', '.0.100');

  // Agent作成
  const agent = await createAgent({
    name,
    apiKey,
    wireguardPublicKey: publicKey,
    wireguardPrivateKey: privateKey,
    virtualIp,
    subnet,
  });

  return Response.json(agent, { status: 201 });
}

export async function GET() {
  const agents = await getAllAgents();
  return Response.json({ agents, total: agents.length });
}
```

---

## テスト

```typescript
// control/tests/unit/db/queries/agents.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createAgent, getAgentById, getNextAvailableSubnet } from '@/lib/db/queries/agents';

describe('Agent queries', () => {
  beforeEach(async () => {
    // テストDB初期化
  });

  it('should create agent', async () => {
    const agent = await createAgent({
      name: 'test-agent',
      apiKey: 'agt_test123',
      wireguardPublicKey: 'pubkey',
      wireguardPrivateKey: 'privkey',
      virtualIp: '10.1.0.100',
      subnet: '10.1.0.0/24',
    });

    expect(agent.name).toBe('test-agent');
    expect(agent.status).toBe('offline');
  });

  it('should get next available subnet', async () => {
    await createAgent({
      name: 'agent1',
      apiKey: 'agt_1',
      wireguardPublicKey: 'pub1',
      wireguardPrivateKey: 'priv1',
      virtualIp: '10.1.0.100',
      subnet: '10.1.0.0/24',
    });

    const nextSubnet = await getNextAvailableSubnet();
    expect(nextSubnet).toBe('10.2.0.0/24');
  });
});
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
