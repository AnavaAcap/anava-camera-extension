#!/bin/bash

# Test the native messaging host by sending a camera auth request

NATIVE_HOST="$HOME/Library/Application Support/Anava/camera-proxy"

# Create test message
TEST_MESSAGE='{
  "url": "https://192.168.50.156/axis-cgi/basicdeviceinfo.cgi",
  "method": "POST",
  "username": "anava",
  "password": "baton",
  "body": {
    "apiVersion": "1.0",
    "method": "getProperties",
    "params": {
      "propertyList": ["Brand", "ProdType", "ProdNbr", "ProdFullName", "SerialNumber"]
    }
  }
}'

echo "Testing native messaging host..."
echo "Host: $NATIVE_HOST"
echo "Message: $TEST_MESSAGE"
echo ""

# Calculate message length
MESSAGE_LENGTH=${#TEST_MESSAGE}

# Create binary file with length prefix (4 bytes, little-endian) + JSON message
TEMP_FILE=$(mktemp)
printf "\\x$(printf '%02x' $((MESSAGE_LENGTH & 0xFF)))" > "$TEMP_FILE"
printf "\\x$(printf '%02x' $(((MESSAGE_LENGTH >> 8) & 0xFF)))" >> "$TEMP_FILE"
printf "\\x$(printf '%02x' $(((MESSAGE_LENGTH >> 16) & 0xFF)))" >> "$TEMP_FILE"
printf "\\x$(printf '%02x' $(((MESSAGE_LENGTH >> 24) & 0xFF)))" >> "$TEMP_FILE"
echo -n "$TEST_MESSAGE" >> "$TEMP_FILE"

# Run native host
echo "Sending request to native host..."
RESPONSE=$("$NATIVE_HOST" < "$TEMP_FILE" 2>&1 | tail -c +5)

# Clean up
rm -f "$TEMP_FILE"

echo ""
echo "Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

echo ""
echo "Check logs:"
echo "  Native host: ~/Library/Logs/anava-native-host.log"
echo "  Proxy server: ~/Library/Logs/anava-camera-proxy-server.log"
