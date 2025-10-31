#!/bin/bash

# Anava Camera Proxy Stopper

PID_FILE="$HOME/Library/Application Support/Anava/proxy.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "❌ No PID file found - proxy may not be running"
    # Try killall as fallback
    killall -9 local-connector 2>/dev/null && echo "✅ Killed via killall" || echo "   No processes found"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ps -p $PID > /dev/null 2>&1; then
    kill -9 $PID
    echo "✅ Stopped proxy (PID: $PID)"
else
    echo "⚠️  Proxy was not running (stale PID file)"
fi

rm -f "$PID_FILE"
