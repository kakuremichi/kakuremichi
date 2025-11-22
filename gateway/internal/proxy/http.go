package proxy

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path/filepath"

	"golang.org/x/crypto/acme"
	"golang.org/x/crypto/acme/autocert"
)

// NewHTTPProxy creates a new HTTP reverse proxy
func NewHTTPProxy(httpAddr, httpsAddr string, acmeConfig ACMEConfig) *HTTPProxy {
	proxy := &HTTPProxy{
		routes:     make(map[string]*TunnelRoute),
		httpAddr:   httpAddr,
		httpsAddr:  httpsAddr,
		acmeConfig: acmeConfig,
	}

	// Initialize ACME manager if enabled
	if acmeConfig.Enabled {
		proxy.initACMEManager()
	}

	return proxy
}

// initACMEManager initializes the ACME certificate manager
func (p *HTTPProxy) initACMEManager() {
	// Create cache directory if it doesn't exist
	if err := os.MkdirAll(p.acmeConfig.CacheDir, 0700); err != nil {
		slog.Error("Failed to create ACME cache directory", "error", err, "dir", p.acmeConfig.CacheDir)
		return
	}

	slog.Info("Initializing ACME certificate manager",
		"email", p.acmeConfig.Email,
		"staging", p.acmeConfig.Staging,
		"cache_dir", p.acmeConfig.CacheDir,
	)

	// Create autocert manager
	p.acmeManager = &autocert.Manager{
		Prompt: autocert.AcceptTOS,
		Email:  p.acmeConfig.Email,
		Cache:  autocert.DirCache(p.acmeConfig.CacheDir),
		HostPolicy: func(ctx context.Context, host string) error {
			// Only allow certificates for domains that have active routes
			if route, exists := p.routes[host]; exists && route.Enabled {
				slog.Info("ACME: Allowing certificate for domain", "domain", host)
				return nil
			}
			slog.Warn("ACME: Rejecting certificate request for unknown domain", "domain", host)
			return fmt.Errorf("acme: domain not configured: %s", host)
		},
	}

	// Use staging environment if configured
	if p.acmeConfig.Staging {
		p.acmeManager.Client = &acme.Client{
			DirectoryURL: "https://acme-staging-v02.api.letsencrypt.org/directory",
		}
		slog.Info("Using Let's Encrypt STAGING environment")
	}
}

// UpdateRoutes updates the tunnel routes
func (p *HTTPProxy) UpdateRoutes(routes []TunnelRoute) {
	slog.Info("Updating tunnel routes", "count", len(routes))

	newRoutes := make(map[string]*TunnelRoute)
	for i := range routes {
		route := &routes[i]
		if route.Enabled {
			newRoutes[route.Domain] = route
			slog.Info("Added route",
				"domain", route.Domain,
				"agent_ip", route.AgentIP,
			)
		}
	}

	p.routes = newRoutes
}

// Start starts the HTTP and HTTPS proxy servers
func (p *HTTPProxy) Start(ctx context.Context) error {
	// Create main handler
	mainHandler := http.HandlerFunc(p.handleRequest)

	// Start HTTP server
	if err := p.startHTTPServer(ctx, mainHandler); err != nil {
		return err
	}

	// Start HTTPS server if ACME is enabled
	if p.acmeConfig.Enabled && p.acmeManager != nil {
		if err := p.startHTTPSServer(ctx, mainHandler); err != nil {
			return err
		}
	}

	// Wait for context cancellation
	<-ctx.Done()
	slog.Info("Shutting down HTTP/HTTPS proxies")

	// Shutdown servers
	shutdownCtx := context.Background()
	if p.httpServer != nil {
		if err := p.httpServer.Shutdown(shutdownCtx); err != nil {
			slog.Error("HTTP server shutdown error", "error", err)
		}
	}
	if p.httpsServer != nil {
		if err := p.httpsServer.Shutdown(shutdownCtx); err != nil {
			slog.Error("HTTPS server shutdown error", "error", err)
		}
	}

	return nil
}

