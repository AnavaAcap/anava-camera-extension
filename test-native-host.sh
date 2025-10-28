#!/bin/bash

# Test script for Anava Camera Proxy Native Messaging Host

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Native Messaging Host Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if binary exists
BINARY_PATH="$HOME/Library/Application Support/Anava/camera-proxy"
if [ ! -f "$BINARY_PATH" ]; then
    echo -e "${RED}✗ Binary not found at: $BINARY_PATH${NC}"
    echo -e "${YELLOW}Please run ./install.sh first${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Binary found${NC}"

# Test 1: Simple HTTP request
echo ""
echo -e "${YELLOW}Test 1: Simple HTTP request to httpbin.org${NC}"
echo '{"url":"https://httpbin.org/get","method":"GET","username":"test","password":"test"}' | \
  python3 -c "import sys, struct; msg = sys.stdin.read().encode(); sys.stdout.buffer.write(struct.pack('<I', len(msg)) + msg)" | \
  timeout 5 "$BINARY_PATH" 2>&1 | \
  python3 -c "import sys, struct, json; length_bytes = sys.stdin.buffer.read(4); length = struct.unpack('<I', length_bytes)[0] if length_bytes else 0; data = sys.stdin.buffer.read(length) if length else b'{}'; result = json.loads(data); print('Status:', result.get('status', 'N/A')); exit(0 if result.get('status') else 1)" && \
  echo -e "${GREEN}✓ Test passed${NC}" || echo -e "${RED}✗ Test failed${NC}"

# Test 2: Camera authentication (if camera is available)
echo ""
echo -e "${YELLOW}Test 2: Camera authentication (192.168.50.156)${NC}"
read -p "Do you want to test with the camera? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo '{"url":"https://192.168.50.156:443/axis-cgi/param.cgi?action=list&group=Properties.System","method":"GET","username":"anava","password":"baton"}' | \
      python3 -c "import sys, struct; msg = sys.stdin.read().encode(); sys.stdout.buffer.write(struct.pack('<I', len(msg)) + msg)" | \
      timeout 10 "$BINARY_PATH" 2>&1 | \
      python3 -c "import sys, struct, json; length_bytes = sys.stdin.buffer.read(4); length = struct.unpack('<I', length_bytes)[0] if length_bytes else 0; data = sys.stdin.buffer.read(length) if length else b'{}'; result = json.loads(data); print('Status:', result.get('status', 'N/A')); print('Has data:', bool(result.get('data'))); exit(0 if result.get('status') == 200 else 1)" && \
      echo -e "${GREEN}✓ Camera authentication successful${NC}" || echo -e "${RED}✗ Camera authentication failed${NC}"
else
    echo -e "${YELLOW}⊘ Skipped${NC}"
fi

# Check logs
echo ""
echo -e "${YELLOW}Recent log entries:${NC}"
LOG_FILE="$HOME/Library/Logs/anava-camera-proxy.log"
if [ -f "$LOG_FILE" ]; then
    tail -10 "$LOG_FILE" | sed 's/^/  /'
else
    echo -e "${YELLOW}  No log file found${NC}"
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Test suite complete!${NC}"
echo -e "${BLUE}========================================${NC}"
