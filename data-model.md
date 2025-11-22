# kakuremichi - データモデル設計

## 概要

Controlサーバーで管理するデータベーススキーマを定義します。

**データベース**: SQLite（MVP）
**ORM**: Drizzle ORM
**マイグレーション**: Drizzle Kit

---

## エンティティ一覧

### MVP（Phase 1）で必要なエンティティ

1. **Agent** - エッジクライアント（オリジン側）
2. **Gateway** - 入口ノード
3. **Tunnel** - トンネル設定（ドメイン → Agent のマッピング）

**注**: TLS証明書はGatewayが独立して管理するため、ControlのDBには保存しない

### Phase 2以降で追加予定

5. **User** - ユーザーアカウント
6. **Organization** - 組織
7. **AccessControl** - アクセス制御（Tunnel ⇔ User）

---

## MVP エンティティ詳細

### 1. Agent

エッジクライアント（オリジン側に配置）

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| id | UUID | ✓ | プライマリキー |
| name | String | ✓ | Agent名（ユーザーが設定、例: "home-server"） |
| api_key | String | ✓ | 認証用APIキー（Control接続時に使用） |
| wireguard_public_key | String | ✓ | WireGuard公開鍵（**Agentがローカルで生成した秘密鍵の公開鍵**） |
| virtual_ip | String | ✓ | WireGuard仮想IP（例: "10.1.0.100"） |
| subnet | String | ✓ | Agent専用サブネット（例: "10.1.0.0/24"） |
| status | Enum | ✓ | ステータス（online, offline, error） |
| last_seen_at | DateTime | - | 最終接続日時 |
| metadata | JSON | - | 追加情報（バージョン、OS、など） |
| created_at | DateTime | ✓ | 作成日時 |
| updated_at | DateTime | ✓ | 更新日時 |

**インデックス**:
- `api_key` (UNIQUE)
- `wireguard_public_key` (UNIQUE)
- `virtual_ip` (UNIQUE)
- `subnet` (UNIQUE)

**バリデーション**:
- `name`: 1〜64文字、英数字とハイフン・アンダースコアのみ
- `api_key`: 自動生成（例: `agt_` + 32文字のランダム文字列）
- `subnet`: IPv4 CIDR形式、自動割り当て（10.1.0.0/24, 10.2.0.0/24, ...）
- `virtual_ip`: IPv4アドレス形式、自動割り当て（サブネットの.100）

---

### 2. Gateway

入口ノード（外部ユーザーからのトラフィックを受信）

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| id | UUID | ✓ | プライマリキー |
| name | String | ✓ | Gateway名（例: "gateway-tokyo"） |
| api_key | String | ✓ | 認証用APIキー（Control接続時に使用） |
| public_ip | String | ✓ | グローバルIP（例: "1.2.3.4"） |
| wireguard_public_key | String | ✓ | WireGuard公開鍵（**Gatewayがローカルで生成した秘密鍵の公開鍵**） |
| region | String | - | リージョン（例: "tokyo", "singapore"） |
| status | Enum | ✓ | ステータス（online, offline, error） |
| last_seen_at | DateTime | - | 最終接続日時 |
| metadata | JSON | - | 追加情報 |
| created_at | DateTime | ✓ | 作成日時 |
| updated_at | DateTime | ✓ | 更新日時 |

**インデックス**:
- `api_key` (UNIQUE)
- `public_ip` (UNIQUE)
- `wireguard_public_key` (UNIQUE)

**バリデーション**:
- `name`: 1〜64文字、英数字とハイフン・アンダースコアのみ
- `public_ip`: IPv4アドレス形式、自動検出または手動入力
- `api_key`: 自動生成（例: `gtw_` + 32文字のランダム文字列）

**注**: Gatewayテーブルにも`api_key`カラムが必要（上記テーブル定義に追加）

---

### 3. Tunnel

トンネル設定（ドメイン → Agent → ターゲットのマッピング）

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| id | UUID | ✓ | プライマリキー |
| domain | String | ✓ | ドメイン名（例: "app.example.com"） |
| agent_id | UUID | ✓ | Agent ID（外部キー） |
| target | String | ✓ | プロキシ先（例: "localhost:8080"） |
| enabled | Boolean | ✓ | 有効/無効（デフォルト: true） |
| description | String | - | 説明 |
| created_at | DateTime | ✓ | 作成日時 |
| updated_at | DateTime | ✓ | 更新日時 |

