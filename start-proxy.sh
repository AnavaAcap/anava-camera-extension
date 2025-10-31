#!/bin/bash

# Anava Camera Proxy Starter
# Starts the local network proxy server that allows Chrome extension to access cameras

PROXY_BIN="/Applications/AnavaLocalConnector/local-connector"
LOG_FILE="$HOME/Library/Logs/anava-camera-proxy-server.log"
PID_FILE="$HOME/Library/Application Support/Anava/proxy.pid"

# Check if already running
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "✅ Proxy is already running (PID: $PID)"
        echo "   Health check: http://127.0.0.1:9876/health"
        exit 0
    fi
fi

# Ensure binary exists
if [ ! -f "$PROXY_BIN" ]; then
    echo "❌ Proxy binary not found at $PROXY_BIN"
    echo "   Run ./install-proxy.sh first"
    exit 1
fi

# Start proxy in background
echo "🚀 Starting Anava camera proxy..."
nohup "$PROXY_BIN" > /dev/null 2>&1 &
PROXY_PID=$!

# Save PID
mkdir -p "$(dirname "$PID_FILE")"
echo $PROXY_PID > "$PID_FILE"

# Wait and verify
sleep 2
if ps -p $PROXY_PID > /dev/null 2>&1; then
    # Test health endpoint
    if curl -s -m 2 http://127.0.0.1:9876/health | grep -q "ok"; then
        echo "✅ Proxy started successfully (PID: $PROXY_PID)"
        echo "   Listening on: http://127.0.0.1:9876"
        echo "   Logs: $LOG_FILE"
    else
        echo "⚠️  Proxy started but health check failed"
        echo "   Check logs: tail -f $LOG_FILE"
    fi
else
    echo "❌ Failed to start proxy"
    rm -f "$PID_FILE"
    exit 1
fi
