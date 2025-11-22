# Agent - WireGuard + netstack

## 概要

AgentのWireGuard実装。ユーザースペースでWireGuardを動作させ、ポート開放不要でGatewayとのトンネルを確立。

**パス**: `agent/internal/wireguard/`

---

## 責務

1. ユーザースペースWireGuardデバイスの作成（ポート開放不要）
2. netstackによる仮想ネットワークスタック
3. 複数Gatewayへの接続
4. 仮想IPでのHTTPリスニング
5. トンネルの監視・維持

---

## 依存パッケージ

```go
import (
    "golang.zx2c4.com/wireguard/device"
    "golang.zx2c4.com/wireguard/tun/netstack"
    "golang.zx2c4.com/wireguard/conn"
    "gvisor.dev/gvisor/pkg/tcpip"
    "gvisor.dev/gvisor/pkg/tcpip/stack"
    "gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
    "gvisor.dev/gvisor/pkg/tcpip/transport/tcp"
)
```

---

## 構造体定義

```go
// agent/internal/wireguard/manager.go

type Config struct {
    PrivateKey string        // Agent秘密鍵
    VirtualIP  string        // 例: "10.1.0.100"
    Subnet     string        // 例: "10.1.0.0/24"
    Gateways   []GatewayInfo // 接続先Gateway一覧
}

type GatewayInfo struct {
    ID        string
    Name      string
    PublicKey string   // Gateway公開鍵
    Endpoint  string   // 例: "1.2.3.4:51820"
    VirtualIP string   // 例: "10.1.0.1"
}

type Manager struct {
    config      Config
    device      *device.Device
    tun         *netstack.Net
    tcpipStack  *stack.Stack
    logger      *slog.Logger
}
```

---

## 主要メソッド

### `NewManager(config Config, logger *slog.Logger) (*Manager, error)`

**処理フロー**:
1. netstack TUNデバイスを作成
2. WireGuardデバイスを作成
3. 秘密鍵を設定
4. Gatewayをpeerとして追加
5. netstackを初期化
6. 仮想IPアドレスを設定

**サンプルコード**:
```go
func NewManager(config Config, logger *slog.Logger) (*Manager, error) {
    logger.Info("Creating WireGuard manager",
        "virtualIP", config.VirtualIP,
        "subnet", config.Subnet,
        "gateways", len(config.Gateways),
    )

    // netstack TUN作成
    tun, tcpipStack, err := netstack.CreateNetTUN(
        []netip.Addr{netip.MustParseAddr(config.VirtualIP)},
        []netip.Addr{}, // DNS servers
        device.DefaultMTU,
    )
    if err != nil {
        return nil, fmt.Errorf("failed to create netstack TUN: %w", err)
    }

    // WireGuardデバイス作成
    wgDevice := device.NewDevice(tun, conn.NewDefaultBind(), device.NewLogger(
        device.LogLevelDebug,
        "[wireguard] ",
    ))

    // IPC設定文字列を生成
    ipcConfig := fmt.Sprintf("private_key=%s\n", config.PrivateKey)

    // 各Gatewayをpeerとして追加
    for _, gateway := range config.Gateways {
        ipcConfig += fmt.Sprintf(
            "public_key=%s\nendpoint=%s\nallowed_ip=%s/32\npersistent_keepalive_interval=25\n",
            gateway.PublicKey,
            gateway.Endpoint,
            gateway.VirtualIP,
        )
    }

    // 設定を適用
    if err := wgDevice.IpcSet(ipcConfig); err != nil {
        tun.Close()
        return nil, fmt.Errorf("failed to configure device: %w", err)
    }

    // デバイスをUp
    wgDevice.Up()

    logger.Info("WireGuard device created successfully")

    return &Manager{
        config:     config,
        device:     wgDevice,
        tun:        tun,
        tcpipStack: tcpipStack,
        logger:     logger,
    }, nil
}
```

---

### `UpdateGateways(gateways []GatewayInfo) error`

Controlからの設定更新時に呼び出す。Gateway一覧を更新。

**サンプルコード**:
```go
func (m *Manager) UpdateGateways(gateways []GatewayInfo) error {
    m.logger.Info("Updating gateways", "count", len(gateways))

    // 現在の設定をクリア（すべてのpeerを削除）
    for _, gw := range m.config.Gateways {
        ipcConfig := fmt.Sprintf("public_key=%s\nremove=true\n", gw.PublicKey)
        m.device.IpcSet(ipcConfig)
    }

    // 新しいGatewayを追加
    for _, gateway := range gateways {
        ipcConfig := fmt.Sprintf(
            "public_key=%s\nendpoint=%s\nallowed_ip=%s/32\npersistent_keepalive_interval=25\n",
            gateway.PublicKey,
            gateway.Endpoint,
            gateway.VirtualIP,
        )

        if err := m.device.IpcSet(ipcConfig); err != nil {
            m.logger.Error("Failed to add gateway", "gateway", gateway.Name, "error", err)
        } else {
            m.logger.Info("Gateway added", "name", gateway.Name, "endpoint", gateway.Endpoint)
        }
    }

    m.config.Gateways = gateways

    return nil
}
```

---

### `GetListener(port int) (net.Listener, error)`

仮想IP上でTCPリスナーを取得。LocalProxyがこれを使ってHTTPサーバーを起動。