// startHTTPServer starts the HTTP server
func (p *HTTPProxy) startHTTPServer(ctx context.Context, mainHandler http.Handler) error {
	slog.Info("Starting HTTP proxy", "addr", p.httpAddr)

	mux := http.NewServeMux()

	// Mount ACME HTTP-01 challenge handler if ACME is enabled
	if p.acmeConfig.Enabled && p.acmeManager != nil {
		// ACME HTTP-01 challenge handler takes precedence
		mux.Handle("/.well-known/acme-challenge/", p.acmeManager.HTTPHandler(nil))
		slog.Info("ACME HTTP-01 challenge handler mounted at /.well-known/acme-challenge/")

		// Redirect all other HTTP traffic to HTTPS
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// Check if this is an ACME challenge (shouldn't reach here, but just in case)
			if filepath.HasPrefix(r.URL.Path, "/.well-known/acme-challenge/") {
				p.acmeManager.HTTPHandler(nil).ServeHTTP(w, r)
				return
			}

			// Redirect to HTTPS
			target := "https://" + r.Host + r.URL.Path
			if r.URL.RawQuery != "" {
				target += "?" + r.URL.RawQuery
			}
			slog.Debug("Redirecting HTTP to HTTPS", "from", r.URL.String(), "to", target)
			http.Redirect(w, r, target, http.StatusMovedPermanently)
		})
	} else {
		// No ACME, serve HTTP directly
		mux.Handle("/", mainHandler)
	}

	p.httpServer = &http.Server{
		Addr:    p.httpAddr,
		Handler: mux,
	}

	// Start server in goroutine
	go func() {
		if err := p.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", err)
		}
	}()

	return nil
}

// startHTTPSServer starts the HTTPS server with ACME
func (p *HTTPProxy) startHTTPSServer(ctx context.Context, mainHandler http.Handler) error {
	slog.Info("Starting HTTPS proxy", "addr", p.httpsAddr)

	p.httpsServer = &http.Server{
		Addr:    p.httpsAddr,
		Handler: mainHandler,
		TLSConfig: &tls.Config{
			GetCertificate: p.acmeManager.GetCertificate,
			MinVersion:     tls.VersionTLS12,
			CipherSuites: []uint16{
				tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
			},
		},
	}

	// Start HTTPS server in goroutine
	go func() {
		// ListenAndServeTLS with empty cert files uses TLSConfig.GetCertificate
		if err := p.httpsServer.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTPS server error", "error", err)
		}
	}()

	slog.Info("HTTPS server started with automatic ACME certificate management")

	return nil
}

// handleRequest handles incoming HTTP/HTTPS requests
func (p *HTTPProxy) handleRequest(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	slog.Debug("Received request", "host", host, "path", r.URL.Path, "method", r.Method, "proto", r.Proto)

	// Find route for this domain
	route, exists := p.routes[host]
	if !exists {
		slog.Warn("No route found for domain", "domain", host)
		http.Error(w, "No tunnel configured for this domain", http.StatusNotFound)
		return
	}

	if !route.Enabled {
		slog.Warn("Route is disabled", "domain", host)
		http.Error(w, "Tunnel is disabled", http.StatusServiceUnavailable)
		return
	}

	// Build target URL (Agent's virtual IP)
	targetURL, err := url.Parse("http://" + route.AgentIP + ":80")
	if err != nil {
		slog.Error("Invalid agent IP", "agent_ip", route.AgentIP, "error", err)
		http.Error(w, "Invalid target configuration", http.StatusInternalServerError)
		return
	}

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Customize the director
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = host // Preserve original Host header

		// Set X-Forwarded headers
		req.Header.Set("X-Forwarded-Host", host)

		// Determine protocol
		proto := "http"
		if r.TLS != nil {
			proto = "https"
		}
		req.Header.Set("X-Forwarded-Proto", proto)

		// Set X-Real-IP
		if realIP := r.Header.Get("X-Real-IP"); realIP == "" {
			// Extract IP from RemoteAddr
			if remoteIP := r.RemoteAddr; remoteIP != "" {
				req.Header.Set("X-Real-IP", remoteIP)
			}
		}
	}

	// Error handler
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("Proxy error", "error", err, "agent_ip", route.AgentIP)
		http.Error(w, "Bad Gateway", http.StatusBadGateway)
	}

	slog.Info("Proxying request",
		"domain", host,
		"agent_ip", route.AgentIP,
		"path", r.URL.Path,
		"tls", r.TLS != nil,
	)

	// Proxy the request
	proxy.ServeHTTP(w, r)
}

// Shutdown gracefully shuts down the proxy
func (p *HTTPProxy) Shutdown() error {
	slog.Info("HTTP proxy shutdown initiated")

	// Servers are shut down in the Start() method's context cancellation handler

	return nil
}

// GetRoutes returns current routes (for testing/debugging)
func (p *HTTPProxy) GetRoutes() map[string]*TunnelRoute {
	result := make(map[string]*TunnelRoute)
	for k, v := range p.routes {
		result[k] = v
	}
	return result
}
