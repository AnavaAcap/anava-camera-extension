#!/bin/bash

# Anava Local Connector Test Script
# Validates that the proxy server is working correctly

set -e

echo "======================================"
echo "Anava Local Connector Test Suite"
echo "======================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Health Check
echo "Test 1: Health check endpoint..."
if curl -s -f http://127.0.0.1:9876/health > /dev/null 2>&1; then
    RESPONSE=$(curl -s http://127.0.0.1:9876/health)
    if echo "$RESPONSE" | grep -q "ok"; then
        echo -e "${GREEN}✓ PASS${NC} - Health check returned 'ok'"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC} - Health check did not return expected response"
        echo "  Response: $RESPONSE"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
else
    echo -e "${RED}✗ FAIL${NC} - Health check endpoint not responding"
    echo "  Is the proxy server running? Try: ./install-local-connector.sh"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 2: Process Check
echo "Test 2: Checking if proxy process is running..."
if ps aux | grep -v grep | grep -q "local-connector"; then
    PID=$(ps aux | grep -v grep | grep "local-connector" | awk '{print $2}')
    echo -e "${GREEN}✓ PASS${NC} - Proxy process is running (PID: $PID)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} - Proxy process not found"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 3: Port Check
echo "Test 3: Checking if port 9876 is listening..."
if lsof -i :9876 > /dev/null 2>&1; then
    PROCESS=$(lsof -i :9876 | tail -1 | awk '{print $1}')
    echo -e "${GREEN}✓ PASS${NC} - Port 9876 is listening (process: $PROCESS)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${RED}✗ FAIL${NC} - Port 9876 is not listening"
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi
echo ""

# Test 4: LaunchAgent Check
echo "Test 4: Checking LaunchAgent status..."
if launchctl list | grep -q "com.anava.local-connector-extension"; then
    echo -e "${GREEN}✓ PASS${NC} - LaunchAgent is loaded"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo -e "${YELLOW}⚠ WARNING${NC} - LaunchAgent not found in launchctl list"
    echo "  This may be normal if proxy was started manually"
    TESTS_PASSED=$((TESTS_PASSED + 1))
fi
echo ""

# Test 5: Camera Authentication Test (only if camera IP provided)
if [ ! -z "$1" ]; then
    CAMERA_IP="$1"
    USERNAME="${2:-anava}"
    PASSWORD="${3:-baton}"

    echo "Test 5: Testing camera authentication at $CAMERA_IP..."
    RESPONSE=$(curl -s -X POST http://127.0.0.1:9876/proxy \
        -H "Content-Type: application/json" \
        -d "{\"url\":\"https://$CAMERA_IP/axis-cgi/basicdeviceinfo.cgi\",\"method\":\"POST\",\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\",\"body\":{\"apiVersion\":\"1.0\",\"method\":\"getProperties\",\"params\":{\"propertyList\":[\"Brand\",\"ProdFullName\"]}}}" \
        -w "\nHTTP_CODE:%{http_code}")

    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
    BODY=$(echo "$RESPONSE" | grep -v "HTTP_CODE")

    if [ "$HTTP_CODE" = "200" ]; then
        if echo "$BODY" | grep -q "AXIS"; then
            MODEL=$(echo "$BODY" | jq -r '.data.data.propertyList.ProdFullName' 2>/dev/null || echo "Unknown")
            echo -e "${GREEN}✓ PASS${NC} - Camera authentication successful"
            echo "  Camera model: $MODEL"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAIL${NC} - Camera did not return expected data"
            echo "  Response: $BODY"
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        echo -e "${RED}✗ FAIL${NC} - Camera authentication failed (HTTP $HTTP_CODE)"
        echo "  Response: $BODY"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    echo ""
else
    echo "Test 5: Skipped (no camera IP provided)"
    echo "  Usage: $0 <camera-ip> [username] [password]"
    echo ""
fi

# Summary
echo "======================================"
echo "Test Results"
echo "======================================"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"
fi
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "Your local connector is working correctly."
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check logs: tail -f ~/Library/Logs/anava-local-connector.log"
    echo "2. Reinstall:  ./install-local-connector.sh"
    echo "3. Check port: lsof -i :9876"
    exit 1
fi
