# Gateway/Agent - WebSocketクライアント

## 概要

Gateway/AgentからControlへのWebSocket接続実装。設定の受信、ハートビート、ステータス報告を担当。

**パス**:
- `gateway/internal/ws/`
- `agent/internal/ws/`

---

## 責務

1. ControlへのWebSocket接続確立
2. API Key認証
3. 設定メッセージの受信・処理
4. ハートビート送信
5. 自動再接続
6. ステータス報告

---

## 依存パッケージ

```go
import (
    "github.com/gorilla/websocket"
    "log/slog"
    "encoding/json"
    "time"
)
```

---

## 構造体定義

```go
// gateway/internal/ws/client.go
// agent/internal/ws/client.go

type Config struct {
    ControlURL string        // wss://control.example.com/ws
    APIKey     string        // gtw_xxx or agt_xxx
    Type       string        // "gateway" or "agent"
    PublicIP   string        // Gatewayの場合のみ
}

type Message struct {
    Type string          `json:"type"`
    Data json.RawMessage `json:"data"`
}

type Client struct {
    config          Config
    conn            *websocket.Conn
    logger          *slog.Logger
    authenticated   bool
    reconnecting    bool
    handlers        map[string]MessageHandler
    heartbeatTicker *time.Ticker
    done            chan struct{}
}

type MessageHandler func(data json.RawMessage) error
```

---

## 主要メソッド

### `NewClient(config Config, logger *slog.Logger) *Client`

**サンプルコード**:
```go
func NewClient(config Config, logger *slog.Logger) *Client {
    return &Client{
        config:   config,
        logger:   logger,
        handlers: make(map[string]MessageHandler),
        done:     make(chan struct{}),
    }
}
```

---

### `Connect() error`

Controlに接続し、認証を行う

**処理フロー**:
1. WebSocket接続
2. authメッセージ送信
3. auth_successまたはauth_errorを待機
4. 成功なら読み込みループ開始
5. ハートビートループ開始

**サンプルコード**:
```go
func (c *Client) Connect() error {
    c.logger.Info("Connecting to Control", "url", c.config.ControlURL)

    // WebSocket接続
    dialer := websocket.DefaultDialer
    conn, _, err := dialer.Dial(c.config.ControlURL, nil)
    if err != nil {
        return fmt.Errorf("failed to connect: %w", err)
    }

    c.conn = conn
    c.logger.Info("WebSocket connected")

    // 認証
    if err := c.authenticate(); err != nil {
        c.conn.Close()
        return fmt.Errorf("authentication failed: %w", err)
    }

    // 読み込みループ開始
    go c.readLoop()

    // ハートビートループ開始
    go c.heartbeatLoop()

    return nil
}
```

---

### `authenticate() error`

認証メッセージを送信し、レスポンスを待機

**サンプルコード**:
```go
func (c *Client) authenticate() error {
    c.logger.Info("Authenticating", "type", c.config.Type)

    authData := map[string]string{
        "apiKey": c.config.APIKey,
    }

    // Gatewayの場合、publicIpも送信
    if c.config.Type == "gateway" && c.config.PublicIP != "" {
        authData["publicIp"] = c.config.PublicIP
    }

    msg := Message{
        Type: "auth",
        Data: mustMarshal(authData),
    }

    if err := c.send(msg); err != nil {
        return err
    }

    // auth_successまたはauth_errorを待機（タイムアウト5秒）
    c.conn.SetReadDeadline(time.Now().Add(5 * time.Second))
    defer c.conn.SetReadDeadline(time.Time{})

    var response Message
    if err := c.conn.ReadJSON(&response); err != nil {
        return fmt.Errorf("failed to read auth response: %w", err)
    }

    if response.Type == "auth_error" {
        var errData struct {
            Message string `json:"message"`
        }
        json.Unmarshal(response.Data, &errData)
        return fmt.Errorf("authentication failed: %s", errData.Message)
    }

    if response.Type != "auth_success" {
        return fmt.Errorf("unexpected response: %s", response.Type)
    }

    c.authenticated = true
    c.logger.Info("Authentication successful")

    // auth_success直後のconfigメッセージを処理
    if err := c.handleMessage(response); err != nil {
        c.logger.Error("Failed to handle auth_success", "error", err)
    }

    return nil
}
```

---

### `readLoop()`

メッセージを受信し続ける

