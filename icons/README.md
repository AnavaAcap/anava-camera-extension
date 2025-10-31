# Anava Local Connector - Icons

## Source

- **icon-design.svg** - Master SVG icon design (128x128)
  - Professional design with camera + network motif
  - Blue gradient background (#2563EB to #1E40AF)
  - White camera icon with lens detail
  - Network connection indicators

## Generated Icons

Run `../scripts/generate-icons.sh` to generate PNG icons:

- icon-16.png (16x16) - Chrome extension toolbar
- icon-48.png (48x48) - Chrome extension management page
- icon-128.png (128x128) - Chrome Web Store

## Requirements

Install an SVG converter:

**macOS:**
```bash
brew install librsvg
# or
brew install imagemagick
```

**Ubuntu/Debian:**
```bash
sudo apt-get install librsvg2-bin
```

**Fedora/RHEL:**
```bash
sudo dnf install librsvg2-tools
```

## Manual Generation (without script)

### Using rsvg-convert:
```bash
rsvg-convert -w 16 -h 16 icon-design.svg > icon-16.png
rsvg-convert -w 48 -h 48 icon-design.svg > icon-48.png
rsvg-convert -w 128 -h 128 icon-design.svg > icon-128.png
```

### Using ImageMagick:
```bash
convert -background none -density 1200 -resize 16x16 icon-design.svg icon-16.png
convert -background none -density 1200 -resize 48x48 icon-design.svg icon-48.png
convert -background none -density 1200 -resize 128x128 icon-design.svg icon-128.png
```

### Using Inkscape:
```bash
inkscape icon-design.svg --export-filename=icon-16.png --export-width=16 --export-height=16
inkscape icon-design.svg --export-filename=icon-48.png --export-width=48 --export-height=48
inkscape icon-design.svg --export-filename=icon-128.png --export-width=128 --export-height=128
```

## CI/CD

The GitHub Actions release workflow automatically generates icons during the build process.

If you're developing locally and need icons, either:
1. Install rsvg-convert or ImageMagick and run the script
2. Generate manually using commands above
3. Use placeholder icons temporarily (any PNG files with correct dimensions)
