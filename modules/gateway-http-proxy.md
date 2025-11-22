# Gateway - HTTPリバースプロキシ

## 概要

GatewayのHTTP/HTTPSリバースプロキシ実装。外部ユーザーからのリクエストを受信し、WireGuardトンネル経由でAgentにプロキシ。

**パス**: `gateway/internal/proxy/`

---

## 責務

1. HTTPS通信の受信（ポート443）
2. SSL/TLS終端
3. ドメインベースルーティング（domain → Agent）
4. WireGuardトンネル経由でAgentにプロキシ
5. Let's Encrypt証明書の自動取得・更新

---

## 依存パッケージ

```go
import (
    "net/http"
    "net/http/httputil"
    "net/url"
    "golang.org/x/crypto/acme/autocert"
    "log/slog"
)
```

---

## 構造体定義

```go
// gateway/internal/proxy/router.go

type TunnelConfig struct {
    ID             string
    Domain         string
    AgentVirtualIP string  // 例: "10.1.0.100"
    Target         string  // 例: "localhost:8080"
    Enabled        bool
}

type Router struct {
    tunnels    map[string]*TunnelConfig  // key: domain
    certManager *autocert.Manager
    logger      *slog.Logger
}
```

---

## 主要メソッド

### `NewRouter(certManager *autocert.Manager, logger *slog.Logger) *Router`

**サンプルコード**:
```go
func NewRouter(certManager *autocert.Manager, logger *slog.Logger) *Router {
    return &Router{
        tunnels:     make(map[string]*TunnelConfig),
        certManager: certManager,
        logger:      logger,
    }
}
```

---

### `UpdateTunnels(tunnels []TunnelConfig) error`

Controlからのconfigメッセージでトンネル一覧を受け取った際に呼び出す。

**サンプルコード**:
```go
func (r *Router) UpdateTunnels(tunnels []TunnelConfig) error {
    r.logger.Info("Updating tunnels", "count", len(tunnels))

    // 既存のトンネルをクリア
    r.tunnels = make(map[string]*TunnelConfig)

    // 新しいトンネルを追加
    for _, tunnel := range tunnels {
        if tunnel.Enabled {
            r.tunnels[tunnel.Domain] = &tunnel
            r.logger.Info("Tunnel registered",
                "domain", tunnel.Domain,
                "agentIP", tunnel.AgentVirtualIP,
                "target", tunnel.Target,
            )
        }
    }

    // autocertのHostPolicyを更新
    r.updateHostPolicy()

    return nil
}
```

---

### `AddTunnel(tunnel TunnelConfig) error`

単一のトンネルを追加

**サンプルコード**:
```go
func (r *Router) AddTunnel(tunnel TunnelConfig) error {
    if !tunnel.Enabled {
        return nil
    }

    r.logger.Info("Adding tunnel",
        "domain", tunnel.Domain,
        "agentIP", tunnel.AgentVirtualIP,
    )

    r.tunnels[tunnel.Domain] = &tunnel
    r.updateHostPolicy()

    return nil
}
```

---

### `RemoveTunnel(domain string) error`

トンネルを削除

**サンプルコード**:
```go
func (r *Router) RemoveTunnel(domain string) error {
    r.logger.Info("Removing tunnel", "domain", domain)

    delete(r.tunnels, domain)
    r.updateHostPolicy()

    return nil
}
```

---

### `ServeHTTP(w http.ResponseWriter, req *http.Request)`

HTTPリクエストをルーティング

**処理フロー**:
1. リクエストのHostヘッダーからドメインを取得
2. tunnelsマップからTunnelConfigを検索
3. 存在しない場合は404
4. AgentのvirtualIPをターゲットとしてプロキシ