**サンプルコード**:
```go
func (c *Client) readLoop() {
    defer func() {
        c.logger.Info("Read loop stopped")
        c.reconnect()
    }()

    for {
        select {
        case <-c.done:
            return
        default:
        }

        var msg Message
        if err := c.conn.ReadJSON(&msg); err != nil {
            c.logger.Error("Read error", "error", err)
            return
        }

        c.logger.Debug("Received message", "type", msg.Type)

        if err := c.handleMessage(msg); err != nil {
            c.logger.Error("Failed to handle message", "type", msg.Type, "error", err)
        }
    }
}
```

---

### `handleMessage(msg Message) error`

受信したメッセージをハンドラーに振り分け

**サンプルコード**:
```go
func (c *Client) handleMessage(msg Message) error {
    handler, exists := c.handlers[msg.Type]
    if !exists {
        c.logger.Warn("No handler for message type", "type", msg.Type)
        return nil
    }

    return handler(msg.Data)
}
```

---

### `RegisterHandler(messageType string, handler MessageHandler)`

メッセージハンドラーを登録

**サンプルコード**:
```go
func (c *Client) RegisterHandler(messageType string, handler MessageHandler) {
    c.handlers[messageType] = handler
}
```

---

### `heartbeatLoop()`

30秒ごとにハートビートを送信

**サンプルコード**:
```go
func (c *Client) heartbeatLoop() {
    c.heartbeatTicker = time.NewTicker(30 * time.Second)
    defer c.heartbeatTicker.Stop()

    for {
        select {
        case <-c.done:
            return
        case <-c.heartbeatTicker.C:
            if !c.authenticated {
                continue
            }

            msg := Message{
                Type: "heartbeat",
                Data: mustMarshal(map[string]int64{
                    "timestamp": time.Now().Unix(),
                }),
            }

            if err := c.send(msg); err != nil {
                c.logger.Error("Failed to send heartbeat", "error", err)
            } else {
                c.logger.Debug("Heartbeat sent")
            }
        }
    }
}
```

---

### `reconnect()`

自動再接続

**サンプルコード**:
```go
func (c *Client) reconnect() {
    if c.reconnecting {
        return
    }
    c.reconnecting = true
    defer func() { c.reconnecting = false }()

    c.authenticated = false

    backoff := time.Second
    maxBackoff := time.Minute

    for {
        select {
        case <-c.done:
            return
        default:
        }

        c.logger.Info("Attempting to reconnect", "backoff", backoff)
        time.Sleep(backoff)

        if err := c.Connect(); err != nil {
            c.logger.Error("Reconnect failed", "error", err)
            backoff *= 2
            if backoff > maxBackoff {
                backoff = maxBackoff
            }
            continue
        }

        c.logger.Info("Reconnected successfully")
        return
    }
}
```

---

### `Send(messageType string, data interface{}) error`

メッセージを送信

**サンプルコード**:
```go
func (c *Client) Send(messageType string, data interface{}) error {
    msg := Message{
        Type: messageType,
        Data: mustMarshal(data),
    }
    return c.send(msg)
}

func (c *Client) send(msg Message) error {
    if c.conn == nil {
        return fmt.Errorf("not connected")
    }

    return c.conn.WriteJSON(msg)
}
```

---

### `Close() error`

接続を閉じる

**サンプルコード**:
```go
func (c *Client) Close() error {
    close(c.done)

    if c.heartbeatTicker != nil {
        c.heartbeatTicker.Stop()
    }

    if c.conn != nil {
        return c.conn.Close()
    }

    return nil
}
```

---

## Gateway側の使用例

