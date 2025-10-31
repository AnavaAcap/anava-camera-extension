#!/bin/bash
# Build RPM package for Anava Local Connector

set -e

VERSION="2.0.0"
PACKAGE_NAME="anava-local-connector-${VERSION}"
SPEC_FILE="installers/linux/rpm/anava-local-connector.spec"
OUTPUT_DIR="dist"

echo "Building Anava Local Connector v${VERSION} for RPM-based systems..."

# Check if rpmbuild is installed
if ! command -v rpmbuild &> /dev/null; then
    echo "ERROR: rpmbuild not found. Please install rpm-build:"
    echo "  Fedora/RHEL: sudo dnf install rpm-build"
    echo "  CentOS: sudo yum install rpm-build"
    exit 1
fi

# Create RPM build directories
mkdir -p ~/rpmbuild/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
mkdir -p "${OUTPUT_DIR}"

# Step 1: Build Linux binary
echo ""
echo "Step 1: Building Linux AMD64 binary..."
GOOS=linux GOARCH=amd64 go build -o build/local-connector ./cmd/local-connector

echo "  Binary created"

# Step 2: Create source tarball
echo ""
echo "Step 2: Creating source tarball..."

# Create temporary directory with source
TEMP_DIR=$(mktemp -d)
SRC_DIR="${TEMP_DIR}/${PACKAGE_NAME}"
mkdir -p "${SRC_DIR}/cmd/local-connector"

# Copy source files
cp -r cmd "${SRC_DIR}/"
cp -r pkg "${SRC_DIR}/"
cp go.mod "${SRC_DIR}/"

# Create tarball
tar -czf ~/rpmbuild/SOURCES/${PACKAGE_NAME}.tar.gz -C "${TEMP_DIR}" "${PACKAGE_NAME}"

# Cleanup temp directory
rm -rf "${TEMP_DIR}"

echo "  Source tarball created"

# Step 3: Copy spec file
echo ""
echo "Step 3: Copying spec file..."
cp "${SPEC_FILE}" ~/rpmbuild/SPECS/

# Step 4: Build RPM
echo ""
echo "Step 4: Building RPM package..."
rpmbuild -ba ~/rpmbuild/SPECS/anava-local-connector.spec

# Step 5: Copy RPM to output directory
echo ""
echo "Step 5: Copying RPM to output directory..."
cp ~/rpmbuild/RPMS/x86_64/${PACKAGE_NAME}-1.*.x86_64.rpm "${OUTPUT_DIR}/"

echo ""
echo "==================================================================="
echo "Build complete!"
echo "Package: ${OUTPUT_DIR}/${PACKAGE_NAME}-1.*.x86_64.rpm"
echo ""
echo "To install:"
echo "  sudo rpm -i ${OUTPUT_DIR}/${PACKAGE_NAME}-1.*.x86_64.rpm"
echo ""
echo "To remove:"
echo "  sudo rpm -e anava-local-connector"
echo "==================================================================="
