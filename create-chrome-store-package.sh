#!/bin/bash

# Create submission package for Chrome Web Store (v2.0.8)
VERSION="2.0.9"
ZIP_NAME="anava-local-connector-v${VERSION}.zip"

echo "🎯 Creating Chrome Web Store submission package for v${VERSION}..."

# Files to include (from root directory)
FILES_TO_INCLUDE=(
  "manifest.json"
  "background.js"
  "content-script.js"
  "popup.html"
  "popup.js"
  "popup.css"
  "rules.json"
  "license-worker.html"
  "license-worker.js"
  "axis-sdk.js"
  "icon16.png"
  "icon48.png"
  "icon128.png"
)

# Verify all files exist
echo "✅ Verifying required files..."
MISSING_FILES=()
for file in "${FILES_TO_INCLUDE[@]}"; do
  if [ ! -f "$file" ]; then
    MISSING_FILES+=("$file")
  fi
done

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
  echo "❌ ERROR: Missing required files:"
  printf '   - %s\n' "${MISSING_FILES[@]}"
  echo ""
  echo "Run 'npm run build' first to generate all files."
  exit 1
fi

# Remove old zip if it exists
if [ -f "$ZIP_NAME" ]; then
  echo "🗑️  Removing old package: $ZIP_NAME"
  rm "$ZIP_NAME"
fi

# Create ZIP file
echo "📦 Creating ZIP archive..."
zip -q "$ZIP_NAME" "${FILES_TO_INCLUDE[@]}"

# Verify ZIP was created
if [ ! -f "$ZIP_NAME" ]; then
  echo "❌ ERROR: Failed to create ZIP file"
  exit 1
fi

# Show results
echo ""
echo "✅ Submission package created: $ZIP_NAME"
ls -lh "$ZIP_NAME"
echo ""
echo "📋 Package contents:"
unzip -l "$ZIP_NAME"

echo ""
echo "🎉 Done! Upload $ZIP_NAME to Chrome Web Store"
echo ""
echo "📝 Remember to update the Chrome Web Store listing with:"
echo "   - New version number: v${VERSION}"
echo "   - Updated permission justifications (see PERMISSION_OPTIMIZATION_v2.0.8.md)"
echo "   - Note: 27% fewer permissions than previous version"
