#!/bin/bash

# Direct test of native messaging host with camera
BINARY="/Users/ryanwager/Library/Application Support/Anava/camera-proxy"

# Create JSON message
MESSAGE='{"method":"POST","url":"https://192.168.50.156:443/axis-cgi/basicdeviceinfo.cgi","username":"anava","password":"baton","body":{"apiVersion":"1.0","method":"getProperties","params":{"propertyList":["Brand","ProdType","ProdNbr","ProdFullName","SerialNumber"]}}}'

# Calculate message length
LENGTH=$(echo -n "$MESSAGE" | wc -c | tr -d ' ')

# Create length prefix (4 bytes, little-endian)
printf "$(printf '\\x%02x\\x%02x\\x%02x\\x%02x' $((LENGTH & 0xFF)) $(((LENGTH >> 8) & 0xFF)) $(((LENGTH >> 16) & 0xFF)) $(((LENGTH >> 24) & 0xFF)))" | cat - <(echo -n "$MESSAGE") | "$BINARY"
