#!/bin/bash

# Create submission package for Chrome Web Store (FIXED - no duplicate manifest)
ZIP_NAME="anava-local-connector-v2.0.7.zip"
TEMP_DIR="submission-temp"

echo "🎯 Creating Chrome Web Store submission package (fixed)..."

# Clean up
rm -rf "$TEMP_DIR"
rm -f "$ZIP_NAME"
mkdir -p "$TEMP_DIR"

# Copy manifest.json to root (only once!)
echo "📄 Copying manifest.json..."
cp dist/manifest.json "$TEMP_DIR/"

# Copy all other files from dist/ EXCEPT manifest.json
echo "📦 Copying extension files..."
cd dist
for file in *.js *.html *.css *.json *.png; do
    if [ "$file" != "manifest.json" ] && [ -f "$file" ]; then
        cp "$file" "../$TEMP_DIR/"
    fi
done
cd ..

# Verify NO duplicate manifests
echo "✅ Verifying package contents..."
manifest_count=$(find "$TEMP_DIR" -name "manifest.json" | wc -l)
if [ "$manifest_count" -eq 1 ]; then
    echo "✓ Exactly 1 manifest.json found"
else
    echo "❌ ERROR: Found $manifest_count manifest files!"
    exit 1
fi

# List files
echo ""
echo "📋 Package contents:"
ls -lh "$TEMP_DIR/"

# Create ZIP file (files at root, not in subdirectory)
echo ""
echo "📦 Creating ZIP archive..."
cd "$TEMP_DIR"
zip -r "../$ZIP_NAME" . -x "*.DS_Store" -x "__MACOSX/*"
cd ..

# Verify structure
echo ""
echo "✅ Submission package created: $ZIP_NAME"
ls -lh "$ZIP_NAME"
echo ""
echo "📋 ZIP structure (manifest should be at root):"
unzip -l "$ZIP_NAME" | head -20

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "🎉 Done! Upload $ZIP_NAME to Chrome Web Store"
