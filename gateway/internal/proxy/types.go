package proxy

import (
	"net/http"

	"golang.org/x/crypto/acme/autocert"
)

// TunnelRoute represents a tunnel routing configuration
type TunnelRoute struct {
	ID       string
	Domain   string
	AgentIP  string // Agent's virtual IP (e.g., "10.1.0.100")
	Enabled  bool
}

// ACMEConfig holds ACME/Let's Encrypt configuration
type ACMEConfig struct {
	Email     string
	Staging   bool
	CacheDir  string
	Enabled   bool // Whether to enable ACME/TLS
}

// HTTPProxy represents the HTTP reverse proxy for Gateway
type HTTPProxy struct {
	routes       map[string]*TunnelRoute // domain -> route
	httpAddr     string                  // HTTP listen address
	httpsAddr    string                  // HTTPS listen address
	acmeManager  *autocert.Manager       // ACME certificate manager
	acmeConfig   ACMEConfig              // ACME configuration
	httpServer   *http.Server            // HTTP server instance
	httpsServer  *http.Server            // HTTPS server instance
}
