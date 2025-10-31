#!/bin/bash
# Build macOS .pkg installer for Anava Local Connector
# Creates a universal binary (ARM64 + AMD64) and packages it

set -e

VERSION="2.0.0"
PACKAGE_ID="com.anava.local-connector"
INSTALLER_ROOT="$(pwd)/installers/macos/root"
SCRIPTS_DIR="$(pwd)/installers/macos/scripts"
BUILD_DIR="$(pwd)/build"
OUTPUT_DIR="$(pwd)/dist"

echo "Building Anava Local Connector v${VERSION} for macOS..."

# Create build and output directories
mkdir -p "${BUILD_DIR}"
mkdir -p "${OUTPUT_DIR}"

# Step 1: Build universal binary (ARM64 + AMD64)
echo ""
echo "Step 1: Building universal binary..."

# Build ARM64 binary
echo "  Building ARM64 binary..."
GOOS=darwin GOARCH=arm64 go build -o "${BUILD_DIR}/local-connector-arm64" ./cmd/local-connector

# Build AMD64 binary
echo "  Building AMD64 binary..."
GOOS=darwin GOARCH=amd64 go build -o "${BUILD_DIR}/local-connector-amd64" ./cmd/local-connector

# Create universal binary using lipo
echo "  Creating universal binary..."
lipo -create \
    "${BUILD_DIR}/local-connector-arm64" \
    "${BUILD_DIR}/local-connector-amd64" \
    -output "${INSTALLER_ROOT}/Applications/AnavaLocalConnector/local-connector"

# Verify universal binary
echo "  Verifying universal binary:"
lipo -info "${INSTALLER_ROOT}/Applications/AnavaLocalConnector/local-connector"

# Step 2: Build .pkg
echo ""
echo "Step 2: Building .pkg installer..."

pkgbuild \
    --root "${INSTALLER_ROOT}" \
    --scripts "${SCRIPTS_DIR}" \
    --identifier "${PACKAGE_ID}" \
    --version "${VERSION}" \
    --install-location "/" \
    "${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}-unsigned.pkg"

echo "✓ Unsigned package created: ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}-unsigned.pkg"

# Step 3: Code signing (PLACEHOLDER)
echo ""
echo "Step 3: Code signing (MANUAL STEP REQUIRED)"
echo ""
echo "To sign the package, you need:"
echo "  1. Apple Developer ID Installer certificate"
echo "  2. Run the following command:"
echo ""
echo "     productsign --sign \"Developer ID Installer: YOUR_NAME\" \\"
echo "       ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}-unsigned.pkg \\"
echo "       ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}.pkg"
echo ""
echo "  3. Verify signature:"
echo ""
echo "     pkgutil --check-signature ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}.pkg"
echo ""

# Step 4: Notarization (PLACEHOLDER)
echo "Step 4: Notarization (MANUAL STEP REQUIRED)"
echo ""
echo "To notarize the package for macOS 10.15+:"
echo "  1. Upload for notarization:"
echo ""
echo "     xcrun notarytool submit ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}.pkg \\"
echo "       --keychain-profile \"AC_PASSWORD\" \\"
echo "       --wait"
echo ""
echo "  2. Staple the notarization ticket:"
echo ""
echo "     xcrun stapler staple ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}.pkg"
echo ""
echo "  3. Verify notarization:"
echo ""
echo "     spctl -a -v --type install ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}.pkg"
echo ""

echo ""
echo "==================================================================="
echo "Build complete!"
echo "Unsigned package: ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}-unsigned.pkg"
echo ""
echo "For testing (unsigned):"
echo "  sudo installer -pkg ${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}-unsigned.pkg -target /"
echo ""
echo "For distribution, complete the code signing and notarization steps above."
echo "==================================================================="
