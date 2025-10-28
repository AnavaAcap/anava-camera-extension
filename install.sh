#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Anava Camera Proxy Installer${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Detect extension ID
echo -e "${YELLOW}Step 1: Detecting Chrome extension ID...${NC}"

EXTENSION_ID=""
CHROME_EXTENSIONS_DIR="$HOME/Library/Application Support/Google/Chrome/Default/Extensions"

if [ -d "$CHROME_EXTENSIONS_DIR" ]; then
    # Look for our extension by checking manifest.json files
    for dir in "$CHROME_EXTENSIONS_DIR"/*; do
        if [ -d "$dir" ]; then
            MANIFEST_PATH="$dir/*/manifest.json"
            for manifest in $MANIFEST_PATH; do
                if [ -f "$manifest" ]; then
                    # Check if this is the Anava extension
                    if grep -q "Anava Camera Manager" "$manifest" 2>/dev/null; then
                        EXTENSION_ID=$(basename "$dir")
                        echo -e "${GREEN}✓ Found extension ID: $EXTENSION_ID${NC}"
                        break 2
                    fi
                fi
            done
        fi
    done
fi

if [ -z "$EXTENSION_ID" ]; then
    echo -e "${RED}✗ Could not automatically detect extension ID${NC}"
    echo -e "${YELLOW}Please enter your Chrome extension ID manually:${NC}"
    echo -e "${YELLOW}(Find it at chrome://extensions with Developer mode enabled)${NC}"
    read -p "Extension ID: " EXTENSION_ID

    if [ -z "$EXTENSION_ID" ]; then
        echo -e "${RED}Error: Extension ID is required${NC}"
        exit 1
    fi
fi

echo ""

# Build Go binary
echo -e "${YELLOW}Step 2: Building Go binary...${NC}"

cd "$(dirname "$0")/native-host"

# Build for both architectures
echo "Building for amd64..."
GOOS=darwin GOARCH=amd64 go build -o camera-proxy-amd64 main.go

echo "Building for arm64..."
GOOS=darwin GOARCH=arm64 go build -o camera-proxy-arm64 main.go

# Detect current architecture and use appropriate binary
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    BINARY="camera-proxy-arm64"
    echo -e "${GREEN}✓ Using ARM64 binary${NC}"
else
    BINARY="camera-proxy-amd64"
    echo -e "${GREEN}✓ Using AMD64 binary${NC}"
fi

echo ""

# Create installation directories
echo -e "${YELLOW}Step 3: Creating installation directories...${NC}"

INSTALL_DIR="$HOME/Library/Application Support/Anava"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

mkdir -p "$INSTALL_DIR"
mkdir -p "$MANIFEST_DIR"

echo -e "${GREEN}✓ Directories created${NC}"
echo ""

# Copy binary
echo -e "${YELLOW}Step 4: Installing binary...${NC}"

BINARY_PATH="$INSTALL_DIR/camera-proxy"
cp "$BINARY" "$BINARY_PATH"
chmod +x "$BINARY_PATH"

echo -e "${GREEN}✓ Binary installed to: $BINARY_PATH${NC}"
echo ""

# Generate native messaging manifest
echo -e "${YELLOW}Step 5: Generating native messaging manifest...${NC}"

MANIFEST_PATH="$MANIFEST_DIR/com.anava.camera_proxy.json"

cat > "$MANIFEST_PATH" << EOF
{
  "name": "com.anava.camera_proxy",
  "description": "Anava Camera Authentication Proxy",
  "path": "$BINARY_PATH",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF

echo -e "${GREEN}✓ Manifest created at: $MANIFEST_PATH${NC}"
echo ""

# Test the binary
echo -e "${YELLOW}Step 6: Testing native messaging host...${NC}"

TEST_INPUT='{"url":"https://httpbin.org/get","method":"GET","username":"test","password":"test"}'
TEST_INPUT_LENGTH=${#TEST_INPUT}

# Create test input with 4-byte length prefix
TEST_FILE=$(mktemp)
printf "$(printf '\\x%02x' $((TEST_INPUT_LENGTH & 0xFF)) $(((TEST_INPUT_LENGTH >> 8) & 0xFF)) $(((TEST_INPUT_LENGTH >> 16) & 0xFF)) $(((TEST_INPUT_LENGTH >> 24) & 0xFF)))" > "$TEST_FILE"
echo -n "$TEST_INPUT" >> "$TEST_FILE"

# Run test
if "$BINARY_PATH" < "$TEST_FILE" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Binary test passed${NC}"
else
    echo -e "${YELLOW}⚠ Binary test had issues, but this may be expected${NC}"
    echo -e "${YELLOW}  Check the log at: ~/Library/Logs/anava-camera-proxy.log${NC}"
fi

rm -f "$TEST_FILE"
echo ""

# Check log file
LOG_FILE="$HOME/Library/Logs/anava-camera-proxy.log"
if [ -f "$LOG_FILE" ]; then
    echo -e "${GREEN}✓ Log file created at: $LOG_FILE${NC}"
    echo -e "${BLUE}Last 5 log entries:${NC}"
    tail -5 "$LOG_FILE" | sed 's/^/  /'
else
    echo -e "${YELLOW}⚠ Log file not yet created (will be created on first use)${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✓ Binary installed: $BINARY_PATH${NC}"
echo -e "${GREEN}✓ Manifest installed: $MANIFEST_PATH${NC}"
echo -e "${GREEN}✓ Extension ID configured: $EXTENSION_ID${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Reload your Chrome extension at chrome://extensions"
echo "2. Test camera authentication with a real camera"
echo "3. Check logs at: $LOG_FILE"
echo ""
echo -e "${BLUE}If you encounter issues:${NC}"
echo "- Verify extension ID matches at chrome://extensions"
echo "- Check native host status in extension popup"
echo "- Review logs in $LOG_FILE"
echo ""