**サンプルコード**:
```go
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
    domain := req.Host

    r.logger.Debug("Incoming request",
        "domain", domain,
        "path", req.URL.Path,
        "method", req.Method,
    )

    // トンネルを検索
    tunnel, exists := r.tunnels[domain]
    if !exists {
        r.logger.Warn("Tunnel not found", "domain", domain)
        http.Error(w, "Tunnel not found", http.StatusNotFound)
        return
    }

    if !tunnel.Enabled {
        r.logger.Warn("Tunnel disabled", "domain", domain)
        http.Error(w, "Tunnel disabled", http.StatusServiceUnavailable)
        return
    }

    // AgentのvirtualIP:targetにプロキシ
    // 例: AgentVirtualIP=10.1.0.100, Target=localhost:8080
    // → http://10.1.0.100:8080にプロキシ
    targetURL, err := url.Parse(fmt.Sprintf("http://%s", tunnel.AgentVirtualIP))
    if err != nil {
        r.logger.Error("Invalid target URL", "error", err)
        http.Error(w, "Internal server error", http.StatusInternalServerError)
        return
    }

    // リバースプロキシ作成
    proxy := httputil.NewSingleHostReverseProxy(targetURL)

    // エラーハンドラー
    proxy.ErrorHandler = func(w http.ResponseWriter, req *http.Request, err error) {
        r.logger.Error("Proxy error",
            "domain", domain,
            "agentIP", tunnel.AgentVirtualIP,
            "error", err,
        )
        http.Error(w, "Bad Gateway", http.StatusBadGateway)
    }

    // プロキシ実行
    r.logger.Info("Proxying request",
        "domain", domain,
        "agentIP", tunnel.AgentVirtualIP,
        "path", req.URL.Path,
    )

    proxy.ServeHTTP(w, req)
}
```

**注意**: Agentは自分のvirtualIP（例: 10.1.0.100）でリクエストをリッスンし、localhost:8080にプロキシする。

---

### `updateHostPolicy()`

autocertのHostPolicyを更新。Let's Encryptが証明書を取得するドメインを制限。

**サンプルコード**:
```go
func (r *Router) updateHostPolicy() {
    domains := make([]string, 0, len(r.tunnels))
    for domain := range r.tunnels {
        domains = append(domains, domain)
    }

    r.logger.Info("Updating host policy", "domains", domains)

    r.certManager.HostPolicy = autocert.HostWhitelist(domains...)
}
```

---

## SSL/TLS証明書管理

### `NewCertManager(cacheDir string, email string) *autocert.Manager`

**サンプルコード**:
```go
// gateway/internal/ssl/autocert.go

func NewCertManager(cacheDir string, email string, logger *slog.Logger) *autocert.Manager {
    manager := &autocert.Manager{
        Prompt:      autocert.AcceptTOS,
        Cache:       autocert.DirCache(cacheDir),
        Email:       email,
        HostPolicy:  autocert.HostWhitelist(),  // 初期は空、Routerが更新
    }

    logger.Info("Certificate manager created",
        "cacheDir", cacheDir,
        "email", email,
    )

    return manager
}
```

---

## HTTPサーバー起動

```go
// gateway/internal/proxy/server.go

type Server struct {
    router      *Router
    certManager *autocert.Manager
    httpServer  *http.Server
    httpsServer *http.Server
    logger      *slog.Logger
}

func NewServer(router *Router, certManager *autocert.Manager, logger *slog.Logger) *Server {
    return &Server{
        router:      router,
        certManager: certManager,
        logger:      logger,
    }
}

func (s *Server) Start() error {
    // HTTPサーバー（ポート80）
    // HTTP-01 チャレンジとHTTPS リダイレクト
    s.httpServer = &http.Server{
        Addr: ":80",
        Handler: s.certManager.HTTPHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            // HTTPSにリダイレクト
            target := "https://" + r.Host + r.URL.Path
            if r.URL.RawQuery != "" {
                target += "?" + r.URL.RawQuery
            }
            http.Redirect(w, r, target, http.StatusMovedPermanently)
        })),
    }

    // HTTPSサーバー（ポート443）
    s.httpsServer = &http.Server{
        Addr:      ":443",
        Handler:   s.router,
        TLSConfig: s.certManager.TLSConfig(),
    }

    // 並行起動
    go func() {
        s.logger.Info("Starting HTTP server", "port", 80)
        if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            s.logger.Error("HTTP server error", "error", err)
        }
    }()

    s.logger.Info("Starting HTTPS server", "port", 443)
    return s.httpsServer.ListenAndServeTLS("", "")
}

func (s *Server) Shutdown(ctx context.Context) error {
    s.logger.Info("Shutting down HTTP/HTTPS servers")

    if err := s.httpServer.Shutdown(ctx); err != nil {
        return err
    }

    return s.httpsServer.Shutdown(ctx)
}
```

---

## 使用例

