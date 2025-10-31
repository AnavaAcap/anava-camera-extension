#!/bin/bash
# Build Debian .deb package for Anava Local Connector

set -e

VERSION="2.0.0"
ARCH="amd64"
PACKAGE_NAME="anava-local-connector_${VERSION}_${ARCH}"
BUILD_DIR="build"
DEB_DIR="installers/linux/deb"
OUTPUT_DIR="dist"

echo "Building Anava Local Connector v${VERSION} for Debian/Ubuntu..."

# Create directories
mkdir -p "${BUILD_DIR}"
mkdir -p "${OUTPUT_DIR}"
mkdir -p "${DEB_DIR}/opt/anava/local-connector"

# Step 1: Build Linux binary
echo ""
echo "Step 1: Building Linux AMD64 binary..."
GOOS=linux GOARCH=amd64 go build -o "${DEB_DIR}/opt/anava/local-connector/local-connector" ./cmd/local-connector

echo "  Binary created"

# Set permissions
chmod 755 "${DEB_DIR}/opt/anava/local-connector/local-connector"

# Step 2: Build .deb package
echo ""
echo "Step 2: Building .deb package..."

# Update version in control file
sed -i.bak "s/^Version: .*/Version: ${VERSION}/" "${DEB_DIR}/DEBIAN/control"
rm -f "${DEB_DIR}/DEBIAN/control.bak"

# Build package
dpkg-deb --build "${DEB_DIR}" "${OUTPUT_DIR}/${PACKAGE_NAME}.deb"

echo "  Package created: ${OUTPUT_DIR}/${PACKAGE_NAME}.deb"

# Step 3: Verify package
echo ""
echo "Step 3: Verifying package..."
dpkg-deb --info "${OUTPUT_DIR}/${PACKAGE_NAME}.deb"

echo ""
echo "==================================================================="
echo "Build complete!"
echo "Package: ${OUTPUT_DIR}/${PACKAGE_NAME}.deb"
echo ""
echo "To install:"
echo "  sudo dpkg -i ${OUTPUT_DIR}/${PACKAGE_NAME}.deb"
echo ""
echo "To remove:"
echo "  sudo dpkg -r anava-local-connector"
echo "==================================================================="
