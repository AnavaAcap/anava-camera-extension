#!/bin/bash
# Generate PNG icons from SVG source
# Requires: ImageMagick or rsvg-convert

set -e

SVG_SOURCE="icons/icon-design.svg"
ICONS_DIR="icons"

echo "Generating icons from SVG..."

# Check if source SVG exists
if [ ! -f "$SVG_SOURCE" ]; then
    echo "ERROR: Source SVG not found: $SVG_SOURCE"
    exit 1
fi

# Detect available converter
CONVERTER=""
if command -v rsvg-convert &> /dev/null; then
    CONVERTER="rsvg"
    echo "Using rsvg-convert"
elif command -v convert &> /dev/null; then
    CONVERTER="imagemagick"
    echo "Using ImageMagick"
else
    echo "ERROR: No SVG converter found"
    echo ""
    echo "Please install one of:"
    echo "  macOS:  brew install librsvg"
    echo "  Ubuntu: sudo apt-get install librsvg2-bin"
    echo "  Fedora: sudo dnf install librsvg2-tools"
    echo "  Or:     brew install imagemagick"
    exit 1
fi

# Generate icons at different sizes
SIZES=(16 48 128)

for size in "${SIZES[@]}"; do
    output_file="${ICONS_DIR}/icon-${size}.png"
    
    echo "Generating ${size}x${size}..."
    
    if [ "$CONVERTER" = "rsvg" ]; then
        rsvg-convert -w $size -h $size "$SVG_SOURCE" > "$output_file"
    else
        # ImageMagick
        convert -background none -density 1200 -resize ${size}x${size} "$SVG_SOURCE" "$output_file"
    fi
    
    # Verify output
    if [ ! -f "$output_file" ]; then
        echo "ERROR: Failed to generate $output_file"
        exit 1
    fi
    
    echo "  ✓ Created: $output_file"
done

echo ""
echo "=========================================="
echo "✓ All icons generated successfully!"
echo "=========================================="
echo ""
echo "Generated files:"
ls -lh ${ICONS_DIR}/icon-*.png

echo ""
echo "To use in Chrome extension:"
echo "  Update manifest.json icons section to reference these files"