```go
// gateway/cmd/gateway/main.go

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // SSL証明書マネージャー
    certManager := ssl.NewCertManager(
        "/var/cache/kakuremichi/certs",
        "admin@example.com",
        logger,
    )

    // ルーター
    router := proxy.NewRouter(certManager, logger)

    // トンネル設定（Controlから受信）
    tunnels := []proxy.TunnelConfig{
        {
            ID:             "tunnel-1",
            Domain:         "app.example.com",
            AgentVirtualIP: "10.1.0.100",
            Target:         "localhost:8080",
            Enabled:        true,
        },
    }
    router.UpdateTunnels(tunnels)

    // HTTPサーバー起動
    server := proxy.NewServer(router, certManager, logger)
    if err := server.Start(); err != nil {
        logger.Error("Server error", "error", err)
        os.Exit(1)
    }
}
```

---

## Agent側の対応

Agentは自分のvirtualIP（例: 10.1.0.100）でHTTPリクエストをリッスンする必要がある：

```go
// agent/internal/proxy/local.go

func (a *Agent) StartLocalProxy() error {
    // virtualIP:80 でリッスン
    listener, err := net.Listen("tcp", fmt.Sprintf("%s:80", a.virtualIP))
    if err != nil {
        return err
    }

    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        // ターゲット（localhost:8080など）にプロキシ
        proxy := httputil.NewSingleHostReverseProxy(targetURL)
        proxy.ServeHTTP(w, r)
    })

    return http.Serve(listener, nil)
}
```

---

## テスト

```go
// gateway/internal/proxy/router_test.go

func TestRouter_ServeHTTP(t *testing.T) {
    logger := slog.Default()
    router := NewRouter(nil, logger)

    // テスト用トンネル
    router.AddTunnel(TunnelConfig{
        ID:             "test",
        Domain:         "test.example.com",
        AgentVirtualIP: "10.1.0.100",
        Target:         "localhost:8080",
        Enabled:        true,
    })

    // リクエスト作成
    req := httptest.NewRequest("GET", "https://test.example.com/", nil)
    req.Host = "test.example.com"
    w := httptest.NewRecorder()

    // テスト（実際のAgentは起動していないので失敗するが、ルーティングロジックは確認できる）
    router.ServeHTTP(w, req)

    // 404ではないことを確認（トンネルが見つかっている）
    if w.Code == http.StatusNotFound {
        t.Error("Tunnel not found")
    }
}
```

---

## ACME/SSL証明書管理の詳細設計

### autocertの動作フロー

#### 初回証明書取得（HTTP-01チャレンジ）

1. **クライアントがHTTPS接続を試みる**: `https://app.example.com`
2. **autocertが証明書キャッシュを確認**: キャッシュになし
3. **Let's EncryptにACME証明書リクエスト**:
   - ドメイン: `app.example.com`
   - アカウント鍵を使用（初回は自動生成）
4. **Let's EncryptがHTTP-01チャレンジを発行**:
   - チャレンジトークン: `abc123`
   - 検証URL: `http://app.example.com/.well-known/acme-challenge/abc123`
5. **autocertがチャレンジレスポンスを返す**:
   - `/.well-known/acme-challenge/*`へのリクエストを自動処理
   - チャレンジトークンに対応するレスポンスを返す
6. **Let's Encryptが検証**:
   - DNS: `app.example.com` → Gateway IPを解決
   - HTTP GET: `http://app.example.com/.well-known/acme-challenge/abc123`
   - レスポンスが正しければ検証成功
7. **証明書発行**: Let's Encryptが証明書+秘密鍵を発行
8. **autocertがキャッシュに保存**: `/var/cache/autocert/app.example.com`

### 複数Gateway時の設計（ゼロ知識アーキテクチャ）

#### 基本方針

**各Gatewayが独立してautocertで証明書を取得・管理**

```
重要原則:
✅ 各Gatewayが自身でautocertを使用してLet's Encrypt証明書を取得
✅ TLS秘密鍵はGatewayローカルに保存（Control Planeは一切関知しない）
✅ 複数GatewayはDNS Round Robinで負荷分散
✅ 各Gatewayが独立してHTTP-01チャレンジに応答
```

**セキュリティ上の利点**:
- TLS秘密鍵がControl Planeを経由しない
- 各Gatewayが独立して証明書管理
- Control Plane侵害時もTLS通信は保護される

