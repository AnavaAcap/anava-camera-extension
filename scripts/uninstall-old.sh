#!/bin/bash
# Uninstall old version of Anava Local Connector
# This script removes files from the pre-2.0 installation

set -e

echo "=========================================="
echo "Anava Local Connector - Old Version Uninstall"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track what was removed
REMOVED_COUNT=0

# Function to safely remove file/directory
safe_remove() {
    local path="$1"
    if [ -e "$path" ]; then
        rm -rf "$path"
        echo -e "${GREEN}✓${NC} Removed: $path"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    else
        echo -e "  Skipped: $path (not found)"
    fi
}

echo "Checking for old installation files..."
echo ""

# Stop and remove LaunchAgent (macOS)
if [ -f ~/Library/LaunchAgents/com.anava.proxy.plist ]; then
    echo "Stopping LaunchAgent..."
    launchctl unload ~/Library/LaunchAgents/com.anava.proxy.plist 2>/dev/null || true
    safe_remove ~/Library/LaunchAgents/com.anava.proxy.plist
fi

# Remove binaries
echo "Removing old binaries..."
safe_remove ~/.local/bin/proxy-server
safe_remove ~/.local/bin/native-host-proxy

# Remove configuration
echo "Removing old configuration..."
safe_remove ~/.config/anava

# Remove old native messaging manifest
echo "Removing old native messaging manifests..."
safe_remove ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.anava.proxy.json
safe_remove ~/Library/Application\ Support/Chromium/NativeMessagingHosts/com.anava.proxy.json

# Remove logs (optional - ask user)
if [ -d ~/Library/Logs ] && ([ -f ~/Library/Logs/anava-camera-proxy-server.log ] || [ -f ~/Library/Logs/anava-native-host.log ]); then
    echo ""
    read -p "Remove old log files? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        safe_remove ~/Library/Logs/anava-camera-proxy-server.log
        safe_remove ~/Library/Logs/anava-native-host.log
        safe_remove ~/Library/Logs/anava-proxy-server.log
    else
        echo "Keeping log files"
    fi
fi

echo ""
echo "=========================================="
if [ $REMOVED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓ Old version uninstalled successfully!${NC}"
    echo -e "  Removed ${GREEN}$REMOVED_COUNT${NC} files/directories"
else
    echo -e "${YELLOW}No old installation files found${NC}"
fi
echo "=========================================="
echo ""
echo "You can now install the new version:"
echo "  1. Install Chrome extension from Web Store"
echo "  2. Click extension icon and download companion app"
echo "  3. Run the installer for your platform"
echo ""
