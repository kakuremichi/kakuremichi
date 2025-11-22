# インストールスクリプト

## 概要

Agent/Gatewayのワンライナーインストールスクリプト。コピペだけでセットアップ完了。

**パス**:
- `control/public/install/agent.sh`
- `control/public/install/gateway.sh`

---

## 責務

1. 必要なパッケージのインストール確認
2. バイナリのダウンロード
3. 設定ファイルの作成
4. systemdサービスの作成・有効化
5. サービスの起動

---

## agent.sh

### 使用方法

```bash
curl -sSL https://control.example.com/install/agent.sh | sh -s -- \
  --api-key=agt_xxxxxxxxxxxx \
  --control-url=https://control.example.com
```

---

### スクリプト内容

```bash
#!/bin/bash

set -e

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}kakuremichi Agent インストールスクリプト${NC}"
echo ""

# 引数パース
API_KEY=""
CONTROL_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --api-key)
      API_KEY="$2"
      shift 2
      ;;
    --control-url)
      CONTROL_URL="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# 必須パラメータチェック
if [ -z "$API_KEY" ] || [ -z "$CONTROL_URL" ]; then
  echo -e "${RED}Error: --api-key and --control-url are required${NC}"
  echo "Usage: curl -sSL https://control.example.com/install/agent.sh | sh -s -- --api-key=xxx --control-url=xxx"
  exit 1
fi

# OSとアーキテクチャ検出
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case $ARCH in
  x86_64)
    ARCH="amd64"
    ;;
  aarch64 | arm64)
    ARCH="arm64"
    ;;
  *)
    echo -e "${RED}Unsupported architecture: $ARCH${NC}"
    exit 1
    ;;
esac

echo -e "${YELLOW}Detected OS: $OS, Arch: $ARCH${NC}"

# バイナリURL
BINARY_URL="https://github.com/yourorg/kakuremichi/releases/latest/download/agent-${OS}-${ARCH}"

# インストールディレクトリ
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/kakuremichi"
DATA_DIR="/var/lib/kakuremichi"

# root権限チェック
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# ディレクトリ作成
echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p $CONFIG_DIR
mkdir -p $DATA_DIR

# バイナリダウンロード
echo -e "${YELLOW}Downloading agent binary...${NC}"
curl -L -o $INSTALL_DIR/kakuremichi-agent $BINARY_URL

# 実行権限付与
chmod +x $INSTALL_DIR/kakuremichi-agent

echo -e "${GREEN}Binary installed to $INSTALL_DIR/kakuremichi-agent${NC}"

# 設定ファイル作成
echo -e "${YELLOW}Creating configuration file...${NC}"
cat > $CONFIG_DIR/agent.conf <<EOF
# kakuremichi Agent Configuration
CONTROL_URL=$CONTROL_URL
API_KEY=$API_KEY
EOF

chmod 600 $CONFIG_DIR/agent.conf

echo -e "${GREEN}Configuration saved to $CONFIG_DIR/agent.conf${NC}"

# systemdサービス作成
echo -e "${YELLOW}Creating systemd service...${NC}"
cat > /etc/systemd/system/kakuremichi-agent.service <<EOF
[Unit]
Description=kakuremichi Agent
After=network.target

[Service]
Type=simple
User=root
EnvironmentFile=$CONFIG_DIR/agent.conf
ExecStart=$INSTALL_DIR/kakuremichi-agent
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# systemd reload
systemctl daemon-reload

# サービス有効化・起動
echo -e "${YELLOW}Enabling and starting service...${NC}"
systemctl enable kakuremichi-agent
systemctl start kakuremichi-agent

# ステータス確認
sleep 2
if systemctl is-active --quiet kakuremichi-agent; then
  echo -e "${GREEN}✓ Agent is running successfully!${NC}"
  echo ""
  echo "To check status: sudo systemctl status kakuremichi-agent"
  echo "To view logs: sudo journalctl -u kakuremichi-agent -f"
else
  echo -e "${RED}✗ Failed to start agent${NC}"
  echo "Check logs: sudo journalctl -u kakuremichi-agent -n 50"
  exit 1
fi
```

---

## gateway.sh

### 使用方法

```bash
curl -sSL https://control.example.com/install/gateway.sh | sh -s -- \
  --api-key=gtw_xxxxxxxxxxxx \
  --control-url=https://control.example.com
```

---

### スクリプト内容

