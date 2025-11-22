package main

import (
	"context"
	"fmt"
	"log"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/yourorg/kakuremichi/agent/internal/config"
)

func main() {
	// Initialize logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	slog.Info("Starting kakuremichi Agent")

	// Load configuration
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	slog.Info("Configuration loaded",
		"control_url", cfg.ControlURL,
		"docker_enabled", cfg.DockerEnabled,
	)

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// TODO: Initialize WireGuard + netstack
	// wg, err := wireguard.NewDevice(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create WireGuard device: %v", err)
	// }
	// defer wg.Close()

	// TODO: Initialize local proxy
	// proxy, err := proxy.NewLocalProxy(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create local proxy: %v", err)
	// }

	// TODO: Initialize WebSocket client (Control connection)
	// wsClient, err := ws.NewClient(cfg)
	// if err != nil {
	// 	log.Fatalf("Failed to create WebSocket client: %v", err)
	// }
	// go wsClient.Connect(ctx)

	// TODO: Initialize Docker integration (if enabled)
	// if cfg.DockerEnabled {
	// 	dockerClient, err := docker.NewClient(cfg)
	// 	if err != nil {
	// 		slog.Warn("Failed to create Docker client", "error", err)
	// 	} else {
	// 		go dockerClient.Watch(ctx)
	// 	}
	// }

	slog.Info("Agent started successfully")

	// Wait for interrupt signal
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	slog.Info("Shutting down Agent")
	cancel()

	// TODO: Graceful shutdown
	// proxy.Shutdown()
	// wg.Close()

	fmt.Println("Agent stopped")
}
