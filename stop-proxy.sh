#!/bin/bash

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PID_FILE="$HOME/Library/Application Support/Anava/camera-proxy-server.pid"

echo -e "${YELLOW}Stopping Anava Camera Proxy Server...${NC}"

# Check if PID file exists
if [ ! -f "$PID_FILE" ]; then
    echo -e "${YELLOW}No PID file found. Checking for running processes...${NC}"

    # Try to find and kill any running instances
    PIDS=$(pgrep -f "camera-proxy-server")
    if [ -z "$PIDS" ]; then
        echo -e "${GREEN}✓ No proxy server processes found${NC}"
        exit 0
    else
        echo -e "${YELLOW}Found running processes: $PIDS${NC}"
        pkill -f "camera-proxy-server"
        sleep 1
        echo -e "${GREEN}✓ Stopped proxy server processes${NC}"
        exit 0
    fi
fi

# Read PID from file
PID=$(cat "$PID_FILE")

# Check if process is running
if ps -p $PID > /dev/null 2>&1; then
    kill $PID
    sleep 1

    # Check if it's really stopped
    if ps -p $PID > /dev/null 2>&1; then
        # Force kill if still running
        kill -9 $PID
        sleep 1
    fi

    rm "$PID_FILE"
    echo -e "${GREEN}✓ Proxy server stopped (PID: $PID)${NC}"
else
    echo -e "${YELLOW}Proxy server was not running${NC}"
    rm "$PID_FILE"
fi
