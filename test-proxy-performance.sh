#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Testing Proxy Performance with New Authentication Pattern${NC}"
echo ""

# Test 1: Non-existent IP (should fail fast - ~3 seconds)
echo -e "${YELLOW}Test 1: Non-existent IP (should timeout in ~3 seconds)${NC}"
START=$(date +%s)
curl -s -X POST http://127.0.0.1:9876/proxy \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://192.168.50.99:443/axis-cgi/basicdeviceinfo.cgi",
    "method": "POST",
    "username": "root",
    "password": "pass",
    "body": {
      "apiVersion": "1.0",
      "method": "getProperties",
      "params": {
        "propertyList": ["Brand", "ProdType"]
      }
    }
  }' > /dev/null 2>&1
END=$(date +%s)
DURATION=$((END - START))
echo -e "Duration: ${DURATION}s"
if [ $DURATION -le 4 ]; then
  echo -e "${GREEN}✓ Fast timeout (expected ~3s)${NC}"
else
  echo -e "${RED}✗ Slow timeout (took ${DURATION}s)${NC}"
fi
echo ""

# Test 2: Check recent logs for new pattern
echo -e "${YELLOW}Test 2: Checking logs for new authentication pattern${NC}"
if grep -q "Step 1: Testing connection without authentication" ~/Library/Logs/anava-camera-proxy-server.log; then
  echo -e "${GREEN}✓ New authentication pattern detected in logs${NC}"
else
  echo -e "${RED}✗ New authentication pattern NOT found in logs${NC}"
fi
echo ""

echo -e "${BLUE}Test Summary:${NC}"
echo "- Non-existent IPs should now fail in ~3 seconds"
echo "- Only ONE unauthenticated request is made first"
echo "- Auth methods are tried based on protocol (HTTPS=Basic first, HTTP=Digest first)"
echo ""
echo "View full logs: tail -f ~/Library/Logs/anava-camera-proxy-server.log"
