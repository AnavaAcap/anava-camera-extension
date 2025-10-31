#!/bin/bash
# Build macOS .pkg installer for Anava Local Connector
# Creates a universal binary (ARM64 + AMD64), signs it, and notarizes it

set -e

VERSION="2.0.0"
PACKAGE_ID="com.anava.local-connector"
INSTALLER_ROOT="$(pwd)/installers/macos/root"
SCRIPTS_DIR="$(pwd)/installers/macos/scripts"
BUILD_DIR="$(pwd)/build"
OUTPUT_DIR="$(pwd)/dist"

# Apple credentials (required for signing and notarization)
APPLE_ID="${APPLE_ID:-}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-}"
APPLE_ID_PASSWORD="${APPLE_ID_PASSWORD:-}"
CSC_NAME="${CSC_NAME:-}"

echo "Building Anava Local Connector v${VERSION} for macOS..."
echo ""

# Check if credentials are provided
if [ -z "$CSC_NAME" ]; then
    echo "⚠️  WARNING: No signing credentials provided"
    echo "    Package will be built unsigned (for testing only)"
    echo ""
    SHOULD_SIGN=false
    SHOULD_SIGN_PKG=false
else
    echo "✓ Signing credentials found: $CSC_NAME"
    SHOULD_SIGN=true

    # Check if we have the Installer certificate (different from Application certificate)
    if security find-identity -v -p basic | grep -q "Developer ID Installer: Ryan Wager (${APPLE_TEAM_ID})"; then
        echo "✓ Installer certificate found"
        SHOULD_SIGN_PKG=true
    else
        echo "⚠️  WARNING: Developer ID Installer certificate not found"
        echo "    Binary will be signed, but .pkg will be unsigned"
        SHOULD_SIGN_PKG=false
    fi
fi

# Create build and output directories
mkdir -p "${BUILD_DIR}"
mkdir -p "${OUTPUT_DIR}"

# Create installer root structure
mkdir -p "${INSTALLER_ROOT}/Applications/AnavaLocalConnector"
mkdir -p "${INSTALLER_ROOT}/Library/Application Support/AnavaLocalConnector/templates"

# Copy template files to installer root
echo "Copying template files to installer root..."
cp installers/macos/com.anava.local_connector.json \
   "${INSTALLER_ROOT}/Library/Application Support/AnavaLocalConnector/templates/"

cp installers/macos/com.anava.local_connector.plist \
   "${INSTALLER_ROOT}/Library/Application Support/AnavaLocalConnector/templates/"

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

# Step 2: Sign the binary (if credentials provided)
if [ "$SHOULD_SIGN" = true ]; then
    echo ""
    echo "Step 2: Signing binary..."

    codesign --force --sign "$CSC_NAME" \
        --timestamp \
        --options runtime \
        "${INSTALLER_ROOT}/Applications/AnavaLocalConnector/local-connector"

    echo "  Verifying binary signature:"
    codesign -dvvv "${INSTALLER_ROOT}/Applications/AnavaLocalConnector/local-connector"
    echo "✓ Binary signed successfully"
fi

# Step 3: Build .pkg
echo ""
echo "Step 3: Building .pkg installer..."

# Create temporary pkg
TEMP_PKG="${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}-temp.pkg"

pkgbuild \
    --root "${INSTALLER_ROOT}" \
    --scripts "${SCRIPTS_DIR}" \
    --identifier "${PACKAGE_ID}" \
    --version "${VERSION}" \
    --install-location "/" \
    "${TEMP_PKG}"

echo "✓ Package created"

# Step 4: Sign the package (if Installer certificate available)
if [ "$SHOULD_SIGN_PKG" = true ]; then
    echo ""
    echo "Step 4: Signing package..."

    SIGNED_PKG="${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}.pkg"

    productsign --sign "Developer ID Installer: Ryan Wager (${APPLE_TEAM_ID})" \
        "${TEMP_PKG}" \
        "${SIGNED_PKG}"

    # Remove temp package
    rm "${TEMP_PKG}"

    echo "  Verifying package signature:"
    pkgutil --check-signature "${SIGNED_PKG}"
    echo "✓ Package signed successfully"

    PKG_FILE="${SIGNED_PKG}"
