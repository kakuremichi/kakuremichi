package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/yourorg/kakuremichi/gateway/internal/config"
)

func main() {
	// Initialize logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	slog.Info("Starting kakuremichi Gateway")

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	slog.Info("Configuration loaded",
		"control_url", cfg.ControlURL,
		"wireguard_port", cfg.WireguardPort,
		"http_port", cfg.HTTPPort,
		"https_port", cfg.HTTPSPort,
	)

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Prevent "declared and not used" error
	_ = ctx

	// TODO: Initialize WireGuard interface
	// wg, err := wireguard.NewInterface(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create WireGuard interface: %v", err)
	// }
	// defer wg.Close()

	// TODO: Initialize HTTP proxy
	// proxy, err := proxy.NewHTTPProxy(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create HTTP proxy: %v", err)
	// }

	// TODO: Initialize WebSocket client (Control connection)
	// wsClient, err := ws.NewClient(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create WebSocket client: %v", err)
	// }
	// go wsClient.Connect(ctx)

	slog.Info("Gateway started successfully")

	// Wait for interrupt signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("Shutting down Gateway")
	cancel()

	// TODO: Graceful shutdown
	// proxy.Shutdown()
	// wg.Close()

	fmt.Println("Gateway stopped")
}
