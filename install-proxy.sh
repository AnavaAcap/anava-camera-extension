#!/bin/bash

set -e

echo "==== Anava Camera Proxy Installation ===="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROXY_SERVER_DIR="proxy-server"
NATIVE_HOST_DIR="native-host-proxy"
INSTALL_DIR="$HOME/Library/Application Support/Anava"
PROXY_SERVER_BIN="$INSTALL_DIR/camera-proxy-server"
NATIVE_HOST_BIN="$INSTALL_DIR/camera-proxy"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_FILE="$MANIFEST_DIR/com.anava.camera_proxy.json"
LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
LAUNCH_AGENT_FILE="$LAUNCH_AGENT_DIR/com.anava.camera-proxy-server.plist"

echo "${YELLOW}Step 1: Building proxy server...${NC}"
cd "$PROXY_SERVER_DIR"
go build -o camera-proxy-server main.go
cd ..
echo "${GREEN}✓ Proxy server built${NC}"

echo ""
echo "${YELLOW}Step 2: Building native messaging host...${NC}"
cd "$NATIVE_HOST_DIR"
go build -o camera-proxy main.go
cd ..
echo "${GREEN}✓ Native messaging host built${NC}"

echo ""
echo "${YELLOW}Step 3: Installing binaries...${NC}"
mkdir -p "$INSTALL_DIR"
cp "$PROXY_SERVER_DIR/camera-proxy-server" "$PROXY_SERVER_BIN"
cp "$NATIVE_HOST_DIR/camera-proxy" "$NATIVE_HOST_BIN"
chmod +x "$PROXY_SERVER_BIN"
chmod +x "$NATIVE_HOST_BIN"
echo "${GREEN}✓ Binaries installed to: $INSTALL_DIR${NC}"

echo ""
echo "${YELLOW}Step 4: Creating native messaging host manifest...${NC}"
mkdir -p "$MANIFEST_DIR"

# Extension ID is determined by Chrome when loaded in developer mode
# We'll use a wildcard pattern that Chrome will accept
EXTENSION_ID="ojhdgnojgelfiejpgipjddfddgefdpfa"
echo "Using extension ID: $EXTENSION_ID"

cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.anava.camera_proxy",
  "description": "Anava Camera Authentication Proxy (via localhost)",
  "path": "$NATIVE_HOST_BIN",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo "${GREEN}✓ Native messaging manifest created${NC}"
echo "   Extension ID: $EXTENSION_ID"

echo ""
echo "${YELLOW}Step 5: Creating LaunchAgent for proxy server...${NC}"
mkdir -p "$LAUNCH_AGENT_DIR"

cat > "$LAUNCH_AGENT_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.anava.camera-proxy-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PROXY_SERVER_BIN</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/Library/Logs/camera-proxy-server.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/Library/Logs/camera-proxy-server.stderr.log</string>
</dict>
</plist>
EOF

echo "${GREEN}✓ LaunchAgent plist created${NC}"

echo ""
echo "${YELLOW}Step 6: Loading LaunchAgent...${NC}"

# Unload if already loaded
launchctl unload "$LAUNCH_AGENT_FILE" 2>/dev/null || true

# Load the new agent
launchctl load "$LAUNCH_AGENT_FILE"

echo "${GREEN}✓ Proxy server started as LaunchAgent${NC}"

# Wait a moment for server to start
sleep 2

echo ""
echo "${YELLOW}Step 7: Testing proxy server...${NC}"
if curl -s http://127.0.0.1:9876/health > /dev/null; then
    echo "${GREEN}✓ Proxy server is running and responding${NC}"
else
    echo "${RED}✗ Proxy server health check failed${NC}"
    echo "Check logs at: ~/Library/Logs/anava-camera-proxy-server.log"
    exit 1
fi

echo ""
echo "${GREEN}==== Installation Complete! ====${NC}"
echo ""
echo "Architecture:"
echo "  1. Chrome Extension → Native Messaging Host (Chrome sandbox allows localhost)"
echo "  2. Native Host → Local Proxy Server (http://127.0.0.1:9876)"
echo "  3. Proxy Server → Camera (NO sandbox restrictions)"
echo ""
echo "Logs:"
echo "  Proxy Server: ~/Library/Logs/anava-camera-proxy-server.log"
echo "  Native Host:  ~/Library/Logs/anava-native-host.log"
echo ""
echo "Control Proxy Server:"
echo "  Stop:  launchctl unload $LAUNCH_AGENT_FILE"
echo "  Start: launchctl load $LAUNCH_AGENT_FILE"
echo "  Check: curl http://127.0.0.1:9876/health"
echo ""
echo "${YELLOW}Next steps:${NC}"
echo "  1. Load the Chrome extension from: $(pwd)"
echo "  2. Test camera authentication"
echo ""
