#!/bin/bash

# Camera Authentication Test Script
# Tests the proxy server with various authentication scenarios

PROXY_URL="http://127.0.0.1:9876/proxy"
CAMERA_IP="192.168.50.156"
USERNAME="anava"
PASSWORD="baton"

echo "========================================"
echo "Camera Proxy Authentication Test"
echo "========================================"
echo ""

# Check if proxy is running
if ! curl -s http://127.0.0.1:9876/health > /dev/null 2>&1; then
    echo "❌ Proxy server not running on port 9876"
    echo "   Run: launchctl load ~/Library/LaunchAgents/com.anava.camera-proxy-server.plist"
    exit 1
fi
echo "✅ Proxy server is running"
echo ""

# Test 1: HTTPS with explicit port
echo "Test 1: HTTPS with explicit port (443)"
RESPONSE=$(curl -s -X POST "$PROXY_URL" -H "Content-Type: application/json" -d '{
  "url": "https://'"$CAMERA_IP"':443/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "'"$USERNAME"'",
  "password": "'"$PASSWORD"'",
  "body": {
    "apiVersion": "1.0",
    "method": "getProperties",
    "params": {"propertyList": ["Brand", "SerialNumber"]}
  }
}')

if echo "$RESPONSE" | grep -q "SerialNumber"; then
    SERIAL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['data']['propertyList']['SerialNumber'])")
    echo "✅ Success - Camera Serial: $SERIAL"
else
    echo "❌ Failed - Response: $RESPONSE"
fi
echo ""

# Test 2: HTTPS without explicit port
echo "Test 2: HTTPS without explicit port"
RESPONSE=$(curl -s -X POST "$PROXY_URL" -H "Content-Type: application/json" -d '{
  "url": "https://'"$CAMERA_IP"'/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "'"$USERNAME"'",
  "password": "'"$PASSWORD"'",
  "body": {
    "apiVersion": "1.0",
    "method": "getProperties",
    "params": {"propertyList": ["Brand", "SerialNumber"]}
  }
}')

if echo "$RESPONSE" | grep -q "SerialNumber"; then
    SERIAL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['data']['propertyList']['SerialNumber'])")
    echo "✅ Success - Camera Serial: $SERIAL"
else
    echo "❌ Failed - Response: $RESPONSE"
fi
echo ""

# Test 3: HTTP
echo "Test 3: HTTP"
RESPONSE=$(curl -s -X POST "$PROXY_URL" -H "Content-Type: application/json" -d '{
  "url": "http://'"$CAMERA_IP"'/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "'"$USERNAME"'",
  "password": "'"$PASSWORD"'",
  "body": {
    "apiVersion": "1.0",
    "method": "getProperties",
    "params": {"propertyList": ["Brand", "SerialNumber"]}
  }
}')

if echo "$RESPONSE" | grep -q "SerialNumber"; then
    SERIAL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['data']['propertyList']['SerialNumber'])")
    echo "✅ Success - Camera Serial: $SERIAL"
else
    echo "❌ Failed - Response: $RESPONSE"
fi
echo ""

# Test 4: Wrong credentials (should fail gracefully)
echo "Test 4: Wrong credentials (should fail with 401)"
RESPONSE=$(curl -s -X POST "$PROXY_URL" -H "Content-Type: application/json" -d '{
  "url": "https://'"$CAMERA_IP"'/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "wrong",
  "password": "wrong",
  "body": {
    "apiVersion": "1.0",
    "method": "getProperties",
    "params": {"propertyList": ["Brand"]}
  }
}')

if echo "$RESPONSE" | grep -q '"status":401'; then
    echo "✅ Correctly rejected invalid credentials"
elif echo "$RESPONSE" | grep -q '"status":200'; then
    echo "⚠️  Warning - Accepted invalid credentials (camera misconfigured?)"
else
    echo "❌ Unexpected response: $RESPONSE"
fi
echo ""

# Performance test
echo "Test 5: Performance (5 sequential requests)"
START_TIME=$(date +%s.%N)
for i in {1..5}; do
    curl -s -X POST "$PROXY_URL" -H "Content-Type: application/json" -d '{
      "url": "https://'"$CAMERA_IP"'/axis-cgi/basicdeviceinfo.cgi",
      "method": "POST",
      "username": "'"$USERNAME"'",
      "password": "'"$PASSWORD"'",
      "body": {"apiVersion": "1.0", "method": "getProperties", "params": {"propertyList": ["Brand"]}}
    }' > /dev/null
done
END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc)
AVG=$(echo "scale=0; $DURATION * 1000 / 5" | bc)
echo "✅ Completed in ${DURATION}s (avg ${AVG}ms per request)"
echo ""

echo "========================================"
echo "Log file: ~/Library/Logs/anava-camera-proxy-server.log"
echo "View latest: tail -50 ~/Library/Logs/anava-camera-proxy-server.log"
echo "========================================"
