package config

import (
	"flag"
	"fmt"
	"os"
)

type Config struct {
	// Control Server
	ControlURL string
	APIKey     string

	// WireGuard
	WireguardPort      int
	WireguardInterface string
	WireguardPrivateKey string // Generated locally, not from env

	// HTTP/HTTPS
	HTTPPort  int
	HTTPSPort int

	// Let's Encrypt
	ACMEEmail     string
	ACMEStaging   bool
	ACMECacheDir  string

	// Server
	PublicIP string
	Region   string
}

func LoadConfig() (*Config, error) {
	cfg := &Config{}

	// Control Server
	flag.StringVar(&cfg.ControlURL, "control-url", getEnv("CONTROL_URL", "ws://localhost:3001"), "Control server WebSocket URL")
	flag.StringVar(&cfg.APIKey, "api-key", getEnv("API_KEY", ""), "API key for authentication")

	// WireGuard
	flag.IntVar(&cfg.WireguardPort, "wireguard-port", getEnvInt("WIREGUARD_PORT", 51820), "WireGuard UDP port")
	flag.StringVar(&cfg.WireguardInterface, "wireguard-interface", getEnv("WIREGUARD_INTERFACE", "wg0"), "WireGuard interface name")

	// HTTP/HTTPS
	flag.IntVar(&cfg.HTTPPort, "http-port", getEnvInt("HTTP_PORT", 80), "HTTP port")
	flag.IntVar(&cfg.HTTPSPort, "https-port", getEnvInt("HTTPS_PORT", 443), "HTTPS port")

	// Let's Encrypt
	flag.StringVar(&cfg.ACMEEmail, "acme-email", getEnv("ACME_EMAIL", "admin@example.com"), "ACME email for Let's Encrypt")
	flag.BoolVar(&cfg.ACMEStaging, "acme-staging", getEnvBool("ACME_STAGING", false), "Use Let's Encrypt staging environment")
	flag.StringVar(&cfg.ACMECacheDir, "acme-cache-dir", getEnv("ACME_CACHE_DIR", "./cache/autocert"), "ACME certificate cache directory")

	// Server
	flag.StringVar(&cfg.PublicIP, "public-ip", getEnv("PUBLIC_IP", "auto"), "Public IP address")
	flag.StringVar(&cfg.Region, "region", getEnv("REGION", "local"), "Gateway region")

	flag.Parse()

	// Validate required fields
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("API_KEY is required")
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		var intValue int
		if _, err := fmt.Sscanf(value, "%d", &intValue); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		return value == "true" || value == "1"
	}
	return defaultValue
}
