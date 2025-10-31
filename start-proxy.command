#!/bin/bash
# Start Anava Local Connector
# Double-click this file or add to Login Items for auto-start

cd "$(dirname "$0")"

# Kill any existing instances
pkill -f local-connector 2>/dev/null

# Start the proxy
./build/local-connector > ~/Library/Logs/anava-local-connector.log 2>&1