else
    # No Installer signing, just rename temp to final
    PKG_FILE="${OUTPUT_DIR}/AnavaLocalConnector-${VERSION}-unsigned.pkg"
    mv "${TEMP_PKG}" "${PKG_FILE}"
    echo ""
    echo "Step 4: Package signing skipped (no Installer certificate)"
    echo "✓ Unsigned package created: ${PKG_FILE}"
fi

# Step 5: Notarize (if package is signed and credentials provided)
if [ "$SHOULD_SIGN_PKG" = true ] && [ -n "$APPLE_ID" ] && [ -n "$APPLE_ID_PASSWORD" ]; then
    echo ""
    echo "Step 5: Notarizing package..."
    echo "  This may take several minutes..."

    # Submit for notarization
    xcrun notarytool submit "${PKG_FILE}" \
        --apple-id "${APPLE_ID}" \
        --password "${APPLE_ID_PASSWORD}" \
        --team-id "${APPLE_TEAM_ID}" \
        --wait

    NOTARIZE_EXIT_CODE=$?

    if [ $NOTARIZE_EXIT_CODE -eq 0 ]; then
        echo "✓ Notarization successful"

        # Staple the notarization ticket
        echo ""
        echo "Step 6: Stapling notarization ticket..."
        xcrun stapler staple "${PKG_FILE}"

        # Verify
        echo "  Verifying notarization:"
        spctl -a -v --type install "${PKG_FILE}"
        echo "✓ Notarization ticket stapled successfully"
    else
        echo "⚠️  Notarization failed or timed out"
        echo "    Package is signed but not notarized"
        echo "    It will still work on your Mac, but may show warnings on other Macs"
    fi
fi

# Final summary
echo ""
echo "==================================================================="
echo "✓ Build complete!"
echo ""

if [ "$SHOULD_SIGN_PKG" = true ]; then
    echo "Signed package: ${PKG_FILE}"
    echo ""
    echo "To install:"
    echo "  sudo installer -pkg \"${PKG_FILE}\" -target /"
    echo ""
    echo "Or double-click the .pkg file to install via Finder"
elif [ "$SHOULD_SIGN" = true ]; then
    echo "Partially signed package: ${PKG_FILE}"
    echo "  ✓ Binary is signed with Developer ID Application"
    echo "  ⚠️  Package is unsigned (need Developer ID Installer certificate)"
    echo ""
    echo "To install (requires allowing unsigned packages):"
    echo "  sudo installer -pkg \"${PKG_FILE}\" -target / -allowUntrusted"
    echo ""
    echo "To get a Developer ID Installer certificate:"
    echo "  1. Go to https://developer.apple.com/account/resources/certificates/list"
    echo "  2. Click '+' to create a new certificate"
    echo "  3. Select 'Developer ID Installer'"
    echo "  4. Download and install in Keychain"
else
    echo "Unsigned package: ${PKG_FILE}"
    echo ""
    echo "⚠️  WARNING: This package is UNSIGNED and for testing only!"
    echo ""
    echo "To install (requires allowing unsigned packages):"
    echo "  sudo installer -pkg \"${PKG_FILE}\" -target / -allowUntrusted"
    echo ""
    echo "For production, run with signing credentials:"
    echo "  APPLE_ID=\"your@email.com\" APPLE_ID_PASSWORD=\"xxxx\" \\"
    echo "  APPLE_TEAM_ID=\"TEAMID\" CSC_NAME=\"Developer ID\" \\"
    echo "  ./scripts/build-macos-pkg.sh"
fi

echo "==================================================================="
