#!/bin/bash
# Production build script for Anava Local Connector
# Builds extension + creates signed, notarized macOS installer
#
# Usage:
#   APPLE_ID="ryan@anava.ai" \
#   APPLE_ID_PASSWORD="gbdi-fnth-pxfx-aofv" \
#   APPLE_TEAM_ID="3JVZNWGRYT" \
#   CSC_NAME="Ryan Wager (3JVZNWGRYT)" \
#   ./build-production.sh

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         Anava Local Connector - Production Build              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check for required credentials
if [ -z "$CSC_NAME" ]; then
    echo "❌ ERROR: CSC_NAME not set"
    echo ""
    echo "Please run with credentials:"
    echo ""
    echo "  APPLE_ID=\"ryan@anava.ai\" \\"
    echo "  APPLE_ID_PASSWORD=\"gbdi-fnth-pxfx-aofv\" \\"
    echo "  APPLE_TEAM_ID=\"3JVZNWGRYT\" \\"
    echo "  CSC_NAME=\"Ryan Wager (3JVZNWGRYT)\" \\"
    echo "  ./build-production.sh"
    echo ""
    exit 1
fi

echo "✓ Credentials found"
echo "  Team: $APPLE_TEAM_ID"
echo "  Signer: $CSC_NAME"
echo ""

# Step 1: Generate icons
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Generating icons..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "scripts/generate-icons.sh" ]; then
    echo "⚠️  Icon generation script not found, skipping..."
else
    chmod +x scripts/generate-icons.sh
    ./scripts/generate-icons.sh || echo "⚠️  Icon generation failed, continuing..."
fi

echo ""

# Step 2: Build extension
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Building Chrome extension..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "  Installing Node.js dependencies..."
    npm install
fi

# Build extension
npm run build

echo "✓ Extension built successfully"
echo ""

# Step 3: Prepare installer structure
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Preparing installer structure..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

INSTALLER_ROOT="installers/macos/root"

# Create directory structure
mkdir -p "${INSTALLER_ROOT}/Applications/AnavaLocalConnector"
mkdir -p "${INSTALLER_ROOT}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "${INSTALLER_ROOT}/Library/LaunchAgents"

echo "✓ Directory structure created"
echo ""

# Step 4: Build macOS installer
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Building macOS installer (signed + notarized)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

chmod +x scripts/build-macos-pkg.sh

# Run the build script with credentials
APPLE_ID="$APPLE_ID" \
APPLE_ID_PASSWORD="$APPLE_ID_PASSWORD" \
APPLE_TEAM_ID="$APPLE_TEAM_ID" \
CSC_NAME="$CSC_NAME" \
./scripts/build-macos-pkg.sh

echo ""

# Step 5: Create extension zip for Chrome Web Store
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Creating extension zip for Chrome Web Store..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p dist

# Zip the extension
zip -r dist/anava-local-connector-extension.zip \
    dist/ \
    icons/ \
    popup.html \
    popup.css \
    popup.js \
    background.js \
    manifest.json \
    -x "*.DS_Store" \
    -x "*node_modules*" \
    -x "dist/AnavaLocalConnector*"

echo "✓ Extension zip created: dist/anava-local-connector-extension.zip"
echo ""

# Detect which package was created
if [ -f "dist/AnavaLocalConnector-2.0.0.pkg" ]; then
    PKG_FILE="dist/AnavaLocalConnector-2.0.0.pkg"
    PKG_STATUS="(Signed and notarized)"
    INSTALL_CMD="sudo installer -pkg dist/AnavaLocalConnector-2.0.0.pkg -target /"
elif [ -f "dist/AnavaLocalConnector-2.0.0-unsigned.pkg" ]; then
    PKG_FILE="dist/AnavaLocalConnector-2.0.0-unsigned.pkg"
    PKG_STATUS="(Binary signed, package unsigned - need Developer ID Installer certificate)"
    INSTALL_CMD="sudo installer -pkg dist/AnavaLocalConnector-2.0.0-unsigned.pkg -target / -allowUntrusted"
else
    PKG_FILE="(not found)"
    PKG_STATUS="(build failed)"
    INSTALL_CMD="(no installer available)"
fi

# Final summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    🎉 BUILD COMPLETE! 🎉                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Production artifacts:"
echo ""
echo "  📦 macOS Installer:"
echo "     ${PKG_FILE}"
echo "     ${PKG_STATUS}"
echo ""
echo "  🔌 Chrome Extension:"
echo "     dist/anava-local-connector-extension.zip"
echo "     (Ready for Chrome Web Store)"
echo ""
echo "Next steps:"
echo ""
echo "  1. Test the installer:"
echo "     ${INSTALL_CMD}"
echo ""
echo "  2. Load extension in Chrome:"
echo "     - Go to chrome://extensions/"
echo "     - Enable Developer mode"
echo "     - Load unpacked → select this directory"
echo ""
echo "  3. Test end-to-end:"
echo "     - Click extension icon"
echo "     - Should show 'Connected' with green dot"
echo "     - Version should be 2.0.0"
echo ""
echo "  4. If tests pass, submit to Chrome Web Store:"
echo "     - Upload dist/anava-local-connector-extension.zip"
echo "     - Follow docs/launch/LAUNCH_CHECKLIST.md"
echo ""

# Add note about getting Installer certificate if needed
if [ -f "dist/AnavaLocalConnector-2.0.0-unsigned.pkg" ]; then
    echo "  ⚠️  To create a fully signed installer for production:"
    echo "     1. Get Developer ID Installer certificate:"
    echo "        https://developer.apple.com/account/resources/certificates/list"
    echo "     2. Install in Keychain"
    echo "     3. Re-run build script"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════════"
