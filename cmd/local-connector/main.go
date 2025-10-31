package main

import (
	"flag"
	"fmt"
	"os"

	"anava-camera-extension/pkg/common"
	"anava-camera-extension/pkg/nativehost"
	"anava-camera-extension/pkg/proxy"
)

const VERSION = "2.0.0"

func main() {
	// Command-line flags
	nativeMessagingMode := flag.Bool("native-messaging", false, "Run as native messaging host")
	proxyServiceMode := flag.Bool("proxy-service", false, "Run as proxy service")
	showVersion := flag.Bool("version", false, "Show version and exit")

	flag.Parse()

	// Show version and exit
	if *showVersion {
		fmt.Printf("Anava Local Connector v%s\n", VERSION)
		os.Exit(0)
	}

	// Determine mode
	var mode string
	if *nativeMessagingMode {
		mode = "native-messaging"
	} else if *proxyServiceMode {
		mode = "proxy-service"
	} else {
		fmt.Fprintln(os.Stderr, "Error: Must specify either --native-messaging or --proxy-service")
		fmt.Fprintln(os.Stderr, "")
		fmt.Fprintln(os.Stderr, "Usage:")
		fmt.Fprintln(os.Stderr, "  local-connector --native-messaging    # Run as Chrome native messaging host")
		fmt.Fprintln(os.Stderr, "  local-connector --proxy-service       # Run as proxy service (daemon)")
		fmt.Fprintln(os.Stderr, "  local-connector --version             # Show version")
		os.Exit(1)
	}

	// Initialize logger
	logger, err := common.InitLogger(mode)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}

	logger.Printf("Starting Anava Local Connector v%s in %s mode", VERSION, mode)

	// Run appropriate mode
	switch mode {
	case "native-messaging":
		if err := nativehost.Run(logger); err != nil {
			logger.Printf("Native messaging host error: %v", err)
			os.Exit(1)
		}

	case "proxy-service":
		// Check for lock file to prevent multiple instances
		lockFile, err := common.NewLockFile()
		if err != nil {
			logger.Printf("Failed to create lock file: %v", err)
			fmt.Fprintf(os.Stderr, "Failed to create lock file: %v\n", err)
			os.Exit(1)
		}

		if err := lockFile.TryLock(); err != nil {
			logger.Printf("Failed to acquire lock: %v", err)
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		defer lockFile.Unlock()

		// Create and run proxy server
		proxyServer, err := proxy.NewProxyServer(logger)
		if err != nil {
			logger.Printf("Failed to create proxy server: %v", err)
			fmt.Fprintf(os.Stderr, "Failed to create proxy server: %v\n", err)
			os.Exit(1)
		}

		if err := proxyServer.Run("9876"); err != nil {
			logger.Printf("Proxy server error: %v", err)
			fmt.Fprintf(os.Stderr, "Proxy server error: %v\n", err)
			os.Exit(1)
		}
	}
}
