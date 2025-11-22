package proxy

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"sync"

	"golang.zx2c4.com/wireguard/tun/netstack"
)

// NewLocalProxy creates a new local proxy server
func NewLocalProxy(net *netstack.Net, addr string) *LocalProxy {
	return &LocalProxy{
		tunnels: make(map[string]*TunnelMapping),
		addr:    addr,
		net:     net,
	}
}

// UpdateTunnels updates the tunnel mappings
func (p *LocalProxy) UpdateTunnels(tunnels []TunnelMapping) {
	slog.Info("Updating tunnel mappings", "count", len(tunnels))

	newTunnels := make(map[string]*TunnelMapping)
	for i := range tunnels {
		tunnel := &tunnels[i]
		if tunnel.Enabled {
			newTunnels[tunnel.Domain] = tunnel
			slog.Info("Added tunnel mapping",
				"domain", tunnel.Domain,
				"target", tunnel.Target,
			)
		}
	}

	p.tunnels = newTunnels
}

// Start starts the local proxy server
func (p *LocalProxy) Start(ctx context.Context) error {
	slog.Info("Starting local proxy", "addr", p.addr, "netstack", p.net != nil)

	mux := http.NewServeMux()
	mux.HandleFunc("/", p.handleRequest)

	server := &http.Server{
		Handler: mux,
	}

	// Start server in goroutine
	if p.net != nil {
		host, portStr, err := net.SplitHostPort(p.addr)
		if err != nil {
			return fmt.Errorf("invalid listen addr %s: %w", p.addr, err)
		}

		port, err := strconv.Atoi(portStr)
		if err != nil {
			return fmt.Errorf("invalid listen port %s: %w", portStr, err)
		}

		ip := net.ParseIP(host)
		if ip == nil {
			return fmt.Errorf("invalid listen ip %s", host)
		}

		listener, err := p.net.ListenTCP(&net.TCPAddr{IP: ip, Port: port})
		if err != nil {
			return fmt.Errorf("failed to listen on netstack %s: %w", p.addr, err)
		}

		go func() {
			if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
				slog.Error("Local proxy server error", "error", err)
			}
		}()
	} else {
		server.Addr = p.addr
		go func() {
			if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				slog.Error("Local proxy server error", "error", err)
			}
		}()
	}

	// Wait for context cancellation
	<-ctx.Done()
	slog.Info("Shutting down local proxy")
	return server.Shutdown(context.Background())
}

// handleRequest handles incoming HTTP requests
func (p *LocalProxy) handleRequest(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	slog.Debug("Received request", "host", host, "path", r.URL.Path, "method", r.Method)

	// Find tunnel for this domain
	tunnel, exists := p.tunnels[host]
	if !exists {
		slog.Warn("No tunnel found for domain", "domain", host)
		http.Error(w, "No tunnel configured for this domain", http.StatusNotFound)
		return
	}

	if !tunnel.Enabled {
		slog.Warn("Tunnel is disabled", "domain", host)
		http.Error(w, "Tunnel is disabled", http.StatusServiceUnavailable)
		return
	}

	// Parse target URL
	targetURL, err := url.Parse("http://" + tunnel.Target)
	if err != nil {
		slog.Error("Invalid target URL", "target", tunnel.Target, "error", err)
		http.Error(w, "Invalid target configuration", http.StatusInternalServerError)
		return
	}

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Customize the director to preserve the original request
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = targetURL.Host
		req.Header.Set("X-Forwarded-Host", host)
		req.Header.Set("X-Forwarded-Proto", "https") // Gateway terminates HTTPS
	}

	// Error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("Proxy error", "error", err, "target", tunnel.Target)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}

	slog.Info("Proxying request",
		"domain", host,
		"target", tunnel.Target,
		"path", r.URL.Path,
	)

	// Proxy the request
	proxy.ServeHTTP(w, r)
}

// Shutdown gracefully shuts down the proxy
func (p *LocalProxy) Shutdown() error {
	slog.Info("Local proxy shutdown complete")
	return nil
}

// GetTunnels returns current tunnel mappings (for testing/debugging)
func (p *LocalProxy) GetTunnels() map[string]*TunnelMapping {
	result := make(map[string]*TunnelMapping)
	for k, v := range p.tunnels {
		result[k] = v
	}
	return result
}

// LocalProxyManager manages multiple local proxies (if needed for different interfaces)
type LocalProxyManager struct {
	proxies map[string]*LocalProxy
	mu      sync.RWMutex
}

// NewLocalProxyManager creates a new proxy manager
func NewLocalProxyManager() *LocalProxyManager {
	return &LocalProxyManager{
		proxies: make(map[string]*LocalProxy),
	}
}

// AddProxy adds a proxy to the manager
func (m *LocalProxyManager) AddProxy(name string, proxy *LocalProxy) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.proxies[name] = proxy
}

// GetProxy retrieves a proxy by name
func (m *LocalProxyManager) GetProxy(name string) (*LocalProxy, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	proxy, exists := m.proxies[name]
	return proxy, exists
}
