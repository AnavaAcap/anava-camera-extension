#!/bin/bash

# Anava Local Connector Installation Script
# This script installs and configures the local proxy server for the Chrome extension

set -e  # Exit on any error

echo "======================================"
echo "Anava Local Connector Installation"
echo "======================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "Working directory: $SCRIPT_DIR"
echo ""

# Step 1: Kill any existing proxy processes
echo "Step 1: Stopping existing proxy processes..."
pkill -9 -f "camera-proxy-server|local-connector" 2>/dev/null || true
echo -e "${GREEN}✓ Stopped existing processes${NC}"
echo ""

# Step 2: Unload old LaunchAgents
echo "Step 2: Unloading old LaunchAgents..."
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-extension.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist 2>/dev/null || true
launchctl unload ~/Library/LaunchAgents/com.anava.local_connector.plist 2>/dev/null || true
echo -e "${GREEN}✓ Unloaded old LaunchAgents${NC}"
echo ""

# Step 3: Remove old LaunchAgent files
echo "Step 3: Removing old LaunchAgent files..."
rm -f ~/Library/LaunchAgents/com.anava.camera-proxy-extension.plist
rm -f ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist
rm -f ~/Library/LaunchAgents/com.anava.local_connector.plist
echo -e "${GREEN}✓ Removed old LaunchAgent files${NC}"
echo ""

# Step 4: Build proxy server
echo "Step 4: Building local connector proxy..."
if ! command -v go &> /dev/null; then
    echo -e "${RED}✗ Go is not installed. Please install Go first.${NC}"
    echo "  Visit: https://golang.org/doc/install"
    exit 1
fi

mkdir -p build
cd proxy-server
echo "Building proxy server..."
go build -o ../build/local-connector main.go

if [ ! -f ../build/local-connector ]; then
    echo -e "${RED}✗ Failed to build proxy server${NC}"
    exit 1
fi

cd ..
echo -e "${GREEN}✓ Built local connector ($(ls -lh build/local-connector | awk '{print $5}'))${NC}"
echo ""

# Step 5: Install LaunchAgent
echo "Step 5: Installing LaunchAgent..."
mkdir -p ~/Library/LaunchAgents
cp com.anava.local-connector-extension.plist ~/Library/LaunchAgents/
echo -e "${GREEN}✓ Installed LaunchAgent${NC}"
echo ""

# Step 6: Load LaunchAgent
echo "Step 6: Loading LaunchAgent..."
launchctl load ~/Library/LaunchAgents/com.anava.local-connector-extension.plist

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Failed to load LaunchAgent${NC}"
    exit 1
fi

echo -e "${GREEN}✓ LaunchAgent loaded${NC}"
echo ""

# Step 7: Wait for startup
echo "Step 7: Waiting for proxy to start..."
sleep 3

# Step 8: Verify proxy is running
echo "Step 8: Verifying proxy server..."
MAX_ATTEMPTS=5
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -s -f http://127.0.0.1:9876/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Proxy server is running!${NC}"
        echo ""

        # Show health check response
        echo "Health check response:"
        curl -s http://127.0.0.1:9876/health | jq '.' 2>/dev/null || curl -s http://127.0.0.1:9876/health
        echo ""

        echo "======================================"
        echo -e "${GREEN}✓ Installation Complete!${NC}"
        echo "======================================"
        echo ""
        echo "Next steps:"
        echo "1. Reload your Chrome extension at chrome://extensions"
        echo "2. Open the extension popup and verify the green status indicator"
        echo "3. Start scanning for cameras"
        echo ""
        echo "Logs location:"
        echo "  - Main log:  ~/Library/Logs/anava-local-connector.log"
        echo "  - Error log: ~/Library/Logs/anava-local-connector-error.log"
        echo ""
        echo "Management commands:"
        echo "  - View logs:     tail -f ~/Library/Logs/anava-local-connector.log"
        echo "  - Stop proxy:    launchctl unload ~/Library/LaunchAgents/com.anava.local-connector-extension.plist"
        echo "  - Start proxy:   launchctl load ~/Library/LaunchAgents/com.anava.local-connector-extension.plist"
        echo "  - Check status:  curl http://127.0.0.1:9876/health"
        echo ""

        exit 0
    fi

    ATTEMPT=$((ATTEMPT + 1))
    echo "Attempt $ATTEMPT/$MAX_ATTEMPTS..."
    sleep 2
done

echo -e "${RED}✗ Proxy server failed to start${NC}"
echo ""
echo "Troubleshooting:"
echo "1. Check error log: tail -20 ~/Library/Logs/anava-local-connector-error.log"
echo "2. Check main log:  tail -20 ~/Library/Logs/anava-local-connector.log"
echo "3. Check if port 9876 is in use: lsof -i :9876"
echo "4. Try running proxy manually: ./build/local-connector"
echo ""

exit 1