```bash
#!/bin/bash

set -e

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}kakuremichi Gateway インストールスクリプト${NC}"
echo ""

# 引数パース
API_KEY=""
CONTROL_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --api-key)
      API_KEY="$2"
      shift 2
      ;;
    --control-url)
      CONTROL_URL="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# 必須パラメータチェック
if [ -z "$API_KEY" ] || [ -z "$CONTROL_URL" ]; then
  echo -e "${RED}Error: --api-key and --control-url are required${NC}"
  exit 1
fi

# OSとアーキテクチャ検出
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case $ARCH in
  x86_64) ARCH="amd64" ;;
  aarch64 | arm64) ARCH="arm64" ;;
  *)
    echo -e "${RED}Unsupported architecture: $ARCH${NC}"
    exit 1
    ;;
esac

echo -e "${YELLOW}Detected OS: $OS, Arch: $ARCH${NC}"

# root権限チェック
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# WireGuard確認（Gatewayは必須）
if ! command -v wg &> /dev/null; then
  echo -e "${YELLOW}WireGuard not found, installing...${NC}"

  # Debian/Ubuntu
  if command -v apt-get &> /dev/null; then
    apt-get update
    apt-get install -y wireguard
  # RHEL/CentOS
  elif command -v yum &> /dev/null; then
    yum install -y epel-release
    yum install -y wireguard-tools
  else
    echo -e "${RED}Could not install WireGuard automatically${NC}"
    echo "Please install WireGuard manually and run this script again"
    exit 1
  fi
fi

# バイナリURL
BINARY_URL="https://github.com/yourorg/kakuremichi/releases/latest/download/gateway-${OS}-${ARCH}"

# インストールディレクトリ
INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/kakuremichi"
CERT_DIR="/var/cache/kakuremichi/certs"

# ディレクトリ作成
echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p $CONFIG_DIR
mkdir -p $CERT_DIR

# バイナリダウンロード
echo -e "${YELLOW}Downloading gateway binary...${NC}"
curl -L -o $INSTALL_DIR/kakuremichi-gateway $BINARY_URL

# 実行権限付与
chmod +x $INSTALL_DIR/kakuremichi-gateway

echo -e "${GREEN}Binary installed to $INSTALL_DIR/kakuremichi-gateway${NC}"

# 設定ファイル作成
echo -e "${YELLOW}Creating configuration file...${NC}"
cat > $CONFIG_DIR/gateway.conf <<EOF
# kakuremichi Gateway Configuration
CONTROL_URL=$CONTROL_URL
API_KEY=$API_KEY

# WireGuard
WIREGUARD_PORT=51820

# HTTP/HTTPS
HTTP_PORT=80
HTTPS_PORT=443

# Let's Encrypt
ACME_EMAIL=admin@example.com
ACME_STAGING=false
CERT_CACHE_DIR=$CERT_DIR
EOF

chmod 600 $CONFIG_DIR/gateway.conf

echo -e "${GREEN}Configuration saved to $CONFIG_DIR/gateway.conf${NC}"

# ファイアウォール設定（UFWの場合）
if command -v ufw &> /dev/null; then
  echo -e "${YELLOW}Configuring firewall (UFW)...${NC}"
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 51820/udp
  echo -e "${GREEN}Firewall rules added${NC}"
fi

# systemdサービス作成
echo -e "${YELLOW}Creating systemd service...${NC}"
cat > /etc/systemd/system/kakuremichi-gateway.service <<EOF
[Unit]
Description=kakuremichi Gateway
After=network.target

[Service]
Type=simple
User=root
EnvironmentFile=$CONFIG_DIR/gateway.conf
ExecStart=$INSTALL_DIR/kakuremichi-gateway
Restart=always
RestartSec=5

# Capabilities
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

# systemd reload
systemctl daemon-reload

# サービス有効化・起動
echo -e "${YELLOW}Enabling and starting service...${NC}"
systemctl enable kakuremichi-gateway
systemctl start kakuremichi-gateway

# ステータス確認
sleep 2
if systemctl is-active --quiet kakuremichi-gateway; then
  echo -e "${GREEN}✓ Gateway is running successfully!${NC}"
  echo ""
  echo "To check status: sudo systemctl status kakuremichi-gateway"
  echo "To view logs: sudo journalctl -u kakuremichi-gateway -f"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "1. Configure DNS records to point to this server's IP"
  echo "2. Create tunnels in the Control panel"
else
  echo -e "${RED}✗ Failed to start gateway${NC}"
  echo "Check logs: sudo journalctl -u kakuremichi-gateway -n 50"
  exit 1
fi
```

---

## Control側でのスクリプト配信

```typescript
// control/src/app/install/agent.sh/route.ts

import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  const scriptPath = path.join(process.cwd(), 'public', 'install', 'agent.sh');
  const script = await fs.readFile(scriptPath, 'utf-8');

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/x-shellscript',
      'Content-Disposition': 'inline; filename="agent.sh"',
    },
  });
}
```

同様に `gateway.sh/route.ts` も作成。

---

## WebUIでの表示

```typescript
// control/src/app/agents/new/page.tsx

'use client';

import { useState } from 'react';

export default function NewAgentPage() {
  const [agent, setAgent] = useState(null);
  const [name, setName] = useState('');

  const createAgent = async () => {
    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setAgent(data);
  };

  return (
    <div>
      <h1>Add New Agent</h1>

      {!agent ? (
        <div>
          <input
            type="text"
            placeholder="Agent name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button onClick={createAgent}>Create Agent</button>
        </div>
      ) : (
        <div>
          <h2>Agent Created!</h2>
          <p>Run this command on your server:</p>
          <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px' }}>
            {agent.installCommand}
          </pre>
          <button onClick={() => navigator.clipboard.writeText(agent.installCommand)}>
            Copy to Clipboard
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## アンインストールスクリプト

### uninstall-agent.sh

```bash
#!/bin/bash

set -e

echo "Uninstalling kakuremichi Agent..."

# サービス停止・無効化
systemctl stop kakuremichi-agent || true
systemctl disable kakuremichi-agent || true

# サービスファイル削除
rm -f /etc/systemd/system/kakuremichi-agent.service
systemctl daemon-reload

# バイナリ削除
rm -f /usr/local/bin/kakuremichi-agent

# 設定ファイル削除（確認）
read -p "Remove configuration files? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  rm -rf /etc/kakuremichi
  rm -rf /var/lib/kakuremichi
  echo "Configuration files removed"
fi

echo "Uninstall complete"
```

---

## テスト

### インストールスクリプトのテスト

```bash
# Dockerコンテナでテスト
docker run -it --rm ubuntu:22.04 bash

# スクリプト実行
curl -sSL http://localhost:3000/install/agent.sh | bash -s -- \
  --api-key=agt_test \
  --control-url=ws://host.docker.internal:3000

# ステータス確認
systemctl status kakuremichi-agent
journalctl -u kakuremichi-agent -n 20
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