#### DNS Round Robin環境での動作

DNS Round Robin環境で複数Gatewayが存在する場合：

```
app.example.com → 1.2.3.4 (Gateway1)
                 → 5.6.7.8 (Gateway2)
```

**証明書取得フロー**:

1. **Gateway1が証明書取得を開始**:
   - `app.example.com`の証明書をautocertで取得開始
   - Let's EncryptがHTTP-01チャレンジの検証リクエストを送信

2. **Let's EncryptのDNS解決**:
   - DNS Round RobinでGateway1またはGateway2のいずれかに振り分け

3. **シナリオA: Gateway1に振り分け（証明書取得成功）**:
   - Gateway1がチャレンジに応答 → 検証成功 → 証明書取得

4. **シナリオB: Gateway2に振り分け（初回は失敗、リトライで成功）**:
   - Gateway2はチャレンジトークンを持っていない → 検証失敗
   - autocertが自動的にリトライ
   - 次のDNS解決でGateway1に振り分けられれば成功

5. **Gateway2の証明書取得**:
   - Gateway2も同様に`app.example.com`の証明書を独立して取得
   - autocertが自動的にリトライして証明書取得

**結果**:
- 各Gatewayが独立して同じドメインの証明書を保持
- DNS Round Robin環境でも最終的に両Gatewayで証明書取得可能
- Let's Encryptはドメイン単位でRate Limit（週50回）があるが、通常の運用では問題なし

#### 代替案: DNS-01チャレンジ（推奨、Phase 2）

HTTP-01チャレンジの代わりに**DNS-01チャレンジ**を使用することで、DNS Round Robinの問題を完全に回避できます。

**DNS-01チャレンジの利点**:
- DNSプロバイダーAPI（Cloudflare、Route53など）を使用してTXTレコードを設定
- どのGatewayからでも証明書取得可能
- ワイルドカード証明書（`*.example.com`）の取得も可能

**実装例（Cloudflare DNS-01）**:

```go
// gateway/internal/ssl/dns01.go

import (
    "github.com/libdns/cloudflare"
    "github.com/mholt/acmez/acme"
)

type CloudflareDNSProvider struct {
    provider *cloudflare.Provider
}

func (p *CloudflareDNSProvider) Present(domain, token, keyAuth string) error {
    // Cloudflare APIでTXTレコード作成
    return p.provider.AppendRecords(ctx, domain, []libdns.Record{
        {
            Type:  "TXT",
            Name:  "_acme-challenge",
            Value: keyAuth,
        },
    })
}

func (p *CloudflareDNSProvider) CleanUp(domain, token, keyAuth string) error {
    // TXTレコード削除
    return p.provider.DeleteRecords(ctx, domain, records)
}

// autocertで使用
certManager := &autocert.Manager{
    Prompt:     autocert.AcceptTOS,
    Cache:      autocert.DirCache("/var/cache/autocert"),
    HostPolicy: autocert.HostWhitelist("app.example.com"),
    // DNS-01チャレンジを使用
    DNS01Provider: &CloudflareDNSProvider{
        provider: cloudflare.New(apiToken),
    },
}
```

**メリット**:
- DNS Round Robin環境で確実に証明書取得可能
- ワイルドカード証明書対応

**デメリット**:
- DNSプロバイダーAPIキーが必要
- MVP範囲外（Phase 2で実装）

### MVP実装方針（Gatewayが独立して証明書取得）

#### Tunnel作成時の動作フロー

1. **ユーザーがWeb UIでTunnel作成**:
   - ドメイン: `app.example.com`
   - Agent: `agent-1`
   - Target: `localhost:8080`

2. **Control APIがTunnel作成**:
   ```typescript
   POST /api/tunnels
   {
     "domain": "app.example.com",
     "agentId": "uuid",
     "target": "localhost:8080"
   }
   ```

3. **Controlがトンネル情報を全Gatewayに配信**:
   - WebSocket経由で`tunnel_create`メッセージを全Gatewayに送信
   - メッセージには**ドメイン名とルーティング情報のみ**（証明書は含まない）

4. **各Gatewayが証明書を自動取得**:
   - `tunnel_create`メッセージを受信したら、`router.AddTunnel()`を呼び出し
   - `updateHostPolicy()`が呼ばれ、autocertのHostPolicyにドメインを追加
   - 次回そのドメインへのHTTPSリクエストが来た際、autocertが自動的に証明書取得
   - 証明書はGatewayのローカルキャッシュに保存（`/var/cache/autocert/`）

