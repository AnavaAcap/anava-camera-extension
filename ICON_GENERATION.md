# Icon Generation

## Overview

Extension icons are automatically generated from the Anava favicon during the build process.

## Source

- **Favicon URL**: `https://anava.ai/favicon.ico`
- **Source File**: `anava-favicon-source.png` (192×192 PNG)
- **Generated Sizes**: 16×16, 48×48, 128×128

## Build Process

```bash
npm run build
```

This runs `build-icons.py` which:
1. Checks if `anava-favicon-source.png` exists
2. Downloads it from anava.ai if missing
3. Resizes to 16×16, 48×48, 128×128 using high-quality LANCZOS resampling
4. Saves to `dist/icon16.png`, `dist/icon48.png`, `dist/icon128.png`

## Manual Update

To update icons with a new Anava favicon:

```bash
# Download latest favicon
curl -s https://anava.ai/favicon.ico -o anava-favicon-source.png

# Rebuild
npm run build
```

## Files

- `anava-favicon-source.png` - Source favicon (checked into git)
- `build-icons.py` - Icon generation script
- `dist/icon*.png` - Generated icons (not in git, built automatically)

## Quality

Icons use LANCZOS resampling for high-quality downscaling, preserving:
- Sharp edges
- Color accuracy
- Alpha transparency
- Brand consistency