**サンプルコード**:
```go
func (m *Manager) GetListener(port int) (net.Listener, error) {
    addr := fmt.Sprintf("%s:%d", m.config.VirtualIP, port)
    m.logger.Info("Creating listener", "addr", addr)

    // netstackを使ってリスナー作成
    listener, err := m.tun.ListenTCP(&net.TCPAddr{
        IP:   net.ParseIP(m.config.VirtualIP),
        Port: port,
    })

    if err != nil {
        return nil, fmt.Errorf("failed to create listener: %w", err)
    }

    m.logger.Info("Listener created successfully", "addr", addr)
    return listener, nil
}
```

---

### `Dial(network, address string) (net.Conn, error)`

仮想IP経由で外部に接続（Agentから他のサービスに接続する場合）

**サンプルコード**:
```go
func (m *Manager) Dial(network, address string) (net.Conn, error) {
    return m.tun.Dial(network, address)
}
```

---

### `GetStats() (map[string]PeerStats, error)`

各Gateway（peer）の統計情報を取得

**サンプルコード**:
```go
type PeerStats struct {
    PublicKey          string
    Endpoint           string
    RxBytes            int64
    TxBytes            int64
    LastHandshakeTime  time.Time
}

func (m *Manager) GetStats() (map[string]PeerStats, error) {
    ipcState, err := m.device.IpcGetOperation()
    if err != nil {
        return nil, err
    }

    stats := make(map[string]PeerStats)

    // IPCの出力をパースして統計情報を取得
    // （実装の詳細は省略）

    return stats, nil
}
```

---

### `Close() error`

WireGuardデバイスとnetstackを停止

**サンプルコード**:
```go
func (m *Manager) Close() error {
    m.logger.Info("Closing WireGuard manager")

    m.device.Down()
    m.tun.Close()

    m.logger.Info("WireGuard manager closed")
    return nil
}
```

---

## LocalProxyとの統合

```go
// agent/internal/proxy/local.go

type LocalProxy struct {
    wgManager *wireguard.Manager
    // ...
}

func (p *LocalProxy) Start() error {
    // WireGuardの仮想IPでリスナー取得
    listener, err := p.wgManager.GetListener(80)
    if err != nil {
        return err
    }

    p.server = &http.Server{
        Handler: http.HandlerFunc(p.handleRequest),
    }

    return p.server.Serve(listener)
}
```

---

## 使用例

```go
// agent/cmd/agent/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // WireGuard設定（Controlから受信）
    wgConfig := wireguard.Config{
        PrivateKey: "agent-private-key",
        VirtualIP:  "10.1.0.100",
        Subnet:     "10.1.0.0/24",
        Gateways: []wireguard.GatewayInfo{
            {
                ID:        "gw1",
                Name:      "gateway-tokyo",
                PublicKey: "gateway1-public-key",
                Endpoint:  "1.2.3.4:51820",
                VirtualIP: "10.1.0.1",
            },
            {
                ID:        "gw2",
                Name:      "gateway-singapore",
                PublicKey: "gateway2-public-key",
                Endpoint:  "5.6.7.8:51820",
                VirtualIP: "10.1.0.2",
            },
        },
    }

    // WireGuardマネージャー作成
    wgManager, err := wireguard.NewManager(wgConfig, logger)
    if err != nil {
        logger.Error("Failed to create WireGuard manager", "error", err)
        os.Exit(1)
    }
    defer wgManager.Close()

    // LocalProxy作成
    localProxy := proxy.NewLocalProxy(wgManager, logger)

    // プロキシ起動（仮想IP:80でリッスン）
    if err := localProxy.Start(); err != nil {
        logger.Error("Failed to start local proxy", "error", err)
        os.Exit(1)
    }
}
```

---

## トラフィックフロー

```
Gateway (1.2.3.4:51820)
  ↓ WireGuard UDP
Agent WireGuard (netstack)
  ↓ 内部ルーティング
Agent仮想IP (10.1.0.100:80) ← LocalProxyがリッスン
  ↓ HTTP Proxy
ローカルアプリ (localhost:8080)
```

---

## netstackの利点

1. **ポート開放不要**: ユーザースペースで動作、特権不要
2. **クロスプラットフォーム**: Linux、macOS、Windowsで動作
3. **分離**: システムのネットワーク設定に影響しない
4. **柔軟性**: 仮想IPで自由にリスニング可能

---

## テスト

```go
// agent/internal/wireguard/manager_test.go

func TestNewManager(t *testing.T) {
    logger := slog.Default()

    config := Config{
        PrivateKey: generatePrivateKey(),
        VirtualIP:  "10.100.0.100",
        Subnet:     "10.100.0.0/24",
        Gateways: []GatewayInfo{
            {
                ID:        "test-gw",
                Name:      "test-gateway",
                PublicKey: generatePublicKey(),
                Endpoint:  "127.0.0.1:51820",
                VirtualIP: "10.100.0.1",
            },
        },
    }

    manager, err := NewManager(config, logger)
    if err != nil {
        t.Fatalf("Failed to create manager: %v", err)
    }
    defer manager.Close()

    // リスナー作成テスト
    listener, err := manager.GetListener(8080)
    if err != nil {
        t.Fatalf("Failed to get listener: %v", err)
    }
    defer listener.Close()

    t.Logf("Listener created on %s", listener.Addr())
}
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