```go
// gateway/cmd/gateway/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // WebSocketクライアント作成
    wsClient := ws.NewClient(ws.Config{
        ControlURL: "wss://control.example.com/ws",
        APIKey:     "gtw_xxx",
        Type:       "gateway",
        PublicIP:   detectPublicIP(),
    }, logger)

    // WireGuardマネージャー
    wgManager := wireguard.NewManager(...)

    // Routerr
    router := proxy.NewRouter(...)

    // configメッセージのハンドラー登録
    wsClient.RegisterHandler("config", func(data json.RawMessage) error {
        var config struct {
            Agents       []wireguard.AgentInfo `json:"agents"`
            Tunnels      []proxy.TunnelConfig  `json:"tunnels"`
            Certificates []CertInfo            `json:"certificates"`
        }

        if err := json.Unmarshal(data, &config); err != nil {
            return err
        }

        // WireGuard Peer更新
        wgManager.UpdatePeers(config.Agents)

        // Tunnel更新
        router.UpdateTunnels(config.Tunnels)

        // 証明書更新
        // ...

        return nil
    })

    // tunnel_createハンドラー
    wsClient.RegisterHandler("tunnel_create", func(data json.RawMessage) error {
        var tunnel proxy.TunnelConfig
        json.Unmarshal(data, &tunnel)
        router.AddTunnel(tunnel)
        return nil
    })

    // tunnel_deleteハンドラー
    wsClient.RegisterHandler("tunnel_delete", func(data json.RawMessage) error {
        var deleteData struct {
            ID string `json:"id"`
        }
        json.Unmarshal(data, &deleteData)
        // Tunnelのドメインを取得して削除
        return nil
    })

    // 接続
    if err := wsClient.Connect(); err != nil {
        logger.Error("Failed to connect", "error", err)
        os.Exit(1)
    }
    defer wsClient.Close()

    // サーバー起動
    // ...
}
```

---

## Agent側の使用例

```go
// agent/cmd/agent/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // WebSocketクライアント
    wsClient := ws.NewClient(ws.Config{
        ControlURL: "wss://control.example.com/ws",
        APIKey:     "agt_xxx",
        Type:       "agent",
    }, logger)

    // WireGuardマネージャー
    var wgManager *wireguard.Manager

    // LocalProxy
    var localProxy *proxy.LocalProxy

    // configメッセージのハンドラー
    wsClient.RegisterHandler("config", func(data json.RawMessage) error {
        var config struct {
            Agent struct {
                VirtualIP          string `json:"virtualIp"`
                Subnet             string `json:"subnet"`
                WireguardPrivateKey string `json:"wireguardPrivateKey"`
            } `json:"agent"`
            Gateways []wireguard.GatewayInfo `json:"gateways"`
            Tunnels  []proxy.TunnelConfig    `json:"tunnels"`
        }

        json.Unmarshal(data, &config)

        // WireGuardマネージャー作成（初回）
        if wgManager == nil {
            wgManager, _ = wireguard.NewManager(wireguard.Config{
                PrivateKey: config.Agent.WireguardPrivateKey,
                VirtualIP:  config.Agent.VirtualIP,
                Subnet:     config.Agent.Subnet,
                Gateways:   config.Gateways,
            }, logger)

            // LocalProxy作成
            localProxy = proxy.NewLocalProxy(wgManager, logger)
            localProxy.UpdateTunnels(config.Tunnels)
            go localProxy.Start()
        } else {
            // Gateway更新
            wgManager.UpdateGateways(config.Gateways)
            localProxy.UpdateTunnels(config.Tunnels)
        }

        return nil
    })

    // tunnel_create/update/deleteハンドラー
    // ...

    // 接続
    wsClient.Connect()
    defer wsClient.Close()

    // ブロック
    select {}
}
```

---

## ヘルパー関数

```go
func mustMarshal(v interface{}) json.RawMessage {
    data, err := json.Marshal(v)
    if err != nil {
        panic(err)
    }
    return data
}

func detectPublicIP() string {
    // 外部APIを使ってグローバルIPを取得
    // 例: https://api.ipify.org
    resp, _ := http.Get("https://api.ipify.org")
    defer resp.Body.Close()
    ip, _ := io.ReadAll(resp.Body)
    return string(ip)
}
```

---

## テスト

```go
// gateway/internal/ws/client_test.go

func TestClient_Connect(t *testing.T) {
    // モックWebSocketサーバー起動
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        upgrader := websocket.Upgrader{}
        conn, _ := upgrader.Upgrade(w, r, nil)
        defer conn.Close()

        // authメッセージを受信
        var msg Message
        conn.ReadJSON(&msg)

        if msg.Type == "auth" {
            // auth_successを返す
            conn.WriteJSON(Message{
                Type: "auth_success",
                Data: mustMarshal(map[string]string{"gatewayId": "test"}),
            })
        }
    }))
    defer server.Close()

    wsURL := "ws" + strings.TrimPrefix(server.URL, "http")

    client := NewClient(Config{
        ControlURL: wsURL,
        APIKey:     "test_key",
        Type:       "gateway",
    }, slog.Default())

    err := client.Connect()
    if err != nil {
        t.Fatalf("Failed to connect: %v", err)
    }

    if !client.authenticated {
        t.Error("Client not authenticated")
    }

    client.Close()
}
```

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
