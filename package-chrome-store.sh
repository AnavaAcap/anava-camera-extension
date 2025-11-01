#!/bin/bash

# Create Chrome Web Store submission package

VERSION=$(node -p "require('./package.json').version")
ZIP_NAME="anava-local-connector-v${VERSION}.zip"

echo "📦 Creating Chrome Web Store package for v${VERSION}..."

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
echo "✅ Chrome Web Store package created!"
echo ""
echo "📦 Package: $ZIP_NAME"
ls -lh "$ZIP_NAME"
echo ""
echo "📋 Package contents:"
unzip -l "$ZIP_NAME"

echo ""
echo "🎯 Next Steps:"
echo ""
echo "1. Upload to Chrome Web Store:"
echo "   https://chrome.google.com/webstore/devconsole"
echo ""
echo "2. Update Store Listing:"
echo "   Version: v${VERSION}"
echo "   Changelog: See BULK_SCAN_API_v2.1.0.md"
echo ""
echo "3. Permission Justifications:"
echo "   See CHROME_STORE_SUBMISSION_v2.0.8.md"
echo ""
echo "   storage: Caches camera data, error logs, proxy status"
echo "   offscreen: Axis SDK license generation (requires DOM)"
echo ""
echo "   localhost:9876: Local proxy server"
echo "   anava-ai.web.app: Web application integration"
echo "   api.github.com: ACAP release manifests"
echo ""
echo "🎉 Package ready for submission!"
