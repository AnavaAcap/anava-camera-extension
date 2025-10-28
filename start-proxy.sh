#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROXY_BIN="$HOME/Library/Application Support/Anava/camera-proxy-server"
PID_FILE="$HOME/Library/Application Support/Anava/camera-proxy-server.pid"

echo -e "${YELLOW}Starting Anava Camera Proxy Server...${NC}"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo -e "${YELLOW}Proxy server is already running (PID: $OLD_PID)${NC}"
        exit 0
    else
        rm "$PID_FILE"
    fi
fi

# Check if binary exists
if [ ! -f "$PROXY_BIN" ]; then
    echo -e "${RED}Error: Proxy server binary not found at: $PROXY_BIN${NC}"
    echo "Please run ./install-proxy.sh first"
    exit 1
fi

# Start the server in background
"$PROXY_BIN" > /dev/null 2>&1 &
SERVER_PID=$!

# Save PID
echo $SERVER_PID > "$PID_FILE"

# Wait a moment and check if it's running
sleep 2
if ps -p $SERVER_PID > /dev/null 2>&1; then
    if curl -s http://127.0.0.1:9876/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Proxy server started successfully (PID: $SERVER_PID)${NC}"
        echo ""
        echo "The proxy server is now running in the background."
        echo "You can now use the Chrome extension to authenticate with cameras."
        echo ""
        echo "To stop the server: ./stop-proxy.sh"
        echo "Logs: ~/Library/Logs/anava-camera-proxy-server.log"
    else
        echo -e "${RED}✗ Proxy server started but health check failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Proxy server failed to start${NC}"
    rm "$PID_FILE"
    exit 1
fi