**インデックス**:
- `domain` (UNIQUE)
- `agent_id`

**リレーション**:
- `agent_id` → `Agent.id` (多対一)

**バリデーション**:
- `domain`: ドメイン形式（例: "app.example.com"）
- `target`: ホスト:ポート形式（例: "localhost:8080", "192.168.1.10:3000"）

---

## ER図

```
┌─────────┐
│ Gateway │
└─────────┘
    (複数)
      │
      │ (WireGuard接続、設定のみ保持)
      │
┌─────────┐        ┌─────────┐
│  Agent  │◄──────│ Tunnel  │
└─────────┘ 1    * └─────────┘
                      (domain)
```

**関係性**:
- 1つの**Agent**は複数の**Tunnel**を持つ（1対多）
- 1つの**Tunnel**は1つの**Agent**に属する（多対1）
- **Gateway**は設定のみ保持（Agent/Tunnelとの直接的なDB関係なし）
- **TLS証明書**: GatewayがLet's Encrypt autocertで独立して管理（ControlのDBには保存しない）

---

## Drizzle ORM スキーマ例

```typescript
// schema/agent.ts
import { pgTable, uuid, varchar, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  apiKey: varchar('api_key', { length: 64 }).notNull().unique(),
  wireguardPublicKey: varchar('wireguard_public_key', { length: 256 }).notNull().unique(),
  virtualIp: varchar('virtual_ip', { length: 15 }).notNull().unique(),
  subnet: varchar('subnet', { length: 18 }).notNull().unique(),
  status: varchar('status', { length: 16 }).notNull().default('offline'),
  lastSeenAt: timestamp('last_seen_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// schema/gateway.ts
export const gateways = pgTable('gateways', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  apiKey: varchar('api_key', { length: 64 }).notNull().unique(),
  publicIp: varchar('public_ip', { length: 15 }).notNull().unique(),
  wireguardPublicKey: varchar('wireguard_public_key', { length: 256 }).notNull().unique(),
  region: varchar('region', { length: 32 }),
  status: varchar('status', { length: 16 }).notNull().default('offline'),
  lastSeenAt: timestamp('last_seen_at'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// schema/tunnel.ts
export const tunnels = pgTable('tunnels', {
  id: uuid('id').defaultRandom().primaryKey(),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  target: varchar('target', { length: 255 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

**注**: TLS証明書はGatewayが独立して管理するため、certificatesテーブルは不要

**注意**: SQLiteを使用する場合は、`pgTable`の代わりに`sqliteTable`を使用し、一部の型を調整する必要があります。

---

## API設計との関連

### Control ⇔ Agent/Gateway

**WebSocket経由で送信される設定**:

```typescript
// Agentに送信
{
  type: 'config',
  data: {
    agent: {
      id: 'uuid',
      virtualIp: '10.1.0.100',
      subnet: '10.1.0.0/24',
    },
    gateways: [
      { id: 'uuid', publicIp: '1.2.3.4', wireguardPublicKey: '...' },
      { id: 'uuid', publicIp: '5.6.7.8', wireguardPublicKey: '...' },
    ],
    tunnels: [
      { domain: 'app.example.com', target: 'localhost:8080' },
    ],
  }
}

// Gatewayに送信
{
  type: 'config',
  data: {
    gateway: {
      id: 'uuid',
      publicIp: '1.2.3.4',
    },
    agents: [
      { id: 'uuid', virtualIp: '10.1.0.100', subnet: '10.1.0.0/24', wireguardPublicKey: '...' },
      { id: 'uuid', virtualIp: '10.2.0.100', subnet: '10.2.0.0/24', wireguardPublicKey: '...' },
    ],
    tunnels: [
      { domain: 'app.example.com', agentVirtualIp: '10.1.0.100', target: 'localhost:8080' },
    ],
  }
}

// 注: TLS証明書はGatewayが独立して管理するため、WebSocket経由での配信は不要
```

---

## データフロー

### 1. Agent登録フロー

```
1. Agent起動 → Control に WebSocket 接続
2. Agent が api_key を送信
3. Control が認証
   - 新規: Agent レコード作成、WireGuard設定生成
   - 既存: Agent レコード更新（status = online）
