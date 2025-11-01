#!/bin/bash

# Anava Local Connector Installation Script
# This script builds and installs the proxy server and Chrome extension

set -e  # Exit on error

echo "🚀 Anava Local Connector Installation"
echo "======================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo "✓ Node.js found: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo "✓ npm found: $(npm --version)"

# Check Go
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed. Please install Go from https://golang.org/dl/"
    exit 1
fi
echo "✓ Go found: $(go version)"

echo ""
echo "Building components..."
echo ""

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Build proxy server
echo "🔨 Building proxy server..."
cd proxy-server
go mod download
go build -o ../build/local-connector .
cd ..

if [ ! -f build/local-connector ]; then
    echo "❌ Failed to build proxy server"
    exit 1
fi
echo "✓ Proxy server built successfully"

# Build Chrome extension
echo "🔨 Building Chrome extension..."
npm run build

echo ""
echo "✅ Build complete!"
echo ""
echo "📦 Installation Summary:"
echo "  • Proxy server: build/local-connector"
echo "  • Extension files: Ready in root directory"
echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Start the proxy server:"
echo "   ./start-proxy.sh"
echo ""
echo "2. Install Chrome extension:"
echo "   • Open chrome://extensions"
echo "   • Enable 'Developer mode'"
echo "   • Click 'Load unpacked'"
echo "   • Select this directory: $(pwd)"
echo ""
echo "3. Use the extension:"
echo "   • Open the Anava web app (https://anava-ai.web.app)"
echo "   • Click the extension icon to verify proxy connection"
echo "   • Start deploying cameras!"
echo ""
echo "📚 Documentation:"
echo "   • README.md - Overview and usage"
echo "   • CLAUDE.md - Technical details"
echo "   • BULK_SCAN_API_v2.1.0.md - Scan architecture"
echo ""
echo "🎉 Installation complete!"
