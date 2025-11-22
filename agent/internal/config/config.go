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
	WireguardPrivateKey string // Generated locally if not provided

	// Docker integration
	DockerEnabled bool
	DockerSocket  string
}

func LoadConfig() (*Config, error) {
	cfg := &Config{}

	// Control Server
	flag.StringVar(&cfg.ControlURL, "control-url", getEnv("CONTROL_URL", "ws://localhost:3001"), "Control server WebSocket URL")
	flag.StringVar(&cfg.APIKey, "api-key", getEnv("API_KEY", ""), "API key for authentication")

	// WireGuard
	flag.StringVar(&cfg.WireguardPrivateKey, "wireguard-private-key", getEnv("WIREGUARD_PRIVATE_KEY", ""), "WireGuard private key (auto-generated if empty)")

	// Docker
	flag.BoolVar(&cfg.DockerEnabled, "docker-enabled", getEnvBool("DOCKER_ENABLED", false), "Enable Docker integration")
	flag.StringVar(&cfg.DockerSocket, "docker-socket", getEnv("DOCKER_SOCKET", "/var/run/docker.sock"), "Docker socket path")

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

func getEnvBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		return value == "true" || value == "1"
	}
	return defaultValue
}