4. Control が設定を Agent に送信（WireGuard、Tunnel）
5. Agent が WireGuard トンネル確立
```

### 2. Tunnel作成フロー

```
1. ユーザーがWebUIでTunnel作成
2. Control がTunnelレコード作成（domain, agent_id, target）
3. Control が全Gatewayに新しいTunnel設定を送信（WebSocket）
4. Gateway がルーティング設定を更新（autocert HostPolicyにドメイン追加）
5. Gateway が初回HTTPS接続時にLet's Encryptで証明書を自動取得
6. 証明書はGatewayのローカルキャッシュ（/var/cache/autocert/）に保存
```

**重要**: Control PlaneはTLS証明書の取得・保存・配布を一切行わない

---

## Phase 2以降のエンティティ（参考）

### User

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| id | UUID | ✓ | プライマリキー |
| email | String | ✓ | メールアドレス |
| password_hash | String | ✓ | パスワードハッシュ |
| name | String | - | 表示名 |
| created_at | DateTime | ✓ | 作成日時 |
| updated_at | DateTime | ✓ | 更新日時 |

### Organization

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| id | UUID | ✓ | プライマリキー |
| name | String | ✓ | 組織名 |
| created_at | DateTime | ✓ | 作成日時 |
| updated_at | DateTime | ✓ | 更新日時 |

### AccessControl

| カラム名 | 型 | 必須 | 説明 |
|---------|-----|------|------|
| id | UUID | ✓ | プライマリキー |
| tunnel_id | UUID | ✓ | Tunnel ID |
| user_id | UUID | ✓ | User ID |
| created_at | DateTime | ✓ | 作成日時 |

---

## ワンライナーセットアップフロー

### Agent追加フロー

**コントロールパネル側**:
1. ユーザーが「Add Agent」ボタンをクリック
2. 名前を入力（例: "home-server"）
3. Controlが以下を自動生成:
   - API Key（例: `agt_a1b2c3d4e5f6g7h8i9j0...`）
   - WireGuard鍵ペア（公開鍵・秘密鍵）
   - サブネット自動割り当て（例: `10.3.0.0/24`）
   - 仮想IP自動割り当て（例: `10.3.0.100`）
   - Agentレコードをデータベースに保存
4. ワンライナーコマンドを表示:
   ```bash
   curl -sSL https://control.example.com/install/agent.sh | sh -s -- \
     --api-key=agt_a1b2c3d4e5f6g7h8i9j0... \
     --control-url=https://control.example.com
   ```
5. コピーボタンでクリップボードにコピー

**ユーザー側（サーバー）**:
1. コマンドをサーバーで実行
2. スクリプト（`agent.sh`）が以下を自動実行:
   - Agentバイナリをダウンロード
   - 設定ファイルを作成（`/etc/kakuremichi/agent.conf`）
   - systemdサービスを作成・有効化
   - Agentを起動
3. AgentがControlにWebSocket接続
4. Control側で認証（API Key）
5. ControlがAgentに設定を送信（WireGuard設定、Tunnel一覧）
6. AgentがWireGuardトンネルを確立
7. コントロールパネルで「online」ステータスに変化

### Gateway追加フロー

**コントロールパネル側**:
1. ユーザーが「Add Gateway」ボタンをクリック
2. 名前とリージョンを入力（例: "gateway-tokyo", "tokyo"）
3. Controlが以下を自動生成:
   - API Key（例: `gtw_k1l2m3n4o5p6q7r8s9t0...`）
   - WireGuard鍵ペア
   - Gatewayレコードをデータベースに保存
4. ワンライナーコマンドを表示:
   ```bash
   curl -sSL https://control.example.com/install/gateway.sh | sh -s -- \
     --api-key=gtw_k1l2m3n4o5p6q7r8s9t0... \
     --control-url=https://control.example.com
   ```

**ユーザー側（サーバー）**:
1. コマンドをサーバーで実行
2. スクリプト（`gateway.sh`）が以下を自動実行:
   - Gatewayバイナリをダウンロード
   - 設定ファイルを作成
   - systemdサービスを作成・有効化
   - Gatewayを起動
3. GatewayがControlにWebSocket接続
4. Control側で認証（API Key）
5. ControlがGatewayに設定を送信（全Agent情報、全Tunnel、証明書）
6. GatewayがWireGuardインターフェースを設定
7. コントロールパネルで「online」ステータスに変化

### サブネット自動割り当てロジック

```typescript
// 既存のAgentのサブネットを取得
const existingSubnets = await db.select({ subnet: agents.subnet }).from(agents);