**重要**: Control Planeは証明書の取得・保存・配布を一切行わない

### 証明書の自動更新

**Let's Encrypt証明書の有効期限**: 90日

**autocertによる自動更新**:

```go
// gateway/internal/ssl/autocert.go

// autocertは自動的に証明書を更新する
// - 有効期限の30日前から更新を試みる
// - TLS Handshake時に期限をチェックし、必要に応じて更新
// - 更新された証明書は自動的にキャッシュに保存

func NewCertManager(cacheDir string, email string, logger *slog.Logger) *autocert.Manager {
    manager := &autocert.Manager{
        Prompt:      autocert.AcceptTOS,
        Cache:       autocert.DirCache(cacheDir),
        Email:       email,
        HostPolicy:  autocert.HostWhitelist(),  // 初期は空、Routerが更新

        // RenewBefore: 有効期限の30日前から更新開始（デフォルト）
        // autocertが自動的に処理するため、明示的な指定は不要
    }

    logger.Info("Certificate manager created",
        "cacheDir", cacheDir,
        "email", email,
    )

    return manager
}
```

**自動更新の仕組み**:

1. **TLS Handshake時の証明書チェック**:
   - クライアントがHTTPS接続すると、autocertがキャッシュから証明書を取得
   - 証明書の有効期限をチェック

2. **更新が必要な場合**:
   - 有効期限まで30日を切っている場合、バックグラウンドで更新を開始
   - Let's Encryptに新しい証明書をリクエスト
   - HTTP-01チャレンジを実行

3. **新しい証明書の保存**:
   - 取得した証明書をキャッシュに保存
   - 次回のTLS Handshakeから新しい証明書を使用

4. **ゼロダウンタイム**:
   - 更新中も古い証明書で通信継続
   - 更新完了後、自動的に新しい証明書に切り替わる

**監視とアラート（Phase 2）**:

```go
// 証明書の有効期限を監視するヘルスチェック
func (s *Server) CheckCertificateHealth() error {
    for domain := range s.router.tunnels {
        cert, err := s.certManager.Cache.Get(context.Background(), domain)
        if err != nil {
            s.logger.Warn("Certificate not found", "domain", domain)
            continue
        }

        // 証明書の有効期限をチェック
        // アラート送信（Slack、メールなど）
    }
    return nil
}
```

**重要**: Control Planeは証明書の更新に一切関与しない。各Gatewayが独立して自動更新を行う。

### DNSの設定要件

**前提条件**: ドメインのDNS AレコードをGateway IPに向ける

```
app.example.com.  IN  A  1.2.3.4  # Gateway1
app.example.com.  IN  A  5.6.7.8  # Gateway2
```

**重要事項**:
- **Gateway IPアドレスのみをDNSに登録**（Control PlaneのIPは不要）
- 各GatewayがHTTP-01チャレンジに独立して応答
- DNS Round Robin環境でも、autocertのリトライ機能により最終的に証明書取得成功

**証明書取得の流れ**:

1. **クライアントが`https://app.example.com`にアクセス**
2. **DNS解決**: Gateway1またはGateway2のいずれかにランダム振り分け
3. **Gateway1で証明書取得開始**（キャッシュにない場合）
4. **Let's EncryptがHTTP-01チャレンジを送信**: `http://app.example.com/.well-known/acme-challenge/...`
5. **DNS解決**: Gateway1またはGateway2に振り分け
6. **Gateway1に振り分けられた場合**: チャレンジ成功 → 証明書取得
7. **Gateway2に振り分けられた場合**: チャレンジ失敗 → autocertがリトライ → 最終的に成功

**DNS TTL推奨値**:
- TTL: 60秒以下（DNS Round Robinの振り分けを頻繁に変更するため）

**Phase 2: DNS-01チャレンジへの移行**:

DNS-01チャレンジを使用することで、より確実に証明書取得が可能：

- DNS TXTレコードで検証
- DNSプロバイダーAPI（Cloudflare、Route53など）と連携
- ワイルドカード証明書（`*.example.com`）の取得も可能

---

**作成日**: 2025-11-22
**最終更新**: 2025-11-22
