# Extension Icons

## Required Sizes

Chrome extensions require 3 icon sizes:
- 16x16 - Toolbar icon
- 48x48 - Extension management page
- 128x128 - Chrome Web Store

## Placeholder Icons

Currently using placeholder icons. To replace:

1. Create PNG files:
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)

2. Design Guidelines:
   - Use Anava brand colors
   - Include camera or network symbol
   - Keep it simple and recognizable
   - PNG format with transparency

3. Recommended Tools:
   - Figma
   - Sketch
   - Adobe Illustrator
   - Online: https://www.favicon.cc/

## Creating Placeholder Icons

### Using ImageMagick (if installed):

```bash
# Create simple colored squares as placeholders
convert -size 16x16 xc:#667eea icons/icon16.png
convert -size 48x48 xc:#667eea icons/icon48.png
convert -size 128x128 xc:#667eea icons/icon128.png
```

### Using Python PIL:

```python
from PIL import Image, ImageDraw

for size in [16, 48, 128]:
    img = Image.new('RGB', (size, size), color='#667eea')
    draw = ImageDraw.Draw(img)
    # Add text or shapes
    img.save(f'icons/icon{size}.png')
```

### Using Online Tools:

1. Go to https://www.favicon-generator.org/
2. Upload base image
3. Download generated sizes
4. Rename to icon16.png, icon48.png, icon128.png

## Temporary Solution

For development, you can comment out icon references in manifest.json:

```json
{
  "action": {
    "default_popup": "popup.html"
    // Temporarily disabled icons
    // "default_icon": {
    //   "16": "icons/icon16.png",
    //   "48": "icons/icon48.png",
    //   "128": "icons/icon128.png"
    // }
  }
}
```

Chrome will use a generic extension icon as fallback.