// 使用済みのサブネット番号を抽出（例: ["10.1.0.0/24", "10.2.0.0/24"] → [1, 2]）
const usedNumbers = existingSubnets.map(s => parseInt(s.subnet.split('.')[1]));

// 次の空き番号を見つける（1から254まで）
let nextNumber = 1;
while (usedNumbers.includes(nextNumber) && nextNumber <= 254) {
  nextNumber++;
}

if (nextNumber > 254) {
  throw new Error('No available subnets (max 254 agents)');
}

// 新しいサブネットを生成
const subnet = `10.${nextNumber}.0.0/24`;
const virtualIp = `10.${nextNumber}.0.100`;
```

---

## セキュリティ考慮事項

### WireGuard鍵管理（ゼロ知識アーキテクチャ）

#### MVP（Phase 1）- **ゼロ知識原則**

**基本方針**:
- **Control PlaneはWireGuard秘密鍵について一切関知しない**
- Agent/Gatewayが自身の秘密鍵をローカルで生成・保持
- Controlには**公開鍵のみ**を登録
- Controlが侵害されても、WireGuardトンネルは保護される

**鍵生成フロー**:

1. **Agent/Gateway起動時**:
   - ローカルで秘密鍵を生成（Curve25519）
   - 秘密鍵をローカルファイルに保存（`/etc/kakuremichi/agent.conf`）
   - 公開鍵を計算

2. **Control への初回接続**:
   - WebSocket接続時に`api_key`と`wireguard_public_key`を送信
   - Controlは公開鍵のみをDBに保存
   - 秘密鍵はネットワーク経由で送信されない

3. **設定受信**:
   - Controlから仮想IP、サブネット、他のPeerの公開鍵を受信
   - ローカルの秘密鍵と組み合わせてWireGuardを設定

**Controlが保存するデータ**:
- ✅ WireGuard公開鍵（DBに保存）
- ✅ 仮想IP、サブネット
- ❌ WireGuard秘密鍵（**保存しない、配信しない**）

**セキュリティ上のメリット**:
- Controlサーバーが侵害されても、秘密鍵は漏洩しない
- ネットワーク盗聴されても、秘密鍵は傍受されない
- 秘密鍵はAgent/Gatewayのローカルディスクにのみ存在

#### TLS証明書秘密鍵

**SSL証明書の秘密鍵**:
- **Gateway自身がautocertで取得・管理**（`gateway-http-proxy.md`参照）
- Control PlaneはTLS証明書・秘密鍵について一切関知しない
- 証明書はGatewayのローカルキャッシュに保存（`/var/cache/autocert/`）
- 各Gatewayが独立してLet's Encryptから証明書を取得
- Control Plane侵害時もTLS通信は保護される

#### Phase 2以降

**秘密鍵ローテーション**:
- Agent/Gatewayが定期的に新しい鍵ペアを生成
- 新しい公開鍵をControlに登録
- 古い鍵を無効化

**証明書管理の強化**:
- DNS-01チャレンジへの移行（複数Gateway環境でより確実）
- 複数Gateway間での証明書共有（共有ストレージ使用、オプション）
- ワイルドカード証明書対応（`*.example.com`）

#### Agent/Gatewayローカル保存

**保存場所**:
- Agent: `/etc/kakuremichi/agent.conf`
- Gateway: `/etc/kakuremichi/gateway.conf`

**権限**:
```bash
chmod 600 /etc/kakuremichi/{agent,gateway}.conf
chown root:root /etc/kakuremichi/{agent,gateway}.conf
```

**設定ファイル形式**:
```yaml
# /etc/kakuremichi/agent.conf
control_url: https://control.example.com
api_key: agt_xxx
wireguard_private_key: base64-encoded-key
virtual_ip: 10.1.0.100
```

**セキュリティ**:
- ファイルは所有者（root）のみ読み取り可能
- systemdサービスはroot権限で実行
- Docker環境ではsecretマウントを使用

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
